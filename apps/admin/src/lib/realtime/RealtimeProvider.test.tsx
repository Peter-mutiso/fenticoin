import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';

import { AuthProvider } from '@/lib/auth/AuthContext';
import { storeSession } from '@/lib/auth/token-storage';
import { RealtimeProvider, useRealtime } from './RealtimeProvider';

const mockGetMe = jest.fn();
jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return { ...actual, getMe: (...args: unknown[]) => mockGetMe(...args) };
});

// A hand-rolled fake socket standing in for `socket.io-client`'s `Socket` —
// captures registered handlers and emitted messages so tests can drive it
// directly, exactly like the real transport would, without a real
// network connection.
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

  fireRaw(event: string, payload?: unknown): void {
    for (const handler of this.handlers.get(event) ?? []) handler(payload);
  }
}

let lastSocket: FakeSocket | undefined;
let lastNamespace: string | undefined;
jest.mock('socket.io-client', () => ({
  io: jest.fn((namespace: string) => {
    lastNamespace = namespace;
    lastSocket = new FakeSocket();
    return lastSocket;
  }),
}));

async function waitForSocket(): Promise<FakeSocket> {
  await waitFor(() => expect(lastSocket).toBeDefined());
  return lastSocket!;
}

function fire(socket: FakeSocket, eventName: string, payload?: unknown): void {
  act(() => socket.fireRaw(eventName, payload));
}

const adminUser = { id: 'admin-1', email: 'admin@example.com', status: 'active', kycStatus: 'approved', emailVerifiedAt: null, phoneVerifiedAt: null };

function authenticate(permissions: string[]) {
  storeSession({ accessToken: 'access-1', refreshToken: 'refresh-1', user: adminUser });
  mockGetMe.mockResolvedValue({ id: 'admin-1', email: 'admin@example.com', status: 'active', sessionId: 's1', roles: ['support'], permissions });
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

function event(overrides: Partial<{ id: string; type: string; entityId: string; occurredAt: string; terminal: boolean }> = {}) {
  return {
    id: 'evt-1',
    type: 'withdrawal.status_changed',
    entityId: 'wd-1',
    occurredAt: '2026-01-01T00:00:00.000Z',
    payload: {},
    ...overrides,
  };
}

describe('admin RealtimeProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    lastSocket = undefined;
    lastNamespace = undefined;
  });

  it('connects to the /admin namespace', async () => {
    authenticate(['reports.view']);
    renderProbe();
    await waitForSocket();
    expect(lastNamespace).toMatch(/\/admin$/);
  });

  it('only subscribes to admin topics matching the current permission set', async () => {
    authenticate(['withdrawals.view', 'reports.view']);
    renderProbe();
    const socket = await waitForSocket();
    fire(socket, 'connect');

    const subscribed = socket.emitted.filter((e) => e.event === 'subscribe:admin-topic').map((e) => (e.payload as { topic: string }).topic);
    expect(subscribed.sort()).toEqual(['reports', 'withdrawals']);
  });

  it('reconnect: every connect triggers the full four-view reconciliation invalidation set', async () => {
    authenticate(['reports.view']);
    const { invalidateSpy } = renderProbe();
    const socket = await waitForSocket();

    fire(socket, 'connect');
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['bets-requiring-review'] }));
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['admin-withdrawals'] }));
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['admin-deposits'] }));
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['reports', 'overview'] }));
  });

  it('duplicate event: the same event id delivered twice only triggers invalidation once', async () => {
    authenticate(['withdrawals.view']);
    const { invalidateSpy } = renderProbe();
    const socket = await waitForSocket();
    fire(socket, 'connect');
    invalidateSpy.mockClear();

    const e = event({ id: 'evt-dup', entityId: 'wd-9' });
    fire(socket, 'withdrawal.status_changed', e);
    fire(socket, 'withdrawal.status_changed', e);

    const calls = invalidateSpy.mock.calls.filter((call) => {
      const arg = call[0] as { queryKey: unknown[] };
      return arg.queryKey[0] === 'admin-withdrawals';
    });
    expect(calls).toHaveLength(1);
  });

  it('stale event: an older occurredAt for the same entity is dropped', async () => {
    authenticate(['withdrawals.view']);
    const { invalidateSpy } = renderProbe();
    const socket = await waitForSocket();
    fire(socket, 'connect');
    invalidateSpy.mockClear();

    fire(socket, 'withdrawal.status_changed', event({ id: 'evt-newer', entityId: 'wd-5', occurredAt: '2026-01-01T00:05:00.000Z' }));
    invalidateSpy.mockClear();
    fire(socket, 'withdrawal.status_changed', event({ id: 'evt-stale', entityId: 'wd-5', occurredAt: '2026-01-01T00:04:00.000Z' }));

    const calls = invalidateSpy.mock.calls.filter((call) => {
      const arg = call[0] as { queryKey: unknown[] };
      return arg.queryKey[0] === 'admin-withdrawals';
    });
    expect(calls).toHaveLength(0);
  });

  it('a bet event invalidates the risk queue', async () => {
    authenticate(['bets.view']);
    const { invalidateSpy } = renderProbe();
    const socket = await waitForSocket();
    fire(socket, 'connect');
    invalidateSpy.mockClear();

    fire(socket, 'bet.updated', event({ id: 'evt-bet', type: 'bet.updated', entityId: 'bet-1' }));
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['bets-requiring-review'] }));
  });
});
