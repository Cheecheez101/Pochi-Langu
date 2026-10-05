import { describe, expect, it } from 'vitest';
import { Money, roundMinorUnits } from './money.js';

describe('Money', () => {
  it('uses exact bigint minor units and serializes at the boundary', () => {
    const value = Money.fromMinor(9007199254740993n);
    expect(value.minor).toBe(9007199254740993n);
    expect(value.toJSON()).toEqual({ currency: 'KES', minor: '9007199254740993' });
  });

  it('performs safe arithmetic and comparisons', () => {
    const one = Money.fromMinor(1n);
    expect(one.add(Money.fromMinor(2n)).minor).toBe(3n);
    expect(one.subtract(Money.fromMinor(2n)).minor).toBe(-1n);
    expect(one.multiply(5n).minor).toBe(5n);
    expect(one.compare(Money.fromMinor(2n))).toBe(-1);
  });

  it('rounds decimal major units with half-up as the documented default', () => {
    expect(Money.fromMajorUnits('1.005').minor).toBe(101n);
    expect(Money.fromMajorUnits('1.004').minor).toBe(100n);
    expect(Money.fromMajorUnits('-1.005').minor).toBe(-101n);
  });

  it('supports explicit rounding modes without floating point', () => {
    expect(roundMinorUnits(5n, 2n, 'half-up')).toBe(3n);
    expect(roundMinorUnits(5n, 2n, 'half-even')).toBe(2n);
    expect(roundMinorUnits(-5n, 2n, 'floor')).toBe(-3n);
    expect(roundMinorUnits(5n, 2n, 'ceil')).toBe(3n);
  });

  it('rejects invalid currencies, decimal values, and divisors', () => {
    expect(() => Money.fromMinor(1n, 'USD')).toThrow();
    expect(() => Money.fromMajorUnits('not-money')).toThrow();
    expect(() => roundMinorUnits(1n, 0n)).toThrow();
    expect(() => Money.fromMinor(1n).divide(0n)).toThrow();
  });
});
