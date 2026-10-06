import { describe, expect, it } from 'vitest';
import { Money } from '../domain/money.js';

describe('savings contracts', () => {
  it('uses integer minor units for internal savings transfers', () => {
    expect(Money.fromMajorUnits('125.50').minor).toBe(12550n);
    expect(() => Money.fromMinor(0n)).not.toThrow();
  });
});
