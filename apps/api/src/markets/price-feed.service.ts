import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  type OnModuleInit,
} from '@nestjs/common';
import { and, asc, desc, eq, gte, lt } from 'drizzle-orm';
import { filter, Observable, Subject } from 'rxjs';

import { DRIZZLE_CLIENT } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.types';
import {
  type Instrument,
  type PriceTick,
  priceTicks,
} from '../database/schema';
import { decimalStringToScaledBigInt } from './decimal';
import { NoPriceAvailableError, StalePriceError } from './errors';
import { InstrumentService } from './instrument.service';
import { toPriceQuote, type PriceQuote } from './price-quote';
import {
  MARKET_DATA_PROVIDER,
  type MarketDataProvider,
} from './providers/market-data-provider.interface';

const CACHE_TTL_MS = 2_000;

/**
 * Minimum time between provider refresh attempts.
 *
 * The scheduler may run more frequently than this, but provider requests
 * will not be made more often than this interval.
 */
const PROVIDER_MIN_REFRESH_INTERVAL_MS = 15_000;

/**
 * When the provider returns HTTP 429, suppress provider requests for this
 * amount of time.
 *
 * Existing database ticks remain untouched and naturally age out through
 * the normal stale-price validation.
 */
const PROVIDER_RATE_LIMIT_COOLDOWN_MS = 60_000;

interface CacheEntry {
  tick: PriceTick;
  instrument: Instrument;
  cachedAt: number;
}

@Injectable()
export class PriceFeedService implements OnModuleInit {
  private readonly logger = new Logger(PriceFeedService.name);

  /**
   * Read-through cache for the most recent tick.
   *
   * The database remains the source of truth.
   */
  private readonly cache = new Map<string, CacheEntry>();

  /**
   * Live price stream.
   */
  private readonly ticks$ = new Subject<PriceQuote>();

  /**
   * Prevent overlapping provider refresh operations.
   */
  private providerRefreshing = false;

  /**
   * Timestamp of the last provider request attempt.
   */
  private lastProviderRefreshAt = 0;

  /**
   * Provider rate-limit cooldown timestamp.
   */
  private providerRateLimitedUntil = 0;

  constructor(
    @Inject(DRIZZLE_CLIENT)
    private readonly db: DrizzleDb,

    private readonly instrumentService: InstrumentService,

    @Inject(MARKET_DATA_PROVIDER)
    private readonly provider: MarketDataProvider,
  ) {}

  /**
   * Log the selected market-data provider at application startup.
   */
  onModuleInit(): void {
    const configured = this.provider.isConfigured();

    this.logger.log(
      `Market data provider selected: ${this.provider.name} (configured=${configured})`,
    );

    if (!configured) {
      this.logger.warn(
        `Market data provider "${this.provider.name}" is not configured — scheduled price refreshes will fail and prices will eventually become stale.`,
      );
    }
  }

  /**
   * Append a new price tick.
   *
   * This is the only method that writes to price_ticks.
   *
   * No fabricated prices are ever written.
   */
  async ingestTick(
    instrument: Instrument,
    quote: {
      priceDecimal: string;
      source: string;
      observedAt: Date;
    },
  ): Promise<PriceQuote> {
    const scaled = decimalStringToScaledBigInt(
      quote.priceDecimal,
      instrument.pricePrecision,
    );

    if (scaled <= 0n) {
      throw new BadRequestException('Price must be positive');
    }

    const [tick] = await this.db
      .insert(priceTicks)
      .values({
        instrumentId: instrument.id,
        price: scaled,
        source: quote.source,
        observedAt: quote.observedAt,
      })
      .returning();

    if (!tick) {
      throw new Error('Failed to insert price tick');
    }

    this.cache.set(instrument.id, {
      tick,
      instrument,
      cachedAt: Date.now(),
    });

    const priceQuote = toPriceQuote(
      tick,
      instrument,
      false,
    );

    this.ticks$.next(priceQuote);

    return priceQuote;
  }

  /**
   * Return the latest trusted price for an instrument.
   *
   * A price is valid only if:
   *
   * 1. A tick exists.
   * 2. The tick is not older than maxPriceAgeSeconds.
   *
   * Never fabricate a price and never silently use an indefinitely stale
   * price.
   */
  async getLatestPrice(
    instrumentId: string,
  ): Promise<PriceQuote> {
    const instrument =
      await this.instrumentService.getById(instrumentId);

    const cached = this.cache.get(instrumentId);

    let tick = cached?.tick;

    if (
      !tick ||
      Date.now() - cached!.cachedAt > CACHE_TTL_MS
    ) {
      const [dbTick] = await this.db
        .select()
        .from(priceTicks)
        .where(eq(priceTicks.instrumentId, instrumentId))
        .orderBy(desc(priceTicks.observedAt))
        .limit(1);

      tick = dbTick;

      if (tick) {
        this.cache.set(instrumentId, {
          tick,
          instrument,
          cachedAt: Date.now(),
        });
      }
    }

    if (!tick) {
      throw new NoPriceAvailableError(instrumentId);
    }

    const ageSeconds =
      (Date.now() - tick.observedAt.getTime()) / 1000;

    if (
      ageSeconds >
      instrument.maxPriceAgeSeconds
    ) {
      throw new StalePriceError({
        instrumentId,
        ageSeconds: Math.round(ageSeconds),
        maxAgeSeconds:
          instrument.maxPriceAgeSeconds,
      });
    }

    return toPriceQuote(
      tick,
      instrument,
      false,
    );
  }

  /**
   * Return the trusted price associated with a specific settlement time.
   *
   * Preference:
   *
   * 1. Earliest tick at or after the settlement timestamp.
   * 2. Latest tick before the settlement timestamp.
   *
   * Staleness is measured relative to the settlement timestamp rather than
   * the current wall clock.
   */
  async getPriceForSettlement(
    instrumentId: string,
    at: Date,
  ): Promise<PriceQuote> {
    const instrument =
      await this.instrumentService.getById(instrumentId);

    const [tickAtOrAfter] = await this.db
      .select()
      .from(priceTicks)
      .where(
        and(
          eq(
            priceTicks.instrumentId,
            instrumentId,
          ),
          gte(priceTicks.observedAt, at),
        ),
      )
      .orderBy(asc(priceTicks.observedAt))
      .limit(1);

    let tick = tickAtOrAfter;

    if (!tick) {
      const [tickBefore] = await this.db
        .select()
        .from(priceTicks)
        .where(
          and(
            eq(
              priceTicks.instrumentId,
              instrumentId,
            ),
            lt(priceTicks.observedAt, at),
          ),
        )
        .orderBy(desc(priceTicks.observedAt))
        .limit(1);

      tick = tickBefore;
    }

    if (!tick) {
      throw new NoPriceAvailableError(instrumentId);
    }

    const ageSeconds =
      Math.abs(
        tick.observedAt.getTime() -
          at.getTime(),
      ) / 1000;

    if (
      ageSeconds >
      instrument.maxPriceAgeSeconds
    ) {
      throw new StalePriceError({
        instrumentId,
        ageSeconds: Math.round(ageSeconds),
        maxAgeSeconds:
          instrument.maxPriceAgeSeconds,
      });
    }

    return toPriceQuote(
      tick,
      instrument,
      false,
    );
  }

  /**
   * Explicitly refresh one instrument.
   *
   * This remains available for admin/manual refresh endpoints.
   *
   * The normal scheduler should use refreshAllActive(), which performs
   * one batched provider request rather than one request per instrument.
   */
  async refreshFromProvider(
    instrument: Instrument,
  ): Promise<PriceQuote | undefined> {
    if (!instrument.providerSymbol) {
      this.logger.warn(
        `Instrument ${instrument.displaySymbol} has no providerSymbol configured — skipping refresh`,
      );

      return undefined;
    }

    if (!this.provider.isConfigured()) {
      this.logger.warn(
        `Market-data refresh skipped instrument=${instrument.displaySymbol} provider=${this.provider.name} reason=provider-not-configured`,
      );

      return undefined;
    }

    if (this.isProviderRateLimited()) {
      this.logger.warn(
        `Market-data refresh skipped instrument=${instrument.displaySymbol} provider=${this.provider.name} reason=provider-rate-limit-cooldown`,
      );

      return undefined;
    }

    try {
      const quotes =
        await this.provider.getQuotes([
          {
            providerSymbol:
              instrument.providerSymbol,
            quoteCurrency:
              instrument.quoteCurrency,
          },
        ]);

      const quote = quotes[0];

      if (!quote) {
        this.logger.warn(
          `market-data refresh: no quote returned instrument=${instrument.displaySymbol} provider=${this.provider.name}`,
        );

        return undefined;
      }

      const ingested =
        await this.ingestTick(
          instrument,
          {
            priceDecimal:
              quote.priceDecimal,
            source: this.provider.name,
            observedAt:
              quote.observedAt,
          },
        );

      this.logger.debug(
        `market-data refresh: instrument=${instrument.displaySymbol} provider=${this.provider.name} price=${quote.priceDecimal}`,
      );

      return ingested;
    } catch (error) {
      this.handleProviderError(
        instrument.displaySymbol,
        error,
      );

      return undefined;
    }
  }

  /**
   * Refresh all active instruments.
   *
   * IMPORTANT:
   *
   * We intentionally make ONE provider request containing all instruments.
   *
   * Previous implementation:
   *
   *   Promise.all(
   *     active.map(instrument =>
   *       refreshFromProvider(instrument)
   *     )
   *   )
   *
   * With four instruments this produced four concurrent CoinGecko
   * requests every cycle.
   *
   * The new implementation produces one request:
   *
   *   BTC + ETH + SOL + XRP
   *
   * This significantly reduces request pressure against CoinGecko.
   */
  async refreshAllActive(): Promise<void> {
    const started = Date.now();

    if (!this.provider.isConfigured()) {
      this.logger.warn(
        `market-data refresh skipped provider=${this.provider.name} reason=provider-not-configured`,
      );

      return;
    }

    if (this.providerRefreshing) {
      this.logger.warn(
        `market-data refresh skipped provider=${this.provider.name} reason=previous-refresh-still-running`,
      );

      return;
    }

    if (this.isProviderRateLimited()) {
      const remainingMs =
        this.providerRateLimitedUntil -
        Date.now();

      this.logger.warn(
        `market-data refresh skipped provider=${this.provider.name} reason=rate-limit-cooldown remainingMs=${Math.max(
          0,
          remainingMs,
        )}`,
      );

      return;
    }

    const elapsedSinceLastRefresh =
      Date.now() -
      this.lastProviderRefreshAt;

    if (
      this.lastProviderRefreshAt > 0 &&
      elapsedSinceLastRefresh <
        PROVIDER_MIN_REFRESH_INTERVAL_MS
    ) {
      this.logger.debug(
        `market-data refresh skipped provider=${this.provider.name} reason=minimum-refresh-interval remainingMs=${
          PROVIDER_MIN_REFRESH_INTERVAL_MS -
          elapsedSinceLastRefresh
        }`,
      );

      return;
    }

    this.providerRefreshing = true;
    this.lastProviderRefreshAt = Date.now();

    let active: Instrument[] = [];

    try {
      active = (
        await this.instrumentService.list()
      ).filter(
        (instrument) =>
          instrument.status === 'active',
      );

      if (active.length === 0) {
        this.logger.debug(
          `market-data refresh skipped provider=${this.provider.name} reason=no-active-instruments`,
        );

        return;
      }

      const refreshable = active.filter(
        (instrument) =>
          Boolean(
            instrument.providerSymbol,
          ),
      );

      const skipped =
        active.length -
        refreshable.length;

      if (refreshable.length === 0) {
        this.logger.warn(
          `market-data refresh completed provider=${this.provider.name} succeeded=0 failed=0 skipped=${skipped} durationMs=${
            Date.now() - started
          }`,
        );

        return;
      }

      /**
       * ONE provider request for ALL refreshable instruments.
       */
      const quotes =
        await this.provider.getQuotes(
          refreshable.map(
            (instrument) => ({
              providerSymbol:
                instrument.providerSymbol!,
              quoteCurrency:
                instrument.quoteCurrency,
            }),
          ),
        );

      /**
       * Match provider responses back to instruments.
       */
      const quoteBySymbol =
        new Map(
          quotes.map((quote) => [
            quote.providerSymbol,
            quote,
          ]),
        );

      let succeeded = 0;
      let failed = 0;

      for (const instrument of refreshable) {
        const quote =
          quoteBySymbol.get(
            instrument.providerSymbol!,
          );

        if (!quote) {
          failed++;

          this.logger.warn(
            `market-data refresh: no quote returned instrument=${instrument.displaySymbol} provider=${this.provider.name}`,
          );

          continue;
        }

        try {
          await this.ingestTick(
            instrument,
            {
              priceDecimal:
                quote.priceDecimal,
              source:
                this.provider.name,
              observedAt:
                quote.observedAt,
            },
          );

          succeeded++;

          this.logger.debug(
            `market-data refresh: instrument=${instrument.displaySymbol} provider=${this.provider.name} price=${quote.priceDecimal}`,
          );
        } catch (error) {
          failed++;

          this.logger.error(
            `market-data ingest failed instrument=${instrument.displaySymbol} provider=${this.provider.name} error=${String(
              error,
            )}`,
          );
        }
      }

      this.logger.log(
        `market-data refresh completed provider=${this.provider.name} succeeded=${succeeded} failed=${failed} skipped=${skipped} durationMs=${
          Date.now() - started
        }`,
      );
    } catch (error) {
      /**
       * A provider-level failure means the entire batch failed.
       *
       * Critically, we do NOT create fallback prices.
       * Existing ticks remain unchanged and will eventually become stale.
       */
      this.handleProviderError(
        'batch',
        error,
      );

      this.logger.log(
        `market-data refresh completed provider=${this.provider.name} succeeded=0 failed=${active.length} durationMs=${
          Date.now() - started
        }`,
      );
    } finally {
      this.providerRefreshing = false;
    }
  }

  /**
   * Determine whether provider requests are currently suppressed.
   */
  private isProviderRateLimited(): boolean {
    return (
      Date.now() <
      this.providerRateLimitedUntil
    );
  }

  /**
   * Centralized provider error handling.
   *
   * HTTP 429 activates a temporary cooldown.
   *
   * No fallback/fake price is ever written.
   */
  private handleProviderError(
    instrument: string,
    error: unknown,
  ): void {
    const message = String(error);

    if (this.isRateLimitError(message)) {
      this.providerRateLimitedUntil =
        Date.now() +
        PROVIDER_RATE_LIMIT_COOLDOWN_MS;

      this.logger.warn(
        `market-data provider rate-limited provider=${this.provider.name} instrument=${instrument} cooldownMs=${PROVIDER_RATE_LIMIT_COOLDOWN_MS}`,
      );

      return;
    }

    this.logger.error(
      `market-data refresh failed instrument=${instrument} provider=${this.provider.name} error=${message}`,
    );
  }

  /**
   * Detect rate-limit errors without coupling the service to a
   * provider-specific error class.
   */
  private isRateLimitError(
    message: string,
  ): boolean {
    return (
      /\b429\b/.test(message) ||
      /too many requests/i.test(
        message,
      ) ||
      /rate.?limit/i.test(message)
    );
  }

  /**
   * Live tick stream for a specific instrument.
   */
  priceStream$(
    instrumentId: string,
  ): Observable<PriceQuote> {
    return this.ticks$
      .asObservable()
      .pipe(
        filter(
          (quote) =>
            quote.instrumentId ===
            instrumentId,
        ),
      );
  }
}