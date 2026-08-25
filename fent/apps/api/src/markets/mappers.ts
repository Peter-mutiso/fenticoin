import type { Instrument, MarketCategory } from '../database/schema';
import type { PriceQuote } from './price-quote';

export function serializeInstrument(instrument: Instrument) {
  return {
    id: instrument.id,
    symbol: instrument.symbol,
    quoteCurrency: instrument.quoteCurrency,
    displaySymbol: instrument.displaySymbol,
    name: instrument.name,
    categoryKey: instrument.categoryKey,
    pricePrecision: instrument.pricePrecision,
    status: instrument.status,
    maxPriceAgeSeconds: instrument.maxPriceAgeSeconds,
    tradingSchedule: instrument.tradingSchedule,
    createdAt: instrument.createdAt,
    updatedAt: instrument.updatedAt,
  };
}

export function serializeMarketCategory(category: MarketCategory) {
  return {
    key: category.key,
    name: category.name,
    description: category.description,
    displayOrder: category.displayOrder,
    isActive: category.isActive,
  };
}

export function serializePriceQuote(quote: PriceQuote) {
  return {
    instrumentId: quote.instrumentId,
    price: quote.price.toDecimalString(),
    priceMinorUnits: quote.price.toMinorUnits().toString(),
    currency: quote.price.currency.code,
    source: quote.source,
    observedAt: quote.observedAt,
    receivedAt: quote.receivedAt,
    isStale: quote.isStale,
  };
}
