/**
 * Real-Postgres integration tests for the wallet/ledger system, using
 * testcontainers (needs Docker). These prove what unit tests fundamentally
 * cannot: that `SELECT ... FOR UPDATE` row locking, the database CHECK
 * constraints, and the idempotency unique constraint actually serialize
 * concurrent writers and prevent double-spends/negative balances under
 * real MVCC — not just that the application code *calls* the right
 * methods in the right order.
 *
 * Run with: pnpm --filter @fenticoin/api test:integration
 * Excluded from the default `pnpm test` (see jest.config.js) since it
 * requires Docker, which isn't available in every environment this repo
 * is developed/built in.
 */
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';

import * as schema from '../database/schema';
import { users } from '../database/schema';
import { HOUSE_SYSTEM_ACCOUNT_KEYS } from './wallet.constants';
import { LedgerService } from './ledger.service';
import { TransactionService } from './transaction.service';
import { WalletService } from './wallet.service';

describe('Wallet/ledger integration (real Postgres)', () => {
  let container: StartedPostgreSqlContainer;
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let walletService: WalletService;
  let ledgerService: LedgerService;
  let transactionService: TransactionService;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    sql = postgres(container.getConnectionUri(), { max: 10 });
    db = drizzle(sql, { schema });

    await migrate(db, { migrationsFolder: 'drizzle' });

    for (const systemKey of HOUSE_SYSTEM_ACCOUNT_KEYS) {
      await db.insert(schema.ledgerAccounts).values({
        ownerType: 'system',
        kind: 'system',
        systemKey,
        currency: 'USD',
        walletId: null,
      });
    }

    walletService = new WalletService(db as never);
    ledgerService = new LedgerService();
    transactionService = new TransactionService(db as never, walletService, ledgerService, { emit: () => true } as never);
  }, 120_000);

  afterAll(async () => {
    await sql?.end();
    await container?.stop();
  });

  async function createUser(): Promise<string> {
    const [user] = await db.insert(users).values({ email: `${randomUUID()}@example.com` }).returning();
    return user!.id;
  }

  it('credits a deposit and the balance reflects it', async () => {
    const userId = await createUser();
    await transactionService.deposit({ userId, currency: 'USD', amount: 10_000n, actorType: 'system' });

    const balance = await walletService.getBalance(userId, 'USD');
    expect(balance.available.toMinorUnits()).toBe(10_000n);
  });

  it('never lets two concurrent withdrawals overdraw the account', async () => {
    const userId = await createUser();
    await transactionService.deposit({ userId, currency: 'USD', amount: 10_000n, actorType: 'system' });

    const results = await Promise.allSettled([
      transactionService.withdraw({ userId, currency: 'USD', amount: 7_000n, actorType: 'user', actorUserId: userId }),
      transactionService.withdraw({ userId, currency: 'USD', amount: 7_000n, actorType: 'user', actorUserId: userId }),
    ]);

    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);

    const balance = await walletService.getBalance(userId, 'USD');
    expect(balance.available.toMinorUnits()).toBe(3_000n);
    expect(balance.available.toMinorUnits() >= 0n).toBe(true);
  });

  it('only charges once when the same idempotency key is submitted concurrently', async () => {
    const userId = await createUser();
    await transactionService.deposit({ userId, currency: 'USD', amount: 10_000n, actorType: 'system' });

    const idempotencyKey = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        transactionService.placeBet({
          userId,
          currency: 'USD',
          amount: 1_000n,
          actorType: 'user',
          actorUserId: userId,
          idempotencyKey,
        }),
      ),
    );

    const uniqueTransactionIds = new Set(results.map((r) => r.id));
    expect(uniqueTransactionIds.size).toBe(1);

    const balance = await walletService.getBalance(userId, 'USD');
    // Exactly one 1,000 stake moved to locked — not five.
    expect(balance.available.toMinorUnits()).toBe(9_000n);
    expect(balance.locked.toMinorUnits()).toBe(1_000n);
  });

  it('rolls back the whole transaction when a leg would violate the non-negative constraint', async () => {
    const userId = await createUser();
    await transactionService.deposit({ userId, currency: 'USD', amount: 100n, actorType: 'system' });

    await expect(
      transactionService.withdraw({ userId, currency: 'USD', amount: 100_000n, actorType: 'user', actorUserId: userId }),
    ).rejects.toThrow();

    const balance = await walletService.getBalance(userId, 'USD');
    expect(balance.available.toMinorUnits()).toBe(100n); // unchanged — no partial debit happened
  });
});
