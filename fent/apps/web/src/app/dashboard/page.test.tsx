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

const user = { id: 'user-1', email: 'trader@example.com', status: 'active', kycStatus: 'unverified', emailVerifiedAt: null, phoneVerifiedAt: null };

function authenticate() {
  storeSession({ accessToken: 'access-1', refreshToken: 'refresh-1', user });
  mockGetMe.mockResolvedValue({ id: 'user-1', email: 'trader@example.com', status: 'active', sessionId: 's1', roles: [], permissions: [] });
}

describe('DashboardPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
  });

  it('renders the betting experience heading and the review-bet action once authenticated', async () => {
    authenticate();
    renderWithProviders(<DashboardPage />);

    expect(await screen.findByRole('heading', { name: /make a prediction/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /review bet/i })).toBeInTheDocument();
  });

  it('shows an honest empty state for featured markets rather than inventing instruments', async () => {
    authenticate();
    renderWithProviders(<DashboardPage />);

    await waitFor(() => expect(screen.getByText(/no instruments available right now/i)).toBeInTheDocument());
  });

  it('redirects an unauthenticated visitor to /login rather than showing the dashboard', async () => {
    renderWithProviders(<DashboardPage />);

    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledWith(expect.stringContaining('/login')));
    expect(screen.queryByRole('heading', { name: /make a prediction/i })).not.toBeInTheDocument();
  });
});
