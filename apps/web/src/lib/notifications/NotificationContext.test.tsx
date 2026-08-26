import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AuthProvider } from '@/lib/auth/AuthContext';
import { storeSession } from '@/lib/auth/token-storage';
import { ToastProvider } from '@/components/ui/Toast';
import { NotificationProvider, useNotifications } from './NotificationContext';

const mockListBets = jest.fn();
const mockListDeposits = jest.fn();
const mockListWithdrawals = jest.fn();
const mockGetMe = jest.fn();

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    listBets: (...args: unknown[]) => mockListBets(...args),
    listDeposits: (...args: unknown[]) => mockListDeposits(...args),
    listWithdrawals: (...args: unknown[]) => mockListWithdrawals(...args),
    getMe: (...args: unknown[]) => mockGetMe(...args),
  };
});

const user = { id: 'user-1', email: 'trader@example.com', status: 'active', kycStatus: 'unverified', emailVerifiedAt: null, phoneVerifiedAt: null, accountType: 'real' as const, demoOfUserId: null };

function authenticate() {
  storeSession({ accessToken: 'access-1', refreshToken: 'refresh-1', user });
  mockGetMe.mockResolvedValue({ id: 'user-1', email: 'trader@example.com', status: 'active', sessionId: 's1', roles: [], permissions: [] });
}

const bet = {
  id: 'bet-1',
  userId: 'user-1',
  instrumentId: 'inst-1',
  type: 'rise_fall' as const,
  selection: 'rise',
  stakeAmountMinorUnits: '1000',
  currency: 'USD',
  entryPriceMinorUnits: '100000',
  entryPriceObservedAt: new Date().toISOString(),
  targetPriceMinorUnits: null,
  payoutRateBasisPoints: '8500',
  potentialPayoutMinorUnits: '1850',
  status: 'open' as const,
  result: null,
  placedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  settlementPriceMinorUnits: null,
  settlementPriceObservedAt: null,
  settledAt: null,
  placementTransactionId: 'txn-1',
  settlementTransactionId: null,
  cancelReason: null,
};

function Probe() {
  const { notifications, unreadCount, markAllRead } = useNotifications();
  return (
    <div>
      <p data-testid="unread">{unreadCount}</p>
      <ul>
        {notifications.map((n) => (
          <li key={n.id}>{n.title}</li>
        ))}
      </ul>
      <button onClick={markAllRead}>Mark all read</button>
    </div>
  );
}

function renderProbe() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <NotificationProvider>
            <Probe />
          </NotificationProvider>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

describe('NotificationProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    mockListBets.mockResolvedValue({ items: [] });
    mockListDeposits.mockResolvedValue({ items: [] });
    mockListWithdrawals.mockResolvedValue({ items: [] });
  });

  it('starts empty when unauthenticated', async () => {
    renderProbe();
    expect(await screen.findByTestId('unread')).toHaveTextContent('0');
  });

  it('records a notification when a bet transitions into a terminal status in-session', async () => {
    authenticate();
    mockListBets.mockResolvedValueOnce({ items: [bet] });

    const { queryClient } = renderProbe();
    await screen.findByTestId('unread');
    await waitFor(() => expect(queryClient.getQueryData(['bets', 'recent'])).toEqual({ items: [bet] }));

    act(() => {
      queryClient.setQueryData(['bets', 'recent'], { items: [{ ...bet, status: 'won' }] });
    });

    await waitFor(() => expect(screen.getByTestId('unread')).toHaveTextContent('1'));
    expect(within(screen.getByRole('list')).getByText(/bet settled — you won/i)).toBeInTheDocument();
  });

  it('does not raise a notification for a bet that was already settled before the provider ever mounted', async () => {
    authenticate();
    mockListBets.mockResolvedValue({ items: [{ ...bet, status: 'won' as const }] });

    renderProbe();
    await screen.findByTestId('unread');

    expect(screen.getByTestId('unread')).toHaveTextContent('0');
  });

  it('mark all read clears the unread count without removing the notifications', async () => {
    authenticate();
    mockListBets.mockResolvedValueOnce({ items: [bet] });

    const { queryClient } = renderProbe();
    await screen.findByTestId('unread');
    await waitFor(() => expect(queryClient.getQueryData(['bets', 'recent'])).toEqual({ items: [bet] }));

    act(() => {
      queryClient.setQueryData(['bets', 'recent'], { items: [{ ...bet, status: 'lost' }] });
    });
    await waitFor(() => expect(screen.getByTestId('unread')).toHaveTextContent('1'));

    await userEvent.click(screen.getByRole('button', { name: /mark all read/i }));

    expect(screen.getByTestId('unread')).toHaveTextContent('0');
    expect(within(screen.getByRole('list')).getByText(/bet settled — you lost/i)).toBeInTheDocument();
  });

  it('does not duplicate a persisted notification on remount', async () => {
    authenticate();
    mockListBets.mockResolvedValue({ items: [{ ...bet, status: 'won' as const }] });
    window.localStorage.setItem(
      `fenticoin.notifications.${user.id}`,
      JSON.stringify([
        {
          id: 'bet_settled:bet-1:won',
          kind: 'bet_settled',
          entityId: 'bet-1',
          title: 'Bet settled — you won',
          description: 'Payout $18.50',
          tone: 'success',
          createdAt: new Date().toISOString(),
          read: false,
          href: '/bet-history?bet=bet-1',
        },
      ]),
    );

    renderProbe();

    await waitFor(() => expect(screen.getByTestId('unread')).toHaveTextContent('1'));
    expect(screen.getAllByText(/bet settled — you won/i)).toHaveLength(1);
  });
});
