import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders } from '@/test-utils/render';
import MarketsPage from './page';

const instrumentBtc = {
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

const instrumentEth = {
  ...instrumentBtc,
  id: 'inst-eth',
  symbol: 'ETH',
  displaySymbol: 'ETH/USD',
  name: 'Ethereum',
};

const mockListInstruments = jest.fn();
const mockListMarketCategories = jest.fn();
const mockGetPrice = jest.fn();

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    listInstruments: (...args: unknown[]) => mockListInstruments(...args),
    listMarketCategories: (...args: unknown[]) => mockListMarketCategories(...args),
    getPrice: (...args: unknown[]) => mockGetPrice(...args),
  };
});

function renderPage() {
  return renderWithProviders(<MarketsPage />);
}

describe('MarketsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListInstruments.mockResolvedValue({ items: [instrumentBtc, instrumentEth] });
    mockListMarketCategories.mockResolvedValue({ items: [] });
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
  });

  it('lists available instruments', async () => {
    renderPage();
    expect(await screen.findByText('BTC/USD')).toBeInTheDocument();
    expect(screen.getByText('ETH/USD')).toBeInTheDocument();
  });

  it('filters by search term client-side', async () => {
    renderPage();
    await screen.findByText('BTC/USD');

    const search = screen.getByLabelText(/search markets/i);
    await userEvent.type(search, 'ether');

    expect(screen.queryByText('BTC/USD')).not.toBeInTheDocument();
    expect(screen.getByText('ETH/USD')).toBeInTheDocument();
  });

  it('shows an empty state when nothing matches the search', async () => {
    renderPage();
    await screen.findByText('BTC/USD');

    const search = screen.getByLabelText(/search markets/i);
    await userEvent.type(search, 'nonexistent-market-xyz');

    expect(await screen.findByText(/no markets match your search/i)).toBeInTheDocument();
  });

  it('shows an error notice when the instrument list fails to load', async () => {
    mockListInstruments.mockRejectedValue(new Error('boom'));
    renderPage();

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('shows an empty state when the backend returns no instruments', async () => {
    mockListInstruments.mockResolvedValue({ items: [] });
    renderPage();

    await waitFor(() => expect(screen.getByText(/no instruments available right now/i)).toBeInTheDocument());
  });
});
