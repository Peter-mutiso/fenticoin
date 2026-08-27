import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { storeSession } from '@/lib/auth/token-storage';
import { renderWithProviders } from '@/test-utils/render';
import { BotsBrowser } from './BotsBrowser';

const mockListBots = jest.fn();
const mockGetBotCatalog = jest.fn();
const mockGetMe = jest.fn();
const mockListDeposits = jest.fn();
const mockListWithdrawals = jest.fn();
const mockListBetsForNotifications = jest.fn();

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    listBots: (...args: unknown[]) => mockListBots(...args),
    getBotCatalog: (...args: unknown[]) => mockGetBotCatalog(...args),
    getMe: (...args: unknown[]) => mockGetMe(...args),
    listDeposits: (...args: unknown[]) => mockListDeposits(...args),
    listWithdrawals: (...args: unknown[]) => mockListWithdrawals(...args),
    listBets: (...args: unknown[]) => mockListBetsForNotifications(...args),
  };
});

const CATALOG = [
  {
    key: 'dca_recurring',
    name: 'Recurring strategy',
    category: 'dca' as const,
    description: 'Places a fixed-size bet on a schedule.',
    riskLevel: 'low' as const,
    frequencyLabel: 'Daily, weekly, or monthly',
    configFields: [],
  },
  {
    key: 'momentum_rsi',
    name: 'Momentum (RSI)',
    category: 'momentum' as const,
    description: 'Places a bet when RSI crosses a threshold.',
    riskLevel: 'medium' as const,
    frequencyLabel: 'Continuous',
    configFields: [],
  },
  {
    key: 'grid_trading',
    name: 'Grid',
    category: 'grid' as const,
    description: "Grid trading isn't available yet.",
    riskLevel: 'medium' as const,
    frequencyLabel: 'Not yet available',
    configFields: [],
    comingSoon: true,
  },
];

function authenticate(accountType: 'real' | 'demo' = 'real') {
  storeSession({
    accessToken: 'a',
    refreshToken: 'r',
    user: { id: 'user-1', email: 'trader@example.com', status: 'active', kycStatus: 'unverified', emailVerifiedAt: null, phoneVerifiedAt: null, accountType, demoOfUserId: accountType === 'demo' ? 'real-user-1' : null },
  });
  mockGetMe.mockResolvedValue({ id: 'user-1', email: 'trader@example.com', status: 'active', sessionId: 's1', roles: [], permissions: [], accountType, demoOfUserId: accountType === 'demo' ? 'real-user-1' : null });
  mockListDeposits.mockResolvedValue({ items: [] });
  mockListWithdrawals.mockResolvedValue({ items: [] });
  mockListBetsForNotifications.mockResolvedValue({ items: [] });
}

describe('BotsBrowser', () => {
  const PRESETS = [
    {
      key: 'mean_reversion',
      name: 'Mean Reversion',
      strategyKey: 'momentum_rsi',
      riskLevel: 'medium' as const,
      executionIntervalSeconds: 60,
      description: 'The standard RSI mean-reversion read.',
      defaultConfig: { rsiPeriod: 14 },
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    authenticate();
    mockGetBotCatalog.mockResolvedValue({ items: CATALOG, presets: PRESETS });
  });

  it('shows the summary hero and an honest "no bots yet" prompt for a strategy with no bots', async () => {
    mockListBots.mockResolvedValue({ items: [], summary: { totalBots: 0, activeBots: 0, weeklyReturnPercent: null } });
    renderWithProviders(<BotsBrowser />);

    expect(await screen.findByText('Trading bots')).toBeInTheDocument();
    expect(screen.getAllByText('0', { selector: 'dd' })).toHaveLength(2); // total bots + active, both genuinely zero
    expect(screen.getByText('—')).toBeInTheDocument(); // weekly return, never fabricated
    expect(screen.getByRole('link', { name: /new recurring strategy bot/i })).toBeInTheDocument();
  });

  it('renders the user\'s real bots under the matching strategy category', async () => {
    mockListBots.mockResolvedValue({
      items: [
        {
          id: 'bot-1',
          userId: 'user-1',
          name: 'BTC weekly',
          status: 'active',
          strategyKey: 'dca_recurring',
          config: { currency: 'USD' },
          executionIntervalSeconds: 300,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          stats: { totalExecutions: 3, totalTrades: 2, totalPnlMinorUnits: '500' },
        },
      ],
      summary: { totalBots: 1, activeBots: 1, weeklyReturnPercent: 12.5 },
    });
    renderWithProviders(<BotsBrowser />);

    expect(await screen.findByText('BTC weekly')).toBeInTheDocument();
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByText('+12.5%')).toBeInTheDocument();
  });

  it('shows a coming-soon state for the Grid category rather than fake strategy cards', async () => {
    mockListBots.mockResolvedValue({ items: [], summary: { totalBots: 0, activeBots: 0, weeklyReturnPercent: null } });
    renderWithProviders(<BotsBrowser />);

    await screen.findByText('Trading bots');
    await userEvent.click(screen.getByRole('button', { name: 'Grid' }));

    expect(await screen.findByText('Coming soon')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /new grid bot/i })).not.toBeInTheDocument();
  });

  it('surfaces a real API error instead of silently showing nothing', async () => {
    mockListBots.mockRejectedValue(new Error('boom'));
    renderWithProviders(<BotsBrowser />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });

  it('shows Recommended Bots backed by a real strategy, with no fabricated performance metric', async () => {
    mockListBots.mockResolvedValue({ items: [], summary: { totalBots: 0, activeBots: 0, weeklyReturnPercent: null } });
    renderWithProviders(<BotsBrowser />);

    expect(await screen.findByText('Mean Reversion')).toBeInTheDocument();
    expect(screen.getByText(/strategy: momentum \(rsi\)/i)).toBeInTheDocument();
    expect(screen.getByText(/every 1 minute/i)).toBeInTheDocument();
    // No win-rate/return percentage invented for a preset nobody has run.
    expect(screen.queryByText(/win rate/i)).not.toBeInTheDocument();

    const useBotLink = screen.getByRole('link', { name: /use bot/i });
    expect(useBotLink).toHaveAttribute('href', '/bots/new?strategy=momentum_rsi&preset=mean_reversion');
  });

  it('never tells a demo account its bots trade with a "real balance"', async () => {
    authenticate('demo');
    mockListBots.mockResolvedValue({ items: [], summary: { totalBots: 0, activeBots: 0, weeklyReturnPercent: null } });
    renderWithProviders(<BotsBrowser />);

    expect(await screen.findByText(/demo balance/i)).toBeInTheDocument();
    expect(screen.queryByText(/trade with your real balance/i)).not.toBeInTheDocument();
  });
});
