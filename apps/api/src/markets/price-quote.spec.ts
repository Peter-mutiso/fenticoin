import type { PriceTick } from '../database/schema';
import { toPriceQuote } from './price-quote';

describe('toPriceQuote', () => {
  it('wraps a raw tick as exact Money using the instrument precision/currency', () => {
    const tick = {
      id: 'tick-1',
      instrumentId: 'inst-1',
      price: 11_250_327n,
      source: 'test',
      observedAt: new Date('2026-01-01T00:00:00Z'),
      receivedAt: new Date('2026-01-01T00:00:01Z'),
    } as PriceTick;

    const quote = toPriceQuote(tick, { quoteCurrency: 'USD', pricePrecision: 2 }, false);

    expect(quote.price).toBe('112503.27');
expect(quote.quoteCurrency).toBe('USD');
expect(quote.pricePrecision).toBe(2);
    expect(quote.isStale).toBe(false);
    expect(quote.source).toBe('test');
  });
});
