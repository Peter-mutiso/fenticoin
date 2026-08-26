import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm';

import { DRIZZLE_CLIENT } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.types';
import { bets, deposits, users, withdrawals } from '../database/schema';

export interface ReportsOverview {
  usersByStatus: { status: string; count: number }[];
  pendingDepositsCount: number;
  pendingWithdrawalsCount: number;
  betsRequiringReviewCount: number;
}

export interface RevenueByCurrency {
  currency: string;
  /** Total stake across settled (won/lost) bets — the platform's handle for the period. */
  grossStakeVolume: string;
  /** (won stake + lost stake) - won payout — the house's realized revenue for the period. */
  grossGamingRevenue: string;
  settledBetCount: number;
}

export interface RevenueReport {
  from: string;
  to: string;
  byCurrency: RevenueByCurrency[];
}

/**
 * Every figure here is a direct SQL aggregate over existing tables — no
 * invented metric, no separate analytics store. `overview` is current-state
 * counts (no date range); `revenue` is strictly derived from settled
 * (`won`/`lost`) bets over an explicit date range — void/cancelled/refunded/
 * open/pending/disputed/requires_review bets have no realized financial
 * outcome yet and are deliberately excluded.
 *
 * Every aggregate here also excludes demo shadow accounts
 * (`users.accountType = 'demo'`) — a demo account's activity is virtual
 * money exercising the real pipeline for testing/demos, and must never be
 * counted toward real-money revenue, user, or review-queue figures.
 */
@Injectable()
export class ReportsService {
  constructor(@Inject(DRIZZLE_CLIENT) private readonly db: DrizzleDb) {}

  async overview(): Promise<ReportsOverview> {
    const usersByStatus = await this.db
      .select({ status: users.status, count: sql<number>`count(*)::int` })
      .from(users)
      .where(ne(users.accountType, 'demo'))
      .groupBy(users.status);

    const [pendingDeposits] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(deposits)
      .where(eq(deposits.status, 'pending'));

    const [pendingWithdrawals] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(withdrawals)
      .where(eq(withdrawals.status, 'pending_review'));

    const [betsRequiringReview] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(bets)
      .innerJoin(users, eq(bets.userId, users.id))
      .where(and(eq(bets.status, 'requires_review'), ne(users.accountType, 'demo')));

    return {
      usersByStatus,
      pendingDepositsCount: pendingDeposits?.count ?? 0,
      pendingWithdrawalsCount: pendingWithdrawals?.count ?? 0,
      betsRequiringReviewCount: betsRequiringReview?.count ?? 0,
    };
  }

  async revenue(from: Date, to: Date): Promise<RevenueReport> {
    const rows = await this.db
      .select({
        currency: bets.currency,
        status: bets.status,
        stakeSum: sql<string>`coalesce(sum(${bets.stakeAmount}), 0)`,
        payoutSum: sql<string>`coalesce(sum(${bets.potentialPayout}), 0)`,
        count: sql<number>`count(*)::int`,
      })
      .from(bets)
      .innerJoin(users, eq(bets.userId, users.id))
      .where(
        and(
          gte(bets.placedAt, from),
          lte(bets.placedAt, to),
          inArray(bets.status, ['won', 'lost']),
          ne(users.accountType, 'demo'),
        ),
      )
      .groupBy(bets.currency, bets.status);

    const byCurrency = new Map<string, { wonStake: bigint; lostStake: bigint; wonPayout: bigint; count: number }>();
    for (const row of rows) {
      const entry = byCurrency.get(row.currency) ?? { wonStake: 0n, lostStake: 0n, wonPayout: 0n, count: 0 };
      if (row.status === 'won') {
        entry.wonStake += BigInt(row.stakeSum);
        entry.wonPayout += BigInt(row.payoutSum);
      } else {
        entry.lostStake += BigInt(row.stakeSum);
      }
      entry.count += row.count;
      byCurrency.set(row.currency, entry);
    }

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      byCurrency: Array.from(byCurrency.entries()).map(([currency, entry]) => ({
        currency,
        grossStakeVolume: (entry.wonStake + entry.lostStake).toString(),
        grossGamingRevenue: (entry.wonStake + entry.lostStake - entry.wonPayout).toString(),
        settledBetCount: entry.count,
      })),
    };
  }
}
