import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, desc, eq, gte, lt } from 'drizzle-orm';
import { filter, Observable, Subject } from 'rxjs';

import { DRIZZLE_CLIENT } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.types';
import { type Instrument, type PriceTick, priceTicks } from '../database/schema';
import { decimalStringToScaledBigInt } from './decimal';
import { NoPriceAvailableError, StalePriceError } from './errors';
import { InstrumentService } from './instrument.service';
import { toPriceQuote, type PriceQuote } from './price-quote';
import { MARKET_DATA_PROVIDER, type MarketDataProvider } from './providers/market-data-provider.interface';

const CACHE_TTL_MS = 2_000;

interface CacheEntry {
  tick: PriceTick;
  instrument: Instrument;
  cachedAt: number;
}

/**
 * The single source of truth for "what is the current price of this
 * instrument, and can it be trusted." Everything downstream — the public
 * API, the SSE stream, and eventually bet settlement — goes through
 * `getLatestPrice`, which is the one place staleness is enforced.
 */
@Injectable()
export class PriceFeedService {
  private readonly logger = new Logger(PriceFeedService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ticks$ = new Subject<PriceQuote>();

  constructor(
    @Inject(DRIZZLE_CLIENT) private readonly db: DrizzleDb,
    private readonly instrumentService: InstrumentService,
    @Inject(MARKET_DATA_PROVIDER) private readonly provider: MarketDataProvider,
  ) {}

  /**
   * Records a new tick. This is the only place `price_ticks` is ever
   * written — always append-only, and the source of truth the cache is
   * merely a read-through accelerator for.
   */
  async ingestTick(
    instrument: Instrument,
    quote: { priceDecimal: string; source: string; observedAt: Date },
  ): Promise<PriceQuote> {
    const scaled = decimalStringToScaledBigInt(quote.priceDecimal, instrument.pricePrecision);
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
    if (!tick) throw new Error('Failed to insert price tick');

    this.cache.set(instrument.id, { tick, instrument, cachedAt: Date.now() });

    const priceQuote = toPriceQuote(tick, instrument, false);
    this.ticks$.next(priceQuote);
    return priceQuote;
  }

  /**
   * The trusted read path. Throws `StalePriceError` if the newest tick is
   * older than the instrument's `maxPriceAgeSeconds`, and
   * `NoPriceAvailableError` if there has never been one — callers
   * (including a future settlement engine) must handle both rather than
   * silently proceeding with bad data.
   */
  async getLatestPrice(instrumentId: string): Promise<PriceQuote> {
    const instrument = await this.instrumentService.getById(instrumentId);

    const cached = this.cache.get(instrumentId);
    let tick = cached?.tick;

    if (!tick || Date.now() - cached!.cachedAt > CACHE_TTL_MS) {
      const [dbTick] = await this.db
        .select()
        .from(priceTicks)
        .where(eq(priceTicks.instrumentId, instrumentId))
        .orderBy(desc(priceTicks.observedAt))
        .limit(1);
      tick = dbTick;
      if (tick) this.cache.set(instrumentId, { tick, instrument, cachedAt: Date.now() });
    }

    if (!tick) {
      throw new NoPriceAvailableError(instrumentId);
    }

    const ageSeconds = (Date.now() - tick.observedAt.getTime()) / 1000;
    if (ageSeconds > instrument.maxPriceAgeSeconds) {
      throw new StalePriceError({
        instrumentId,
        ageSeconds: Math.round(ageSeconds),
        maxAgeSeconds: instrument.maxPriceAgeSeconds,
      });
    }

    return toPriceQuote(tick, instrument, false);
  }

  /**
   * The trusted price for a *specific point in time* — what bet
   * settlement uses instead of `getLatestPrice`, since by the time a bet
   * is actually settled "now" may be well past its `expiresAt`. Prefers
   * the earliest tick at/after `at` (the first price recorded once
   * expiry arrived); falls back to the latest tick before it if the feed
   * hadn't produced one yet. Staleness is measured against `at`, not
   * against the current wall-clock time, for the same reason.
   */
  async getPriceForSettlement(instrumentId: string, at: Date): Promise<PriceQuote> {
    const instrument = await this.instrumentService.getById(instrumentId);

    const [tickAtOrAfter] = await this.db
      .select()
      .from(priceTicks)
      .where(and(eq(priceTicks.instrumentId, instrumentId), gte(priceTicks.observedAt, at)))
      .orderBy(asc(priceTicks.observedAt))
      .limit(1);

    let tick = tickAtOrAfter;
    if (!tick) {
      const [tickBefore] = await this.db
        .select()
        .from(priceTicks)
        .where(and(eq(priceTicks.instrumentId, instrumentId), lt(priceTicks.observedAt, at)))
        .orderBy(desc(priceTicks.observedAt))
        .limit(1);
      tick = tickBefore;
    }

    if (!tick) {
      throw new NoPriceAvailableError(instrumentId);
    }

    const ageSeconds = Math.abs(tick.observedAt.getTime() - at.getTime()) / 1000;
    if (ageSeconds > instrument.maxPriceAgeSeconds) {
      throw new StalePriceError({
        instrumentId,
        ageSeconds: Math.round(ageSeconds),
        maxAgeSeconds: instrument.maxPriceAgeSeconds,
      });
    }

    return toPriceQuote(tick, instrument, false);
  }

  /**
   * Pulls one fresh quote from the configured provider and ingests it.
   * Provider failures (network error, no quote returned, provider not
   * configured) are logged and swallowed here, never surfaced as a
   * fabricated price — the existing latest tick just ages, and
   * `getLatestPrice` will eventually start reporting it stale.
   */
  async refreshFromProvider(instrument: Instrument): Promise<PriceQuote | undefined> {
    if (!instrument.providerSymbol) {
      this.logger.warn(`Instrument ${instrument.displaySymbol} has no providerSymbol configured — skipping refresh`);
      return undefined;
    }

    try {
      const [quote] = await this.provider.getQuotes([
        { providerSymbol: instrument.providerSymbol, quoteCurrency: instrument.quoteCurrency },
      ]);
      if (!quote) {
        this.logger.warn(`${this.provider.name} returned no quote for ${instrument.displaySymbol}`);
        return undefined;
      }
      return await this.ingestTick(instrument, {
        priceDecimal: quote.priceDecimal,
        source: this.provider.name,
        observedAt: quote.observedAt,
      });
    } catch (error) {
      this.logger.error(
        `Failed to refresh ${instrument.displaySymbol} from ${this.provider.name}: ${String(error)}`,
      );
      return undefined;
    }
  }

  async refreshAllActive(): Promise<void> {
    const active = (await this.instrumentService.list()).filter((i) => i.status === 'active');
    await Promise.all(active.map((instrument) => this.refreshFromProvider(instrument)));
  }

  /** Live tick stream for one instrument — see `MarketsController`'s SSE endpoint. */
  priceStream$(instrumentId: string): Observable<PriceQuote> {
    return this.ticks$.asObservable().pipe(filter((quote) => quote.instrumentId === instrumentId));
  }
}
