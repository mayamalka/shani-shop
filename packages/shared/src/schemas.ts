import { z } from 'zod';
import { NAME_ALLOWED, NAME_RULE_MESSAGE } from './text';

// ---------- building blocks ----------
const trimmed = (min: number, max: number, msg = 'שדה חובה') =>
  z.string().trim().min(min, min <= 1 ? msg : `לפחות ${min} תווים`).max(max, `עד ${max} תווים`);

/** A person's name: letters only (any language) + space, hyphen, apostrophe/geresh. 2–40 characters. */
const personName = (max: number) =>
  z
    .string()
    .trim()
    .min(2, 'לפחות 2 אותיות')
    .max(max, `עד ${max} תווים`)
    .regex(NAME_ALLOWED, NAME_RULE_MESSAGE);
export const nameSchema = personName(40);
export const emailSchema = z.string().trim().toLowerCase().email('כתובת אימייל לא תקינה').max(160);
export const israeliPhoneSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/[\s-]/g, '').replace(/^\+972/, '0'))
  // mobile 05X/07X (10 digits) or landline 02/03/04/08/09 (9 digits)
  .refine((s) => /^0(5\d{8}|7\d{8}|[23489]\d{7})$/.test(s), 'מספר טלפון לא תקין (ספרות בלבד, למשל 0501234567)');
const id = z.string().min(1).max(64);

export const PHOTO_ROLES = ['CHILD', 'PARENTS'] as const;
export type PhotoRole = (typeof PHOTO_ROLES)[number];

export const photoRefSchema = z.object({
  uploadId: id,
  token: z.string().min(32).max(128),
  role: z.enum(PHOTO_ROLES),
});
export type PhotoRef = z.infer<typeof photoRefSchema>;

export const personalizationSchema = z
  .object({
    childName: nameSchema,
    parent1Name: nameSchema,
    parent2Name: z.union([z.literal(''), personName(40)]).optional().default(''),
    photos: z.array(photoRefSchema).min(1).max(4),
  })
  .superRefine((p, ctx) => {
    for (const role of PHOTO_ROLES) {
      if (!p.photos.some((x) => x.role === role)) {
        ctx.addIssue({ code: 'custom', path: ['photos'], message: role === 'CHILD' ? 'יש להעלות תמונה של הילד/ה' : 'יש להעלות תמונה של ההורים' });
      }
    }
  });
export type Personalization = z.infer<typeof personalizationSchema>;

export const cartLineSchema = z.object({
  productId: id,
  quantity: z.number().int().min(1).max(10),
  personalization: personalizationSchema.optional(),
  pageIds: z.array(id).max(40).optional(),
});
export type CartLineInput = z.infer<typeof cartLineSchema>;

export const DELIVERY_METHODS = ['SHIPPING', 'PICKUP'] as const;

export const quoteSchema = z.object({
  items: z.array(cartLineSchema).max(20),
  delivery: z.enum(DELIVERY_METHODS).default('SHIPPING'),
});
export type QuoteInput = z.infer<typeof quoteSchema>;

export const checkoutSchema = z
  .object({
    customer: z.object({ fullName: personName(80), phone: israeliPhoneSchema, email: emailSchema }),
    delivery: z.object({
      method: z.enum(DELIVERY_METHODS),
      /** locality code from the official registry (data.gov.il); the server takes the name from its own list */
      cityCode: z.number().int().positive().optional(),
      city: z.string().trim().max(80).optional().default(''),
      street: z.string().trim().max(120).optional().default(''),
      houseNumber: z.string().trim().regex(/^\d{0,4}$/, 'מספר בית – ספרות בלבד').optional().default(''),
      apartment: z.string().trim().regex(/^\d{0,4}$/, 'מספר דירה – ספרות בלבד').optional().default(''),
      notes: z.string().trim().max(500).optional().default(''),
    }),
    items: z.array(cartLineSchema).min(1, 'הסל ריק').max(20),
    consents: z.object({
      terms: z.literal(true, { error: 'יש לאשר את התקנון ומדיניות הפרטיות' }),
      photos: z.boolean(),
      marketing: z.boolean(),
    }),
  })
  .superRefine((c, ctx) => {
    if (c.delivery.method === 'SHIPPING') {
      if (!c.delivery.cityCode) ctx.addIssue({ code: 'custom', path: ['delivery', 'city'], message: 'יש לבחור יישוב מהרשימה' });
      if (!c.delivery.street) ctx.addIssue({ code: 'custom', path: ['delivery', 'street'], message: 'יש לבחור רחוב מהרשימה' });
      if (!c.delivery.houseNumber) ctx.addIssue({ code: 'custom', path: ['delivery', 'houseNumber'], message: 'יש למלא מספר בית' });
    }
    if (c.items.some((i) => i.personalization) && !c.consents.photos) {
      ctx.addIssue({ code: 'custom', path: ['consents', 'photos'], message: 'יש לאשר שימוש בתמונות להכנת הספר' });
    }
  });
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const contactSchema = z.object({
  subject: trimmed(2, 120),
  email: emailSchema,
  message: trimmed(5, 3000),
  consent: z.literal(true, { error: 'יש לאשר את השימוש בפרטים' }),
  /** honeypot – real people leave it empty */
  website: z.string().max(0).optional().default(''),
});
export type ContactInput = z.infer<typeof contactSchema>;

export const consentSchema = z.object({
  visitorId: z.string().uuid(),
  analytics: z.boolean(),
  marketing: z.boolean(),
});
export type ConsentInput = z.infer<typeof consentSchema>;

// ---------- admin ----------
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(200) });
export const totpSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, 'קוד בן 6 ספרות') });
export const backupCodeSchema = z.object({ backupCode: z.string().trim().min(8).max(20) });

const agorot = z.number().int().min(0).max(10_000_000);

export const productUpdateSchema = z
  .object({
    title: trimmed(2, 120),
    description: trimmed(0, 4000).optional().default(''),
    ageLabel: z.string().trim().max(40).optional().default(''),
    price: agorot,
    discountPrice: agorot.nullable(),
    discountEndsAt: z.string().datetime({ offset: true }).nullable().or(z.literal('').transform(() => null)),
    active: z.boolean(),
    sortOrder: z.number().int().min(0).max(9999).optional().default(0),
    /** customer must enter child + parent names and upload child + parents photos (ignored for the custom book) */
    personalized: z.boolean().optional(),
  })
  .refine((p) => p.discountPrice == null || p.discountPrice < p.price, {
    path: ['discountPrice'],
    message: 'מחיר המבצע חייב להיות נמוך מהמחיר הרגיל',
  });
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;

export const imageOrderSchema = z.object({ imageIds: z.array(id).max(50) });

export const pageOptionSchema = z
  .object({
    title: trimmed(2, 80),
    summary: trimmed(2, 400),
    minAge: z.number().int().min(0).max(12),
    maxAge: z.number().int().min(0).max(12),
    active: z.boolean(),
    sortOrder: z.number().int().min(0).max(9999).optional().default(0),
  })
  .refine((p) => p.maxAge >= p.minAge, { path: ['maxAge'], message: 'גיל מקסימלי קטן מהמינימלי' });
export type PageOptionInput = z.infer<typeof pageOptionSchema>;

export const pricingSchema = z.object({
  minPages: z.number().int().min(1).max(60),
  maxPages: z.number().int().min(1).max(60),
  tiers: z.array(z.object({ fromPage: z.number().int().min(1), toPage: z.number().int().min(1), pricePerPage: agorot })).min(1).max(20),
});

export const settingsSchema = z.object({
  businessName: trimmed(2, 80),
  businessEmail: emailSchema,
  whatsappNumber: z.string().trim().max(20),
  whatsappMessage: z.string().trim().max(300),
  instagramUrl: z.string().trim().url().or(z.literal('')),
  tiktokUrl: z.string().trim().url().or(z.literal('')),
  taxStatus: z.enum(['PATUR', 'MURSHE']),
  vatRate: z.number().min(0).max(50),
  shippingFee: agorot,
  pickupAddress: z.string().trim().max(200),
  accessibilityCoordinator: z.string().trim().max(200),
  photoRetentionDays: z.number().int().min(7).max(365),
  ga4Id: z.string().trim().regex(/^(G-[A-Z0-9]+)?$/, 'מזהה GA4 מתחיל ב־G-'),
  metaPixelId: z.string().trim().regex(/^\d*$/, 'מזהה פיקסל מספרי'),
  tiktokPixelId: z.string().trim().regex(/^[A-Z0-9]*$/i, 'מזהה לא תקין'),
});
export type SettingsInput = z.infer<typeof settingsSchema>;

/** About page, edited in place (admin) */
export const aboutSchema = z
  .object({
    aboutTitle: z.string().trim().min(2, 'לפחות 2 תווים').max(120).optional(),
    aboutText: z.string().trim().min(10, 'לפחות 10 תווים').max(6000).optional(),
  })
  .refine((a) => a.aboutTitle !== undefined || a.aboutText !== undefined, 'אין מה לשמור');

export const ORDER_STATUSES = ['PENDING_PAYMENT', 'PAID', 'IN_PROGRESS', 'SHIPPED', 'DELIVERED', 'CANCELLED'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const statusUpdateSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  notifyCustomer: z.boolean().default(false),
});
