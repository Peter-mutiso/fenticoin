import { screen, waitFor } from '@testing-library/react';

import { storeSession } from '@/lib/auth/token-storage';
import { renderWithProviders } from '@/test-utils/render';
import TradePage from './page';

const mockGetMe = jest.fn();
const mockListBets = jest.fn().mockResolvedValue({ items: [] });
jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    listInstruments: jest.fn().mockResolvedValue({ items: [] }),
    getMe: (...args: unknown[]) => mockGetMe(...args),
    listBets: (...args: unknown[]) => mockListBets(...args),
  };
});

jest.mock('next/navigation', () => ({
  usePathname: () => '/trade',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
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

describe('TradePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    mockGetMe.mockRejectedValue(new Error('Unauthorized'));
  });

  it('renders the real trading workspace (the same server-authoritative bet builder as the dashboard), not a placeholder', async () => {
    authenticate();
    renderWithProviders(<TradePage />);

    expect(await screen.findByRole('heading', { name: /make a prediction/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /review bet/i })).toBeInTheDocument();
  });

  it('lets an unauthenticated visitor browse markets and prompts them to log in to trade, rather than redirecting them away', async () => {
    renderWithProviders(<TradePage />);

    expect(await screen.findByText(/log in to see live odds, your balance, and place a bet/i)).toBeInTheDocument();
    // The button is present (same layout, no jarring reflow) but disabled until logged in.
    expect(screen.getByRole('button', { name: /review bet/i })).toBeDisabled();
  });

  it('surfaces the bet history/open-positions panel once the user has placed bets, on this same page', async () => {
    mockListBets.mockResolvedValue({
      items: [
        {
          id: 'bet-1',
          userId: 'user-1',
          instrumentId: 'inst-1',
          type: 'rise_fall',
          selection: 'rise',
          stakeAmountMinorUnits: '1000',
          currency: 'USD',
          entryPriceMinorUnits: '10000000',
          entryPriceObservedAt: new Date().toISOString(),
          targetPriceMinorUnits: null,
          payoutRateBasisPoints: '8500',
          potentialPayoutMinorUnits: '1850',
          status: 'open',
          result: null,
          placedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 30_000).toISOString(),
          settlementPriceMinorUnits: null,
          settlementPriceObservedAt: null,
          settledAt: null,
          placementTransactionId: 'txn-1',
          settlementTransactionId: null,
          cancelReason: null,
          botId: null,
        },
      ],
    });
    authenticate();
    renderWithProviders(<TradePage />);

    await waitFor(() => expect(screen.getByRole('heading', { name: /your bets/i })).toBeInTheDocument());
  });
});
