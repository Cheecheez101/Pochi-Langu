export const MIN_PASSWORD_LENGTH = 12;

export function normalizePhone(phone: string): string {
  const compact = phone.trim().replace(/[\s()-]/g, '');
  if (/^07\d{8}$/.test(compact) || /^01\d{8}$/.test(compact)) {
    return `+254${compact.slice(1)}`;
  }
  return compact;
}

export function isValidKenyanPhone(phone: string): boolean {
  const trimmed = phone.trim();
  if (trimmed.length < 9 || trimmed.length > 20) return false;
  return /^\+254[17]\d{8}$/.test(normalizePhone(trimmed));
}

export function isValidPassword(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH && password.length <= 128;
}
