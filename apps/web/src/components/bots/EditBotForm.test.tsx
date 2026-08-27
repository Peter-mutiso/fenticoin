import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders } from '@/test-utils/render';
import { EditBotForm } from './EditBotForm';

const mockGetBot = jest.fn();
const mockGetBotCatalog = jest.fn();
const mockUpdateBot = jest.fn();
const mockListInstruments = jest.fn();
const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), forward: jest.fn(), refresh: jest.fn(), prefetch: jest.fn() }),
}));

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    getBot: (...args: unknown[]) => mockGetBot(...args),
    getBotCatalog: (...args: unknown[]) => mockGetBotCatalog(...args),
    updateBot: (...args: unknown[]) => mockUpdateBot(...args),
    listInstruments: (...args: unknown[]) => mockListInstruments(...args),
  };
});

const ENTRY = {
  key: 'dca_recurring',
  name: 'Recurring strategy',
  category: 'dca' as const,
  description: 'x',
  riskLevel: 'low' as const,
  frequencyLabel: 'Weekly',
  configFields: [
    { key: 'instrumentId', label: 'Market', type: 'instrument' as const, required: true },
    { key: 'stakeAmount', label: 'Stake per execution', type: 'stake' as const, required: true },
    { key: 'currency', label: 'Currency', type: 'currency' as const, required: true },
  ],
};

const BOT = {
  id: 'bot-1',
  userId: 'user-1',
  name: 'BTC weekly',
  status: 'inactive' as const,
  strategyKey: 'dca_recurring',
  config: { instrumentId: 'inst-1', stakeAmount: '1000', currency: 'USD' },
  executionIntervalSeconds: 300,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('EditBotForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetBotCatalog.mockResolvedValue({ items: [ENTRY] });
    mockListInstruments.mockResolvedValue({ items: [{ id: 'inst-1', symbol: 'BTC', quoteCurrency: 'USD', displaySymbol: 'BTC/USD', name: 'Bitcoin', categoryKey: 'crypto', pricePrecision: 2, status: 'active', maxPriceAgeSeconds: 30 }] });
  });

  it('refuses to edit an active bot — configuration must not change mid-execution', async () => {
    mockGetBot.mockResolvedValue({ ...BOT, status: 'active' });
    renderWithProviders(<EditBotForm botId="bot-1" />);

    expect(await screen.findByText(/deactivate this bot before changing its configuration/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Market')).not.toBeInTheDocument();
  });

  it('prefills the form with the real saved configuration and saves changes', async () => {
    mockGetBot.mockResolvedValue(BOT);
    mockUpdateBot.mockResolvedValue({ ...BOT, name: 'BTC weekly v2' });
    renderWithProviders(<EditBotForm botId="bot-1" />);

    const nameInput = await screen.findByDisplayValue('BTC weekly');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'BTC weekly v2');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(mockUpdateBot).toHaveBeenCalledWith('bot-1', {
        name: 'BTC weekly v2',
        config: { instrumentId: 'inst-1', stakeAmount: '1000', currency: 'USD' },
        executionIntervalSeconds: 300,
      }),
    );
    expect(mockPush).toHaveBeenCalledWith('/bots/bot-1');
  });

  it('prefills the execution interval from the bot and lets it be changed', async () => {
    mockGetBot.mockResolvedValue({ ...BOT, executionIntervalSeconds: 1800 });
    mockUpdateBot.mockResolvedValue({ ...BOT, executionIntervalSeconds: 60 });
    renderWithProviders(<EditBotForm botId="bot-1" />);

    await screen.findByDisplayValue('BTC weekly');
    expect(screen.getByLabelText('Execution interval')).toHaveValue('1800');

    await userEvent.selectOptions(screen.getByLabelText('Execution interval'), '60');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(mockUpdateBot).toHaveBeenCalledWith('bot-1', expect.objectContaining({ executionIntervalSeconds: 60 })));
  });
});
