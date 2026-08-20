import { render, screen } from '@testing-library/react';

import type { MarketAsset } from '@/types/market';
import { AssetCard } from './AssetCard';

const asset: MarketAsset = {
  id: 'eth',
  symbol: 'ETH',
  name: 'Ethereum',
  priceUsd: 4588.81,
  changePercent24h: -5.62,
};

describe('AssetCard', () => {
  it('renders the symbol, name, formatted price, and change', () => {
    render(<AssetCard asset={asset} />);

    expect(screen.getAllByText('ETH').length).toBeGreaterThan(0);
    expect(screen.getByText('Ethereum')).toBeInTheDocument();
    expect(screen.getByText('$4,588.81')).toBeInTheDocument();
    expect(screen.getByText('5.62%')).toBeInTheDocument();
  });
});
