import { CurrencyMismatchError, Money, NonIntegerAmountError } from './money';
import { EUR, USD } from './currency';

describe('Money', () => {
  it('constructs from minor units and round-trips', () => {
    const m = Money.fromMinorUnits(1234n, USD);
    expect(m.toMinorUnits()).toBe(1234n);
    expect(m.toDecimalString()).toBe('12.34');
    expect(m.toString()).toBe('12.34 USD');
  });

  it('rejects non-integer minor-unit numbers', () => {
    expect(() => Money.fromMinorUnitsNumber(12.5, USD)).toThrow(NonIntegerAmountError);
  });

  it('adds and subtracts within the same currency', () => {
    const a = Money.fromMinorUnits(1000n, USD);
    const b = Money.fromMinorUnits(250n, USD);
    expect(a.add(b).toMinorUnits()).toBe(1250n);
    expect(a.subtract(b).toMinorUnits()).toBe(750n);
  });

  it('throws on cross-currency arithmetic', () => {
    const a = Money.fromMinorUnits(100n, USD);
    const b = Money.fromMinorUnits(100n, EUR);
    expect(() => a.add(b)).toThrow(CurrencyMismatchError);
    expect(() => a.compareTo(b)).toThrow(CurrencyMismatchError);
  });

  it('negates and takes absolute value', () => {
    const a = Money.fromMinorUnits(500n, USD);
    expect(a.negate().toMinorUnits()).toBe(-500n);
    expect(a.negate().abs().toMinorUnits()).toBe(500n);
  });

  it('multiplies by an integer factor', () => {
    const a = Money.fromMinorUnits(300n, USD);
    expect(a.multiplyByInteger(4n).toMinorUnits()).toBe(1200n);
  });

  it('applies basis points exactly with floor rounding by default', () => {
    // 85.00% of 333 minor units = 283.05 -> floors to 283
    const a = Money.fromMinorUnits(333n, USD);
    expect(a.applyBasisPoints(8_500n).toMinorUnits()).toBe(283n);
  });

  it('applies basis points with ceil rounding when requested', () => {
    const a = Money.fromMinorUnits(333n, USD);
    expect(a.applyBasisPoints(8_500n, 'ceil').toMinorUnits()).toBe(284n);
  });

  it('applies basis points with half-even (banker\'s) rounding', () => {
    // 50.00% of 3 minor units = 1.5 -> rounds to even (2)
    const a = Money.fromMinorUnits(3n, USD);
    expect(a.applyBasisPoints(5_000n, 'half-even').toMinorUnits()).toBe(2n);

    // 50.00% of 1 minor unit = 0.5 -> rounds to even (0)
    const b = Money.fromMinorUnits(1n, USD);
    expect(b.applyBasisPoints(5_000n, 'half-even').toMinorUnits()).toBe(0n);
  });

  it('applies basis points to negative amounts consistently', () => {
    const a = Money.fromMinorUnits(-333n, USD);
    expect(a.applyBasisPoints(8_500n, 'floor').toMinorUnits()).toBe(-284n);
    expect(a.applyBasisPoints(8_500n, 'ceil').toMinorUnits()).toBe(-283n);
  });

  it('compares and checks sign/zero', () => {
    const zero = Money.zero(USD);
    const pos = Money.fromMinorUnits(1n, USD);
    const neg = Money.fromMinorUnits(-1n, USD);

    expect(zero.isZero()).toBe(true);
    expect(pos.isPositive()).toBe(true);
    expect(neg.isNegative()).toBe(true);
    expect(pos.compareTo(neg)).toBe(1);
    expect(neg.compareTo(pos)).toBe(-1);
    expect(zero.compareTo(Money.zero(USD))).toBe(0);
  });

  it('checks equality by currency and amount', () => {
    const a = Money.fromMinorUnits(500n, USD);
    const b = Money.fromMinorUnits(500n, USD);
    const c = Money.fromMinorUnits(500n, EUR);
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });

  it('serializes to JSON without precision loss', () => {
    const a = Money.fromMinorUnits(9_007_199_254_740_993n, USD); // > Number.MAX_SAFE_INTEGER
    expect(a.toJSON()).toEqual({ amountMinorUnits: '9007199254740993', currency: 'USD' });
  });
});
