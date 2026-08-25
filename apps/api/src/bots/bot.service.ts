import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { AuditLogService } from '../audit/audit-log.service';
import { DRIZZLE_CLIENT } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.types';
import { bots, type Bot } from '../database/schema';

@Injectable()
export class BotService {
  constructor(@Inject(DRIZZLE_CLIENT) private readonly db: DrizzleDb, private readonly auditLog: AuditLogService) {}

  async getOrCreate(userId: string): Promise<Bot> {
    const [existing] = await this.db.select().from(bots).where(eq(bots.userId, userId)).limit(1);
    if (existing) return existing;
    const [created] = await this.db.insert(bots).values({ userId, status: 'strategy_unconfigured' }).returning();
    if (!created) throw new Error('Failed to create bot');
    return created;
  }

  async setActive(userId: string, active: boolean): Promise<Bot> {
    const bot = await this.getOrCreate(userId);
    if (active && !bot.strategyKey) throw new ConflictException('Bot strategy is not configured');
    const [updated] = await this.db.update(bots).set({ status: active ? 'active' : 'inactive', updatedAt: new Date() }).where(and(eq(bots.id, bot.id), eq(bots.userId, userId))).returning();
    if (!updated) throw new NotFoundException('Bot not found');
    await this.auditLog.record({ actorUserId: userId, action: active ? 'bot.activated' : 'bot.deactivated', targetType: 'bot', targetId: bot.id });
    return updated;
  }
}