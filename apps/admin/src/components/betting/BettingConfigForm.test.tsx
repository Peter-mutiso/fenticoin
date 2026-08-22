import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { storeSession } from '@/lib/auth/token-storage';
import { renderWithProviders } from '@/test-utils/render';
import { BettingConfigForm } from './BettingConfigForm';

const mockGetMe = jest.fn();
const mockUpsertBettingConfig = jest.fn();

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    getMe: (...args: unknown[]) => mockGetMe(...args),
    upsertBettingConfig: (...args: unknown[]) => mockUpsertBettingConfig(...args),
  };
});

function authenticate() {
  storeSession({
    accessToken: 'a',
    refreshToken: 'r',
    user: { id: 'admin-1', email: 'admin@example.com', status: 'active', kycStatus: 'approved', emailVerifiedAt: null, phoneVerifiedAt: null },
  });
  mockGetMe.mockResolvedValue({ id: 'admin-1', email: 'admin@example.com', status: 'active', sessionId: 's1', roles: ['risk'], permissions: ['odds.manage'] });
}

describe('BettingConfigForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
  });

  it('never saves on the first click — a confirmation dialog gates the real-money odds/limits change', async () => {
    authenticate();
    renderWithProviders(<BettingConfigForm instrumentId="inst-1" betType="rise_fall" currency="USD" />);

    await userEvent.type(screen.getByRole('textbox', { name: /min stake/i }), '10');
    await userEvent.type(screen.getByRole('textbox', { name: /max stake/i }), '1000');
    await userEvent.type(screen.getByRole('textbox', { name: /payout rate/i }), '85');
    await userEvent.click(await screen.findByRole('button', { name: /^save$/i }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(mockUpsertBettingConfig).not.toHaveBeenCalled();
  });

  it('converts the payout percentage to exact basis points (float-free) and saves only after confirming', async () => {
    authenticate();
    mockUpsertBettingConfig.mockResolvedValue({});
    renderWithProviders(<BettingConfigForm instrumentId="inst-1" betType="rise_fall" currency="USD" />);

    await userEvent.type(screen.getByRole('textbox', { name: /min stake/i }), '10');
    await userEvent.type(screen.getByRole('textbox', { name: /max stake/i }), '1000');
    await userEvent.type(screen.getByRole('textbox', { name: /payout rate/i }), '85.5');
    await userEvent.click(await screen.findByRole('button', { name: /^save$/i }));

    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));

    await waitFor(() =>
      expect(mockUpsertBettingConfig).toHaveBeenCalledWith(
        expect.objectContaining({ instrumentId: 'inst-1', betType: 'rise_fall', minStake: '1000', maxStake: '100000', payoutRateBasisPoints: '8550' }),
      ),
    );
  });

  it('disables Save until the minimum stake is positive, max >= min, and payout rate is positive', async () => {
    authenticate();
    renderWithProviders(<BettingConfigForm instrumentId="inst-1" betType="rise_fall" currency="USD" />);

    const save = await screen.findByRole('button', { name: /^save$/i });
    expect(save).toBeDisabled();

    await userEvent.type(screen.getByRole('textbox', { name: /min stake/i }), '100');
    await userEvent.type(screen.getByRole('textbox', { name: /max stake/i }), '10');
    await userEvent.type(screen.getByRole('textbox', { name: /payout rate/i }), '85');
    expect(save).toBeDisabled();
    expect(screen.getByText(/maximum stake must be greater than or equal to the minimum/i)).toBeInTheDocument();
  });

  it('is hidden entirely for an admin without odds.manage', async () => {
    storeSession({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'admin-1', email: 'admin@example.com', status: 'active', kycStatus: 'approved', emailVerifiedAt: null, phoneVerifiedAt: null },
    });
    mockGetMe.mockResolvedValue({ id: 'admin-1', email: 'admin@example.com', status: 'active', sessionId: 's1', roles: ['support'], permissions: ['bets.view'] });

    renderWithProviders(<BettingConfigForm instrumentId="inst-1" betType="rise_fall" currency="USD" />);

    await waitFor(() => expect(mockGetMe).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument();
  });
});
