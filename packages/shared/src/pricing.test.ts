import { describe, expect, it } from 'vitest';
import {
  computeTotals,
  customBookPrice,
  customPriceBreakdown,
  effectivePrice,
  isDiscountActive,
  nextPagePrice,
  PricingError,
  validateTiers,
  type CustomPricing,
} from './pricing';
import { formatILS, shekels } from './money';

const PRICING: CustomPricing = {
  minPages: 10,
  maxPages: 15,
  tiers: [
    { fromPage: 1, toPage: 10, pricePerPage: shekels(30) },
    { fromPage: 11, toPage: 13, pricePerPage: shekels(27) },
    { fromPage: 14, toPage: 15, pricePerPage: shekels(25) },
  ],
};

describe('custom book pricing', () => {
  it.each([
    [10, 300],
    [11, 327],
    [12, 354],
    [13, 381],
    [14, 406],
    [15, 431],
  ])('%i pages cost ₪%i', (pages, expected) => {
    expect(customBookPrice(pages, PRICING)).toBe(shekels(expected));
  });

  it('rejects fewer than the minimum and more than the maximum', () => {
    expect(() => customBookPrice(9, PRICING)).toThrow(PricingError);
    expect(() => customBookPrice(16, PRICING)).toThrow(PricingError);
    expect(() => customBookPrice(10.5, PRICING)).toThrow(PricingError);
  });

  it('breaks the price down by tier', () => {
    expect(customPriceBreakdown(12, PRICING)).toEqual([
      { fromPage: 1, toPage: 10, count: 10, pricePerPage: 3000, subtotal: 30000 },
      { fromPage: 11, toPage: 12, count: 2, pricePerPage: 2700, subtotal: 5400 },
    ]);
  });

  it('tells the price of the next page', () => {
    expect(nextPagePrice(10, PRICING)).toBe(2700);
    expect(nextPagePrice(13, PRICING)).toBe(2500);
    expect(nextPagePrice(15, PRICING)).toBeNull();
  });

  it('rejects tiers with gaps or that do not reach the maximum', () => {
    expect(() => validateTiers({ ...PRICING, tiers: [PRICING.tiers[0]!, PRICING.tiers[2]!] })).toThrow(/11/);
    expect(() => validateTiers({ ...PRICING, maxPages: 16 })).toThrow(/16/);
    expect(() => validateTiers({ ...PRICING, minPages: 0 })).toThrow();
  });
});

describe('discounts', () => {
  const base = { price: 30000, discountPrice: 27000, discountEndsAt: null };
  it('uses the discount price when active', () => {
    expect(effectivePrice(base)).toBe(27000);
  });
  it('ignores a discount that is not lower than the price', () => {
    expect(effectivePrice({ ...base, discountPrice: 30000 })).toBe(30000);
    expect(effectivePrice({ ...base, discountPrice: 35000 })).toBe(30000);
  });
  it('ignores an expired discount', () => {
    const now = new Date('2026-12-01T00:00:00Z');
    expect(isDiscountActive({ ...base, discountEndsAt: '2026-11-30T23:59:00Z' }, now)).toBe(false);
    expect(isDiscountActive({ ...base, discountEndsAt: '2026-12-31T00:00:00Z' }, now)).toBe(true);
  });
  it('no discount → regular price', () => {
    expect(effectivePrice({ ...base, discountPrice: null })).toBe(30000);
  });
});

describe('order totals', () => {
  const lines = [
    { unitPrice: 30000, quantity: 2 },
    { unitPrice: 35400, quantity: 1 },
  ];
  it('adds shipping for courier delivery', () => {
    expect(computeTotals({ lines, delivery: 'SHIPPING', shippingFee: 3000, taxStatus: 'PATUR', vatRate: 18 })).toEqual({
      subtotal: 95400,
      shipping: 3000,
      total: 98400,
      vatIncluded: 0,
    });
  });
  it('pickup is free', () => {
    expect(computeTotals({ lines, delivery: 'PICKUP', shippingFee: 3000, taxStatus: 'PATUR', vatRate: 18 }).shipping).toBe(0);
  });
  it('reports included VAT for עוסק מורשה', () => {
    const t = computeTotals({ lines: [{ unitPrice: 11800, quantity: 1 }], delivery: 'PICKUP', shippingFee: 0, taxStatus: 'MURSHE', vatRate: 18 });
    expect(t.vatIncluded).toBe(1800);
    expect(t.total).toBe(11800);
  });
  it('empty cart has no shipping', () => {
    expect(computeTotals({ lines: [], delivery: 'SHIPPING', shippingFee: 3000, taxStatus: 'PATUR', vatRate: 18 }).total).toBe(0);
  });
});

describe('formatILS', () => {
  it('formats whole shekels without decimals', () => {
    expect(formatILS(30000)).toMatch(/300/);
    expect(formatILS(30000)).not.toMatch(/\.00/);
    expect(formatILS(2750)).toMatch(/27\.50/);
  });
});
