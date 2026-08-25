import type { Currency } from './currency';

/**
 * Thrown when an operation is attempted between two `Money` values of
 * different currencies. Currency conversion is intentionally not implemented
 * here — it belongs in a dedicated, explicit FX/pricing module, never as an
 * implicit side effect of arithmetic.
 */
export class CurrencyMismatchError extends Error {
  constructor(a: string, b: string) {
    super(`Cannot operate on Money in different currencies: ${a} vs ${b}`);
    this.name = 'CurrencyMismatchError';
  }
}

/**
 * Thrown when a value that must be an integer number of minor units is not.
 * This is the guard that keeps floating-point numbers out of money math.
 */
export class NonIntegerAmountError extends Error {
  constructor(value: number) {
    super(`Money amounts must be whole minor units, received: ${value}`);
    this.name = 'NonIntegerAmountError';
  }
}

/** Thrown by `Money.fromDecimalString` when the input isn't a plain decimal number string. */
export class InvalidDecimalStringError extends Error {
  constructor(value: string) {
    super(`Invalid decimal amount: "${value}"`);
    this.name = 'InvalidDecimalStringError';
  }
}

export type RoundingMode = 'floor' | 'ceil' | 'half-even';

/**
 * An exact monetary amount, stored as a `bigint` count of minor units
 * (e.g. cents) plus its currency. Never backed by `number`/`float` —
 * that is the whole point of this type.
 *
 * Instances are immutable; every operation returns a new `Money`.
 */
export class Money {
  private constructor(
    private readonly amountMinorUnits: bigint,
    public readonly currency: Currency,
  ) {}

  static fromMinorUnits(amount: bigint, currency: Currency): Money {
    return new Money(amount, currency);
  }

  /**
   * Convenience constructor from a JS number of *minor* units (e.g. cents).
   * Rejects non-integers so a stray float can never enter the ledger.
   */
  static fromMinorUnitsNumber(amount: number, currency: Currency): Money {
    if (!Number.isInteger(amount)) {
      throw new NonIntegerAmountError(amount);
    }
    return new Money(BigInt(amount), currency);
  }

  /**
   * Parses a decimal string (e.g. "12.50", user-typed input) into `Money`,
   * scaled to the currency's own `decimals` — using only string/BigInt
   * arithmetic, never `Number()` multiplication, so typed input can never
   * pick up floating-point error on its way into a request. Truncates
   * (never rounds) any precision finer than the currency supports.
   */
  static fromDecimalString(value: string, currency: Currency): Money {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      throw new InvalidDecimalStringError(value);
    }

    const negative = trimmed.startsWith('-');
    const unsigned = negative ? trimmed.slice(1) : trimmed.startsWith('+') ? trimmed.slice(1) : trimmed;

    const parts = unsigned.split('.');
    if (parts.length > 2) {
      throw new InvalidDecimalStringError(value);
    }
    const [wholePartRaw, fractionPartRaw = ''] = parts;
    const wholePart = wholePartRaw || '0';

    if (!/^\d+$/.test(wholePart) || !/^\d*$/.test(fractionPartRaw)) {
      throw new InvalidDecimalStringError(value);
    }

    const fractionPart = fractionPartRaw.slice(0, currency.decimals).padEnd(currency.decimals, '0');
    const magnitude = BigInt(wholePart + fractionPart);
    return new Money(negative ? -magnitude : magnitude, currency);
  }

  static zero(currency: Currency): Money {
    return new Money(0n, currency);
  }

  private assertSameCurrency(other: Money): void {
    if (other.currency.code !== this.currency.code) {
      throw new CurrencyMismatchError(this.currency.code, other.currency.code);
    }
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amountMinorUnits + other.amountMinorUnits, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amountMinorUnits - other.amountMinorUnits, this.currency);
  }

  negate(): Money {
    return new Money(-this.amountMinorUnits, this.currency);
  }

  abs(): Money {
    return new Money(this.amountMinorUnits < 0n ? -this.amountMinorUnits : this.amountMinorUnits, this.currency);
  }

  /** Multiply by a whole-number factor (e.g. "3 units of this stake"). */
  multiplyByInteger(factor: bigint): Money {
    return new Money(this.amountMinorUnits * factor, this.currency);
  }

  /**
   * Apply an exact integer-basis-points rate (1/100 of a percent) without
   * ever touching floating point, e.g. 8_500n = 85.00%. Any fractional
   * minor unit produced by the division is resolved by `rounding`
   * (defaults to `floor`, i.e. rounding in the platform's favor), so the
   * rounding policy for money-affecting rates is always explicit at the
   * call site rather than implicit.
   */
  applyBasisPoints(basisPoints: bigint, rounding: RoundingMode = 'floor'): Money {
    const numerator = this.amountMinorUnits * basisPoints;
    const denominator = 10_000n;
    const quotient = numerator / denominator;
    const remainder = numerator % denominator;

    if (remainder === 0n) {
      return new Money(quotient, this.currency);
    }

    switch (rounding) {
      case 'floor':
        return new Money(numerator < 0n ? quotient - 1n : quotient, this.currency);
      case 'ceil':
        return new Money(numerator < 0n ? quotient : quotient + 1n, this.currency);
      case 'half-even': {
        const twiceRemainder = remainder * 2n;
        const absTwiceRemainder = twiceRemainder < 0n ? -twiceRemainder : twiceRemainder;
        const roundUp =
          absTwiceRemainder > denominator ||
          (absTwiceRemainder === denominator && quotient % 2n !== 0n);
        if (!roundUp) return new Money(quotient, this.currency);
        return new Money(numerator < 0n ? quotient - 1n : quotient + 1n, this.currency);
      }
    }
  }

  compareTo(other: Money): -1 | 0 | 1 {
    this.assertSameCurrency(other);
    if (this.amountMinorUnits < other.amountMinorUnits) return -1;
    if (this.amountMinorUnits > other.amountMinorUnits) return 1;
    return 0;
  }

  equals(other: Money): boolean {
    return this.currency.code === other.currency.code && this.amountMinorUnits === other.amountMinorUnits;
  }

  isZero(): boolean {
    return this.amountMinorUnits === 0n;
  }

  isNegative(): boolean {
    return this.amountMinorUnits < 0n;
  }

  isPositive(): boolean {
    return this.amountMinorUnits > 0n;
  }

  toMinorUnits(): bigint {
    return this.amountMinorUnits;
  }

  /** Human-readable major-unit string, e.g. "12.34" — for display only, never for math. */
  toDecimalString(): string {
    const { decimals } = this.currency;
    const negative = this.amountMinorUnits < 0n;
    const abs = negative ? -this.amountMinorUnits : this.amountMinorUnits;
    const divisor = 10n ** BigInt(decimals);
    const whole = abs / divisor;
    const fraction = (abs % divisor).toString().padStart(decimals, '0');
    const sign = negative ? '-' : '';
    return decimals > 0 ? `${sign}${whole}.${fraction}` : `${sign}${whole}`;
  }

  toString(): string {
    return `${this.toDecimalString()} ${this.currency.code}`;
  }

  toJSON(): { amountMinorUnits: string; currency: string } {
    return { amountMinorUnits: this.amountMinorUnits.toString(), currency: this.currency.code };
  }
}
