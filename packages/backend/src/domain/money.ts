export type RoundingMode = 'half-up' | 'half-even' | 'floor' | 'ceil';

export const KES_MINOR_UNITS_PER_UNIT = 100n;

function assertSafeInteger(value: bigint): void {
  if (value < BigInt(Number.MIN_SAFE_INTEGER) || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('Money value exceeds the safe integer range for number conversion');
  }
}

/**
 * The only rounding operation in the money domain. Inputs are integer minor
 * units and an integer divisor; no floating-point arithmetic is involved.
 */
export function roundMinorUnits(
  numerator: bigint,
  denominator: bigint,
  mode: RoundingMode = 'half-up',
): bigint {
  if (denominator <= 0n) {
    throw new RangeError('Rounding denominator must be positive');
  }

  const sign = numerator < 0n ? -1n : 1n;
  const absolute = numerator < 0n ? -numerator : numerator;
  const quotient = absolute / denominator;
  const remainder = absolute % denominator;
  const shouldIncrement =
    mode === 'ceil'
      ? sign > 0n && remainder !== 0n
      : mode === 'floor'
        ? sign < 0n && remainder !== 0n
        : mode === 'half-up'
          ? remainder * 2n >= denominator
          : remainder * 2n > denominator || (remainder * 2n === denominator && quotient % 2n === 1n);

  return sign * (quotient + (shouldIncrement ? 1n : 0n));
}

export class Money {
  private constructor(readonly minor: bigint, readonly currency: 'KES') {
  }

  static fromMinor(minor: bigint | number | string, currency = 'KES'): Money {
    if (currency !== 'KES') {
      throw new RangeError('Only KES is supported');
    }
    const value = typeof minor === 'bigint' ? minor : BigInt(minor);
    return new Money(value, 'KES');
  }

  static fromMajorUnits(
    majorUnits: bigint | number | string,
    rounding: RoundingMode = 'half-up',
  ): Money {
    if (typeof majorUnits === 'number' && !Number.isFinite(majorUnits)) {
      throw new TypeError('Major units must be finite');
    }
    const [whole, fraction = ''] = String(majorUnits).split('.');
    if (!/^-?\d+$/.test(whole) || !/^\d*$/.test(fraction)) {
      throw new TypeError('Major units must be a decimal value');
    }
    const sign = whole.startsWith('-') ? -1n : 1n;
    const absoluteWhole = whole.replace('-', '');
    const scaledNumerator = BigInt(`${absoluteWhole}${fraction || '0'}`);
    const denominator = 10n ** BigInt(fraction.length);
    return Money.fromMinor(sign * roundMinorUnits(scaledNumerator * KES_MINOR_UNITS_PER_UNIT, denominator, rounding));
  }

  add(other: Money): Money {
    this.assertCurrency(other);
    return Money.fromMinor(this.minor + other.minor);
  }

  subtract(other: Money): Money {
    this.assertCurrency(other);
    return Money.fromMinor(this.minor - other.minor);
  }

  multiply(factor: bigint): Money {
    return Money.fromMinor(this.minor * factor);
  }

  divide(divisor: bigint, rounding: RoundingMode = 'half-up'): Money {
    return Money.fromMinor(roundMinorUnits(this.minor, divisor, rounding));
  }

  compare(other: Money): -1 | 0 | 1 {
    this.assertCurrency(other);
    return this.minor < other.minor ? -1 : this.minor > other.minor ? 1 : 0;
  }

  isNegative(): boolean {
    return this.minor < 0n;
  }

  isZero(): boolean {
    return this.minor === 0n;
  }

  toJSON(): { currency: 'KES'; minor: string } {
    return { currency: this.currency, minor: this.minor.toString() };
  }

  toString(): string {
    return `${this.currency} ${this.minor.toString()} minor`;
  }

  toNumber(): number {
    assertSafeInteger(this.minor);
    return Number(this.minor);
  }

  private assertCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new TypeError('Money currencies must match');
    }
  }
}
