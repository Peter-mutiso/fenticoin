import { screen, waitFor, within } from '@testing-library/react';

import { storeSession } from '@/lib/auth/token-storage';
import { renderWithProviders } from '@/test-utils/render';
import PortfolioPage from './page';

const instrument = {
  id: 'inst-btc',
  symbol: 'BTC',
  quoteCurrency: 'USD',
  displaySymbol: 'BTC/USD',
  name: 'Bitcoin',
  categoryKey: 'crypto',
  pricePrecision: 2,
  status: 'active' as const,
  maxPriceAgeSeconds: 30,
};

const openBet = {
  id: 'bet-open',
  userId: 'user-1',
  instrumentId: 'inst-btc',
  type: 'rise_fall' as const,
  selection: 'rise',
  stakeAmountMinorUnits: '1000',
  currency: 'USD',
  entryPriceMinorUnits: '11200000',
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

const wonBet = {
  ...openBet,
  id: 'bet-won',
  status: 'won' as const,
  result: 'win' as const,
  settlementPriceMinorUnits: '11300000',
  settledAt: new Date().toISOString(),
};

const mockGetWallet = jest.fn();
const mockListBets = jest.fn();
const mockListInstruments = jest.fn();
const mockListDeposits = jest.fn();
const mockListWithdrawals = jest.fn();
const mockGetMe = jest.fn();

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    getWallet: (...args: unknown[]) => mockGetWallet(...args),
    listBets: (...args: unknown[]) => mockListBets(...args),
    listInstruments: (...args: unknown[]) => mockListInstruments(...args),
    listDeposits: (...args: unknown[]) => mockListDeposits(...args),
    listWithdrawals: (...args: unknown[]) => mockListWithdrawals(...args),
    getMe: (...args: unknown[]) => mockGetMe(...args),
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

const mockRouterReplace = jest.fn();
jest.mock('next/navigation', () => ({
  usePathname: () => '/portfolio',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  useRouter: () => ({
    push: jest.fn(),
    replace: (...args: unknown[]) => mockRouterReplace(...args),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
  }),
}));

function renderPage() {
  return renderWithProviders(<PortfolioPage />);
}

describe('PortfolioPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    // `clearAllMocks` resets call history but not implementations set via `.mockResolvedValue` in
    // an earlier test — without a fresh default here, a test that never calls `authenticate()`
    // would inherit an earlier test's resolved user and incorrectly appear logged in.
    mockGetMe.mockRejectedValue(new Error('Unauthorized'));
    mockListInstruments.mockResolvedValue({ items: [instrument] });
    mockListDeposits.mockResolvedValue({ items: [] });
    mockListWithdrawals.mockResolvedValue({ items: [] });
  });

  it('redirects an unauthenticated visitor to /login', async () => {
    renderPage();
    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledWith(expect.stringContaining('/login')));
  });

  it('shows available/locked balance, open positions, and completed bets for an authenticated user', async () => {
    authenticate();
    mockGetWallet.mockResolvedValue({ currency: 'USD', availableMinorUnits: '5000', available: '50.00', lockedMinorUnits: '1000', locked: '10.00' });
    mockListBets.mockResolvedValue({ items: [openBet, wonBet] });

    renderPage();

    await waitFor(() => {
      const main = within(screen.getByRole('main'));
      expect(main.getByText('$50.00')).toBeInTheDocument();
      expect(main.getAllByText('$10.00').length).toBeGreaterThan(0);
      expect(main.getAllByText(/BTC\/USD/).length).toBeGreaterThan(0);
      expect(main.getByText(/performance/i)).toBeInTheDocument();
    });
  });

  it('shows empty states when the user has no bets at all', async () => {
    authenticate();
    mockGetWallet.mockResolvedValue({ currency: 'USD', availableMinorUnits: '0', available: '0.00', lockedMinorUnits: '0', locked: '0.00' });
    mockListBets.mockResolvedValue({ items: [] });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/don't have any open positions/i)).toBeInTheDocument();
      expect(screen.getByText(/no completed bets yet/i)).toBeInTheDocument();
    });
  });
});
