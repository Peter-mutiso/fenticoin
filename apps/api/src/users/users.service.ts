import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, ilike } from 'drizzle-orm';

import { AuditLogService } from '../audit/audit-log.service';
import { SessionService } from '../auth/services/session.service';
import { DRIZZLE_CLIENT } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.types';
import { type User, users } from '../database/schema';

export interface SetStatusInput {
  userId: string;
  status: 'active' | 'suspended' | 'banned';
  actorUserId: string;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface ListUsersFilters {
  email?: string;
  status?: 'active' | 'suspended' | 'banned' | 'pending_deletion';
  kycStatus?: 'unverified' | 'pending' | 'approved' | 'rejected';
  limit: number;
  offset: number;
}

export interface ReviewKycInput {
  userId: string;
  decision: 'approve' | 'reject';
  reason: string;
  actorUserId: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface SetEligibilityInput {
  userId: string;
  status: 'eligible' | 'ineligible' | 'unknown';
  reason: string;
  actorUserId: string;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class UsersService {
  constructor(
    @Inject(DRIZZLE_CLIENT) private readonly db: DrizzleDb,
    private readonly sessionService: SessionService,
    private readonly auditLog: AuditLogService,
  ) {}

  normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  async findByEmail(email: string): Promise<User | undefined> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, this.normalizeEmail(email)))
      .limit(1);
    return user;
  }

  async findById(id: string): Promise<User | undefined> {
    const [user] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return user;
  }

  async list(params: ListUsersFilters): Promise<{ items: User[] }> {
    const conditions = [
      params.email ? ilike(users.email, `%${params.email}%`) : undefined,
      params.status ? eq(users.status, params.status) : undefined,
      params.kycStatus ? eq(users.kycStatus, params.kycStatus) : undefined,
    ].filter((condition): condition is NonNullable<typeof condition> => condition !== undefined);

    const items = await this.db
      .select()
      .from(users)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(users.createdAt))
      .limit(params.limit)
      .offset(params.offset);
    return { items };
  }

  /**
   * Changes account status. Suspending or banning immediately revokes
   * every active session for the account — a suspended user must be
   * locked out on their very next request, not merely unable to log in
   * again (see `AuthGuard`, which independently re-checks status too).
   */
  async setStatus(input: SetStatusInput): Promise<User> {
    const before = await this.findById(input.userId);
    if (!before) throw new NotFoundException('User not found');

    const [after] = await this.db
      .update(users)
      .set({ status: input.status, updatedAt: new Date() })
      .where(eq(users.id, input.userId))
      .returning();

    if (input.status !== 'active') {
      await this.sessionService.revokeAllForUser(input.userId, 'account_suspended');
    }

    await this.auditLog.record({
      actorUserId: input.actorUserId,
      action: 'user.status_changed',
      targetType: 'user',
      targetId: input.userId,
      before: { status: before.status },
      after: { status: input.status, reason: input.reason },
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    return after as User;
  }

  /**
   * Records a KYC decision. Deliberately minimal: there is no document
   * submission system to review against, so this is an admin's recorded
   * decision based on out-of-band evidence, not an automated workflow.
   */
  async reviewKyc(input: ReviewKycInput): Promise<User> {
    const before = await this.findById(input.userId);
    if (!before) throw new NotFoundException('User not found');

    const kycStatus = input.decision === 'approve' ? 'approved' : 'rejected';

    const [after] = await this.db
      .update(users)
      .set({ kycStatus, updatedAt: new Date() })
      .where(eq(users.id, input.userId))
      .returning();

    await this.auditLog.record({
      actorUserId: input.actorUserId,
      action: 'user.kyc_reviewed',
      targetType: 'user',
      targetId: input.userId,
      before: { kycStatus: before.kycStatus },
      after: { kycStatus, reason: input.reason },
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    return after as User;
  }

  /**
   * Sets the single `eligibilityStatus` flag that gates betting, withdrawals,
   * and deposits (see `BettingEligibilityService`, `WithdrawalEligibilityService`,
   * `DepositEligibilityService`) — a risk/compliance restriction distinct from
   * a full account suspend.
   */
  async setEligibility(input: SetEligibilityInput): Promise<User> {
    const before = await this.findById(input.userId);
    if (!before) throw new NotFoundException('User not found');

    const [after] = await this.db
      .update(users)
      .set({ eligibilityStatus: input.status, updatedAt: new Date() })
      .where(eq(users.id, input.userId))
      .returning();

    await this.auditLog.record({
      actorUserId: input.actorUserId,
      action: 'user.eligibility_changed',
      targetType: 'user',
      targetId: input.userId,
      before: { eligibilityStatus: before.eligibilityStatus },
      after: { eligibilityStatus: input.status, reason: input.reason },
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    return after as User;
  }
}
