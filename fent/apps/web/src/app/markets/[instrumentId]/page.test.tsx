import { screen, waitFor } from '@testing-library/react';

import { storeSession } from '@/lib/auth/token-storage';
import { renderWithProviders } from '@/test-utils/render';
import MarketDetailPage from './page';

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

const bettingConfig = {
  instrumentId: 'inst-btc',
  betType: 'rise_fall' as const,
  minStakeMinorUnits: '100',
  maxStakeMinorUnits: '100000',
  payoutRateBasisPoints: '8500',
  maxExposureMinorUnits: null,
  minDurationSeconds: '30',
  maxDurationSeconds: '3600',
  isEnabled: true,
};

const mockGetInstrument = jest.fn();
const mockGetPrice = jest.fn();
const mockGetBettingConfig = jest.fn();
const mockUseParams = jest.fn();
const mockGetMe = jest.fn();
const mockListDeposits = jest.fn();
const mockListWithdrawals = jest.fn();
const mockListBets = jest.fn();

function authenticate() {
  storeSession({
    accessToken: 'a',
    refreshToken: 'r',
    user: { id: 'user-1', email: 'trader@example.com', status: 'active', kycStatus: 'unverified', emailVerifiedAt: null, phoneVerifiedAt: null },
  });
  mockGetMe.mockResolvedValue({ id: 'user-1', email: 'trader@example.com', status: 'active', sessionId: 's1', roles: [], permissions: [] });
  mockListDeposits.mockResolvedValue({ items: [] });
  mockListWithdrawals.mockResolvedValue({ items: [] });
  mockListBets.mockResolvedValue({ items: [] });
}

jest.mock('next/navigation', () => ({
  usePathname: () => '/markets/inst-btc',
  useParams: () => mockUseParams(),
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), forward: jest.fn(), refresh: jest.fn(), prefetch: jest.fn() }),
}));

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    getInstrument: (...args: unknown[]) => mockGetInstrument(...args),
    getPrice: (...args: unknown[]) => mockGetPrice(...args),
    getBettingConfig: (...args: unknown[]) => mockGetBettingConfig(...args),
    getMe: (...args: unknown[]) => mockGetMe(...args),
    listDeposits: (...args: unknown[]) => mockListDeposits(...args),
    listWithdrawals: (...args: unknown[]) => mockListWithdrawals(...args),
    listBets: (...args: unknown[]) => mockListBets(...args),
  };
});

function renderPage() {
  return renderWithProviders(<MarketDetailPage />);
}

describe('MarketDetailPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseParams.mockReturnValue({ instrumentId: 'inst-btc' });
    mockGetInstrument.mockResolvedValue(instrument);
    mockGetPrice.mockResolvedValue({
      instrumentId: 'inst-btc',
      price: '112000.00',
      priceMinorUnits: '11200000',
      currency: 'USD',
      source: 'test',
      observedAt: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      isStale: false,
    });
    mockGetBettingConfig.mockResolvedValue(bettingConfig);
  });

  it('shows the instrument details and prompts an unauthenticated visitor to log in for odds', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'BTC/USD' })).toBeInTheDocument();
    expect(screen.getByText(/log in to see odds/i)).toBeInTheDocument();
    expect(mockGetBettingConfig).not.toHaveBeenCalled();
  });

  it('shows a "market not found" state when the instrument fails to load', async () => {
    mockGetInstrument.mockRejectedValue(new Error('not found'));
    renderPage();

    expect(await screen.findByText(/market not found/i)).toBeInTheDocument();
  });

  it('the "Bet now" link routes to /dashboard (the authenticated app home), not the public landing page', async () => {
    authenticate();
    renderPage();

    const betNowLink = await screen.findByRole('link', { name: /bet now/i });
    expect(betNowLink).toHaveAttribute('href', '/dashboard?instrument=inst-btc&type=rise_fall');
  });

  it('shows an honest empty state, not a blank section, when no bet type is available for this market', async () => {
    authenticate();
    mockGetBettingConfig.mockResolvedValue({ ...bettingConfig, isEnabled: false });
    renderPage();

    await waitFor(() => expect(mockGetBettingConfig).toHaveBeenCalled());
    expect(await screen.findByText(/no betting types are currently available/i)).toBeInTheDocument();
  });
});
