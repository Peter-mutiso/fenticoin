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
  instrumentRoom,
  userRoom,
  type RealtimeEvent,
} from '@fenticoin/types';
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
 * The end-user real-time channel (apps/web).
 *
 * Every socket must authenticate at handshake exactly as an HTTP request
 * would (`RealtimeAuthService`, mirroring `AuthGuard`).
 *
 * Authenticated sockets are automatically joined to their own private
 * `user:{id}` room.
 *
 * There is deliberately no message that allows a client to join another
 * user's room. Private-data isolation is therefore enforced by capability:
 * the client never receives a way to select another user's room.
 *
 * Authentication runs as Socket.IO namespace middleware (`server.use`)
 * rather than in `handleConnection`.
 *
 * This means authentication failures happen before the Socket.IO handshake
 * completes and are surfaced to the client as `connect_error`.
 */
@WebSocketGateway()
export class RealtimeGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(
    RealtimeGateway.name,
  );

  /**
   * instrumentId -> socket IDs currently subscribed to that instrument.
   *
   * This is used for subscription bookkeeping and cleanup.
   */
  private readonly instrumentSubscriptions =
    new Map<string, Set<string>>();

  /**
   * Instruments for which this gateway has already attached a
   * PriceFeedService Observable subscription.
   *
   * There must only be one PriceFeedService subscription per instrument
   * within this gateway instance, regardless of how many clients subscribe.
   */
  private readonly forwardingInstruments =
    new Set<string>();

  /**
   * Cache the trusted quote currency for an instrument after it has been
   * validated through InstrumentService.
   *
   * PriceQuote intentionally contains only the API-safe decimal price and
   * does not carry currency metadata. Currency therefore comes from the
   * authoritative instrument configuration.
   */
  private readonly instrumentQuoteCurrencies =
    new Map<string, string>();

  constructor(
    private readonly realtimeAuth: RealtimeAuthService,
    private readonly instrumentService: InstrumentService,
    private readonly priceFeedService: PriceFeedService,
  ) {}

  /**
   * Configure Socket.IO authentication middleware.
   */
  afterInit(server: Server): void {
    server.use(
      (
        socket: Socket,
        next: (err?: Error) => void,
      ) => {
        const token =
          socket.handshake.auth?.token as
            | string
            | undefined;

        this.realtimeAuth
          .authenticate(token)
          .then((user) => {
            (
              socket.data as AuthenticatedSocketData
            ).user = user;

            next();
          })
          .catch((error: unknown) => {
            const message =
              error instanceof UnauthorizedException
                ? error.message
                : 'Authentication failed';

            next(new Error(message));
          });
      },
    );
  }

  /**
   * Authentication has already succeeded by the time this method runs.
   */
  async handleConnection(
    socket: Socket,
  ): Promise<void> {
    const user =
      (socket.data as AuthenticatedSocketData).user;

    await socket.join(userRoom(user.id));
  }

  /**
   * Remove the socket from all instrument subscription bookkeeping.
   */
  handleDisconnect(socket: Socket): void {
    for (const [
      instrumentId,
      sockets,
    ] of this.instrumentSubscriptions) {
      sockets.delete(socket.id);

      if (sockets.size === 0) {
        this.instrumentSubscriptions.delete(
          instrumentId,
        );
      }
    }
  }

  /**
   * Subscribe the authenticated socket to a public instrument room.
   *
   * Instrument rooms contain market data only. Private financial/user
   * events are always delivered through the authenticated user's room.
   */
  @SubscribeMessage('subscribe:instrument')
  async subscribeInstrument(
    @ConnectedSocket() socket: Socket,
    @MessageBody()
    body: { instrumentId?: string },
  ): Promise<void> {
    const instrumentId = body?.instrumentId;

    if (!instrumentId) {
      throw new WsException(
        'instrumentId is required',
      );
    }

    /**
     * Resolve the instrument through the authoritative service.
     *
     * Besides validating that the instrument exists, this gives us the
     * trusted quote currency used when constructing market-price events.
     */
    const instrument =
      await this.instrumentService.getById(
        instrumentId,
      );

    await socket.join(
      instrumentRoom(instrumentId),
    );

    this.instrumentQuoteCurrencies.set(
      instrumentId,
      instrument.quoteCurrency,
    );

    this.trackInstrumentSubscription(
      instrumentId,
      socket.id,
    );

    this.ensurePriceForwarding(
      instrumentId,
    );
  }

  /**
   * Unsubscribe the authenticated socket from an instrument room.
   */
  @SubscribeMessage('unsubscribe:instrument')
  async unsubscribeInstrument(
    @ConnectedSocket() socket: Socket,
    @MessageBody()
    body: { instrumentId?: string },
  ): Promise<void> {
    const instrumentId = body?.instrumentId;

    if (!instrumentId) {
      return;
    }

    await socket.leave(
      instrumentRoom(instrumentId),
    );

    const sockets =
      this.instrumentSubscriptions.get(
        instrumentId,
      );

    sockets?.delete(socket.id);

    if (sockets && sockets.size === 0) {
      this.instrumentSubscriptions.delete(
        instrumentId,
      );
    }
  }

  /**
   * Force-disconnect every socket belonging to a user.
   *
   * Used during logout/suspension by the connection-revocation service.
   */
  disconnectUser(userId: string): void {
    const server = this.server;

    if (!server) {
      return;
    }

    server
      .in(userRoom(userId))
      .disconnectSockets(true);
  }

  /**
   * Force-disconnect one specific socket.
   *
   * Used by the stale-session backstop sweep.
   */
  disconnectSocket(socketId: string): void {
    const server = this.server;

    if (!server) {
      return;
    }

    server
      .in(socketId)
      .disconnectSockets(true);
  }

  /**
   * Return all currently connected end-user sockets.
   *
   * Socket.IO may not yet be initialized when scheduled revocation
   * services execute, so this method safely returns an empty array.
   */
  allConnectedSockets(): Socket[] {
    const server = this.server;

    if (!server?.sockets?.sockets) {
      return [];
    }

    return [
      ...server.sockets.sockets.values(),
    ];
  }

  /**
   * Broadcast private user-scoped realtime events.
   *
   * The event must contain a userId. Events without a userId are ignored
   * because they cannot safely be routed to a private user room.
   */
  @OnEvent('bet.updated')
  @OnEvent('bet.settled')
  @OnEvent('deposit.status_changed')
  @OnEvent('withdrawal.status_changed')
  @OnEvent('wallet.transaction_posted')
  @OnEvent('notification.new')
  @OnEvent('demo.reset')
  broadcastPrivateEvent(
    event: RealtimeEvent,
  ): void {
    if (!event.userId) {
      return;
    }

    try {
      this.server
        .in(userRoom(event.userId))
        .emit(event.type, event);
    } catch (error) {
      this.logger.error(
        `Failed to broadcast ${event.type} for user ${event.userId}: ${String(
          error,
        )}`,
      );
    }
  }

  /**
   * Broadcast market-status events to the public instrument room.
   */
  @OnEvent('market.status')
  broadcastMarketStatus(
    event: RealtimeEvent,
  ): void {
    try {
      this.server
        .in(instrumentRoom(event.entityId))
        .emit(event.type, event);
    } catch (error) {
      this.logger.error(
        `Failed to broadcast market.status for instrument ${event.entityId}: ${String(
          error,
        )}`,
      );
    }
  }

  /**
   * Attach one PriceFeedService subscription for an instrument.
   *
   * The PriceFeedService remains the single source of truth for market
   * ticks. The gateway only converts the already validated PriceQuote
   * into the realtime event envelope and forwards it to the instrument
   * room.
   *
   * IMPORTANT:
   *
   * PriceQuote.price is a decimal string.
   *
   * PriceQuote deliberately does not carry quote currency, so currency
   * comes from the trusted Instrument configuration rather than from the
   * client or from the price string.
   */
  private ensurePriceForwarding(
    instrumentId: string,
  ): void {
    if (
      this.forwardingInstruments.has(
        instrumentId,
      )
    ) {
      return;
    }

    this.forwardingInstruments.add(
      instrumentId,
    );

    this.priceFeedService
      .priceStream$(instrumentId)
      .subscribe((quote) => {
        try {
          /**
           * The currency should normally already be cached because
           * subscribeInstrument() resolves the instrument before calling
           * ensurePriceForwarding().
           *
           * Keep the defensive check here so that a malformed internal
           * sequence cannot produce a market event with an undefined
           * currency.
           */
          const quoteCurrency =
            this.instrumentQuoteCurrencies.get(
              instrumentId,
            );

          if (!quoteCurrency) {
            this.logger.error(
              `Cannot forward price tick for instrument=${instrumentId}: ` +
                `trusted quote currency is unavailable`,
            );

            return;
          }

          const event =
            buildMarketPriceEvent(
              quote,
              quoteCurrency,
            );

          this.server
            .in(instrumentRoom(instrumentId))
            .emit(event.type, event);
        } catch (error) {
          this.logger.error(
            `Failed to forward price tick for ${instrumentId}: ${String(
              error,
            )}`,
          );
        }
      });
  }

  /**
   * Track which sockets are subscribed to an instrument.
   */
  private trackInstrumentSubscription(
    instrumentId: string,
    socketId: string,
  ): void {
    const existing =
      this.instrumentSubscriptions.get(
        instrumentId,
      ) ?? new Set<string>();

    existing.add(socketId);

    this.instrumentSubscriptions.set(
      instrumentId,
      existing,
    );
  }
}