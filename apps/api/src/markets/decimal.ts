/**
 * Converts a decimal string (e.g. "112503.27") to an integer scaled to
 * `precision` decimal places (e.g. `11250327n` at precision 2) — using
 * only string/BigInt arithmetic, never `Number()` multiplication, so a
 * provider's price quote can never pick up floating-point error on the
 * way into the ledger of price history.
 */
export function decimalStringToScaledBigInt(value: string, precision: number): bigint {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error('Cannot parse an empty price string');
  }

  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed.startsWith('+') ? trimmed.slice(1) : trimmed;

  const [wholePartRaw, fractionPartRaw = ''] = unsigned.split('.');
  const wholePart = wholePartRaw || '0';

  if (!/^\d+$/.test(wholePart) || !/^\d*$/.test(fractionPartRaw)) {
    throw new Error(`Invalid decimal price: "${value}"`);
  }
  if (unsigned.split('.').length > 2) {
    throw new Error(`Invalid decimal price: "${value}"`);
  }

  // Truncates (never rounds) any precision finer than the instrument
  // supports — silently rounding a price is exactly the kind of
  // imprecision this module exists to avoid.
  const fractionPart = fractionPartRaw.slice(0, precision).padEnd(precision, '0');

  const magnitude = BigInt(wholePart + fractionPart);
  return negative ? -magnitude : magnitude;
}
