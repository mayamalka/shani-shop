/**
 * Allowed characters in people's names (and city/street names):
 * letters of any language (Hebrew, English, Arabic, Russian…), combining marks (niqqud),
 * space, hyphen, dot, apostrophe and Hebrew geresh/gershayim (ג׳ני, צ'רלי, בן-דוד, ש״ס).
 * Everything else – digits, < > ; = ( ) { } / \ % $ # etc. – is rejected.
 */
export const NAME_ALLOWED = /^[\p{L}\p{M}][\p{L}\p{M} '’׳״".-]*$/u;
const NAME_DISALLOWED_CHARS = /[^\p{L}\p{M} '’׳״".-]/gu;

export const NAME_RULE_MESSAGE = 'אפשר להשתמש באותיות בלבד (וגם רווח, מקף או גרש)';

/** Removes characters that are not allowed in a name (used while typing). */
export function sanitizeName(value: string): string {
  return value.replace(NAME_DISALLOWED_CHARS, '').replace(/\s{2,}/g, ' ').trimStart();
}

/** Keeps digits only (phone, house number, flat number). */
export function digitsOnly(value: string, maxLength = 20): string {
  return value.replace(/\D/g, '').slice(0, maxLength);
}

/** For comparing Hebrew place names typed slightly differently: quotes, geresh, hyphens and extra spaces are ignored. */
export function normalizePlace(s: string): string {
  return s
    .replace(/["'׳״’`-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
