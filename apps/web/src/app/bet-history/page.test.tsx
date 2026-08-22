import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { storeSession } from '@/lib/auth/token-storage';
import { renderWithProviders } from '@/test-utils/render';
import BetHistoryPage from './page';

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

const mockGetMe = jest.fn();
const mockListBets = jest.fn();
const mockGetBet = jest.fn();
const mockListInstruments = jest.fn();
const mockListDeposits = jest.fn();
const mockListWithdrawals = jest.fn();

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    getMe: (...args: unknown[]) => mockGetMe(...args),
    listBets: (...args: unknown[]) => mockListBets(...args),
    getBet: (...args: unknown[]) => mockGetBet(...args),
    listInstruments: (...args: unknown[]) => mockListInstruments(...args),
    listDeposits: (...args: unknown[]) => mockListDeposits(...args),
    listWithdrawals: (...args: unknown[]) => mockListWithdrawals(...args),
  };
});

function authenticate() {
  storeSession({
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    user: { id: 'user-1', email: 'trader@example.com', status: 'active', kycStatus: 'unverified', emailVerifiedAt: null, phoneVerifiedAt: null },
  });
  mockGetMe.mockResolvedValue({ id: 'user-1', email: 'trader@example.com', status: 'active', sessionId: 's1', roles: [], permissions: [] });
}

const mockRouterReplace = jest.fn();
jest.mock('next/navigation', () => ({
  usePathname: () => '/bet-history',
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
  return renderWithProviders(<BetHistoryPage />);
}

describe('BetHistoryPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    mockListInstruments.mockResolvedValue({ items: [instrument] });
    mockListDeposits.mockResolvedValue({ items: [] });
    mockListWithdrawals.mockResolvedValue({ items: [] });
  });

  it('redirects an unauthenticated visitor to /login', async () => {
    renderPage();
    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledWith(expect.stringContaining('/login')));
  });

  it('lists bets and opens a detail modal on click', async () => {
    authenticate();
    mockListBets.mockResolvedValue({ items: [openBet] });
    mockGetBet.mockResolvedValue(openBet);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('main')).toHaveTextContent('BTC/USD');
    });

    await userEvent.click(screen.getByText(/BTC\/USD.*rise\/fall.*rise/i));

    const dialog = await screen.findByRole('dialog', { name: /bet details/i });
    await waitFor(() => expect(within(dialog).getByText(/entry price/i)).toBeInTheDocument());
  });

  it('shows an empty state when the user has no bets', async () => {
    authenticate();
    mockListBets.mockResolvedValue({ items: [] });

    renderPage();

    await waitFor(() => expect(screen.getByText(/haven't placed any bets yet/i)).toBeInTheDocument());
  });

  it('refetches with a status filter when a filter chip is selected', async () => {
    authenticate();
    mockListBets.mockResolvedValue({ items: [openBet] });

    renderPage();
    await waitFor(() => expect(screen.getByRole('main')).toHaveTextContent('BTC/USD'));

    await userEvent.click(screen.getByRole('button', { name: 'Won' }));

    await waitFor(() => expect(mockListBets).toHaveBeenCalledWith(expect.objectContaining({ status: 'won' })));
  });
});
