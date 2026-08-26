import { screen, waitFor } from '@testing-library/react';

import { storeSession } from '@/lib/auth/token-storage';
import { renderWithProviders } from '@/test-utils/render';
import LandingPage from './page';

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
  usePathname: () => '/',
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

describe('LandingPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
  });

  it('shows the public marketing hero with sign-up and login entry points for an anonymous visitor', async () => {
    renderWithProviders(<LandingPage />);

    expect(screen.getByRole('heading', { name: /a clearer way to follow markets/i })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /create free account/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /log in/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /sign up/i }).length).toBeGreaterThan(0);
  });

  it('never shows a real dollar figure or account-specific data to an anonymous visitor', () => {
    renderWithProviders(<LandingPage />);

    expect(screen.queryByText(/available:/i)).not.toBeInTheDocument();
  });

  it('shows an honest empty state for the markets preview rather than inventing instruments', async () => {
    renderWithProviders(<LandingPage />);

    await waitFor(() => expect(screen.getByText(/no instruments available right now/i)).toBeInTheDocument());
  });

  it('redirects an already-authenticated visitor straight to the dashboard', async () => {
    storeSession({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      user: { id: 'user-1', email: 'trader@example.com', status: 'active', kycStatus: 'unverified', emailVerifiedAt: null, phoneVerifiedAt: null, accountType: 'real', demoOfUserId: null },
    });
    mockGetMe.mockResolvedValue({ id: 'user-1', email: 'trader@example.com', status: 'active', sessionId: 's1', roles: [], permissions: [] });

    renderWithProviders(<LandingPage />);

    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledWith('/dashboard'));
  });
});
