import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ApiError } from '@/lib/api-client';
import { storeSession } from '@/lib/auth/token-storage';
import { renderWithProviders } from '@/test-utils/render';
import DepositPage from './page';

const mockGetMe = jest.fn();
const mockCreateDeposit = jest.fn();
const mockListDeposits = jest.fn();
const mockListBets = jest.fn();
const mockListWithdrawals = jest.fn();

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    getMe: (...args: unknown[]) => mockGetMe(...args),
    createDeposit: (...args: unknown[]) => mockCreateDeposit(...args),
    listDeposits: (...args: unknown[]) => mockListDeposits(...args),
    listBets: (...args: unknown[]) => mockListBets(...args),
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
  usePathname: () => '/account/deposit',
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
  return renderWithProviders(<DepositPage />);
}

describe('DepositPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    mockListBets.mockResolvedValue({ items: [] });
    mockListWithdrawals.mockResolvedValue({ items: [] });
    mockListDeposits.mockResolvedValue({ items: [] });
  });

  it('redirects an unauthenticated visitor to /login', async () => {
    renderPage();
    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledWith(expect.stringContaining('/login')));
  });

  it('shows an honest notice when the payment provider is not configured yet, instead of a generic error', async () => {
    authenticate();
    mockCreateDeposit.mockRejectedValue(new ApiError('Not Implemented', 501, 'NotImplementedException'));

    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /deposit/i })).toBeInTheDocument());

    await userEvent.type(screen.getByPlaceholderText('0.00'), '25');
    await userEvent.click(screen.getByRole('button', { name: /deposit/i }));

    await waitFor(() => expect(screen.getByText(/deposits aren't available yet/i)).toBeInTheDocument());
  });

  it('submits a deposit and shows a success toast on a working provider', async () => {
    authenticate();
    mockCreateDeposit.mockResolvedValue({
      id: 'dep-1',
      userId: 'user-1',
      currency: 'USD',
      amountMinorUnits: '2500',
      status: 'pending',
      providerName: 'TestProvider',
      providerReference: 'ref-1',
      redirectUrl: null,
      transactionId: null,
      failureReason: null,
      expiresAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /deposit/i })).toBeInTheDocument());

    await userEvent.type(screen.getByPlaceholderText('0.00'), '25');
    await userEvent.click(screen.getByRole('button', { name: /deposit/i }));

    await waitFor(() => expect(screen.getByText(/deposit initiated/i)).toBeInTheDocument());
    expect(mockCreateDeposit).toHaveBeenCalledWith({ currency: 'USD', amountMinorUnits: '2500' }, expect.any(String));
  });
});
