import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ApiError } from '@/lib/api-client';
import { renderWithProviders } from '@/test-utils/render';
import { NewBotForm } from './NewBotForm';

const mockGetBotCatalog = jest.fn();
const mockCreateBot = jest.fn();
const mockListInstruments = jest.fn();
const mockPush = jest.fn();
let searchParamValue = 'dca_recurring';

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(`strategy=${searchParamValue}`),
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), forward: jest.fn(), refresh: jest.fn(), prefetch: jest.fn() }),
}));

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    getBotCatalog: (...args: unknown[]) => mockGetBotCatalog(...args),
    createBot: (...args: unknown[]) => mockCreateBot(...args),
    listInstruments: (...args: unknown[]) => mockListInstruments(...args),
  };
});

const ENTRY = {
  key: 'dca_recurring',
  name: 'Recurring strategy',
  category: 'dca' as const,
  description: 'Places a fixed-size bet on a schedule.',
  riskLevel: 'low' as const,
  frequencyLabel: 'Daily, weekly, or monthly',
  configFields: [
    { key: 'instrumentId', label: 'Market', type: 'instrument' as const, required: true },
    { key: 'selection', label: 'Direction', type: 'select' as const, required: true, options: [{ value: 'rise', label: 'Rise' }, { value: 'fall', label: 'Fall' }] },
    { key: 'stakeAmount', label: 'Stake per execution', type: 'stake' as const, required: true },
    { key: 'currency', label: 'Currency', type: 'currency' as const, required: true },
    { key: 'intervalUnit', label: 'Frequency', type: 'select' as const, required: true, options: [{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }] },
    { key: 'durationSeconds', label: 'Bet duration (seconds)', type: 'duration' as const, required: true, min: 30, max: 3600, defaultValue: 60 },
  ],
};

describe('NewBotForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    searchParamValue = 'dca_recurring';
    mockGetBotCatalog.mockResolvedValue({ items: [ENTRY, { ...ENTRY, key: 'grid_trading', category: 'grid', comingSoon: true }] });
    mockListInstruments.mockResolvedValue({ items: [{ id: 'inst-1', symbol: 'BTC', quoteCurrency: 'USD', displaySymbol: 'BTC/USD', name: 'Bitcoin', categoryKey: 'crypto', pricePrecision: 2, status: 'active', maxPriceAgeSeconds: 30 }] });
  });

  it('refuses to submit until the required fields are filled', async () => {
    renderWithProviders(<NewBotForm />);
    await screen.findByText('Bot name');

    expect(screen.getByRole('button', { name: 'Create bot' })).toBeDisabled();
  });

  it('creates a bot with the configured fields converted to server-ready values', async () => {
    mockCreateBot.mockResolvedValue({ id: 'bot-new' });
    renderWithProviders(<NewBotForm />);
    await screen.findByText('Bot name');

    await userEvent.type(screen.getByLabelText('Bot name'), 'BTC weekly');
    await userEvent.selectOptions(screen.getByLabelText('Market'), 'inst-1');
    await userEvent.selectOptions(screen.getByLabelText('Direction'), 'rise');
    await userEvent.type(screen.getByLabelText('Stake per execution'), '10');
    await userEvent.selectOptions(screen.getByLabelText('Frequency'), 'weekly');
    await userEvent.clear(screen.getByLabelText('Bet duration (seconds)'));
    await userEvent.type(screen.getByLabelText('Bet duration (seconds)'), '60');

    await userEvent.click(screen.getByRole('button', { name: 'Create bot' }));

    await waitFor(() =>
      expect(mockCreateBot).toHaveBeenCalledWith(
        {
          name: 'BTC weekly',
          strategyKey: 'dca_recurring',
          config: { instrumentId: 'inst-1', selection: 'rise', stakeAmount: '1000', currency: 'USD', intervalUnit: 'weekly', durationSeconds: 60 },
        },
        expect.anything(),
      ),
    );
    expect(mockPush).toHaveBeenCalledWith('/bots/bot-new');
  });

  it('shows a real server validation error rather than pretending the bot was created', async () => {
    mockCreateBot.mockRejectedValue(new ApiError('Selected market is not currently tradable', 400, 'BAD_REQUEST'));
    renderWithProviders(<NewBotForm />);
    await screen.findByText('Bot name');

    await userEvent.type(screen.getByLabelText('Bot name'), 'BTC weekly');
    await userEvent.selectOptions(screen.getByLabelText('Market'), 'inst-1');
    await userEvent.selectOptions(screen.getByLabelText('Direction'), 'rise');
    await userEvent.type(screen.getByLabelText('Stake per execution'), '10');
    await userEvent.selectOptions(screen.getByLabelText('Frequency'), 'weekly');
    await userEvent.clear(screen.getByLabelText('Bet duration (seconds)'));
    await userEvent.type(screen.getByLabelText('Bet duration (seconds)'), '60');
    await userEvent.click(screen.getByRole('button', { name: 'Create bot' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/not currently tradable/i);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("refuses to configure the coming-soon Grid strategy", async () => {
    searchParamValue = 'grid_trading';
    renderWithProviders(<NewBotForm />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/isn't available to configure/i);
  });
});
