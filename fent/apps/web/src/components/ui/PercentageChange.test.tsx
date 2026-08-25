import { render, screen } from '@testing-library/react';

import { PercentageChange } from './PercentageChange';

describe('PercentageChange', () => {
  it('renders a positive value in the brand color with the absolute magnitude', () => {
    render(<PercentageChange value={0.29} />);
    const el = screen.getByText('0.29%');
    expect(el.className).toMatch(/text-brand-600/);
  });

  it('renders a negative value in the loss color, without a leading minus sign', () => {
    render(<PercentageChange value={-5.62} />);
    const el = screen.getByText('5.62%');
    expect(el.className).toMatch(/text-loss-500/);
  });

  it('treats exactly zero as positive', () => {
    render(<PercentageChange value={0} />);
    const el = screen.getByText('0.00%');
    expect(el.className).toMatch(/text-brand-600/);
  });
});
