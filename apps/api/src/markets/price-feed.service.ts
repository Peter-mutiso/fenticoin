import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  type OnModuleInit,
} from '@nestjs/common';
import { and, desc, eq, lte } from 'drizzle-orm';
import { filter, Observable, Subject } from 'rxjs';

import { DRIZZLE_CLIENT } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.types';
import {
  type Instrument,
  type PriceTick,
  priceTicks,
} from '../database/schema';
import { decimalStringToScaledBigInt } from './decimal';
import {
  NoPriceAvailableError,
  StalePriceError,
} from './errors';
import { InstrumentService } from './instrument.service';
import {
  toPriceQuote,
  type PriceQuote,
} from './price-quote';
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
 * normal stale-price validation.
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
   * Prevent overlapping provider refresh operations in this process.
   */
  private providerRefreshing = false;

  /**
   * Timestamp of the last actual provider request attempt.
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
        `Market data provider "${this.provider.name}" is not configured — ` +
          `scheduled price refreshes will fail and prices will eventually become stale.`,
      );
    }
  }

  /**
   * Append a new trusted price tick.
   *
   * This is the only method that writes to price_ticks.
   *
   * No fabricated, fallback, zero, negative, NaN, or undefined prices
   * are ever written.
   */
  async ingestTick(
    instrument: Instrument,
    quote: {
      priceDecimal: string;
      source: string;
      observedAt: Date;
    },
  ): Promise<PriceQuote> {
    if (!quote.priceDecimal) {
      throw new BadRequestException(
        `Price is missing for instrument ${instrument.displaySymbol}`,
      );
    }

    if (!quote.source) {
      throw new BadRequestException(
        `Price source is missing for instrument ${instrument.displaySymbol}`,
      );
    }

    if (!(quote.observedAt instanceof Date)) {
      throw new BadRequestException(
        `Price observedAt is invalid for instrument ${instrument.displaySymbol}`,
      );
    }

    if (Number.isNaN(quote.observedAt.getTime())) {
      throw new BadRequestException(
        `Price observedAt is invalid for instrument ${instrument.displaySymbol}`,
      );
    }

    const normalizedPrice = String(quote.priceDecimal).trim();

    if (!normalizedPrice) {
      throw new BadRequestException(
        `Price is empty for instrument ${instrument.displaySymbol}`,
      );
    }

    const scaled = decimalStringToScaledBigInt(
      normalizedPrice,
      instrument.pricePrecision,
    );

    if (scaled <= 0n) {
      throw new BadRequestException(
        `Price must be positive for instrument ${instrument.displaySymbol}`,
      );
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

    /**
     * Update the latest-price cache immediately.
     */
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

    /**
     * Defensive validation of the domain quote before exposing it
     * through the live stream.
     *
     * This prevents an invalid quote from propagating to SSE/WebSocket
     * consumers and ultimately producing "price: undefined" in the UI.
     */
    this.assertValidPriceQuote(
      priceQuote,
      instrument,
    );

    this.ticks$.next(priceQuote);

    return priceQuote;
  }
async getLatestPrice(
  instrumentId: string,
): Promise<PriceQuote> {
  const instrument = await this.instrumentService.getById(instrumentId);

  const getFreshTickFromStorage = async (): Promise<PriceTick | undefined> => {
    const cached = this.cache.get(instrumentId);

    if (
      cached &&
      Date.now() - cached.cachedAt <= CACHE_TTL_MS
    ) {
      return cached.tick;
    }

    const [dbTick] = await this.db
      .select()
      .from(priceTicks)
      .where(eq(priceTicks.instrumentId, instrumentId))
      .orderBy(desc(priceTicks.observedAt))
      .limit(1);

    if (dbTick) {
      this.cache.set(instrumentId, {
        tick: dbTick,
        instrument,
        cachedAt: Date.now(),
      });
    }

    return dbTick;
  };

  let tick = await getFreshTickFromStorage();

  /*
   * If we already have a valid fresh price, use it immediately.
   */
  if (tick) {
    this.assertValidTick(tick, instrument);

    const ageSeconds =
      (Date.now() - tick.observedAt.getTime()) / 1000;

    if (ageSeconds <= instrument.maxPriceAgeSeconds) {
      const priceQuote = toPriceQuote(
        tick,
        instrument,
        false,
      );

      this.assertValidPriceQuote(
        priceQuote,
        instrument,
      );

      return priceQuote;
    }
  }

  /*
   * The stored price is missing or stale.
   *
   * Before rejecting the bet, attempt to obtain a fresh trusted
   * provider quote immediately.
   */
  const refreshed = await this.refreshFromProvider(instrument);

  if (refreshed) {
    const refreshedAgeSeconds =
      (Date.now() - refreshed.observedAt.getTime()) / 1000;

    if (
      refreshedAgeSeconds <=
      instrument.maxPriceAgeSeconds
    ) {
      return refreshed;
    }

    this.logger.warn(
      `Provider returned stale quote for ` +
        `instrument=${instrument.displaySymbol} ` +
        `ageSeconds=${Math.round(refreshedAgeSeconds)} ` +
        `maxAgeSeconds=${instrument.maxPriceAgeSeconds}`,
    );
  }

  /*
   * Re-read the database once more in case another process/scheduler
   * inserted a fresh tick while the provider refresh was happening.
   */
  tick = await getFreshTickFromStorage();

  if (tick) {
    this.assertValidTick(tick, instrument);

    const ageSeconds =
      (Date.now() - tick.observedAt.getTime()) / 1000;

    if (ageSeconds <= instrument.maxPriceAgeSeconds) {
      const priceQuote = toPriceQuote(
        tick,
        instrument,
        false,
      );

      this.assertValidPriceQuote(
        priceQuote,
        instrument,
      );

      return priceQuote;
    }

    throw new StalePriceError({
      instrumentId,
      ageSeconds: Math.round(ageSeconds),
      maxAgeSeconds: instrument.maxPriceAgeSeconds,
    });
  }

  throw new NoPriceAvailableError(instrumentId);
}
  
  async getPriceForSettlement(
    instrumentId: string,
    at: Date,
  ): Promise<PriceQuote> {
    if (!(at instanceof Date)) {
      throw new BadRequestException(
        'Settlement timestamp is invalid',
      );
    }

    if (Number.isNaN(at.getTime())) {
      throw new BadRequestException(
        'Settlement timestamp is invalid',
      );
    }

    const instrument =
      await this.instrumentService.getById(
        instrumentId,
      );

    /**
     * IMPORTANT:
     *
     * We deliberately select only prices that were observed at or before
     * the settlement timestamp.
     *
     * A future price must never influence settlement.
     */
    const [tick] = await this.db
      .select()
      .from(priceTicks)
      .where(
        and(
          eq(
            priceTicks.instrumentId,
            instrumentId,
          ),
          lte(
            priceTicks.observedAt,
            at,
          ),
        ),
      )
      .orderBy(
        desc(priceTicks.observedAt),
      )
      .limit(1);

    if (!tick) {
      throw new NoPriceAvailableError(
        instrumentId,
      );
    }

    this.assertValidTick(
      tick,
      instrument,
    );

    /**
     * Settlement staleness is measured relative to the settlement
     * timestamp, not the current wall clock.
     */
    const ageSeconds =
      (at.getTime() -
        tick.observedAt.getTime()) /
      1000;

    /**
     * Defensive protection against an impossible future tick.
     */
    if (ageSeconds < 0) {
      throw new StalePriceError({
        instrumentId,
        ageSeconds: 0,
        maxAgeSeconds:
          instrument.maxPriceAgeSeconds,
      });
    }

    if (
      ageSeconds >
      instrument.maxPriceAgeSeconds
    ) {
      throw new StalePriceError({
        instrumentId,
        ageSeconds: Math.round(
          ageSeconds,
        ),
        maxAgeSeconds:
          instrument.maxPriceAgeSeconds,
      });
    }

    const priceQuote = toPriceQuote(
      tick,
      instrument,
      false,
    );

    this.assertValidPriceQuote(
      priceQuote,
      instrument,
    );

    return priceQuote;
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
        `Market-data refresh skipped instrument=${instrument.displaySymbol} ` +
          `provider=${this.provider.name} reason=provider-not-configured`,
      );

      return undefined;
    }

    if (this.isProviderRateLimited()) {
      this.logger.warn(
        `Market-data refresh skipped instrument=${instrument.displaySymbol} ` +
          `provider=${this.provider.name} reason=provider-rate-limit-cooldown`,
      );

      return undefined;
    }

    try {
      /**
       * Record the actual provider request attempt.
       *
       * Manual refreshes also respect the rate-limit cooldown, but do not
       * manipulate the scheduler's global refresh timestamp.
       */
      const quotes =
        await this.provider.getQuotes([
          {
            providerSymbol:
              instrument.providerSymbol,
            quoteCurrency:
              instrument.quoteCurrency,
          },
        ]);

      const quote = quotes.find(
        (candidate) =>
          candidate.providerSymbol ===
          instrument.providerSymbol,
      );

      if (!quote) {
        this.logger.warn(
          `market-data refresh: no quote returned ` +
            `instrument=${instrument.displaySymbol} ` +
            `provider=${this.provider.name}`,
        );

        return undefined;
      }

      if (!quote.priceDecimal) {
        this.logger.warn(
          `market-data refresh: provider returned an empty price ` +
            `instrument=${instrument.displaySymbol} ` +
            `provider=${this.provider.name}`,
        );

        return undefined;
      }

      const ingested =
        await this.ingestTick(
          instrument,
          {
            priceDecimal:
              String(
                quote.priceDecimal,
              ),
            source:
              this.provider.name,
            observedAt:
              quote.observedAt,
          },
        );

      this.logger.debug(
        `market-data refresh: instrument=${instrument.displaySymbol} ` +
          `provider=${this.provider.name} ` +
          `price=${quote.priceDecimal}`,
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
   * Exactly ONE provider request is made for all refreshable instruments.
   *
   * Example:
   *
   * BTC + ETH + SOL + XRP
   *
   * instead of:
   *
   * BTC request
   * ETH request
   * SOL request
   * XRP request
   */
  async refreshAllActive(): Promise<void> {
    const started = Date.now();

    if (!this.provider.isConfigured()) {
      this.logger.warn(
        `market-data refresh skipped provider=${this.provider.name} ` +
          `reason=provider-not-configured`,
      );

      return;
    }

    if (this.providerRefreshing) {
      this.logger.warn(
        `market-data refresh skipped provider=${this.provider.name} ` +
          `reason=previous-refresh-still-running`,
      );

      return;
    }

    if (this.isProviderRateLimited()) {
      const remainingMs =
        this.providerRateLimitedUntil -
        Date.now();

      this.logger.warn(
        `market-data refresh skipped provider=${this.provider.name} ` +
          `reason=rate-limit-cooldown ` +
          `remainingMs=${Math.max(
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
        `market-data refresh skipped provider=${this.provider.name} ` +
          `reason=minimum-refresh-interval ` +
          `remainingMs=${
            PROVIDER_MIN_REFRESH_INTERVAL_MS -
            elapsedSinceLastRefresh
          }`,
      );

      return;
    }

    this.providerRefreshing = true;

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
          `market-data refresh skipped provider=${this.provider.name} ` +
            `reason=no-active-instruments`,
        );

        return;
      }

      const refreshable =
        active.filter(
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
          `market-data refresh completed provider=${this.provider.name} ` +
            `succeeded=0 failed=0 skipped=${skipped} ` +
            `durationMs=${
              Date.now() - started
            }`,
        );

        return;
      }

      /**
       * Record the timestamp immediately before the actual provider
       * request.
       *
       * Database/instrument lookup failures therefore do not incorrectly
       * consume the provider refresh interval.
       */
      this.lastProviderRefreshAt =
        Date.now();

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
            `market-data refresh: no quote returned ` +
              `instrument=${instrument.displaySymbol} ` +
              `provider=${this.provider.name}`,
          );

          continue;
        }

        if (!quote.priceDecimal) {
          failed++;

          this.logger.warn(
            `market-data refresh: provider returned no price ` +
              `instrument=${instrument.displaySymbol} ` +
              `provider=${this.provider.name}`,
          );

          continue;
        }

        try {
          await this.ingestTick(
            instrument,
            {
              priceDecimal:
                String(
                  quote.priceDecimal,
                ),
              source:
                this.provider.name,
              observedAt:
                quote.observedAt,
            },
          );

          succeeded++;

          this.logger.debug(
            `market-data refresh: instrument=${instrument.displaySymbol} ` +
              `provider=${this.provider.name} ` +
              `price=${quote.priceDecimal}`,
          );
        } catch (error) {
          failed++;

          this.logger.error(
            `market-data ingest failed ` +
              `instrument=${instrument.displaySymbol} ` +
              `provider=${this.provider.name} ` +
              `error=${String(error)}`,
          );
        }
      }

      this.logger.log(
        `market-data refresh completed ` +
          `provider=${this.provider.name} ` +
          `succeeded=${succeeded} ` +
          `failed=${failed} ` +
          `skipped=${skipped} ` +
          `durationMs=${
            Date.now() - started
          }`,
      );
    } catch (error) {
      /**
       * A provider-level failure means the entire batch failed.
       *
       * Critically, no fallback/fake prices are created.
       * Existing ticks remain unchanged and will naturally become stale.
       */
      this.handleProviderError(
        'batch',
        error,
      );

      this.logger.log(
        `market-data refresh completed ` +
          `provider=${this.provider.name} ` +
          `succeeded=0 ` +
          `failed=${active.length} ` +
          `durationMs=${
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
    const message =
      this.errorMessage(error);

    if (this.isRateLimitError(error)) {
      this.providerRateLimitedUntil =
        Date.now() +
        PROVIDER_RATE_LIMIT_COOLDOWN_MS;

      this.logger.warn(
        `market-data provider rate-limited ` +
          `provider=${this.provider.name} ` +
          `instrument=${instrument} ` +
          `cooldownMs=${PROVIDER_RATE_LIMIT_COOLDOWN_MS}`,
      );

      return;
    }

    this.logger.error(
      `market-data refresh failed ` +
        `instrument=${instrument} ` +
        `provider=${this.provider.name} ` +
        `error=${message}`,
    );
  }

  /**
   * Extract a useful error message without relying on String(error)
   * for every possible provider error shape.
   */
  private errorMessage(
    error: unknown,
  ): string {
    if (error instanceof Error) {
      return error.message;
    }

    if (
      typeof error === 'object' &&
      error !== null
    ) {
      try {
        return JSON.stringify(error);
      } catch {
        return String(error);
      }
    }

    return String(error);
  }

  /**
   * Detect provider rate-limit errors.
   *
   * Supports common HTTP/client error shapes while retaining a
   * provider-neutral implementation.
   */
  private isRateLimitError(
    error: unknown,
  ): boolean {
    if (
      typeof error === 'object' &&
      error !== null
    ) {
      const candidate =
        error as {
          status?: unknown;
          statusCode?: unknown;
          response?: {
            status?: unknown;
          };
        };

      if (
        candidate.status === 429 ||
        candidate.statusCode === 429 ||
        candidate.response?.status === 429
      ) {
        return true;
      }
    }

    const message =
      this.errorMessage(error);

    return (
      /\b429\b/.test(message) ||
      /too many requests/i.test(
        message,
      ) ||
      /rate.?limit/i.test(message)
    );
  }

  /**
   * Validate a persisted tick before exposing it to trading code.
   *
   * This is deliberately defensive because financial calculations must
   * never operate on an invalid market price.
   */
  private assertValidTick(
    tick: PriceTick,
    instrument: Instrument,
  ): void {
    if (!tick) {
      throw new NoPriceAvailableError(
        instrument.id,
      );
    }

    if (
      tick.price === null ||
      tick.price === undefined
    ) {
      throw new NoPriceAvailableError(
        instrument.id,
      );
    }

    if (tick.price <= 0n) {
      throw new BadRequestException(
        `Invalid non-positive price for instrument ${instrument.displaySymbol}`,
      );
    }

    if (
      !(tick.observedAt instanceof Date) ||
      Number.isNaN(
        tick.observedAt.getTime(),
      )
    ) {
      throw new NoPriceAvailableError(
        instrument.id,
      );
    }
  }

  /**
   * Validate the public quote returned to API/frontend consumers.
   *
   * PriceQuote.price is intentionally a decimal string.
   *
   * This catches a broken price-quote mapping at the service boundary
   * instead of allowing:
   *
   *   price: undefined
   *
   * to propagate into the frontend.
   */
  private assertValidPriceQuote(
    quote: PriceQuote,
    instrument: Instrument,
  ): void {
    if (!quote) {
      throw new NoPriceAvailableError(
        instrument.id,
      );
    }

    const price = quote.price?.trim();

    if (!price) {
      this.logger.error(
        `Invalid PriceQuote produced for instrument=${instrument.displaySymbol}. ` +
          `The PriceQuote mapper did not expose a price value.`,
      );

      throw new NoPriceAvailableError(
        instrument.id,
      );
    }

    /**
     * Accept only a normal decimal representation.
     *
     * Examples:
     *   100
     *   100.25
     *   0.50
     *   .50
     *
     * Reject:
     *   NaN
     *   Infinity
     *   undefined
     *   empty strings
     *   scientific notation
     *   malformed decimals
     */
    if (
      !/^[+]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(
        price,
      )
    ) {
      throw new BadRequestException(
        `Invalid price quote for instrument ${instrument.displaySymbol}`,
      );
    }

    if (
      decimalStringToScaledBigInt(
        price,
        instrument.pricePrecision,
      ) <= 0n
    ) {
      throw new BadRequestException(
        `Invalid price quote for instrument ${instrument.displaySymbol}`,
      );
    }
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