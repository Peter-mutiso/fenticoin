import { screen, waitFor } from '@testing-library/react';

import { storeSession } from '@/lib/auth/token-storage';
import { renderWithProviders } from '@/test-utils/render';
import { BetsPanel } from './BetsPanel';

const mockListBets = jest.fn();
const mockGetMe = jest.fn();
const mockListDeposits = jest.fn();
const mockListWithdrawals = jest.fn();
jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    listBets: (...args: unknown[]) => mockListBets(...args),
    getMe: (...args: unknown[]) => mockGetMe(...args),
    listDeposits: (...args: unknown[]) => mockListDeposits(...args),
    listWithdrawals: (...args: unknown[]) => mockListWithdrawals(...args),
  };
});

function authenticate() {
  storeSession({
    accessToken: 'a',
    refreshToken: 'r',
    user: { id: 'user-1', email: 'trader@example.com', status: 'active', kycStatus: 'unverified', emailVerifiedAt: null, phoneVerifiedAt: null },
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
});
