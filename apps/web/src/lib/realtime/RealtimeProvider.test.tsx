import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';

import { AuthProvider } from '@/lib/auth/AuthContext';
import { storeSession } from '@/lib/auth/token-storage';
import { RealtimeProvider, useRealtime } from './RealtimeProvider';

const mockGetMe = jest.fn();
jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return { ...actual, getMe: (...args: unknown[]) => mockGetMe(...args) };
});

// A hand-rolled fake socket standing in for `socket.io-client`'s `Socket` —
// captures registered handlers so tests can fire them directly, exactly
// like the real transport would, without an actual network connection.
class FakeSocket {
  private readonly handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  emitted: { event: string; payload: unknown }[] = [];

  on(event: string, handler: (...args: unknown[]) => void): this {
    const set = this.handlers.get(event) ?? new Set();
    set.add(handler);
    this.handlers.set(event, set);
    return this;
  }

  emit(event: string, payload?: unknown): this {
    this.emitted.push({ event, payload });
    return this;
  }

  disconnect(): this {
    return this;
  }

  fire(event: string, payload?: unknown): void {
    for (const handler of this.handlers.get(event) ?? []) handler(payload);
  }
}

let lastSocket: FakeSocket | undefined;
jest.mock('socket.io-client', () => ({
  io: jest.fn(() => {
    lastSocket = new FakeSocket();
    return lastSocket;
  }),
}));

/** The socket is only created once `AuthProvider` resolves to `authenticated` (async `getMe()` hydration), so tests must wait for it rather than assuming it exists right after render. */
async function waitForSocket(): Promise<FakeSocket> {
  await waitFor(() => expect(lastSocket).toBeDefined());
  return lastSocket!;
}

/** `fire(socket, ...)` synchronously triggers React state updates (`setConnected`, query invalidation) — wrapped in `act` so React doesn't warn about updates outside its render cycle. */
function fire(socket: FakeSocket, eventName: string, payload?: unknown): void {
  act(() => socket.fire(eventName, payload));
}

const user = { id: 'user-1', email: 'trader@example.com', status: 'active', kycStatus: 'unverified', emailVerifiedAt: null, phoneVerifiedAt: null, accountType: 'real' as const, demoOfUserId: null };

function authenticate() {
  storeSession({ accessToken: 'access-1', refreshToken: 'refresh-1', user });
  mockGetMe.mockResolvedValue({ id: 'user-1', email: 'trader@example.com', status: 'active', sessionId: 's1', roles: [], permissions: [] });
}

function Probe() {
  const { connected } = useRealtime();
  return <p data-testid="connected">{String(connected)}</p>;
}

function renderProbe() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
  const view = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RealtimeProvider>
          <Probe />
        </RealtimeProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { ...view, queryClient, invalidateSpy };
}

function event(overrides: Partial<{ id: string; type: string; entityId: string; userId: string; occurredAt: string; terminal: boolean }> = {}) {
  return {
    id: 'evt-1',
    type: 'bet.updated',
    entityId: 'bet-1',
    userId: 'user-1',
    occurredAt: '2026-01-01T00:00:00.000Z',
    payload: {},
    ...overrides,
  };
}

function betInvalidations(invalidateSpy: jest.SpyInstance, entityId: string) {
  return invalidateSpy.mock.calls.filter((call) => {
    const arg = call[0] as { queryKey: unknown[] };
    return arg.queryKey[0] === 'bet' && arg.queryKey[1] === entityId;
  });
}

describe('RealtimeProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    lastSocket = undefined;
  });

  it('connects once authenticated and reports connected state', async () => {
    authenticate();
    renderProbe();
    const socket = await waitForSocket();

    fire(socket, 'connect');
    await waitFor(() => expect(screen.getByTestId('connected')).toHaveTextContent('true'));

    fire(socket, 'disconnect');
    await waitFor(() => expect(screen.getByTestId('connected')).toHaveTextContent('false'));
  });

  it('reconnect: every "connect" (first connect and every later reconnect) triggers the full reconciliation invalidation set', async () => {
    authenticate();
    const { invalidateSpy } = renderProbe();
    const socket = await waitForSocket();

    fire(socket, 'connect');
    const firstRoundCalls = invalidateSpy.mock.calls.length;
    expect(firstRoundCalls).toBeGreaterThan(0);
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['wallet'] }));
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['bets', 'recent'] }));

    invalidateSpy.mockClear();
    fire(socket, 'disconnect');
    fire(socket, 'connect'); // simulated reconnect
    expect(invalidateSpy.mock.calls.length).toBe(firstRoundCalls);
  });

  it('duplicate event: the same event id delivered twice only triggers invalidation once', async () => {
    authenticate();
    const { invalidateSpy } = renderProbe();
    const socket = await waitForSocket();
    fire(socket, 'connect');
    invalidateSpy.mockClear();

    const e = event({ id: 'evt-dup', entityId: 'bet-7', occurredAt: '2026-01-01T00:00:10.000Z' });
    fire(socket, 'bet.updated', e);
    fire(socket, 'bet.updated', e); // exact duplicate, same id

    expect(betInvalidations(invalidateSpy, 'bet-7')).toHaveLength(1);
  });

  it('stale event: an event whose occurredAt is not newer than the last-applied one for that entity is dropped', async () => {
    authenticate();
    const { invalidateSpy } = renderProbe();
    const socket = await waitForSocket();
    fire(socket, 'connect');
    invalidateSpy.mockClear();

    fire(socket, 'bet.updated', event({ id: 'evt-newer', entityId: 'bet-9', occurredAt: '2026-01-01T00:05:00.000Z' }));
    invalidateSpy.mockClear();

    // A different id, but an older/equal occurredAt for the same entity — a stale re-delivery.
    fire(socket, 'bet.updated', event({ id: 'evt-stale', entityId: 'bet-9', occurredAt: '2026-01-01T00:04:00.000Z' }));

    expect(betInvalidations(invalidateSpy, 'bet-9')).toHaveLength(0);
  });

  it('out-of-order event: a newer event arriving after an even-newer one for the same entity is dropped, only the newest takes effect', async () => {
    authenticate();
    const { invalidateSpy } = renderProbe();
    const socket = await waitForSocket();
    fire(socket, 'connect');
    invalidateSpy.mockClear();

    // Newest arrives first...
    fire(socket, 'bet.updated', event({ id: 'evt-newest', entityId: 'bet-11', occurredAt: '2026-01-01T00:10:00.000Z' }));
    invalidateSpy.mockClear();
    // ...then an older one for the same entity arrives out of order.
    fire(socket, 'bet.updated', event({ id: 'evt-older', entityId: 'bet-11', occurredAt: '2026-01-01T00:09:00.000Z' }));

    expect(betInvalidations(invalidateSpy, 'bet-11')).toHaveLength(0);
  });

  it('a genuinely newer event for an entity is applied normally', async () => {
    authenticate();
    const { invalidateSpy } = renderProbe();
    const socket = await waitForSocket();
    fire(socket, 'connect');
    invalidateSpy.mockClear();

    fire(socket, 'bet.updated', event({ id: 'evt-a', entityId: 'bet-12', occurredAt: '2026-01-01T00:00:00.000Z' }));
    invalidateSpy.mockClear();
    fire(socket, 'bet.updated', event({ id: 'evt-b', entityId: 'bet-12', occurredAt: '2026-01-01T00:01:00.000Z' }));

    expect(betInvalidations(invalidateSpy, 'bet-12')).toHaveLength(1);
  });

  it('bet.settled also invalidates the wallet — a settlement changes the balance', async () => {
    authenticate();
    const { invalidateSpy } = renderProbe();
    const socket = await waitForSocket();
    fire(socket, 'connect');
    invalidateSpy.mockClear();

    fire(socket, 'bet.settled', event({ id: 'evt-settled', type: 'bet.settled', entityId: 'bet-13' }));
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['wallet'] }));
  });

  it('a non-terminal deposit status change does not invalidate the wallet', async () => {
    authenticate();
    const { invalidateSpy } = renderProbe();
    const socket = await waitForSocket();
    fire(socket, 'connect');
    invalidateSpy.mockClear();

    fire(socket, 'deposit.status_changed', event({ id: 'evt-dep', type: 'deposit.status_changed', entityId: 'dep-1', terminal: false }));

    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['deposits', 'recent'] }));
    expect(invalidateSpy).not.toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['wallet'] }));
  });
});
