import { formatUsd } from './format';

describe('formatUsd', () => {
  it('formats values >= 1 with two decimal places', () => {
    expect(formatUsd(4588.81)).toBe('$4,588.81');
    expect(formatUsd(1)).toBe('$1.00');
  });

  it('formats sub-dollar values with four decimal places', () => {
    expect(formatUsd(0.318)).toBe('$0.3180');
  });
});
