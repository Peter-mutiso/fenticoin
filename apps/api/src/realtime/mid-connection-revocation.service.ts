import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { AdminRealtimeGateway } from './admin-realtime.gateway';
import { RealtimeGateway } from './realtime.gateway';

/**
 * A socket that passed handshake auth stays connected indefinitely by
 * default, even after its session is later revoked (logout, logout-all,
 * account suspended/banned — `UsersService.setStatus` already routes
 * through `SessionService.revokeAllForUser` for the latter, so one event
 * covers all three). This is the push side of closing that gap — reacting
 * to `SessionService`'s `auth.session_revoked` emission — near-
 * immediately, rather than waiting for the backstop sweep's 5-minute
 * worst case (see `StaleSessionSweeper`).
 */
@Injectable()
export class MidConnectionRevocationService {
  private readonly logger = new Logger(MidConnectionRevocationService.name);

  constructor(
    private readonly realtimeGateway: RealtimeGateway,
    private readonly adminRealtimeGateway: AdminRealtimeGateway,
  ) {}

  @OnEvent('auth.session_revoked')
  handleRevocation(payload: { userId: string }): void {
    try {
      this.realtimeGateway.disconnectUser(payload.userId);
      this.adminRealtimeGateway.disconnectUser(payload.userId);
    } catch (error) {
      this.logger.error(`Failed to force-disconnect sockets for revoked user ${payload.userId}: ${String(error)}`);
    }
  }
}
