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
import { instrumentRoom, userRoom, type RealtimeEvent } from '@fenticoin/types';
import { OnEvent } from '@nestjs/event-emitter';
import type { Server, Socket } from 'socket.io';

import type { RequestUser } from '../authorization/types/request-user';
import { InstrumentService } from '../markets/instrument.service';
import { PriceFeedService } from '../markets/price-feed.service';
import { buildMarketPriceEvent } from './realtime-events';
import { RealtimeAuthService } from './realtime-auth.service';

export interface AuthenticatedSocketData {
  user: RequestUser;
}

/**
 * The end-user real-time channel (apps/web). Every socket must authenticate
 * at handshake exactly as an HTTP request would (`RealtimeAuthService`,
 * mirroring `AuthGuard`), is auto-joined to its own `user:{id}` room, and
 * there is deliberately no message that lets a client request joining a
 * different user's room — the private-data boundary is enforced by never
 * exposing the capability, not by checking a client-supplied id.
 *
 * Auth runs as namespace middleware (`server.use`, wired in `afterInit`),
 * not in `handleConnection` — rejecting there calls `next(error)` *before*
 * the Socket.IO handshake completes, so a failed auth surfaces to the
 * client as a genuine `connect_error` and the socket is never considered
 * connected at all, rather than a connect-then-immediately-disconnect
 * cycle (also: sockets cannot `emit('connect_error', ...)` themselves —
 * that event name is reserved for the client's own connection-failure
 * signal).
 */
@WebSocketGateway()
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly instrumentSubscriptions = new Map<string, Set<string>>(); // instrumentId -> socket ids, for price forwarding cleanup

  constructor(
    private readonly realtimeAuth: RealtimeAuthService,
    private readonly instrumentService: InstrumentService,
    private readonly priceFeedService: PriceFeedService,
  ) {}

  afterInit(server: Server): void {
    server.use((socket: Socket, next: (err?: Error) => void) => {
      const token = socket.handshake.auth?.token as string | undefined;
      this.realtimeAuth
        .authenticate(token)
        .then((user) => {
          (socket.data as AuthenticatedSocketData).user = user;
          next();
        })
        .catch((error: unknown) => {
          const message = error instanceof UnauthorizedException ? error.message : 'Authentication failed';
          next(new Error(message));
        });
    });
  }

  async handleConnection(socket: Socket): Promise<void> {
    // Auth already succeeded (middleware above ran first) — this only
    // ever fires for an authenticated socket.
    const user = (socket.data as AuthenticatedSocketData).user;
    await socket.join(userRoom(user.id));
  }

  handleDisconnect(socket: Socket): void {
    for (const sockets of this.instrumentSubscriptions.values()) {
      sockets.delete(socket.id);
    }
  }

  @SubscribeMessage('subscribe:instrument')
  async subscribeInstrument(@ConnectedSocket() socket: Socket, @MessageBody() body: { instrumentId?: string }): Promise<void> {
    const instrumentId = body?.instrumentId;
    if (!instrumentId) throw new WsException('instrumentId is required');

    // Validates the instrument exists — the room is public within the
    // namespace (instrument data isn't user-scoped), this just guards
    // against joining a room for a nonexistent id.
    await this.instrumentService.getById(instrumentId);

    await socket.join(instrumentRoom(instrumentId));
    this.trackInstrumentSubscription(instrumentId, socket.id);
    this.ensurePriceForwarding(instrumentId);
  }

  @SubscribeMessage('unsubscribe:instrument')
  async unsubscribeInstrument(@ConnectedSocket() socket: Socket, @MessageBody() body: { instrumentId?: string }): Promise<void> {
    const instrumentId = body?.instrumentId;
    if (!instrumentId) return;
    await socket.leave(instrumentRoom(instrumentId));
    this.instrumentSubscriptions.get(instrumentId)?.delete(socket.id);
  }

  /** Force-disconnects every socket for a user — called on logout/suspend, see `MidConnectionRevocationService`. */
  disconnectUser(userId: string): void {
    this.server.in(userRoom(userId)).disconnectSockets(true);
  }

  /** Force-disconnects one specific socket by session — used by the backstop sweep. */
  disconnectSocket(socketId: string): void {
    this.server.in(socketId).disconnectSockets(true);
  }

  allConnectedSockets(): Socket[] {
    return [...this.server.sockets.sockets.values()];
  }

  @OnEvent('bet.updated')
  @OnEvent('bet.settled')
  @OnEvent('deposit.status_changed')
  @OnEvent('withdrawal.status_changed')
  @OnEvent('wallet.transaction_posted')
  @OnEvent('notification.new')
  broadcastPrivateEvent(event: RealtimeEvent): void {
    if (!event.userId) return;
    try {
      this.server.in(userRoom(event.userId)).emit(event.type, event);
    } catch (error) {
      this.logger.error(`Failed to broadcast ${event.type} for user ${event.userId}: ${String(error)}`);
    }
  }

  @OnEvent('market.status')
  broadcastMarketStatus(event: RealtimeEvent): void {
    try {
      this.server.in(instrumentRoom(event.entityId)).emit(event.type, event);
    } catch (error) {
      this.logger.error(`Failed to broadcast market.status for instrument ${event.entityId}: ${String(error)}`);
    }
  }

  // ---- price forwarding: subscribes to PriceFeedService's existing
  // Observable directly rather than re-deriving price events, per the plan.

  private readonly forwardingInstruments = new Set<string>();

  private ensurePriceForwarding(instrumentId: string): void {
    if (this.forwardingInstruments.has(instrumentId)) return;
    this.forwardingInstruments.add(instrumentId);

    this.priceFeedService.priceStream$(instrumentId).subscribe((quote) => {
      try {
        const event = buildMarketPriceEvent(quote);
        this.server.in(instrumentRoom(instrumentId)).emit(event.type, event);
      } catch (error) {
        this.logger.error(`Failed to forward price tick for ${instrumentId}: ${String(error)}`);
      }
    });
  }

  private trackInstrumentSubscription(instrumentId: string, socketId: string): void {
    const existing = this.instrumentSubscriptions.get(instrumentId) ?? new Set<string>();
    existing.add(socketId);
    this.instrumentSubscriptions.set(instrumentId, existing);
  }
}
