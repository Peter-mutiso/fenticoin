import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders } from '@/test-utils/render';
import { AdjustBalanceForm } from './AdjustBalanceForm';

const mockAdjustBalance = jest.fn();
const mockGrantBonus = jest.fn();
const mockGetWalletBalance = jest.fn();

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    adjustBalance: (...args: unknown[]) => mockAdjustBalance(...args),
    grantBonus: (...args: unknown[]) => mockGrantBonus(...args),
    getWalletBalance: (...args: unknown[]) => mockGetWalletBalance(...args),
  };
});

describe('AdjustBalanceForm — manual balance adjustment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('disables submission until both a positive amount and a reason of at least 5 characters are provided', async () => {
    renderWithProviders(<AdjustBalanceForm userId="user-1" mode="adjust" />);

    const submit = screen.getByRole('button', { name: /post adjustment/i });
    expect(submit).toBeDisabled();

    await userEvent.type(screen.getByPlaceholderText('0.00'), '25');
    expect(submit).toBeDisabled(); // amount alone isn't enough — a reason is required too

    await userEvent.type(screen.getByRole('textbox', { name: /reason/i }), 'ab');
    expect(submit).toBeDisabled(); // too short

    await userEvent.type(screen.getByRole('textbox', { name: /reason/i }), 'cde');
    expect(submit).toBeEnabled();
  });

  it('never posts the adjustment on the first click — a confirmation dialog gates the real-money mutation', async () => {
    renderWithProviders(<AdjustBalanceForm userId="user-1" mode="adjust" />);

    await userEvent.type(screen.getByPlaceholderText('0.00'), '25');
    await userEvent.type(screen.getByRole('textbox', { name: /reason/i }), 'goodwill credit');
    await userEvent.click(screen.getByRole('button', { name: /post adjustment/i }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(mockAdjustBalance).not.toHaveBeenCalled();
    expect(mockGetWalletBalance).not.toHaveBeenCalled();
  });

  it('captures before/after balance and posts a credit adjustment with the reason, currency, and amount, only after the confirm dialog is accepted', async () => {
    mockGetWalletBalance
      .mockResolvedValueOnce({ currency: 'USD', availableMinorUnits: '5000', available: '50.00', lockedMinorUnits: '0', locked: '0.00' })
      .mockResolvedValueOnce({ currency: 'USD', availableMinorUnits: '7500', available: '75.00', lockedMinorUnits: '0', locked: '0.00' });
    mockAdjustBalance.mockResolvedValue({ id: 'txn-1' });

    renderWithProviders(<AdjustBalanceForm userId="user-1" mode="adjust" />);

    await userEvent.type(screen.getByPlaceholderText('0.00'), '25');
    await userEvent.type(screen.getByRole('textbox', { name: /reason/i }), 'goodwill credit');
    await userEvent.click(screen.getByRole('button', { name: /post adjustment/i }));

    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));

    await waitFor(() =>
      expect(mockAdjustBalance).toHaveBeenCalledWith('user-1', { currency: 'USD', amountMinorUnits: '2500', direction: 'credit', reason: 'goodwill credit' }, expect.any(String)),
    );

    expect(await screen.findByText('$50.00')).toBeInTheDocument();
    expect(screen.getByText('$75.00')).toBeInTheDocument();
  });

  it('grant-bonus mode calls grantBonus, never adjustBalance, only after the confirm dialog is accepted', async () => {
    mockGetWalletBalance.mockResolvedValue({ currency: 'USD', availableMinorUnits: '0', available: '0.00', lockedMinorUnits: '0', locked: '0.00' });
    mockGrantBonus.mockResolvedValue({ id: 'txn-2' });

    renderWithProviders(<AdjustBalanceForm userId="user-1" mode="bonus" />);

    await userEvent.type(screen.getByPlaceholderText('0.00'), '10');
    await userEvent.type(screen.getByRole('textbox', { name: /reason/i }), 'welcome bonus');
    await userEvent.click(screen.getByRole('button', { name: /grant bonus/i }));

    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(mockGrantBonus).toHaveBeenCalledWith('user-1', { currency: 'USD', amountMinorUnits: '1000', reason: 'welcome bonus' }, expect.any(String)));
    expect(mockAdjustBalance).not.toHaveBeenCalled();
  });
});
