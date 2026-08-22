import { screen, waitFor } from '@testing-library/react';

import { renderWithProviders } from '@/test-utils/render';
import { DashboardView } from './DashboardView';

const mockGetReportsOverview = jest.fn();
const mockGetRevenueReport = jest.fn();

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    getReportsOverview: (...args: unknown[]) => mockGetReportsOverview(...args),
    getRevenueReport: (...args: unknown[]) => mockGetRevenueReport(...args),
  };
});

describe('DashboardView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders only real aggregate figures returned by the server — never an invented number', async () => {
    mockGetReportsOverview.mockResolvedValue({
      usersByStatus: [{ status: 'active', count: 42 }, { status: 'suspended', count: 3 }],
      pendingDepositsCount: 5,
      pendingWithdrawalsCount: 2,
      betsRequiringReviewCount: 1,
    });
    mockGetRevenueReport.mockResolvedValue({
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-01-31T00:00:00.000Z',
      byCurrency: [{ currency: 'USD', grossStakeVolume: '500000', grossGamingRevenue: '75000', settledBetCount: 120 }],
    });

    renderWithProviders(<DashboardView />);

    expect((await screen.findAllByText('42')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('5').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1').length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getByText('$5000.00 volume')).toBeInTheDocument());
    expect(screen.getByText('$750.00 GGR')).toBeInTheDocument();
  });

  it('shows an honest empty state instead of a fake chart when nothing settled in range', async () => {
    mockGetReportsOverview.mockResolvedValue({ usersByStatus: [], pendingDepositsCount: 0, pendingWithdrawalsCount: 0, betsRequiringReviewCount: 0 });
    mockGetRevenueReport.mockResolvedValue({ from: '', to: '', byCurrency: [] });

    renderWithProviders(<DashboardView />);

    expect(await screen.findByText(/no settled bets in the last 30 days/i)).toBeInTheDocument();
  });

  it('surfaces a fetch error via a Notice rather than crashing', async () => {
    mockGetReportsOverview.mockRejectedValue(new Error('network down'));
    mockGetRevenueReport.mockResolvedValue({ from: '', to: '', byCurrency: [] });

    renderWithProviders(<DashboardView />);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
