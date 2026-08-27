import { act, screen, waitFor } from '@testing-library/react';

import { storeSession } from '@/lib/auth/token-storage';
import { renderWithProviders } from '@/test-utils/render';
import { Header } from './Header';

const mockGetMe = jest.fn();
const mockGetDemoStatus = jest.fn();
const mockListBets = jest.fn();
const mockListDeposits = jest.fn();
const mockListWithdrawals = jest.fn();

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    getMe: (...args: unknown[]) => mockGetMe(...args),
    getDemoStatus: (...args: unknown[]) => mockGetDemoStatus(...args),
    listBets: (...args: unknown[]) => mockListBets(...args),
    listDeposits: (...args: unknown[]) => mockListDeposits(...args),
    listWithdrawals: (...args: unknown[]) => mockListWithdrawals(...args),
  };
});

function authenticate() {
  storeSession({
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    user: { id: 'user-1', email: 'trader@example.com', status: 'active', kycStatus: 'unverified', emailVerifiedAt: null, phoneVerifiedAt: null, accountType: 'real', demoOfUserId: null },
  });
  mockGetMe.mockResolvedValue({ id: 'user-1', email: 'trader@example.com', status: 'active', sessionId: 's1', roles: [], permissions: [] });
}

function authenticateAsDemo() {
  storeSession({
    accessToken: 'access-demo',
    refreshToken: 'refresh-demo',
    user: { id: 'demo-user-1', email: 'demo+user-1@fenticoin.demo.internal', status: 'active', kycStatus: 'unverified', emailVerifiedAt: null, phoneVerifiedAt: null, accountType: 'demo', demoOfUserId: 'user-1' },
  });
  mockGetMe.mockResolvedValue({ id: 'demo-user-1', email: 'demo+user-1@fenticoin.demo.internal', status: 'active', sessionId: 's-demo', roles: [], permissions: [] });
}

describe('Header', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    mockListDeposits.mockResolvedValue({ items: [] });
    mockListWithdrawals.mockResolvedValue({ items: [] });
    mockListBets.mockResolvedValue({ items: [] });
  });

  it('formats the active account balance from minor units — never a raw Number() float conversion', async () => {
    authenticate();
    mockGetDemoStatus.mockResolvedValue({
      current: 'real',
      real: { userId: 'user-1', balance: { currency: 'USD', availableMinorUnits: '123456', available: '1234.56', lockedMinorUnits: '0', locked: '0.00' } },
      demo: null,
    });

    renderWithProviders(<Header />);

    await waitFor(() => expect(screen.getByText('$1234.56')).toBeInTheDocument());
  });

  it('shows an unread notification badge after a bet settles in-session', async () => {
    authenticate();
    mockGetDemoStatus.mockResolvedValue({
      current: 'real',
      real: { userId: 'user-1', balance: { currency: 'USD', availableMinorUnits: '0', available: '0.00', lockedMinorUnits: '0', locked: '0.00' } },
      demo: null,
    });

    const openBet = {
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
    mockListBets.mockResolvedValue({ items: [openBet] });

    const { queryClient } = renderWithProviders(<Header />);
    await waitFor(() => expect(queryClient.getQueryData(['bets', 'recent'])).toEqual({ items: [openBet] }));

    act(() => {
      queryClient.setQueryData(['bets', 'recent'], { items: [{ ...openBet, status: 'won' }] });
    });

    await waitFor(() => expect(screen.getByLabelText(/notifications/i)).toHaveTextContent('1'));
  });

  it('shows a persistent Demo indicator and the demo balance for a demo account', async () => {
    authenticateAsDemo();
    mockGetDemoStatus.mockResolvedValue({
      current: 'demo',
      real: { userId: 'user-1', balance: { currency: 'USD', availableMinorUnits: '500000', available: '5000.00', lockedMinorUnits: '0', locked: '0.00' } },
      demo: { userId: 'demo-user-1', balance: { currency: 'USD', availableMinorUnits: '1000000', available: '10000.00', lockedMinorUnits: '0', locked: '0.00' } },
    });

    renderWithProviders(<Header />);

    const switcher = await screen.findByRole('button', { name: /switch account/i });
    expect(switcher).toHaveTextContent('Demo');
    await waitFor(() => expect(switcher).toHaveTextContent('$10000.00'));
  });

  it('shows a Real indicator and the real balance for a real account', async () => {
    authenticate();
    mockGetDemoStatus.mockResolvedValue({
      current: 'real',
      real: { userId: 'user-1', balance: { currency: 'USD', availableMinorUnits: '0', available: '0.00', lockedMinorUnits: '0', locked: '0.00' } },
      demo: null,
    });

    renderWithProviders(<Header />);

    const switcher = await screen.findByRole('button', { name: /switch account/i });
    expect(switcher).toHaveTextContent('Real');
    expect(switcher).not.toHaveTextContent('Demo');
    await waitFor(() => expect(switcher).toHaveTextContent('$0.00'));
  });
});
