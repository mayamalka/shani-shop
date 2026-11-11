import type { Agorot } from './money';

export interface PricingTier {
  fromPage: number;
  toPage: number;
  /** price per page in agorot */
  pricePerPage: Agorot;
}

export interface CustomPricing {
  minPages: number;
  maxPages: number;
  tiers: PricingTier[];
}

export class PricingError extends Error {}

/** Throws PricingError when tiers have gaps/overlaps or don't cover minPages..maxPages. */
export function validateTiers(p: CustomPricing): void {
  if (!Number.isInteger(p.minPages) || !Number.isInteger(p.maxPages) || p.minPages < 1 || p.maxPages < p.minPages) {
    throw new PricingError('טווח עמודים לא תקין');
  }
  const tiers = [...p.tiers].sort((a, b) => a.fromPage - b.fromPage);
  let expected = 1;
  for (const t of tiers) {
    if (t.fromPage !== expected) throw new PricingError(`חסרה מדרגת מחיר לעמוד ${expected}`);
    if (t.toPage < t.fromPage) throw new PricingError('מדרגה לא תקינה');
    if (!Number.isInteger(t.pricePerPage) || t.pricePerPage < 0) throw new PricingError('מחיר לעמוד לא תקין');
    expected = t.toPage + 1;
  }
  if (expected - 1 < p.maxPages) throw new PricingError(`חסרה מדרגת מחיר לעמוד ${expected}`);
}

export interface CustomPriceLine {
  fromPage: number;
  toPage: number;
  count: number;
  pricePerPage: Agorot;
  subtotal: Agorot;
}

/** Breakdown of the custom-book price, tier by tier (only tiers actually used). */
export function customPriceBreakdown(pageCount: number, p: CustomPricing): CustomPriceLine[] {
  validateTiers(p);
  if (!Number.isInteger(pageCount) || pageCount < p.minPages || pageCount > p.maxPages) {
    throw new PricingError(`יש לבחור בין ${p.minPages} ל־${p.maxPages} עמודים`);
  }
  const lines: CustomPriceLine[] = [];
  for (const t of [...p.tiers].sort((a, b) => a.fromPage - b.fromPage)) {
    if (t.fromPage > pageCount) break;
    const to = Math.min(t.toPage, pageCount);
    const count = to - t.fromPage + 1;
    lines.push({ fromPage: t.fromPage, toPage: to, count, pricePerPage: t.pricePerPage, subtotal: count * t.pricePerPage });
  }
  return lines;
}

export function customBookPrice(pageCount: number, p: CustomPricing): Agorot {
  return customPriceBreakdown(pageCount, p).reduce((s, l) => s + l.subtotal, 0);
}

/** Price of the next page, or null when already at the maximum. */
export function nextPagePrice(pageCount: number, p: CustomPricing): Agorot | null {
  const next = pageCount + 1;
  if (next > p.maxPages) return null;
  const t = p.tiers.find((x) => next >= x.fromPage && next <= x.toPage);
  return t ? t.pricePerPage : null;
}

export interface Discountable {
  price: Agorot;
  discountPrice: Agorot | null;
  discountEndsAt: string | Date | null;
}

/** A discount counts only if it is lower than the price and has not expired. */
export function isDiscountActive(p: Discountable, now: Date = new Date()): boolean {
  if (p.discountPrice == null || p.discountPrice >= p.price || p.discountPrice < 0) return false;
  if (p.discountEndsAt && new Date(p.discountEndsAt).getTime() <= now.getTime()) return false;
  return true;
}

export function effectivePrice(p: Discountable, now: Date = new Date()): Agorot {
  return isDiscountActive(p, now) ? (p.discountPrice as Agorot) : p.price;
}

export type TaxStatus = 'PATUR' | 'MURSHE';
export type DeliveryMethod = 'SHIPPING' | 'PICKUP';

export interface TotalsInput {
  lines: { unitPrice: Agorot; quantity: number }[];
  delivery: DeliveryMethod;
  shippingFee: Agorot;
  taxStatus: TaxStatus;
  /** e.g. 18 for 18% – only used when taxStatus is MURSHE */
  vatRate: number;
}

export interface Totals {
  subtotal: Agorot;
  shipping: Agorot;
  total: Agorot;
  /** VAT included in the total (0 for עוסק פטור) */
  vatIncluded: Agorot;
}

/** Prices are shown VAT-inclusive; for עוסק מורשה we report the VAT part of the total. */
export function computeTotals(i: TotalsInput): Totals {
  const subtotal = i.lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const shipping = i.lines.length === 0 || i.delivery === 'PICKUP' ? 0 : i.shippingFee;
  const total = subtotal + shipping;
  const vatIncluded = i.taxStatus === 'MURSHE' ? Math.round(total - total / (1 + i.vatRate / 100)) : 0;
  return { subtotal, shipping, total, vatIncluded };
}
