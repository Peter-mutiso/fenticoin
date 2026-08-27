import { screen, waitFor } from '@testing-library/react';

import { storeSession } from '@/lib/auth/token-storage';
import { renderWithProviders } from '@/test-utils/render';
import DashboardPage from './page';

const mockGetMe = jest.fn();
jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    listInstruments: jest.fn().mockResolvedValue({ items: [] }),
    listBets: jest.fn().mockResolvedValue({ items: [] }),
    listBots: jest.fn().mockResolvedValue({ items: [], summary: { totalBots: 0, activeBots: 0, weeklyReturnPercent: null } }),
    getMe: (...args: unknown[]) => mockGetMe(...args),
  };
});

const mockRouterReplace = jest.fn();
jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
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

const user = { id: 'user-1', email: 'trader@example.com', status: 'active', kycStatus: 'unverified', emailVerifiedAt: null, phoneVerifiedAt: null, accountType: 'real' as const, demoOfUserId: null };

function authenticate() {
  storeSession({ accessToken: 'access-1', refreshToken: 'refresh-1', user });
  mockGetMe.mockResolvedValue({ id: 'user-1', email: 'trader@example.com', status: 'active', sessionId: 's1', roles: [], permissions: [] });
}

describe('DashboardPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    // `clearAllMocks` resets call history but not implementations set via `.mockResolvedValue` in
    // an earlier test — without a fresh default here, a test that never calls `authenticate()`
    // would inherit an earlier test's resolved user and incorrectly appear logged in.
    mockGetMe.mockRejectedValue(new Error('Unauthorized'));
  });

  it('renders a true at-a-glance summary — balance, open positions, bots, and recent activity — rather than the full trade builder', async () => {
    authenticate();
    renderWithProviders(<DashboardPage />);

    expect(await screen.findByRole('heading', { name: /^dashboard$/i })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: /open positions/i })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: /^bots$/i })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: /recent activity/i })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /start a trade/i })).toHaveAttribute('href', '/trade');

    // The dashboard must summarize the account, not duplicate the full trade
    // page's bet-placement form — that regression is exactly what this test guards against.
    expect(screen.queryByRole('heading', { name: /make a prediction/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /review bet/i })).not.toBeInTheDocument();
  });

  it('shows an honest empty state for featured markets rather than inventing instruments', async () => {
    authenticate();
    renderWithProviders(<DashboardPage />);

    await waitFor(() => expect(screen.getByText(/no instruments available right now/i)).toBeInTheDocument());
  });

  it('redirects an unauthenticated visitor to /login rather than showing the dashboard', async () => {
    renderWithProviders(<DashboardPage />);

    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledWith(expect.stringContaining('/login')));
    expect(screen.queryByRole('heading', { name: /^dashboard$/i })).not.toBeInTheDocument();
  });
});
