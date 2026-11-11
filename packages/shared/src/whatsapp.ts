/** Israeli number ("050-123 4567", "+972 50…") → international digits ("972501234567"). */
export function normalizeIsraeliPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (/^972\d{8,9}$/.test(digits)) return digits;
  if (/^0\d{8,9}$/.test(digits)) return '972' + digits.slice(1);
  return null;
}

export function buildWhatsAppLink(phone: string, message: string): string | null {
  const n = normalizeIsraeliPhone(phone);
  if (!n) return null;
  return `https://wa.me/${n}?text=${encodeURIComponent(message)}`;
}
