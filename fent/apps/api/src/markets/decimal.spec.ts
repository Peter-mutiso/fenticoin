import { decimalStringToScaledBigInt } from './decimal';

describe('decimalStringToScaledBigInt', () => {
  it('scales a whole number', () => {
    expect(decimalStringToScaledBigInt('100', 2)).toBe(10_000n);
  });

  it('scales a decimal exactly matching the precision', () => {
    expect(decimalStringToScaledBigInt('112503.27', 2)).toBe(11_250_327n);
  });

  it('pads a shorter fraction to the requested precision', () => {
    expect(decimalStringToScaledBigInt('1.5', 4)).toBe(15_000n);
  });

  it('truncates (never rounds) a fraction finer than the requested precision', () => {
    expect(decimalStringToScaledBigInt('1.23999', 2)).toBe(123n);
  });

  it('handles a leading-dot / no-whole-part value', () => {
    expect(decimalStringToScaledBigInt('.5', 2)).toBe(50n);
  });

  it('handles negative values', () => {
    expect(decimalStringToScaledBigInt('-2.5', 2)).toBe(-250n);
  });

  it('handles a zero-precision instrument', () => {
    expect(decimalStringToScaledBigInt('42', 0)).toBe(42n);
    expect(decimalStringToScaledBigInt('42.9', 0)).toBe(42n);
  });

  it('rejects garbage input', () => {
    expect(() => decimalStringToScaledBigInt('not-a-number', 2)).toThrow('Invalid decimal price');
    expect(() => decimalStringToScaledBigInt('1.2.3', 2)).toThrow('Invalid decimal price');
    expect(() => decimalStringToScaledBigInt('', 2)).toThrow('empty');
  });
});
