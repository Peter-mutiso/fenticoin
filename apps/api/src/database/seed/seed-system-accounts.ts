/* eslint-disable no-console */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { KNOWN_CURRENCIES } from '@fenticoin/domain';

import { HOUSE_SYSTEM_ACCOUNT_KEYS } from '../../wallet/wallet.constants';
import { ledgerAccounts } from '../schema';

/**
 * Provisions the house's chart of accounts (`house_cash`, `house_revenue`,
 * `house_liability`) for every supported currency. Idempotent — safe to
 * run any number of times; existing accounts (and their balances) are
 * left untouched via `onConflictDoNothing`.
 */
async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL must be set to seed system ledger accounts');

  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client);

  for (const currency of Object.keys(KNOWN_CURRENCIES)) {
    for (const systemKey of HOUSE_SYSTEM_ACCOUNT_KEYS) {
      await db
        .insert(ledgerAccounts)
        .values({ ownerType: 'system', kind: 'system', systemKey, currency, walletId: null })
        .onConflictDoNothing();
    }
  }

  console.log(
    `Provisioned system ledger accounts for currencies: ${Object.keys(KNOWN_CURRENCIES).join(', ')}`,
  );
  await client.end();
}

main().catch((error: unknown) => {
  console.error('System account seed failed:', error);
  process.exitCode = 1;
});
