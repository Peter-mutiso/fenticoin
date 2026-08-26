import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { storeSession } from '@/lib/auth/token-storage';
import { renderWithProviders } from '@/test-utils/render';
import { BettingExperience } from './BettingExperience';

const mockGetMe = jest.fn();
const mockListInstruments = jest.fn();
const mockGetPrice = jest.fn();
const mockGetBettingConfig = jest.fn();
const mockGetWallet = jest.fn();
const mockPlaceBet = jest.fn();
const mockListBets = jest.fn();
const mockListDeposits = jest.fn();
const mockListWithdrawals = jest.fn();

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    getMe: (...args: unknown[]) => mockGetMe(...args),
    listInstruments: (...args: unknown[]) => mockListInstruments(...args),
    getPrice: (...args: unknown[]) => mockGetPrice(...args),
    getBettingConfig: (...args: unknown[]) => mockGetBettingConfig(...args),
    getWallet: (...args: unknown[]) => mockGetWallet(...args),
    placeBet: (...args: unknown[]) => mockPlaceBet(...args),
    listBets: (...args: unknown[]) => mockListBets(...args),
    listDeposits: (...args: unknown[]) => mockListDeposits(...args),
    listWithdrawals: (...args: unknown[]) => mockListWithdrawals(...args),
  };
});

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

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

function authenticate() {
  storeSession({
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    user: { id: 'user-1', email: 'trader@example.com', status: 'active', kycStatus: 'unverified', emailVerifiedAt: null, phoneVerifiedAt: null, accountType: 'real', demoOfUserId: null },
  });
  mockGetMe.mockResolvedValue({ id: 'user-1', email: 'trader@example.com', status: 'active', sessionId: 's1', roles: [], permissions: [] });
  mockListDeposits.mockResolvedValue({ items: [] });
  mockListWithdrawals.mockResolvedValue({ items: [] });
  mockListBets.mockResolvedValue({ items: [] });
}

async function selectInstrumentAndStake(stake: string) {
  await screen.findByText('Select an instrument');
  await userEvent.selectOptions(screen.getByLabelText(/instrument/i), 'inst-btc');
  await screen.findByText(/stake range/i);
  await userEvent.type(screen.getByLabelText(/^stake/i), stake);
}

describe('BettingExperience', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    // `clearAllMocks` resets call history but not implementations set via `.mockResolvedValue` in
    // an earlier test — without a fresh default here, a test that never calls `authenticate()`
    // would inherit an earlier test's resolved user and incorrectly appear logged in.
    mockGetMe.mockRejectedValue(new Error('Unauthorized'));
    mockListInstruments.mockResolvedValue({ items: [instrument] });
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
    mockGetWallet.mockResolvedValue({ currency: 'USD', availableMinorUnits: '100000', available: '1000.00', lockedMinorUnits: '0', locked: '0.00' });
  });

  it('prompts an unauthenticated visitor to log in rather than showing odds or a balance', async () => {
    renderWithProviders(<BettingExperience />);

    expect(await screen.findByText(/log in to see live odds/i)).toBeInTheDocument();
    expect(screen.queryByText(/^available:/i)).not.toBeInTheDocument();
    expect(mockGetBettingConfig).not.toHaveBeenCalled();
  });

  it("shows the user's real available balance, not a fabricated figure", async () => {
    authenticate();
    renderWithProviders(<BettingExperience />);

    // The balance is scoped to the selected instrument's currency, so it only resolves once a market is chosen.
    await userEvent.selectOptions(await screen.findByLabelText(/instrument/i), 'inst-btc');

    expect((await screen.findAllByText('$1000.00', { exact: false })).length).toBeGreaterThan(0);
  });

  it('keeps Review bet disabled until a valid, in-bounds, affordable stake is entered', async () => {
    authenticate();
    renderWithProviders(<BettingExperience />);

    const reviewButton = await screen.findByRole('button', { name: /review bet/i });
    expect(reviewButton).toBeDisabled();

    await selectInstrumentAndStake('10');
    await waitFor(() => expect(reviewButton).toBeEnabled());
  });

  it('shows an honest insufficient-balance notice rather than silently blocking the button', async () => {
    authenticate();
    mockGetWallet.mockResolvedValue({ currency: 'USD', availableMinorUnits: '500', available: '5.00', lockedMinorUnits: '0', locked: '0.00' });
    renderWithProviders(<BettingExperience />);

    await selectInstrumentAndStake('10');

    expect(await screen.findByText(/insufficient available balance/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /review bet/i })).toBeDisabled();
  });

  it('opens a review step showing the stake and an estimate explicitly labeled as non-final before placing the bet', async () => {
    authenticate();
    renderWithProviders(<BettingExperience />);

    await selectInstrumentAndStake('10');
    await waitFor(() => expect(screen.getByRole('button', { name: /review bet/i })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: /review bet/i }));

    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText('$10.00')).toBeInTheDocument();
    expect(dialog.getByText(/final odds and return are set by the server/i)).toBeInTheDocument();
    expect(mockPlaceBet).not.toHaveBeenCalled();
  });

  it('places the bet with the stake converted to exact minor units and an idempotency key on confirm', async () => {
    authenticate();
    mockPlaceBet.mockResolvedValue({
      id: 'bet-1',
      stakeAmountMinorUnits: '1000',
      currency: 'USD',
      payoutRateBasisPoints: '8500',
    });
    renderWithProviders(<BettingExperience />);

    await selectInstrumentAndStake('10');
    await waitFor(() => expect(screen.getByRole('button', { name: /review bet/i })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: /review bet/i }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /confirm bet/i }));

    await waitFor(() =>
      expect(mockPlaceBet).toHaveBeenCalledWith(
        expect.objectContaining({ instrumentId: 'inst-btc', type: 'rise_fall', selection: 'rise', stakeAmount: '1000', currency: 'USD' }),
        expect.any(String),
      ),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows the real server error inside the review dialog and never treats a failed placement as successful', async () => {
    authenticate();
    const { ApiError } = jest.requireActual('@/lib/api-client');
    mockPlaceBet.mockRejectedValue(new ApiError('Insufficient available balance', 400, 'BadRequestException'));
    renderWithProviders(<BettingExperience />);

    await selectInstrumentAndStake('10');
    await waitFor(() => expect(screen.getByRole('button', { name: /review bet/i })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: /review bet/i }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /confirm bet/i }));

    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent(/insufficient available balance/i);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
