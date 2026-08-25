import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { storeSession } from '@/lib/auth/token-storage';
import { renderWithProviders } from '@/test-utils/render';
import TransactionsPage from './page';

const depositTx = {
  id: 'tx-1',
  type: 'deposit' as const,
  status: 'posted' as const,
  currency: 'USD',
  totalAmountMinorUnits: '5000',
  actorType: 'system',
  actorUserId: null,
  subjectUserId: 'user-1',
  reason: null,
  relatedType: null,
  relatedId: null,
  reversalOfTransactionId: null,
  createdAt: new Date().toISOString(),
  postedAt: new Date().toISOString(),
};

const betWinTx = { ...depositTx, id: 'tx-2', type: 'bet_win' as const, totalAmountMinorUnits: '1850' };

const mockGetMe = jest.fn();
const mockListWalletTransactions = jest.fn();
const mockListBets = jest.fn();
const mockListDeposits = jest.fn();
const mockListWithdrawals = jest.fn();

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    getMe: (...args: unknown[]) => mockGetMe(...args),
    listWalletTransactions: (...args: unknown[]) => mockListWalletTransactions(...args),
    listBets: (...args: unknown[]) => mockListBets(...args),
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
  usePathname: () => '/transactions',
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
  return renderWithProviders(<TransactionsPage />);
}

describe('TransactionsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    mockListBets.mockResolvedValue({ items: [] });
    mockListDeposits.mockResolvedValue({ items: [] });
    mockListWithdrawals.mockResolvedValue({ items: [] });
  });

  it('redirects an unauthenticated visitor to /login', async () => {
    renderPage();
    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledWith(expect.stringContaining('/login')));
  });

  it('lists deposit and betting transactions from the one unfiltered endpoint', async () => {
    authenticate();
    mockListWalletTransactions.mockResolvedValue({ items: [depositTx, betWinTx] });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Deposit')).toBeInTheDocument();
      expect(screen.getByText('Bet won')).toBeInTheDocument();
    });
  });

  it('filters to a single group client-side', async () => {
    authenticate();
    mockListWalletTransactions.mockResolvedValue({ items: [depositTx, betWinTx] });

    renderPage();
    await waitFor(() => expect(screen.getByText('Deposit')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Deposits' }));

    expect(screen.queryByText('Bet won')).not.toBeInTheDocument();
    expect(screen.getByText('Deposit')).toBeInTheDocument();
  });

  it('shows an empty state when there are no transactions', async () => {
    authenticate();
    mockListWalletTransactions.mockResolvedValue({ items: [] });

    renderPage();

    await waitFor(() => expect(screen.getByText(/don't have any transactions yet/i)).toBeInTheDocument());
  });
});
