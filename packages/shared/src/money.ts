/** All money in the system is an integer number of agorot (1 ₪ = 100 agorot). */
export type Agorot = number;

export const shekels = (n: number): Agorot => Math.round(n * 100);
export const toShekels = (a: Agorot): number => a / 100;

/** "₪300" or "₪27.50" – Hebrew-locale shekel formatting without unnecessary decimals. */
export function formatILS(a: Agorot): string {
  const whole = a % 100 === 0;
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(a / 100);
}
