import { Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import type { RealtimeEvent } from '@fenticoin/types';

import { buildNotificationEvent } from './realtime-events';

/**
 * Derives `notification.new` from the same underlying events the client
 * already surfaces notifications from (bet settlement, deposit/withdrawal
 * terminal status) — no persisted notifications table. Only re-emits when
 * the transition just described is actually terminal, mirroring the
 * client's own `isSettledBetStatus`/`isTerminalDepositStatus`/
 * `isTerminalWithdrawalStatus` predicates (`apps/web/src/lib/api-client.ts`,
 * mirrored server-side in `realtime-events.ts`) so both sides agree on
 * "notification-worthy" without a shared package. This event's only job is
 * to make the client's existing poll-and-diff notification watcher fire
 * sooner; it carries no notification copy of its own.
 */
@Injectable()
export class NotificationProjectionService {
  constructor(private readonly events: EventEmitter2) {}

  @OnEvent('bet.settled')
  onBetSettled(event: RealtimeEvent): void {
    // `bet.settled` (as opposed to `bet.updated`) is only ever emitted for
    // a status `isSettledBetStatus` already agrees is terminal.
    this.project(event);
  }

  @OnEvent('deposit.status_changed')
  onDepositStatusChanged(event: RealtimeEvent): void {
    if (!event.terminal) return;
    this.project(event);
  }

  @OnEvent('withdrawal.status_changed')
  onWithdrawalStatusChanged(event: RealtimeEvent): void {
    if (!event.terminal) return;
    this.project(event);
  }

  private project(source: RealtimeEvent): void {
    this.events.emit('notification.new', buildNotificationEvent(source));
  }
}
