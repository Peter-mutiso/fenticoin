import { act, screen, waitFor } from '@testing-library/react';

import { storeSession } from '@/lib/auth/token-storage';
import { renderWithProviders } from '@/test-utils/render';
import { BetsPanel } from './BetsPanel';

const mockListBets = jest.fn();
const mockGetMe = jest.fn();
const mockListDeposits = jest.fn();
const mockListWithdrawals = jest.fn();
const mockGetPrice = jest.fn();
jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    listBets: (...args: unknown[]) => mockListBets(...args),
    getMe: (...args: unknown[]) => mockGetMe(...args),
    listDeposits: (...args: unknown[]) => mockListDeposits(...args),
    listWithdrawals: (...args: unknown[]) => mockListWithdrawals(...args),
    getPrice: (...args: unknown[]) => mockGetPrice(...args),
  };
});

function authenticate() {
  storeSession({
    accessToken: 'a',
    refreshToken: 'r',
    user: { id: 'user-1', email: 'trader@example.com', status: 'active', kycStatus: 'unverified', emailVerifiedAt: null, phoneVerifiedAt: null, accountType: 'real', demoOfUserId: null },
  });
  mockGetMe.mockResolvedValue({ id: 'user-1', email: 'trader@example.com', status: 'active', sessionId: 's1', roles: [], permissions: [] });
  mockListDeposits.mockResolvedValue({ items: [] });
  mockListWithdrawals.mockResolvedValue({ items: [] });
}

describe('BetsPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
  });

  it('shows a specific error, not a silently empty section, when fetching bets fails', async () => {
    authenticate();
    const { ApiError } = jest.requireActual('@/lib/api-client');
    mockListBets.mockRejectedValue(new ApiError('Database unavailable', 500, 'InternalServerError'));

    renderWithProviders(<BetsPanel instruments={[]} />);

    expect(await screen.findByRole('heading', { name: /your bets/i })).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent(/unable to load your bets/i);
  });

  it('renders nothing when the user genuinely has no bets (not an error)', async () => {
    authenticate();
    mockListBets.mockResolvedValue({ items: [] });

    renderWithProviders(<BetsPanel instruments={[]} />);

    await waitFor(() => expect(mockListBets).toHaveBeenCalled());
    expect(screen.queryByRole('heading', { name: /your bets/i })).not.toBeInTheDocument();
  });

  const instrument = { id: 'inst-1', symbol: 'BTCUSD', quoteCurrency: 'USD', displaySymbol: 'BTC/USD', name: 'Bitcoin', categoryKey: 'crypto', pricePrecision: 2, status: 'active' as const, maxPriceAgeSeconds: 30 };

  function openBet(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: 'bet-1',
      userId: 'user-1',
      instrumentId: 'inst-1',
      type: 'rise_fall' as const,
      selection: 'rise',
      stakeAmountMinorUnits: '1000',
      currency: 'USD',
      entryPriceMinorUnits: '10000000',
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
      botId: null,
      ...overrides,
    };
  }

  it('shows an unsettled bet under "Open positions" with its live entry/current price, not under history', async () => {
    authenticate();
    mockListBets.mockResolvedValue({ items: [openBet()] });
    mockGetPrice.mockResolvedValue({ instrumentId: 'inst-1', price: '101000.00', priceMinorUnits: '10100000', currency: 'USD', source: 'test', observedAt: new Date().toISOString(), receivedAt: new Date().toISOString(), isStale: false });

    renderWithProviders(<BetsPanel instruments={[instrument]} />);

    expect(await screen.findByRole('heading', { name: /open positions/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('$101000.00')).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: /recent history/i })).not.toBeInTheDocument();
  });

  it('moves a bet out of Open positions and into history the moment the server settles it', async () => {
    authenticate();
    mockListBets.mockResolvedValue({ items: [openBet()] });
    mockGetPrice.mockResolvedValue({ instrumentId: 'inst-1', price: '100000.00', priceMinorUnits: '10000000', currency: 'USD', source: 'test', observedAt: new Date().toISOString(), receivedAt: new Date().toISOString(), isStale: false });

    const { queryClient } = renderWithProviders(<BetsPanel instruments={[instrument]} />);
    await waitFor(() => expect(queryClient.getQueryData(['bets', 'recent'])).toBeTruthy());

    act(() => {
      queryClient.setQueryData(['bets', 'recent'], { items: [openBet({ status: 'won', result: 'win', settledAt: new Date().toISOString() })] });
    });

    await waitFor(() => expect(screen.getByRole('heading', { name: /recent history/i })).toBeInTheDocument());
    // Back to zero open positions — the empty affordance, never the removed card, and no fabricated "still open" state.
    expect(await screen.findByText(/no open positions/i)).toBeInTheDocument();
  });
});
