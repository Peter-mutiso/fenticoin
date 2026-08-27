import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}));

import { BottomNav } from './BottomNav';
import { NAV_ITEMS } from './nav-items';

describe('BottomNav', () => {
  it('keeps only the 5 core destinations directly visible, moving the rest behind "More" — the fix for Account being pushed off-screen at narrow widths', () => {
    render(<BottomNav items={NAV_ITEMS} />);

    for (const label of ['Home', 'Markets', 'Trade', 'Bots', 'Portfolio']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }

    // These must NOT be flat top-level items any more (that's what overflowed).
    expect(screen.queryByRole('link', { name: 'History' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Transactions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Account' })).not.toBeInTheDocument();

    expect(screen.getByRole('button', { name: /more/i })).toBeInTheDocument();
  });

  it('opens a sheet exposing History, Transactions, and Account when "More" is tapped', async () => {
    const user = userEvent.setup();
    render(<BottomNav items={NAV_ITEMS} />);

    await user.click(screen.getByRole('button', { name: /more/i }));

    expect(screen.getByRole('dialog', { name: /more/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'History' })).toHaveAttribute('href', '/bet-history');
    expect(screen.getByRole('link', { name: 'Transactions' })).toHaveAttribute('href', '/transactions');
    expect(screen.getByRole('link', { name: 'Account' })).toHaveAttribute('href', '/account');
  });
});
