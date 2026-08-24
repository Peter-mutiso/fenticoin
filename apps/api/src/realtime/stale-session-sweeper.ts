import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import type { RequestUser } from '../authorization/types/request-user';
import { AdminRealtimeGateway } from './admin-realtime.gateway';
import { RealtimeAuthService } from './realtime-auth.service';
import { RealtimeGateway } from './realtime.gateway';

interface AuthenticatedSocketData {
  user: RequestUser;
}

/**
 * Backstop for `MidConnectionRevocationService`: re-validates every
 * currently-connected socket's session against the DB in one pass every 5
 * minutes, force-disconnecting any that fail. Exists specifically because
 * the push-driven path is enumerated by hand — a future revocation code
 * path could be added without remembering to emit the event — so this
 * bounds the worst case to 5 minutes regardless of code coverage
 * elsewhere. Registers no `ScheduleModule.forRoot()` of its own — that's
 * already registered once by `MarketsModule`, per the repo-wide convention
 * (see `betting.module.ts`/`payments.module.ts`).
 */
@Injectable()
export class StaleSessionSweeper {
  private readonly logger = new Logger(StaleSessionSweeper.name);

  constructor(
    private readonly realtimeGateway: RealtimeGateway,
    private readonly adminRealtimeGateway: AdminRealtimeGateway,
    private readonly realtimeAuth: RealtimeAuthService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async sweep(): Promise<void> {
    try {
      const sockets = [
        ...this.realtimeGateway.allConnectedSockets(),
        ...this.adminRealtimeGateway.allConnectedSockets(),
      ];

      if (sockets.length === 0) {
        return;
      }

      let disconnected = 0;
      let validationErrors = 0;

      for (const socket of sockets) {
        const user = (socket.data as AuthenticatedSocketData).user;

        if (!user) {
          continue;
        }

        try {
          const stillValid =
            await this.realtimeAuth.isSessionStillValid(
              user.sessionId,
              user.id,
            );

          if (!stillValid) {
            socket.disconnect(true);
            disconnected++;
          }
        } catch (error: unknown) {
          validationErrors++;

          this.logger.error(
            `Failed to validate realtime session for user ${
              user.id
            }: ${String(error)}`,
          );
        }
      }

      if (disconnected > 0) {
        this.logger.log(
          `Backstop sweep force-disconnected ${disconnected} socket(s) with a no-longer-valid session`,
        );
      }

      if (validationErrors > 0) {
        this.logger.warn(
          `Backstop sweep encountered ${validationErrors} session validation error(s)`,
        );
      }
    } catch (error: unknown) {
      this.logger.error(
        `Realtime stale-session sweep failed: ${String(error)}`,
      );
    }
  }
}