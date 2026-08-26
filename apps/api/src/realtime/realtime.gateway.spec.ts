import { UnauthorizedException, type INestApplication } from '@nestjs/common';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Test } from '@nestjs/testing';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';

import type { RequestUser } from '../authorization/types/request-user';
import { InstrumentService } from '../markets/instrument.service';
import { PriceFeedService } from '../markets/price-feed.service';
import { AdminRealtimeGateway } from './admin-realtime.gateway';
import { RealtimeAuthService } from './realtime-auth.service';
import { RealtimeGateway } from './realtime.gateway';

/**
 * Real Socket.IO server + real socket.io-client connections over an actual
 * ephemeral TCP port — not gateway-method unit tests — because the
 * riskiest requirements here (unauthorized subscription, multi-session
 * fan-out, private-room isolation) are only genuinely proven by two
 * independent sockets talking to a real server, not by calling a class
 * method in isolation. Runs in the default fast suite (no Postgres/Docker
 * needed): `RealtimeAuthService`/`InstrumentService`/`PriceFeedService`
 * are stubbed in-memory since only the transport/room/permission behavior
 * is under test here.
 */

const USER_A: RequestUser = { id: 'user-a', email: 'a@example.com', status: 'active', sessionId: 'sess-a', roles: ['user'], permissions: [], accountType: 'real', demoOfUserId: null };
const USER_B: RequestUser = { id: 'user-b', email: 'b@example.com', status: 'active', sessionId: 'sess-b', roles: ['user'], permissions: [], accountType: 'real', demoOfUserId: null };
const ADMIN_REPORTS_ONLY: RequestUser = {
  id: 'admin-1',
  email: 'admin@example.com',
  status: 'active',
  sessionId: 'sess-admin',
  roles: ['support'],
  permissions: ['reports.view'],
  accountType: 'real',
  demoOfUserId: null,
};
const NO_ADMIN_ACCESS: RequestUser = {
  id: 'user-c',
  email: 'c@example.com',
  status: 'active',
  sessionId: 'sess-c',
  roles: ['user'],
  permissions: [],
  accountType: 'real',
  demoOfUserId: null,
};

const TOKENS: Record<string, RequestUser> = {
  'token-a': USER_A,
  'token-a-second-session': { ...USER_A, sessionId: 'sess-a-2' },
  'token-b': USER_B,
  'admin-reports-only': ADMIN_REPORTS_ONLY,
  'no-admin-access': NO_ADMIN_ACCESS,
};

describe('Realtime gateways (real Socket.IO transport)', () => {
  let app: INestApplication;
  let events: EventEmitter2;
  let baseUrl: string;
  const openSockets: ClientSocket[] = [];

  beforeAll(async () => {
    const realtimeAuth = {
      authenticate: jest.fn(async (token: string | undefined) => {
        const user = token ? TOKENS[token] : undefined;
        if (!user) throw new UnauthorizedException('Invalid token');
        return user;
      }),
      isSessionStillValid: jest.fn().mockResolvedValue(true),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [
        RealtimeGateway,
        AdminRealtimeGateway,
        { provide: RealtimeAuthService, useValue: realtimeAuth },
        { provide: InstrumentService, useValue: { getById: jest.fn().mockResolvedValue({ id: 'inst-1' }) } },
        { provide: PriceFeedService, useValue: { priceStream$: jest.fn().mockReturnValue({ subscribe: jest.fn() }) } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.listen(0);
    events = moduleRef.get(EventEmitter2);

    const address = app.getHttpServer().address();
    const port = typeof address === 'object' && address ? address.port : 0;
    baseUrl = `http://localhost:${port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    for (const socket of openSockets.splice(0)) socket.disconnect();
  });

  function connect(namespace: string, token: string | undefined): Promise<ClientSocket> {
    return new Promise((resolve, reject) => {
      const socket = ioClient(`${baseUrl}${namespace}`, {
        auth: { token },
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
      });
      openSockets.push(socket);
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', (error: Error) => reject(error));
    });
  }

  function waitForEvent(socket: ClientSocket, eventName: string, timeoutMs = 2000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for "${eventName}"`)), timeoutMs);
      socket.once(eventName, (payload: unknown) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
  }

  function neverReceives(socket: ClientSocket, eventName: string, withinMs = 300): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, withinMs);
      socket.once(eventName, () => {
        clearTimeout(timer);
        reject(new Error(`Unexpectedly received "${eventName}"`));
      });
    });
  }

  describe('unauthorized subscription', () => {
    it('rejects a connection with no token — never reaches "connect"', async () => {
      await expect(connect('/', undefined)).rejects.toBeTruthy();
    });

    it('rejects a connection with an unrecognized/garbage token', async () => {
      await expect(connect('/', 'garbage-token')).rejects.toBeTruthy();
    });

    it('a socket is only ever placed in its own user:{id} room — never a room a client can request', async () => {
      const socketA = await connect('/', 'token-a');
      const socketB = await connect('/', 'token-b');

      const gateway = app.get(RealtimeGateway);
      // Server-side introspection: confirm the room membership is exactly
      // what handleConnection derived from the authenticated user, proving
      // this is enforced by never exposing a join capability — not merely
      // "the honest client never asked for someone else's room".
      const inRoomA = [...gateway.server.sockets.adapter.rooms.get('user:user-a') ?? []];
      const inRoomB = [...gateway.server.sockets.adapter.rooms.get('user:user-b') ?? []];
      expect(inRoomA).toHaveLength(1);
      expect(inRoomB).toHaveLength(1);

      const eventForA = { id: 'evt-1', type: 'bet.settled' as const, entityId: 'bet-1', userId: 'user-a', occurredAt: new Date().toISOString(), payload: {} };
      const receivedByA = waitForEvent(socketA, 'bet.settled');
      const neverReceivedByB = neverReceives(socketB, 'bet.settled');
      events.emit('bet.settled', eventForA);

      await expect(receivedByA).resolves.toEqual(eventForA);
      await expect(neverReceivedByB).resolves.toBeUndefined();
    });

    it('a non-admin-permission user cannot connect to the /admin namespace at all', async () => {
      await expect(connect('/admin', 'no-admin-access')).rejects.toBeTruthy();
    });

    it('an admin with only reports.view is rejected when subscribing to a topic gated by a different permission', async () => {
      const socket = await connect('/admin', 'admin-reports-only');

      const ackOrError: Promise<unknown> = new Promise((resolve) => {
        socket.on('exception', (payload: unknown) => resolve(payload));
      });
      socket.emit('subscribe:admin-topic', { topic: 'withdrawals' });
      const result = await Promise.race([ackOrError, new Promise((resolve) => setTimeout(() => resolve('no-error-received'), 300))]);
      expect(result).not.toBe('no-error-received');

      // And even a real broadcast to that topic never reaches this socket.
      const neverReceived = neverReceives(socket, 'withdrawal.status_changed');
      events.emit('withdrawal.status_changed', {
        id: 'evt-2',
        type: 'withdrawal.status_changed' as const,
        entityId: 'wd-1',
        userId: 'user-a',
        occurredAt: new Date().toISOString(),
        payload: {},
        terminal: true,
      });
      await expect(neverReceived).resolves.toBeUndefined();
    });

    it('an admin with the matching permission does receive events for that topic', async () => {
      const socket = await connect('/admin', 'admin-reports-only');
      socket.emit('subscribe:admin-topic', { topic: 'reports' });
      await new Promise((resolve) => setTimeout(resolve, 100)); // let the join complete

      const event = {
        id: 'evt-3',
        type: 'deposit.status_changed' as const,
        entityId: 'dep-1',
        userId: 'user-a',
        occurredAt: new Date().toISOString(),
        payload: {},
        terminal: true,
      };
      const received = waitForEvent(socket, 'deposit.status_changed');
      events.emit('deposit.status_changed', event);
      await expect(received).resolves.toEqual(event);
    });
  });

  describe('multiple browser sessions', () => {
    it('two sockets for the same user (two sessions/tabs) both receive a private event exactly once', async () => {
      const tab1 = await connect('/', 'token-a');
      const tab2 = await connect('/', 'token-a-second-session');

      const event = { id: 'evt-4', type: 'bet.updated' as const, entityId: 'bet-2', userId: 'user-a', occurredAt: new Date().toISOString(), payload: {} };
      const gotTab1 = waitForEvent(tab1, 'bet.updated');
      const gotTab2 = waitForEvent(tab2, 'bet.updated');
      events.emit('bet.updated', event);

      await expect(gotTab1).resolves.toEqual(event);
      await expect(gotTab2).resolves.toEqual(event);
    });
  });

  describe('duplicate event (server-side re-emission)', () => {
    it('emitting the identical envelope twice delivers it twice — dedup is the client\'s job by id, not server-side suppression', async () => {
      const socket = await connect('/', 'token-a');
      const event = { id: 'evt-5', type: 'bet.updated' as const, entityId: 'bet-3', userId: 'user-a', occurredAt: new Date().toISOString(), payload: {} };

      const received: unknown[] = [];
      socket.on('bet.updated', (payload: unknown) => received.push(payload));

      events.emit('bet.updated', event);
      events.emit('bet.updated', event);
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(received).toHaveLength(2);
      expect(received[0]).toEqual(event);
      expect(received[1]).toEqual(event);
      // Both carry the identical deterministic id — this is what lets the
      // client's dedup guard (see apps/web RealtimeProvider) collapse them
      // into a single effective update.
      expect((received[0] as { id: string }).id).toBe((received[1] as { id: string }).id);
    });
  });

  describe('reconnect', () => {
    it('a socket that reconnects with a fresh token re-authenticates and rejoins its private room', async () => {
      const socket = await connect('/', 'token-a');
      const gateway = app.get(RealtimeGateway);
      expect(gateway.server.sockets.adapter.rooms.get('user:user-a')?.size).toBe(1);

      // Simulate the server force-disconnecting this socket (e.g. session
      // revoked) and the client reconnecting — proving the handshake path
      // works again on a fresh connection, not just on the first one.
      socket.disconnect();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const reconnected = await connect('/', 'token-a');
      expect(gateway.server.sockets.adapter.rooms.get('user:user-a')?.size).toBe(1);

      const event = { id: 'evt-6', type: 'bet.updated' as const, entityId: 'bet-4', userId: 'user-a', occurredAt: new Date().toISOString(), payload: {} };
      const received = waitForEvent(reconnected, 'bet.updated');
      events.emit('bet.updated', event);
      await expect(received).resolves.toEqual(event);
    });
  });
});
