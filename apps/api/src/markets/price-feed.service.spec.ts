import { BadRequestException } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

import type { DrizzleDb } from '../database/database.types';
import type { Instrument } from '../database/schema';
import { chainable } from '../test-utils/mock-drizzle';
import { NoPriceAvailableError, StalePriceError } from './errors';
import type { InstrumentService } from './instrument.service';
import { PriceFeedService } from './price-feed.service';
import type { MarketDataProvider } from './providers/market-data-provider.interface';

const NOW = new Date();

function instrument(overrides: Partial<Instrument> = {}): Instrument {
  return {
    id: 'inst-btc',
    symbol: 'BTC',
    quoteCurrency: 'USD',
    displaySymbol: 'BTC/USD',
    name: 'Bitcoin',
    categoryKey: 'crypto',
    providerSymbol: 'bitcoin',
    pricePrecision: 2,
    status: 'active',
    maxPriceAgeSeconds: 30,
    tradingSchedule: null,
    createdBy: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as Instrument;
}

function makeHarness(overrides: { db?: Partial<DrizzleDb> } = {}) {
  const db = { select: jest.fn(), insert: jest.fn(), ...overrides.db } as unknown as DrizzleDb;
  const instrumentService = { getById: jest.fn(), list: jest.fn() } as unknown as InstrumentService;
  const provider = { name: 'TestProvider', isConfigured: () => true, getQuotes: jest.fn() } as unknown as MarketDataProvider;
  const service = new PriceFeedService(db, instrumentService, provider);
  return { service, db, instrumentService, provider };
}

describe('PriceFeedService', () => {
  describe('ingestTick', () => {
    it('rejects a non-positive price', async () => {
      const { service } = makeHarness();
      await expect(
        service.ingestTick(instrument(), { priceDecimal: '0', source: 'test', observedAt: NOW }),
      ).rejects.toThrow(BadRequestException);
    });

    it('scales the decimal price using the instrument precision and returns an exact Money quote', async () => {
      const insertChain = chainable([
        { id: 'tick-1', instrumentId: 'inst-btc', price: 11_250_327n, source: 'test', observedAt: NOW, receivedAt: NOW },
      ]);
      const insert = jest.fn().mockReturnValue(insertChain);
      const { service } = makeHarness({ db: { insert } });

      const quote = await service.ingestTick(instrument(), { priceDecimal: '112503.27', source: 'test', observedAt: NOW });

      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({ instrumentId: 'inst-btc', price: 11_250_327n, source: 'test' }),
      );
      expect(quote.price.toDecimalString()).toBe('112503.27');
      expect(quote.isStale).toBe(false);
    });

    it('publishes the tick on the price stream for that instrument', async () => {
      const insert = jest.fn().mockReturnValue(
        chainable([{ id: 'tick-1', instrumentId: 'inst-btc', price: 100n, source: 'test', observedAt: NOW, receivedAt: NOW }]),
      );
      const { service } = makeHarness({ db: { insert } });

      const received = firstValueFrom(service.priceStream$('inst-btc'));
      await service.ingestTick(instrument(), { priceDecimal: '1.00', source: 'test', observedAt: NOW });

      const quote = await received;
      expect(quote.instrumentId).toBe('inst-btc');
    });
  });

  describe('getLatestPrice', () => {
    it('throws NoPriceAvailableError when there has never been a tick', async () => {
      const { service, instrumentService, db } = makeHarness();
      (instrumentService.getById as jest.Mock).mockResolvedValue(instrument());
      (db.select as jest.Mock).mockReturnValue(chainable([]));

      await expect(service.getLatestPrice('inst-btc')).rejects.toThrow(NoPriceAvailableError);
    });

    it('returns the latest tick as a non-stale quote when it is within maxPriceAgeSeconds', async () => {
      const { service, instrumentService, db } = makeHarness();
      (instrumentService.getById as jest.Mock).mockResolvedValue(instrument({ maxPriceAgeSeconds: 30 }));
      (db.select as jest.Mock).mockReturnValue(
        chainable([{ id: 'tick-1', instrumentId: 'inst-btc', price: 11_250_327n, observedAt: new Date(), receivedAt: new Date() }]),
      );

      const quote = await service.getLatestPrice('inst-btc');
      expect(quote.isStale).toBe(false);
      expect(quote.price.toDecimalString()).toBe('112503.27');
    });

    it('throws StalePriceError when the latest tick is older than maxPriceAgeSeconds', async () => {
      const { service, instrumentService, db } = makeHarness();
      (instrumentService.getById as jest.Mock).mockResolvedValue(instrument({ maxPriceAgeSeconds: 30 }));
      const oldObservedAt = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes old
      (db.select as jest.Mock).mockReturnValue(
        chainable([{ id: 'tick-1', instrumentId: 'inst-btc', price: 100n, observedAt: oldObservedAt, receivedAt: oldObservedAt }]),
      );

      await expect(service.getLatestPrice('inst-btc')).rejects.toThrow(StalePriceError);
    });

    it('serves from the in-memory cache without a second DB read within the cache TTL', async () => {
      const insert = jest.fn().mockReturnValue(
        chainable([{ id: 'tick-1', instrumentId: 'inst-btc', price: 100n, source: 'test', observedAt: new Date(), receivedAt: new Date() }]),
      );
      const select = jest.fn();
      const { service, instrumentService } = makeHarness({ db: { insert, select } });
      (instrumentService.getById as jest.Mock).mockResolvedValue(instrument());

      await service.ingestTick(instrument(), { priceDecimal: '1.00', source: 'test', observedAt: new Date() });
      await service.getLatestPrice('inst-btc');

      expect(select).not.toHaveBeenCalled(); // cache satisfied the read
    });
  });

  describe('refreshFromProvider', () => {
    it('skips instruments with no providerSymbol configured', async () => {
      const { service, provider } = makeHarness();
      const result = await service.refreshFromProvider(instrument({ providerSymbol: null }));
      expect(result).toBeUndefined();
      expect(provider.getQuotes).not.toHaveBeenCalled();
    });

    it('ingests the quote returned by the provider', async () => {
      const insert = jest.fn().mockReturnValue(
        chainable([{ id: 'tick-1', instrumentId: 'inst-btc', price: 11_250_000n, source: 'TestProvider', observedAt: NOW, receivedAt: NOW }]),
      );
      const { service, provider } = makeHarness({ db: { insert } });
      (provider.getQuotes as jest.Mock).mockResolvedValue([
        { providerSymbol: 'bitcoin', quoteCurrency: 'USD', priceDecimal: '112500.00', observedAt: NOW },
      ]);

      const result = await service.refreshFromProvider(instrument());
      expect(result?.price.toDecimalString()).toBe('112500.00');
    });

    it('returns undefined (never throws) when the provider returns no quote', async () => {
      const { service, provider } = makeHarness();
      (provider.getQuotes as jest.Mock).mockResolvedValue([]);
      const result = await service.refreshFromProvider(instrument());
      expect(result).toBeUndefined();
    });

    it('swallows a provider failure instead of throwing or fabricating a price', async () => {
      const { service, provider } = makeHarness();
      (provider.getQuotes as jest.Mock).mockRejectedValue(new Error('network error'));
      await expect(service.refreshFromProvider(instrument())).resolves.toBeUndefined();
    });
  });

  describe('refreshAllActive', () => {
    it('isolates missing provider quotes — instruments with returned quotes are ingested independently', async () => {
  const insertChain = chainable([
    {
      id: 'tick-1',
      price: 100n,
      source: 'TestProvider',
      observedAt: NOW,
      receivedAt: NOW,
    },
  ]);

  const insert = jest.fn().mockReturnValue(insertChain);

  const { service, instrumentService, provider } = makeHarness({
    db: { insert },
  });

  (instrumentService.list as jest.Mock).mockResolvedValue([
    instrument({
      id: 'a',
      providerSymbol: 'bitcoin',
      status: 'active',
    }),
    instrument({
      id: 'b',
      providerSymbol: 'ethereum',
      status: 'active',
    }),
    instrument({
      id: 'c',
      providerSymbol: 'solana',
      status: 'active',
    }),
  ]);

  (provider.getQuotes as jest.Mock).mockResolvedValue([
    {
      providerSymbol: 'bitcoin',
      quoteCurrency: 'USD',
      priceDecimal: '1.00',
      observedAt: NOW,
    },
    {
      providerSymbol: 'solana',
      quoteCurrency: 'USD',
      priceDecimal: '1.00',
      observedAt: NOW,
    },
  ]);

  await service.refreshAllActive();

  const insertedInstrumentIds = insertChain.values.mock.calls.map(
    ([values]: [{ instrumentId: string }]) =>
      values.instrumentId,
  );

  expect(insertedInstrumentIds.sort()).toEqual(['a', 'c']);
});

  });

  describe('onModuleInit', () => {
    it('logs the selected provider name and configured status', () => {
      const { service, provider } = makeHarness();
      const logSpy = jest.spyOn((service as unknown as { logger: { log: (msg: string) => void } }).logger, 'log');

      service.onModuleInit();

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(provider.name));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('configured=true'));
    });

    it('warns loudly when the selected provider is not configured', () => {
      const { service, provider } = makeHarness();
      (provider as { isConfigured: () => boolean }).isConfigured = () => false;
      const warnSpy = jest.spyOn((service as unknown as { logger: { warn: (msg: string) => void } }).logger, 'warn');

      service.onModuleInit();

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not configured'));
    });
  });
});
