import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';

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

  async list(params: { limit: number; offset: number }): Promise<{ items: User[] }> {
    const items = await this.db
      .select()
      .from(users)
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
}
