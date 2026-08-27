import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { eq, inArray } from 'drizzle-orm';

import { AuditLogService } from '../audit/audit-log.service';
import { toPublicUser, type AuthResult } from '../auth/auth.service';
import { SessionService, type SessionMeta } from '../auth/services/session.service';
import { TokenService } from '../auth/services/token.service';
import type { RequestUser } from '../authorization/types/request-user';
import { AppConfigService } from '../config/app-config.service';
import { DRIZZLE_CLIENT } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.types';
import {
  betSettlementAudits,
  bets,
  bots,
  type User,
  userProfiles,
  users,
  tradingBotLogs,
} from '../database/schema';
import { buildDemoResetEvent } from '../realtime/realtime-events';
import { UsersService } from '../users/users.service';
import { serializeBalance } from '../wallet/mappers';
import { TransactionService } from '../wallet/transaction.service';
import { WalletService } from '../wallet/wallet.service';

/**
 * Everything about "Demo Mode" lives here: provisioning a real, isolated
 * shadow `users` row per real user (see `users.accountType`/`demoOfUserId`)
 * and resetting it. Nothing downstream of this — betting, settlement,
 * bots, wallet — has any idea a demo account is different from a real one;
 * they only ever see a `userId`. This service is the *only* place that
 * knows demo accounts exist as a concept.
 */
@Injectable()
export class DemoService {
  constructor(
    @Inject(DRIZZLE_CLIENT) private readonly db: DrizzleDb,
    private readonly usersService: UsersService,
    private readonly walletService: WalletService,
    private readonly transactionService: TransactionService,
    private readonly sessionService: SessionService,
    private readonly tokenService: TokenService,
    private readonly auditLog: AuditLogService,
    private readonly config: AppConfigService,
    private readonly events: EventEmitter2,
  ) {}

  async enterDemo(realUserId: string, meta: SessionMeta): Promise<AuthResult> {
    const realUser = await this.usersService.findById(realUserId);
    if (!realUser) throw new NotFoundException('User not found');
    if (realUser.accountType === 'demo') {
      throw new ConflictException('A demo account cannot itself enter demo mode');
    }

    const demoUser = await this.getOrCreateDemoShadow(realUser);

    const { session, refreshTokenRaw } = await this.sessionService.createSession(demoUser.id, meta);
    const accessToken = this.tokenService.signAccessToken(demoUser.id, session.id);

    await this.auditLog.record({
      actorUserId: realUser.id,
      action: 'demo.entered',
      targetType: 'user',
      targetId: demoUser.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return { accessToken, refreshToken: refreshTokenRaw, user: toPublicUser(demoUser) };
  }

  /**
   * Both accounts' balances in one call, without switching the active
   * session — this is what powers the header account switcher, which
   * shows "REAL $X / DEMO $Y" side by side so switching is a genuine
   * choice, not a leap of faith. Works from either session: a demo
   * session resolves its own linked real user via `demoOfUserId`, a real
   * session looks up its own shadow (without creating one — a status
   * check must never have the side effect of provisioning a wallet).
   * Balances are read fresh from `WalletService` on every call; nothing
   * here is cached or client-supplied.
   */
  async getStatus(
    user: RequestUser,
    currency = 'USD',
  ): Promise<{
    current: 'real' | 'demo';
    real: { userId: string; balance: ReturnType<typeof serializeBalance> };
    demo: { userId: string; balance: ReturnType<typeof serializeBalance> } | null;
  }> {
    const realUserId = user.accountType === 'demo' ? user.demoOfUserId! : user.id;

    const realBalance = await this.walletService.getBalance(realUserId, currency);

    const [demoUser] = await this.db.select({ id: users.id }).from(users).where(eq(users.demoOfUserId, realUserId)).limit(1);
    const demo = demoUser ? { userId: demoUser.id, balance: serializeBalance(await this.walletService.getBalance(demoUser.id, currency)) } : null;

    return {
      current: user.accountType,
      real: { userId: realUserId, balance: serializeBalance(realBalance) },
      demo,
    };
  }

  /**
   * Clears the caller's own demo bet/bot history and re-funds it to the
   * configured starting balance. `demoUserId` must already be known to
   * belong to a demo account — the controller enforces that by only ever
   * passing `req.user.id`, never an arbitrary target, so this can never
   * touch a real user's data by accident or by request tampering.
   *
   * Deliberately never deletes `transactions`/`ledger_entries`: this
   * codebase's ledger is append-only everywhere else (see
   * `TransactionService.reverseTransaction`/`reverseCompletedWithdrawal` —
   * corrections are always a new compensating entry, never a deletion), and
   * a demo bet's win/loss legitimately posts its other leg against a real
   * house system account (`house_revenue`/`house_liability`) — deleting
   * those rows would either violate the `ledger_entries -> transactions`
   * foreign key (when a settled bet is involved) or, if forced through,
   * silently desync that house account's cached balance from its own
   * remaining entries. Instead, any locked stake is released back to
   * available through the same real `refundBet` ledger movement a bet
   * cancellation already uses, and the resulting available balance is
   * trued up to the target with one ordinary `adjustBalance` correction —
   * both real, audited, already-proven-safe primitives.
   */
  async resetDemo(demoUserId: string): Promise<void> {
    await this.db.transaction(async (rawTx) => {
      const tx = rawTx as unknown as DrizzleDb;

      const demoBetRows = await tx
        .select({ id: bets.id, status: bets.status, stakeAmount: bets.stakeAmount, currency: bets.currency })
        .from(bets)
        .where(eq(bets.userId, demoUserId));

      for (const bet of demoBetRows) {
        if (bet.status === 'open' || bet.status === 'pending') {
          await this.transactionService.refundBet(
            {
              userId: demoUserId,
              currency: bet.currency,
              amount: bet.stakeAmount,
              actorType: 'system',
              reason: 'Demo account reset — releasing an open position',
              relatedType: 'bet',
              relatedId: bet.id,
              idempotencyKey: `demo-reset-refund:${bet.id}`,
            },
            tx,
          );
        }
      }

      const betIds = demoBetRows.map((row) => row.id);
      if (betIds.length > 0) {
        await tx.delete(betSettlementAudits).where(inArray(betSettlementAudits.betId, betIds));
      }
      await tx.delete(bets).where(eq(bets.userId, demoUserId));

      const demoBotRows = await tx.select({ id: bots.id }).from(bots).where(eq(bots.userId, demoUserId));
      const botIds = demoBotRows.map((row) => row.id);
      if (botIds.length > 0) {
        await tx.delete(tradingBotLogs).where(inArray(tradingBotLogs.botId, botIds));
        await tx.update(bots).set({ status: 'inactive', updatedAt: new Date() }).where(inArray(bots.id, botIds));
      }

      const currency = this.config.demoCurrency;
      const targetBalance = BigInt(this.config.demoInitialBalanceMinorUnits);
      // Read through `tx`, not `walletService.getBalance` (which always
      // queries via the module-level `db`, a separate connection outside
      // this transaction) — the refunds above are only visible here, not
      // to a query on another connection, until this transaction commits.
      const { available } = await this.walletService.getOrCreateWalletAccounts(tx, demoUserId, currency);
      const currentAvailable = available.balance;
      const diff = targetBalance - currentAvailable;

      if (diff > 0n) {
        await this.transactionService.adjustBalance(
          {
            userId: demoUserId,
            currency,
            amount: diff,
            direction: 'credit',
            actorType: 'system',
            reason: 'Demo account reset — restored to starting balance',
          },
          tx,
        );
      } else if (diff < 0n) {
        await this.transactionService.adjustBalance(
          {
            userId: demoUserId,
            currency,
            amount: -diff,
            direction: 'debit',
            actorType: 'system',
            reason: 'Demo account reset — restored to starting balance',
          },
          tx,
        );
      }
    });

    await this.auditLog.record({
      actorUserId: demoUserId,
      action: 'demo.reset',
      targetType: 'user',
      targetId: demoUserId,
    });

    const event = buildDemoResetEvent(demoUserId);
    this.events.emit(event.type, event);
  }

  private async getOrCreateDemoShadow(realUser: User): Promise<User> {
    const [existing] = await this.db.select().from(users).where(eq(users.demoOfUserId, realUser.id)).limit(1);
    if (existing) return existing;

    return this.db.transaction(async (rawTx) => {
      const tx = rawTx as unknown as DrizzleDb;
      const [created] = await tx
        .insert(users)
        .values({
          email: `demo+${realUser.id}@fenticoin.demo.internal`,
          status: 'active',
          accountType: 'demo',
          demoOfUserId: realUser.id,
        })
        .onConflictDoNothing()
        .returning();

      if (!created) {
        // Lost a creation race to a concurrent request — the row now exists.
        const [race] = await tx.select().from(users).where(eq(users.demoOfUserId, realUser.id)).limit(1);
        if (!race) throw new Error(`Failed to provision demo shadow for user ${realUser.id}`);
        return race;
      }

      const demoUser = created as User;

      await tx.insert(userProfiles).values({ userId: demoUser.id });
      // `adjustBalance` already provisions the wallet/ledger accounts
      // itself (via its own internal `getOrCreateWalletAccounts` call) —
      // an explicit call here would just be redundant round trips against
      // a brand-new row nothing else could have touched yet.
      await this.transactionService.adjustBalance(
        {
          userId: demoUser.id,
          currency: this.config.demoCurrency,
          amount: BigInt(this.config.demoInitialBalanceMinorUnits),
          direction: 'credit',
          actorType: 'system',
          reason: 'Demo account initial funding',
        },
        tx,
      );

      return demoUser;
    });
  }
}
