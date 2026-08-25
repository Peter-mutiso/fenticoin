/* eslint-disable no-console */
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { instruments, marketCategories } from '../schema';

/**
 * Seeds the *initial* market category and instrument set. This is data,
 * not code: the application never hardcodes "BTC/ETH/SOL/XRP" anywhere —
 * `InstrumentService`/`MarketsController` work against whatever rows
 * exist in `instruments`, and an admin can add/suspend/retire any of them
 * (or add new ones) at runtime with no deploy. Idempotent — safe to
 * re-run; existing rows are left untouched.
 *
 * `providerSymbol` values are CoinGecko coin ids, matching
 * `CoinGeckoMarketDataProvider` — irrelevant to the dev-fixture provider,
 * which ignores them and simulates data regardless.
 */
const SEED_CATEGORY = { key: 'crypto', name: 'Crypto', description: 'Cryptocurrency instruments', displayOrder: 0 };

const SEED_INSTRUMENTS = [
  { symbol: 'BTC', quoteCurrency: 'USD', name: 'Bitcoin', providerSymbol: 'bitcoin' },
  { symbol: 'ETH', quoteCurrency: 'USD', name: 'Ethereum', providerSymbol: 'ethereum' },
  { symbol: 'SOL', quoteCurrency: 'USD', name: 'Solana', providerSymbol: 'solana' },
  { symbol: 'XRP', quoteCurrency: 'USD', name: 'Ripple', providerSymbol: 'ripple' },
] as const;

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL must be set to seed instruments');

  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client);

  const [existingCategory] = await db
    .select()
    .from(marketCategories)
    .where(eq(marketCategories.key, SEED_CATEGORY.key))
    .limit(1);
  if (!existingCategory) {
    await db.insert(marketCategories).values(SEED_CATEGORY);
    console.log(`Created market category "${SEED_CATEGORY.key}"`);
  }

  for (const seed of SEED_INSTRUMENTS) {
    const [existing] = await db
      .select()
      .from(instruments)
      .where(eq(instruments.symbol, seed.symbol))
      .limit(1);
    if (existing) {
      console.log(`Instrument ${seed.symbol}/${seed.quoteCurrency} already exists — skipping`);
      continue;
    }

    await db.insert(instruments).values({
      symbol: seed.symbol,
      quoteCurrency: seed.quoteCurrency,
      displaySymbol: `${seed.symbol}/${seed.quoteCurrency}`,
      name: seed.name,
      categoryKey: SEED_CATEGORY.key,
      providerSymbol: seed.providerSymbol,
      pricePrecision: 2,
      maxPriceAgeSeconds: 30,
    });
    console.log(`Created instrument ${seed.symbol}/${seed.quoteCurrency}`);
  }

  await client.end();
}

main().catch((error: unknown) => {
  console.error('Instrument seed failed:', error);
  process.exitCode = 1;
});
