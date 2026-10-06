export function normalizePhone(phone: string): string {
  const compact = phone.trim().replace(/[\s()-]/g, '');
  if (/^07\d{8}$/.test(compact) || /^01\d{8}$/.test(compact)) return `+254${compact.slice(1)}`;
  return compact;
}

export function isValidKenyanPhone(phone: string): boolean {
  return /^\+254[17]\d{8}$/.test(normalizePhone(phone));
}
