import { Logger, UnauthorizedException } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import {
  adminTopicRoom,
  ADMIN_TOPICS,
  type AdminTopic,
  type RealtimeEvent,
} from '@fenticoin/types';
import { OnEvent } from '@nestjs/event-emitter';
import type { Server, Socket } from 'socket.io';

import {
  PERMISSIONS,
  type PermissionKey,
} from '../authorization/permissions.catalog';
import type { RequestUser } from '../authorization/types/request-user';
import { RealtimeAuthService } from './realtime-auth.service';

export interface AuthenticatedSocketData {
  user: RequestUser;
}

/** Any one of these lets a socket connect at all; the specific topic rooms are gated individually below. */
const BASELINE_ADMIN_PERMISSIONS: PermissionKey[] = [
  PERMISSIONS.DEPOSITS_VIEW,
  PERMISSIONS.WITHDRAWALS_VIEW,
  PERMISSIONS.BETS_VIEW,
  PERMISSIONS.WALLET_VIEW,
  PERMISSIONS.REPORTS_VIEW,
  PERMISSIONS.MARKETS_VIEW,
];

/** Mirrors the permission that already gates the equivalent HTTP endpoint for each admin dashboard topic — no new authorization concept invented. */
const ADMIN_TOPIC_PERMISSIONS: Record<AdminTopic, PermissionKey> = {
  withdrawals: PERMISSIONS.WITHDRAWALS_VIEW,
  deposits: PERMISSIONS.DEPOSITS_VIEW,
  'bets-review': PERMISSIONS.BETS_VIEW,
  reports: PERMISSIONS.REPORTS_VIEW,
};

/**
 * The admin dashboard's real-time channel (apps/admin), isolated on its own
 * Socket.IO namespace so an end-user client (a different app, different
 * token audience) can never even reach this transport, let alone its
 * rooms — defense in depth beyond the per-topic permission checks below.
 */
@WebSocketGateway({ namespace: 'admin' })
export class AdminRealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(AdminRealtimeGateway.name);

  constructor(private readonly realtimeAuth: RealtimeAuthService) {}

  afterInit(server: Server): void {
    // Namespace middleware, not `handleConnection` — see RealtimeGateway's
    // doc comment for why (a failed `next(error)` here surfaces to the
    // client as a real `connect_error`; the socket is never "connected"
    // at all, and sockets can't emit that reserved event name themselves).
    server.use((socket: Socket, next: (err?: Error) => void) => {
      const token = socket.handshake.auth?.token as string | undefined;

      this.realtimeAuth
        .authenticate(token)
        .then((user) => {
          const permissionSet = new Set(user.permissions);

          const hasAnyAdminAccess = BASELINE_ADMIN_PERMISSIONS.some((p) =>
            permissionSet.has(p),
          );

          if (!hasAnyAdminAccess) {
            next(new Error('Account has no administrative access'));
            return;
          }

          (socket.data as AuthenticatedSocketData).user = user;
          next();
        })
        .catch((error: unknown) => {
          const message =
            error instanceof UnauthorizedException
              ? error.message
              : 'Authentication failed';

          next(new Error(message));
        });
    });
  }

  handleConnection(): void {
    // No-op: auth + the admin-access check already happened in the
    // namespace middleware above. Per-topic room joins happen on-demand
    // via `subscribe:admin-topic`, not automatically at connect time.
  }

  handleDisconnect(): void {
    // No per-socket cleanup needed beyond Socket.IO's own room bookkeeping.
  }

  @SubscribeMessage('subscribe:admin-topic')
  subscribeAdminTopic(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { topic?: string },
  ): void {
    const topic = body?.topic as AdminTopic | undefined;

    if (!topic || !ADMIN_TOPICS.includes(topic)) {
      throw new WsException('Unknown admin topic');
    }

    const user = (socket.data as AuthenticatedSocketData).user;
    const requiredPermission = ADMIN_TOPIC_PERMISSIONS[topic];

    if (!user.permissions.includes(requiredPermission)) {
      throw new WsException('Forbidden');
    }

    void socket.join(adminTopicRoom(topic));
  }

  @SubscribeMessage('unsubscribe:admin-topic')
  unsubscribeAdminTopic(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { topic?: string },
  ): void {
    const topic = body?.topic as AdminTopic | undefined;

    if (!topic) {
      return;
    }

    void socket.leave(adminTopicRoom(topic));
  }

  disconnectUser(userId: string): void {
    const server = this.server;

    if (!server?.sockets?.sockets) {
      return;
    }

    for (const socket of server.sockets.sockets.values()) {
      if (
        (socket.data as AuthenticatedSocketData).user?.id === userId
      ) {
        socket.disconnect(true);
      }
    }
  }

  disconnectSocket(socketId: string): void {
    const server = this.server;

    if (!server) {
      return;
    }

    server.in(socketId).disconnectSockets(true);
  }

  /**
   * Returns all currently connected admin namespace sockets.
   *
   * The gateway may be instantiated before Socket.IO has finished
   * initializing the namespace. The stale-session sweeper runs on a
   * scheduled job, so this method must safely return an empty list rather
   * than dereferencing an uninitialized Socket.IO server.
   */
  allConnectedSockets(): Socket[] {
    const server = this.server;

    if (!server?.sockets?.sockets) {
      return [];
    }

    return [...server.sockets.sockets.values()];
  }

  @OnEvent('deposit.status_changed')
  broadcastDeposit(event: RealtimeEvent): void {
    this.fanOut(event, ['deposits', 'reports']);
  }

  @OnEvent('withdrawal.status_changed')
  broadcastWithdrawal(event: RealtimeEvent): void {
    this.fanOut(event, ['withdrawals', 'reports']);
  }

  @OnEvent('bet.updated')
  @OnEvent('bet.settled')
  broadcastBet(event: RealtimeEvent): void {
    this.fanOut(event, ['bets-review', 'reports']);
  }

  private fanOut(event: RealtimeEvent, topics: AdminTopic[]): void {
    try {
      for (const topic of topics) {
        this.server.in(adminTopicRoom(topic)).emit(event.type, event);
      }
    } catch (error) {
      this.logger.error(
        `Failed to broadcast ${event.type} to admin topics [${topics.join(
          ', ',
        )}]: ${String(error)}`,
      );
    }
  }
}