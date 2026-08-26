import type { DrizzleDb } from '../database/database.types';
import { chainable } from '../test-utils/mock-drizzle';
import { ReportsService } from './reports.service';

describe('ReportsService', () => {
  describe('overview', () => {
    it('returns current-state counts from existing tables', async () => {
      const select = jest
        .fn()
        .mockReturnValueOnce(chainable([{ status: 'active', count: 10 }, { status: 'suspended', count: 2 }]))
        .mockReturnValueOnce(chainable([{ count: 3 }]))
        .mockReturnValueOnce(chainable([{ count: 1 }]))
        .mockReturnValueOnce(chainable([{ count: 4 }]));
      const db = { select } as unknown as DrizzleDb;
      const service = new ReportsService(db);

      const result = await service.overview();

      expect(result).toEqual({
        usersByStatus: [{ status: 'active', count: 10 }, { status: 'suspended', count: 2 }],
        pendingDepositsCount: 3,
        pendingWithdrawalsCount: 1,
        betsRequiringReviewCount: 4,
      });
    });
  });

  describe('revenue', () => {
    it('computes gross stake volume and GGR per currency, excluding non-settled bets by construction (the query itself filters to won/lost)', async () => {
      const select = jest.fn().mockReturnValue(
        chainable([
          { currency: 'USD', status: 'won', stakeSum: '10000', payoutSum: '18500', count: 5 },
          { currency: 'USD', status: 'lost', stakeSum: '20000', payoutSum: '0', count: 8 },
        ]),
      );
      const db = { select } as unknown as DrizzleDb;
      const service = new ReportsService(db);

      const result = await service.revenue(new Date('2026-01-01'), new Date('2026-01-31'));

      expect(result.byCurrency).toEqual([
        {
          currency: 'USD',
          // grossStakeVolume = wonStake + lostStake = 10000 + 20000
          grossStakeVolume: '30000',
          // GGR = (wonStake + lostStake) - wonPayout = 30000 - 18500
          grossGamingRevenue: '11500',
          settledBetCount: 13,
        },
      ]);
    });

    it('returns an empty breakdown when no bets settled in the range', async () => {
      const select = jest.fn().mockReturnValue(chainable([]));
      const db = { select } as unknown as DrizzleDb;
      const service = new ReportsService(db);

      const result = await service.revenue(new Date('2026-01-01'), new Date('2026-01-31'));
      expect(result.byCurrency).toEqual([]);
    });

    it('excludes demo accounts from revenue — the query itself joins to users and filters accountType != demo', async () => {
      // The mock can't verify the SQL WHERE clause directly, but it does let
      // us assert the query builder actually performs the join this
      // exclusion depends on, so a future refactor that silently drops it
      // fails this test rather than just under-filtering silently.
      interface Chain {
        from: jest.Mock<Chain, []>;
        innerJoin: jest.Mock<Chain, unknown[]>;
        where: jest.Mock<Chain, unknown[]>;
        groupBy: jest.Mock<Promise<unknown[]>, []>;
      }
      const chain: Chain = {
        from: jest.fn(() => chain),
        innerJoin: jest.fn(() => chain),
        where: jest.fn(() => chain),
        groupBy: jest.fn(() => Promise.resolve([])),
      };
      const innerJoin = chain.innerJoin;
      const select = jest.fn(() => chain);
      const db = { select } as unknown as DrizzleDb;
      const service = new ReportsService(db);

      await service.revenue(new Date('2026-01-01'), new Date('2026-01-31'));

      expect(innerJoin).toHaveBeenCalled();
    });

    it('keeps multiple currencies independent — never sums across them', async () => {
      const select = jest.fn().mockReturnValue(
        chainable([
          { currency: 'USD', status: 'won', stakeSum: '1000', payoutSum: '1850', count: 1 },
          { currency: 'EUR', status: 'lost', stakeSum: '500', payoutSum: '0', count: 1 },
        ]),
      );
      const db = { select } as unknown as DrizzleDb;
      const service = new ReportsService(db);

      const result = await service.revenue(new Date('2026-01-01'), new Date('2026-01-31'));

      const usd = result.byCurrency.find((row) => row.currency === 'USD');
      const eur = result.byCurrency.find((row) => row.currency === 'EUR');
      expect(usd).toEqual({ currency: 'USD', grossStakeVolume: '1000', grossGamingRevenue: '-850', settledBetCount: 1 });
      expect(eur).toEqual({ currency: 'EUR', grossStakeVolume: '500', grossGamingRevenue: '500', settledBetCount: 1 });
    });
  });
});
