import { render, screen } from '@testing-library/react';

import { BalanceCard } from './BalanceCard';

describe('BalanceCard', () => {
  it('labels a real account "Real Portfolio" and offers Deposit/Withdraw', () => {
    render(<BalanceCard availableMinorUnits="100000" currency="USD" />);

    expect(screen.getByText('Real Portfolio')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /deposit/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /withdraw/i })).toBeInTheDocument();
  });

  it('labels a demo account "Demo Balance", explains the restriction, and never links to Deposit/Withdraw', () => {
    render(<BalanceCard availableMinorUnits="1000000" currency="USD" isDemo />);

    expect(screen.getByText('Demo Balance')).toBeInTheDocument();
    expect(screen.getByText(/no real-world value/i)).toBeInTheDocument();
    expect(screen.queryByText('Real Portfolio')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /deposit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /withdraw/i })).not.toBeInTheDocument();
  });
});
