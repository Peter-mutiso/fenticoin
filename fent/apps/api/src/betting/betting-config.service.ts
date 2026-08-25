import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';

import { AuditLogService } from '../audit/audit-log.service';
import { DRIZZLE_CLIENT } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.types';
import { type BetType, type BettingConfig, bets, bettingConfigs } from '../database/schema';

export interface UpsertBettingConfigInput {
  instrumentId: string;
  betType: BetType;
  minStake: bigint;
  maxStake: bigint;
  payoutRateBasisPoints: bigint;
  maxExposure?: bigint;
  minDurationSeconds: bigint;
  maxDurationSeconds: bigint;
  isEnabled?: boolean;
  actorUserId: string;
}

/**
 * The admin-configurable side of the odds engine. Nothing here ever
 * touches an existing bet — `BettingService` reads the current row at
 * placement time and snapshots what it needs onto the bet itself, so an
 * admin changing a rate/limit here can only affect bets placed *after*
 * the change, never retroactively corrupt one already on the books.
 */
@Injectable()
export class BettingConfigService {
  constructor(
    @Inject(DRIZZLE_CLIENT) private readonly db: DrizzleDb,
    private readonly auditLog: AuditLogService,
  ) {}

  async list(instrumentId?: string): Promise<BettingConfig[]> {
    return this.db
      .select()
      .from(bettingConfigs)
      .where(instrumentId ? eq(bettingConfigs.instrumentId, instrumentId) : undefined);
  }

  async get(instrumentId: string, betType: BetType): Promise<BettingConfig> {
    const [config] = await this.db
      .select()
      .from(bettingConfigs)
      .where(and(eq(bettingConfigs.instrumentId, instrumentId), eq(bettingConfigs.betType, betType)))
      .limit(1);
    if (!config) {
      throw new NotFoundException(`No betting config for instrument ${instrumentId} / ${betType}`);
    }
    return config;
  }

  async upsert(input: UpsertBettingConfigInput): Promise<BettingConfig> {
    const existing = await this.db
      .select()
      .from(bettingConfigs)
      .where(and(eq(bettingConfigs.instrumentId, input.instrumentId), eq(bettingConfigs.betType, input.betType)))
      .limit(1);

    const values = {
      instrumentId: input.instrumentId,
      betType: input.betType,
      minStake: input.minStake,
      maxStake: input.maxStake,
      payoutRateBasisPoints: input.payoutRateBasisPoints,
      maxExposure: input.maxExposure,
      minDurationSeconds: input.minDurationSeconds,
      maxDurationSeconds: input.maxDurationSeconds,
      isEnabled: input.isEnabled ?? true,
    };

    const [config] =
      existing.length > 0
        ? await this.db
            .update(bettingConfigs)
            .set({ ...values, updatedAt: new Date() })
            .where(eq(bettingConfigs.id, existing[0]!.id))
            .returning()
        : await this.db.insert(bettingConfigs).values(values).returning();
    if (!config) throw new Error('Failed to upsert betting config');

    await this.auditLog.record({
      actorUserId: input.actorUserId,
      action: existing.length > 0 ? 'betting_config.updated' : 'betting_config.created',
      targetType: 'betting_config',
      targetId: config.id,
      before: existing[0] ? this.serializeForAudit(existing[0]) : undefined,
      after: this.serializeForAudit(config),
    });

    return config;
  }

  /** Sum of stakes currently "at risk" (open or mid-settlement) for this (instrument, betType). */
  async getCurrentExposure(instrumentId: string, betType: BetType): Promise<bigint> {
    const [row] = await this.db
      .select({ total: sql<string>`coalesce(sum(${bets.stakeAmount}), 0)` })
      .from(bets)
      .where(
        and(eq(bets.instrumentId, instrumentId), eq(bets.type, betType), inArray(bets.status, ['open', 'pending'])),
      );
    return BigInt(row?.total ?? 0);
  }

  private serializeForAudit(config: BettingConfig) {
    return {
      minStake: config.minStake.toString(),
      maxStake: config.maxStake.toString(),
      payoutRateBasisPoints: config.payoutRateBasisPoints.toString(),
      maxExposure: config.maxExposure?.toString() ?? null,
      minDurationSeconds: config.minDurationSeconds.toString(),
      maxDurationSeconds: config.maxDurationSeconds.toString(),
      isEnabled: config.isEnabled,
    };
  }
}
