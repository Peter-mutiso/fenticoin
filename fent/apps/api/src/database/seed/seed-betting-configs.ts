/* eslint-disable no-console */
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { bettingConfigs, instruments } from '../schema';

/**
 * Default betting-config rows for every seeded instrument x bet type —
 * data, not business logic. An admin can change any of these via
 * `PUT /admin/betting/configs` at any time; this script only fills in
 * sensible starting values and never overwrites an existing row.
 */
const DEFAULT_CONFIG = {
  minStake: 100n, // 1.00 in the instrument's quote currency
  maxStake: 100_000n, // 1,000.00
  payoutRateBasisPoints: 8_500n, // 85% profit on a win
  maxExposure: 5_000_000n, // 50,000.00 aggregate open stake ceiling
  minDurationSeconds: 30n,
  maxDurationSeconds: 3_600n,
};

const BET_TYPES = ['rise_fall', 'higher_lower', 'up_down'] as const;

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL must be set to seed betting configs');

  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client);

  const allInstruments = await db.select().from(instruments);

  for (const instrument of allInstruments) {
    for (const betType of BET_TYPES) {
      const [existing] = await db
        .select()
        .from(bettingConfigs)
        .where(and(eq(bettingConfigs.instrumentId, instrument.id), eq(bettingConfigs.betType, betType)))
        .limit(1);
      if (existing) {
        console.log(`Config for ${instrument.displaySymbol} / ${betType} already exists — skipping`);
        continue;
      }

      await db.insert(bettingConfigs).values({ instrumentId: instrument.id, betType, ...DEFAULT_CONFIG });
      console.log(`Created betting config for ${instrument.displaySymbol} / ${betType}`);
    }
  }

  await client.end();
}

main().catch((error: unknown) => {
  console.error('Betting config seed failed:', error);
  process.exitCode = 1;
});
