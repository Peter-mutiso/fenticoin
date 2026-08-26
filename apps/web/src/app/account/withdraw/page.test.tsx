import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ApiError } from '@/lib/api-client';
import { storeSession } from '@/lib/auth/token-storage';
import { renderWithProviders } from '@/test-utils/render';
import WithdrawPage from './page';

const mockGetMe = jest.fn();
const mockGetWallet = jest.fn();
const mockCreateWithdrawal = jest.fn();
const mockListWithdrawals = jest.fn();
const mockListBets = jest.fn();
const mockListDeposits = jest.fn();

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    getMe: (...args: unknown[]) => mockGetMe(...args),
    getWallet: (...args: unknown[]) => mockGetWallet(...args),
    createWithdrawal: (...args: unknown[]) => mockCreateWithdrawal(...args),
    listWithdrawals: (...args: unknown[]) => mockListWithdrawals(...args),
    listBets: (...args: unknown[]) => mockListBets(...args),
    listDeposits: (...args: unknown[]) => mockListDeposits(...args),
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
  usePathname: () => '/account/withdraw',
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
  return renderWithProviders(<WithdrawPage />);
}

describe('WithdrawPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    // `clearAllMocks` resets call history but not implementations set via `.mockResolvedValue` in
    // an earlier test — without a fresh default here, a test that never calls `authenticate()`
    // would inherit an earlier test's resolved user and incorrectly appear logged in.
    mockGetMe.mockRejectedValue(new Error('Unauthorized'));
    mockListBets.mockResolvedValue({ items: [] });
    mockListDeposits.mockResolvedValue({ items: [] });
    mockListWithdrawals.mockResolvedValue({ items: [] });
    mockGetWallet.mockResolvedValue({ currency: 'USD', availableMinorUnits: '5000', available: '50.00', lockedMinorUnits: '0', locked: '0.00' });
  });

  it('redirects an unauthenticated visitor to /login', async () => {
    renderPage();
    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledWith(expect.stringContaining('/login')));
  });

  it('blocks submission when the requested amount exceeds the available balance', async () => {
    authenticate();

    renderPage();
    await waitFor(() => expect(within(screen.getByRole('main')).getByText('$50.00')).toBeInTheDocument());

    await userEvent.type(screen.getByPlaceholderText('0.00'), '100');

    await waitFor(() => expect(screen.getByText(/insufficient available balance/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /withdraw/i })).toBeDisabled();
    expect(mockCreateWithdrawal).not.toHaveBeenCalled();
  });

  it('shows an honest notice when the payment provider is not configured yet', async () => {
    authenticate();
    mockCreateWithdrawal.mockRejectedValue(new ApiError('Not Implemented', 501, 'NotImplementedException'));

    renderPage();
    await waitFor(() => expect(within(screen.getByRole('main')).getByText('$50.00')).toBeInTheDocument());

    await userEvent.type(screen.getByPlaceholderText('0.00'), '25');
    await userEvent.click(screen.getByRole('button', { name: /withdraw/i }));

    await waitFor(() => expect(screen.getByText(/withdrawals aren't available yet/i)).toBeInTheDocument());
  });
});
