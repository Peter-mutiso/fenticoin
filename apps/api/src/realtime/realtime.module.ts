import { Module } from '@nestjs/common';

import { TokenModule } from '../auth/token.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { MarketsModule } from '../markets/markets.module';
import { AdminRealtimeGateway } from './admin-realtime.gateway';
import { MidConnectionRevocationService } from './mid-connection-revocation.service';
import { NotificationProjectionService } from './notification-projection.service';
import { RealtimeAuthService } from './realtime-auth.service';
import { RealtimeGateway } from './realtime.gateway';
import { StaleSessionSweeper } from './stale-session-sweeper';

/**
 * Wires up the WebSocket real-time layer: handshake auth
 * (`RealtimeAuthService`, mirroring `AuthGuard`), the two namespaced
 * gateways (`RealtimeGateway` for apps/web, `AdminRealtimeGateway` for
 * apps/admin), the notification-projection mapper, and both halves of
 * mid-connection revocation (push via `MidConnectionRevocationService`,
 * backstop sweep via `StaleSessionSweeper`).
 *
 * Does NOT call `ScheduleModule.forRoot()` — that's already registered
 * once by `MarketsModule` (imported below for `InstrumentService`/
 * `PriceFeedService` anyway), and `@Cron` discovery works app-wide once
 * registered anywhere, per the convention already documented in
 * `betting.module.ts`/`payments.module.ts`.
 */
@Module({
  imports: [TokenModule, AuthorizationModule, MarketsModule],
  providers: [
    RealtimeAuthService,
    RealtimeGateway,
    AdminRealtimeGateway,
    NotificationProjectionService,
    MidConnectionRevocationService,
    StaleSessionSweeper,
  ],
  exports: [RealtimeGateway, AdminRealtimeGateway],
})
export class RealtimeModule {}