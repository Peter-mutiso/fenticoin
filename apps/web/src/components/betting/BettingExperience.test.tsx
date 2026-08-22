import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ApiError } from '@/lib/api-client';
import { AuthProvider } from '@/lib/auth/AuthContext';
import { storeSession } from '@/lib/auth/token-storage';
import { ToastProvider } from '@/components/ui/Toast';
import { BettingExperience } from './BettingExperience';

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

const wallet = { currency: 'USD', availableMinorUnits: '5000', available: '50.00', lockedMinorUnits: '0', locked: '0.00' };

const price = {
  instrumentId: 'inst-btc',
  price: '112000.00',
  priceMinorUnits: '11200000',
  currency: 'USD',
  source: 'test',
  observedAt: new Date().toISOString(),
  receivedAt: new Date().toISOString(),
  isStale: false,
};

const mockListInstruments = jest.fn();
const mockGetPrice = jest.fn();
const mockGetBettingConfig = jest.fn();
const mockGetWallet = jest.fn();
const mockPlaceBet = jest.fn();
const mockListBets = jest.fn();
const mockGetMe = jest.fn();

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    listInstruments: (...args: unknown[]) => mockListInstruments(...args),
    getPrice: (...args: unknown[]) => mockGetPrice(...args),
    getBettingConfig: (...args: unknown[]) => mockGetBettingConfig(...args),
    getWallet: (...args: unknown[]) => mockGetWallet(...args),
    placeBet: (...args: unknown[]) => mockPlaceBet(...args),
    listBets: (...args: unknown[]) => mockListBets(...args),
    getMe: (...args: unknown[]) => mockGetMe(...args),
  };
});

function renderExperience() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <BettingExperience />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

function authenticate() {
  storeSession({
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    user: { id: 'user-1', email: 'trader@example.com', status: 'active', kycStatus: 'unverified', emailVerifiedAt: null, phoneVerifiedAt: null },
  });
  mockGetMe.mockResolvedValue({ id: 'user-1', email: 'trader@example.com', status: 'active', kycStatus: 'unverified', emailVerifiedAt: null, phoneVerifiedAt: null });
}

describe('BettingExperience', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    mockListInstruments.mockResolvedValue({ items: [instrument] });
    mockGetPrice.mockResolvedValue(price);
    mockGetBettingConfig.mockResolvedValue(bettingConfig);
    mockGetWallet.mockResolvedValue(wallet);
    mockListBets.mockResolvedValue({ items: [] });
  });

  it('never lets an unauthenticated visitor see a balance, and prompts them to log in', async () => {
    renderExperience();

    expect(await screen.findByText(/log in to see live odds/i)).toBeInTheDocument();
    expect(screen.queryByText(/available:/i)).not.toBeInTheDocument();
  });

  it('walks an authenticated user through select → review → confirm, and disables Confirm while submitting (no double-click)', async () => {
    authenticate();
    const user = userEvent.setup();
    let resolvePlaceBet: (value: unknown) => void = () => {};
    mockPlaceBet.mockReturnValue(new Promise((resolve) => (resolvePlaceBet = resolve)));

    renderExperience();

    const instrumentSelect = await screen.findByLabelText(/instrument/i);
    await user.selectOptions(instrumentSelect, 'inst-btc');

    const stakeInput = await screen.findByPlaceholderText('0.00');
    await user.type(stakeInput, '10');

    const reviewButton = await screen.findByRole('button', { name: /review bet/i });
    await waitFor(() => expect(reviewButton).toBeEnabled());
    await user.click(reviewButton);

    const dialog = await screen.findByRole('dialog', { name: /review bet/i });
    const confirmButton = within(dialog).getByRole('button', { name: /confirm bet/i });

    await user.click(confirmButton);
    // A second click while the request is still in flight must not fire a second placement.
    await user.click(confirmButton);

    expect(mockPlaceBet).toHaveBeenCalledTimes(1);
    expect(confirmButton).toBeDisabled();

    resolvePlaceBet({
      id: 'bet-1',
      userId: 'user-1',
      instrumentId: 'inst-btc',
      type: 'rise_fall',
      selection: 'rise',
      stakeAmountMinorUnits: '1000',
      currency: 'USD',
      entryPriceMinorUnits: '11200000',
      entryPriceObservedAt: new Date().toISOString(),
      targetPriceMinorUnits: null,
      payoutRateBasisPoints: '8500',
      potentialPayoutMinorUnits: '1850',
      status: 'open',
      result: null,
      placedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      settlementPriceMinorUnits: null,
      settlementPriceObservedAt: null,
      settledAt: null,
      placementTransactionId: 'txn-1',
      settlementTransactionId: null,
      cancelReason: null,
    });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText(/bet confirmed/i)).toBeInTheDocument();
  });

  it('surfaces a rejected bet (e.g. insufficient balance) inside the review dialog without crashing', async () => {
    authenticate();
    const user = userEvent.setup();
    mockPlaceBet.mockRejectedValue(new ApiError('Insufficient funds', 422, 'InsufficientFundsError'));

    renderExperience();

    const instrumentSelect = await screen.findByLabelText(/instrument/i);
    await user.selectOptions(instrumentSelect, 'inst-btc');
    const stakeInput = await screen.findByPlaceholderText('0.00');
    await user.type(stakeInput, '10');

    const reviewButton = await screen.findByRole('button', { name: /review bet/i });
    await waitFor(() => expect(reviewButton).toBeEnabled());
    await user.click(reviewButton);

    const dialog = await screen.findByRole('dialog', { name: /review bet/i });
    await user.click(within(dialog).getByRole('button', { name: /confirm bet/i }));

    expect(await within(dialog).findByText('Insufficient funds')).toBeInTheDocument();
    // The dialog stays open so the user can adjust the stake and retry, rather than losing their place.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('disables the market and shows a notice when the market is closed', async () => {
    authenticate();
    mockListInstruments.mockResolvedValue({ items: [{ ...instrument, status: 'suspended' as const }] });

    renderExperience();

    const instrumentSelect = await screen.findByLabelText(/instrument/i);
    const option = within(instrumentSelect).getByRole('option', { name: /closed/i });
    expect(option).toBeDisabled();
  });
});
