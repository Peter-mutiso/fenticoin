import { render, screen } from '@testing-library/react';

import { Providers } from './providers';
import HomePage from './page';

describe('HomePage', () => {
  it('renders the portfolio balance, watchlist heading, and deposit/withdraw actions', () => {
    render(
      <Providers>
        <HomePage />
      </Providers>,
    );

    expect(screen.getByRole('heading', { name: /watchlist/i })).toBeInTheDocument();
    expect(screen.getAllByText('$39.80').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /deposit/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /withdraw/i })).toBeInTheDocument();
  });

  it('renders every watchlist fixture asset', () => {
    render(
      <Providers>
        <HomePage />
      </Providers>,
    );

    for (const symbol of ['ETH', 'BTC', 'USDC', 'SOL', 'XRP', 'DOGE']) {
      expect(screen.getAllByText(symbol).length).toBeGreaterThan(0);
    }
  });
});
