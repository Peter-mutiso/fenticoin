import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders } from '@/test-utils/render';
import { BotDetail } from './BotDetail';

const mockGetBot = jest.fn();
const mockGetBotCatalog = jest.fn();
const mockListInstruments = jest.fn();
const mockListBets = jest.fn();
const mockListBotLogs = jest.fn();
const mockActivateBot = jest.fn();
const mockDeactivateBot = jest.fn();

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    getBot: (...args: unknown[]) => mockGetBot(...args),
    getBotCatalog: (...args: unknown[]) => mockGetBotCatalog(...args),
    listInstruments: (...args: unknown[]) => mockListInstruments(...args),
    listBets: (...args: unknown[]) => mockListBets(...args),
    listBotLogs: (...args: unknown[]) => mockListBotLogs(...args),
    activateBot: (...args: unknown[]) => mockActivateBot(...args),
    deactivateBot: (...args: unknown[]) => mockDeactivateBot(...args),
  };
});

const BOT_INACTIVE = {
  id: 'bot-1',
  userId: 'user-1',
  name: 'BTC weekly',
  status: 'inactive' as const,
  strategyKey: 'dca_recurring',
  config: { currency: 'USD' },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  stats: { totalExecutions: 0, totalTrades: 0, totalPnlMinorUnits: '0' },
};

describe('BotDetail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetBotCatalog.mockResolvedValue({ items: [{ key: 'dca_recurring', name: 'Recurring strategy', category: 'dca', description: 'x', riskLevel: 'low', frequencyLabel: 'Weekly', configFields: [] }] });
    mockListInstruments.mockResolvedValue({ items: [] });
    mockListBets.mockResolvedValue({ items: [] });
    mockListBotLogs.mockResolvedValue({ items: [] });
  });

  it('shows an honest "—" for P/L and no trades yet, rather than a fabricated figure', async () => {
    mockGetBot.mockResolvedValue(BOT_INACTIVE);
    renderWithProviders(<BotDetail botId="bot-1" />);

    expect(await screen.findByText('BTC weekly')).toBeInTheDocument();
    expect(screen.getByText('No trades yet')).toBeInTheDocument();
    expect(screen.getByText('No activity recorded yet.')).toBeInTheDocument();
    const stats = screen.getAllByRole('definition');
    expect(stats[0]).toHaveTextContent('—');
  });

  it('activates the bot through the real server endpoint', async () => {
    mockGetBot.mockResolvedValue(BOT_INACTIVE);
    mockActivateBot.mockResolvedValue({ ...BOT_INACTIVE, status: 'active' });
    renderWithProviders(<BotDetail botId="bot-1" />);

    await screen.findByText('BTC weekly');
    await userEvent.click(screen.getByRole('button', { name: /start bot/i }));

    await waitFor(() => expect(mockActivateBot).toHaveBeenCalledWith('bot-1'));
    expect(await screen.findByText('Running')).toBeInTheDocument();
  });

  it('disables Configure while the bot is running — config must not change mid-execution', async () => {
    mockGetBot.mockResolvedValue({ ...BOT_INACTIVE, status: 'active' });
    renderWithProviders(<BotDetail botId="bot-1" />);

    await screen.findByText('BTC weekly');
    const configureLink = screen.getByRole('link', { name: /configure/i });
    expect(configureLink).toHaveAttribute('aria-disabled', 'true');
  });

  it('renders real trades and real logs, never a scripted ticker', async () => {
    mockGetBot.mockResolvedValue({ ...BOT_INACTIVE, status: 'active', stats: { totalExecutions: 2, totalTrades: 1, totalPnlMinorUnits: '250' } });
    mockListBets.mockResolvedValue({
      items: [
        { id: 'bet-1', userId: 'user-1', instrumentId: 'inst-1', type: 'rise_fall', selection: 'rise', stakeAmountMinorUnits: '1000', currency: 'USD', entryPriceMinorUnits: '100', entryPriceObservedAt: '2026-01-01T00:00:00.000Z', targetPriceMinorUnits: null, payoutRateBasisPoints: '8500', potentialPayoutMinorUnits: '1850', status: 'won', result: 'win', placedAt: '2026-01-01T00:00:00.000Z', expiresAt: '2026-01-01T00:01:00.000Z', settlementPriceMinorUnits: null, settlementPriceObservedAt: null, settledAt: '2026-01-01T00:01:00.000Z', placementTransactionId: null, settlementTransactionId: null, cancelReason: null, botId: 'bot-1' },
      ],
    });
    mockListBotLogs.mockResolvedValue({ items: [{ id: 'log-1', botId: 'bot-1', occurredAt: '2026-01-01T00:00:00.000Z', level: 'success', message: 'Placed a rise_fall bet (rise).', betId: 'bet-1', signal: null }] });

    renderWithProviders(<BotDetail botId="bot-1" />);

    expect(await screen.findByText('Placed a rise_fall bet (rise).')).toBeInTheDocument();
    expect(screen.getByText('+$2.50', { exact: false })).toBeInTheDocument();
  });
});
