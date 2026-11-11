import { describe, expect, it } from 'vitest';
import { checkoutSchema, contactSchema, personalizationSchema, productUpdateSchema, settingsSchema } from './schemas';
import { digitsOnly, normalizePlace, sanitizeName } from './text';
import { buildWhatsAppLink, normalizeIsraeliPhone } from './whatsapp';

describe('typing filters', () => {
  it('sanitizeName keeps letters, spaces, hyphen and geresh only', () => {
    expect(sanitizeName("מיכל1 <כהן>; '")).toBe("מיכל כהן '");
    expect(sanitizeName('  שני')).toBe('שני');
    expect(sanitizeName('שני  כהן')).toBe('שני כהן');
  });
  it('digitsOnly', () => {
    expect(digitsOnly('050-123 4567')).toBe('0501234567');
    expect(digitsOnly('12345', 4)).toBe('1234');
  });
  it('normalizePlace ignores quotes and hyphens', () => {
    expect(normalizePlace('פרדס חנה-כרכור')).toBe(normalizePlace('פרדס חנה כרכור'));
    expect(normalizePlace('שד\' רוטשילד')).toBe(normalizePlace('שד רוטשילד'));
  });
});

const token = 'a'.repeat(40);
const photos = [
  { uploadId: 'u1', token, role: 'CHILD' as const },
  { uploadId: 'u2', token, role: 'PARENTS' as const },
];

describe('personalization', () => {
  it('requires child name, a parent name and both photos', () => {
    expect(personalizationSchema.safeParse({ childName: 'נועם', parent1Name: 'מיכל', photos }).success).toBe(true);
    const noParents = personalizationSchema.safeParse({ childName: 'נועם', parent1Name: 'מיכל', photos: [photos[0]] });
    expect(noParents.success).toBe(false);
    expect(JSON.stringify(noParents.error)).toContain('ההורים');
    expect(personalizationSchema.safeParse({ childName: ' ', parent1Name: 'מיכל', photos }).success).toBe(false);
    expect(personalizationSchema.safeParse({ childName: 'נועם1', parent1Name: 'מיכל', photos }).success).toBe(false);
    expect(personalizationSchema.safeParse({ childName: 'נועם', parent1Name: 'מיכל', parent2Name: 'x; drop', photos }).success).toBe(false);
    expect(personalizationSchema.safeParse({ childName: 'אוריאל-חיים', parent1Name: 'אמא מיכל', parent2Name: '', photos }).success).toBe(true);
  });
});

describe('checkout', () => {
  const valid = {
    customer: { fullName: 'מיכל כהן', phone: '050-123 4567', email: 'Michal@Example.com ' },
    delivery: { method: 'SHIPPING', cityCode: 4000, city: 'חיפה', street: 'הרצל', houseNumber: '12' },
    items: [{ productId: 'p1', quantity: 1, personalization: { childName: 'נועם', parent1Name: 'מיכל', photos } }],
    consents: { terms: true, photos: true, marketing: false },
  };
  it('accepts a valid order and normalizes phone/email', () => {
    const r = checkoutSchema.parse(valid);
    expect(r.customer.phone).toBe('0501234567');
    expect(r.customer.email).toBe('michal@example.com');
  });
  it('requires city, street and house number for courier delivery but not for pickup', () => {
    const r = checkoutSchema.safeParse({ ...valid, delivery: { method: 'SHIPPING' } });
    expect(r.success).toBe(false);
    expect(r.error!.issues.map((i) => i.path.join('.')).sort()).toEqual(['delivery.city', 'delivery.houseNumber', 'delivery.street']);
    expect(checkoutSchema.safeParse({ ...valid, delivery: { method: 'PICKUP' } }).success).toBe(true);
  });
  it('requires terms, and photo consent when photos are used', () => {
    expect(checkoutSchema.safeParse({ ...valid, consents: { terms: false, photos: true, marketing: false } }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...valid, consents: { terms: true, photos: false, marketing: false } }).success).toBe(false);
  });
  it('rejects bad phone numbers', () => {
    for (const phone of ['12345', '05012345678', '050-ABC-4567', '0101234567']) {
      expect(checkoutSchema.safeParse({ ...valid, customer: { ...valid.customer, phone } }).success, phone).toBe(false);
    }
    for (const phone of ['0501234567', '+972501234567', '03-1234567']) {
      expect(checkoutSchema.safeParse({ ...valid, customer: { ...valid.customer, phone } }).success, phone).toBe(true);
    }
  });
  it('house and flat numbers are digits only', () => {
    expect(checkoutSchema.safeParse({ ...valid, delivery: { ...valid.delivery, houseNumber: '12א' } }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...valid, delivery: { ...valid.delivery, apartment: '4b' } }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...valid, delivery: { ...valid.delivery, apartment: '14' } }).success).toBe(true);
  });
  it('names: letters only – no digits, symbols or code', () => {
    for (const fullName of ["'; DROP TABLE orders;--", '<script>alert(1)</script>', 'מיכל 123', 'a', '{{x}}']) {
      expect(checkoutSchema.safeParse({ ...valid, customer: { ...valid.customer, fullName } }).success, fullName).toBe(false);
    }
    for (const fullName of ['מיכל כהן', "צ'רלי בן-דוד", 'ג׳ני', 'Michal Cohen', 'שִׁירָה', 'محمد']) {
      expect(checkoutSchema.safeParse({ ...valid, customer: { ...valid.customer, fullName } }).success, fullName).toBe(true);
    }
  });
});

describe('contact form', () => {
  it('rejects the honeypot being filled', () => {
    const base = { subject: 'שאלה', email: 'a@b.co', message: 'שלום רב, שאלה', consent: true };
    expect(contactSchema.safeParse(base).success).toBe(true);
    expect(contactSchema.safeParse({ ...base, website: 'spam.com' }).success).toBe(false);
    expect(contactSchema.safeParse({ ...base, consent: false }).success).toBe(false);
  });
});

describe('admin product', () => {
  const p = { title: 'ספר', price: 30000, discountPrice: 27000, discountEndsAt: null, active: true };
  it('discount must be lower than the price', () => {
    expect(productUpdateSchema.safeParse(p).success).toBe(true);
    expect(productUpdateSchema.safeParse({ ...p, discountPrice: 30000 }).success).toBe(false);
    expect(productUpdateSchema.safeParse({ ...p, discountEndsAt: '' }).success).toBe(true);
  });
});

describe('settings', () => {
  it('validates analytics ids', () => {
    const s = {
      businessName: 'הדודה שני', businessEmail: 'a@b.co', whatsappNumber: '', whatsappMessage: '', instagramUrl: '', tiktokUrl: '',
      taxStatus: 'PATUR', vatRate: 18, shippingFee: 3000, pickupAddress: '', aboutTitle: '', aboutText: '', accessibilityCoordinator: '',
      photoRetentionDays: 60, ga4Id: 'G-ABC123', metaPixelId: '123', tiktokPixelId: 'C1ABC',
    };
    expect(settingsSchema.safeParse(s).success).toBe(true);
    expect(settingsSchema.safeParse({ ...s, ga4Id: 'UA-1' }).success).toBe(false);
  });
});

describe('whatsapp', () => {
  it('normalizes Israeli numbers', () => {
    expect(normalizeIsraeliPhone('050-123-4567')).toBe('972501234567');
    expect(normalizeIsraeliPhone('+972 50 123 4567')).toBe('972501234567');
    expect(normalizeIsraeliPhone('123')).toBeNull();
  });
  it('builds a link with the encoded message', () => {
    expect(buildWhatsAppLink('0501234567', 'היי שני')).toBe('https://wa.me/972501234567?text=%D7%94%D7%99%D7%99%20%D7%A9%D7%A0%D7%99');
    expect(buildWhatsAppLink('', 'x')).toBeNull();
  });
});
