import { describe, expect, it } from 'vitest';
import { isValidKenyanPhone, isValidPassword, normalizePhone } from './validation';

describe('auth validation', () => {
  it('accepts and normalizes Kenyan mobile numbers', () => {
    expect(isValidKenyanPhone('0712 345 678')).toBe(true);
    expect(normalizePhone('0712 345 678')).toBe('+254712345678');
    expect(isValidKenyanPhone('+254 712 345 678')).toBe(true);
    expect(isValidKenyanPhone('0612 345 678')).toBe(false);
  });

  it('matches the backend password length bounds', () => {
    expect(isValidPassword('short')).toBe(false);
    expect(isValidPassword('correct horse battery')).toBe(true);
    expect(isValidPassword('a'.repeat(129))).toBe(false);
  });
});
