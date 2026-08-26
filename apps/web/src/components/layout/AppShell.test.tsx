import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { storeSession } from '@/lib/auth/token-storage';
import { renderWithProviders } from '@/test-utils/render';
import { AppShell } from './AppShell';

const mockGetMe = jest.fn();
const mockListBets = jest.fn();
const mockListDeposits = jest.fn();
const mockListWithdrawals = jest.fn();
jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    getMe: (...args: unknown[]) => mockGetMe(...args),
    listBets: (...args: unknown[]) => mockListBets(...args),
    listDeposits: (...args: unknown[]) => mockListDeposits(...args),
    listWithdrawals: (...args: unknown[]) => mockListWithdrawals(...args),
  };
});

const replaceMock = jest.fn();
jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: jest.fn(), replace: replaceMock, back: jest.fn(), forward: jest.fn(), refresh: jest.fn(), prefetch: jest.fn() }),
}));

function renderShell(requireAuth: boolean) {
  return renderWithProviders(
    <AppShell requireAuth={requireAuth}>
      <p>Protected content</p>
    </AppShell>,
  );
}

describe('AppShell', () => {
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
  });

  it('renders normally for a public (non-requireAuth) page regardless of auth status', async () => {
    renderShell(false);
    await waitFor(() => expect(screen.getByText('Protected content')).toBeInTheDocument());
  });

  it('redirects an unauthenticated visitor away from a requireAuth page', async () => {
    renderShell(true);
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith(expect.stringContaining('/login')));
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  it('renders a requireAuth page normally once authenticated', async () => {
    storeSession({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      user: { id: 'user-1', email: 'trader@example.com', status: 'active', kycStatus: 'unverified', emailVerifiedAt: null, phoneVerifiedAt: null, accountType: 'real', demoOfUserId: null },
    });
    mockGetMe.mockResolvedValue({ id: 'user-1', email: 'trader@example.com', status: 'active', sessionId: 's1', roles: [], permissions: [] });

    renderShell(true);

    await waitFor(() => expect(screen.getByText('Protected content')).toBeInTheDocument());
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('shows a distinct "can\'t reach the API" retry state — never redirecting to login — when hydration fails due to a network error', async () => {
    storeSession({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      user: { id: 'user-1', email: 'trader@example.com', status: 'active', kycStatus: 'unverified', emailVerifiedAt: null, phoneVerifiedAt: null, accountType: 'real', demoOfUserId: null },
    });
    const { NetworkError } = jest.requireActual('@/lib/api-client');
    mockGetMe.mockRejectedValue(new NetworkError());

    renderShell(true);

    await waitFor(() => expect(screen.getByText(/can.t reach the fenticoin api/i)).toBeInTheDocument());
    expect(replaceMock).not.toHaveBeenCalled();

    mockGetMe.mockResolvedValue({ id: 'user-1', email: 'trader@example.com', status: 'active', sessionId: 's1', roles: [], permissions: [] });
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => expect(screen.getByText('Protected content')).toBeInTheDocument());
  });
});
