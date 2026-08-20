/** Display-only USD formatting for market/portfolio UI — not ledger math. */
export function formatUsd(value: number): string {
  const decimals = Math.abs(value) < 1 ? 4 : 2;
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
