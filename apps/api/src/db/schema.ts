// Database schema for the Hadoda Shani shop. Money is stored in agorot (integer).
// After changing this file run `npm run db:generate -w @shani/api` to create a migration.
import { relations } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgEnum, pgTable, real, text, timestamp } from 'drizzle-orm/pg-core';
import { randomBytes } from 'node:crypto';

export const newId = () => randomBytes(12).toString('base64url');
const id = () => text('id').primaryKey().$defaultFn(newId);
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const createdAt = () => ts('created_at').notNull().defaultNow();

export const productType = pgEnum('product_type', ['PRESET', 'CUSTOM', 'SIMPLE']);
export const orderStatus = pgEnum('order_status', ['PENDING_PAYMENT', 'PAID', 'IN_PROGRESS', 'SHIPPED', 'DELIVERED', 'CANCELLED']);
export const deliveryMethod = pgEnum('delivery_method', ['SHIPPING', 'PICKUP']);
export const photoRole = pgEnum('photo_role', ['CHILD', 'PARENTS']);
export const taxStatus = pgEnum('tax_status', ['PATUR', 'MURSHE']);

export const products = pgTable('products', {
  id: id(),
  slug: text('slug').notNull().unique(),
  type: productType('type').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  ageLabel: text('age_label').notNull().default(''),
  price: integer('price').notNull(),
  discountPrice: integer('discount_price'),
  discountEndsAt: ts('discount_ends_at'),
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  // custom-book limits (CUSTOM only)
  minPages: integer('min_pages'),
  maxPages: integer('max_pages'),
  createdAt: createdAt(),
  updatedAt: ts('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
});

export const productImages = pgTable(
  'product_images',
  {
    id: id(),
    productId: text('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
    fileKey: text('file_key').notNull(),
    alt: text('alt').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('product_images_product_idx').on(t.productId)],
);

export const pricingTiers = pgTable(
  'pricing_tiers',
  {
    id: id(),
    productId: text('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
    fromPage: integer('from_page').notNull(),
    toPage: integer('to_page').notNull(),
    pricePerPage: integer('price_per_page').notNull(),
  },
  (t) => [index('pricing_tiers_product_idx').on(t.productId)],
);

export const pageOptions = pgTable('page_options', {
  id: id(),
  title: text('title').notNull(),
  summary: text('summary').notNull(),
  minAge: integer('min_age').notNull(),
  maxAge: integer('max_age').notNull(),
  imageKey: text('image_key'),
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: createdAt(),
});

export const orders = pgTable(
  'orders',
  {
    id: id(),
    number: integer('number').notNull().unique().generatedAlwaysAsIdentity({ startWith: 1001 }),
    status: orderStatus('status').notNull().default('PENDING_PAYMENT'),
    fullName: text('full_name').notNull(),
    email: text('email').notNull(),
    phone: text('phone').notNull(),
    deliveryMethod: deliveryMethod('delivery_method').notNull(),
    /** locality code from the official registry (data.gov.il) */
    cityCode: integer('city_code'),
    city: text('city').notNull().default(''),
    street: text('street').notNull().default(''),
    houseNumber: text('house_number').notNull().default(''),
    apartment: text('apartment').notNull().default(''),
    notes: text('notes').notNull().default(''),
    subtotal: integer('subtotal').notNull(),
    shipping: integer('shipping').notNull(),
    total: integer('total').notNull(),
    vatIncluded: integer('vat_included').notNull().default(0),
    taxStatus: taxStatus('tax_status').notNull(),
    paymentProvider: text('payment_provider').notNull(),
    paymentRef: text('payment_ref'),
    paidAt: ts('paid_at'),
    marketingOptIn: boolean('marketing_opt_in').notNull().default(false),
    termsAcceptedAt: ts('terms_accepted_at').notNull(),
    photosConsentAt: ts('photos_consent_at'),
    photosDeletedAt: ts('photos_deleted_at'),
    createdAt: createdAt(),
    updatedAt: ts('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [index('orders_status_created_idx').on(t.status, t.createdAt)],
);

export const orderItems = pgTable(
  'order_items',
  {
    id: id(),
    orderId: text('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
    productId: text('product_id').references(() => products.id, { onDelete: 'set null' }),
    productType: productType('product_type').notNull(),
    title: text('title').notNull(),
    unitPrice: integer('unit_price').notNull(),
    quantity: integer('quantity').notNull(),
    childName: text('child_name'),
    parent1Name: text('parent1_name'),
    parent2Name: text('parent2_name'),
    /** snapshot of chosen pages: [{ id, title }] */
    pages: jsonb('pages').$type<{ id: string; title: string }[]>().notNull().default([]),
  },
  (t) => [index('order_items_order_idx').on(t.orderId)],
);

/** A customer photo. Private: only the uploader (holding the token) and the admin can read it. */
export const uploads = pgTable(
  'uploads',
  {
    id: id(),
    tokenHash: text('token_hash').notNull(),
    fileKey: text('file_key').notNull(),
    role: photoRole('role'),
    orderItemId: text('order_item_id').references(() => orderItems.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    deletedAt: ts('deleted_at'),
  },
  (t) => [index('uploads_order_item_idx').on(t.orderItemId)],
);

export const orderStatusEvents = pgTable(
  'order_status_events',
  {
    id: id(),
    orderId: text('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
    status: orderStatus('status').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('order_status_events_order_idx').on(t.orderId)],
);

export const adminUsers = pgTable('admin_users', {
  id: id(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  /** TOTP secret, AES-256-GCM encrypted with APP_SECRET */
  totpSecretEnc: text('totp_secret_enc').notNull(),
  /** last accepted 30-second step – stops the same code being used twice */
  lastTotpStep: integer('last_totp_step').notNull().default(0),
  failedAttempts: integer('failed_attempts').notNull().default(0),
  lockedUntil: ts('locked_until'),
  createdAt: createdAt(),
});

export const backupCodes = pgTable('backup_codes', {
  id: id(),
  adminId: text('admin_id').notNull().references(() => adminUsers.id, { onDelete: 'cascade' }),
  codeHash: text('code_hash').notNull(),
  usedAt: ts('used_at'),
});

export const adminSessions = pgTable('admin_sessions', {
  id: id(),
  tokenHash: text('token_hash').notNull().unique(),
  adminId: text('admin_id').notNull().references(() => adminUsers.id, { onDelete: 'cascade' }),
  csrfToken: text('csrf_token').notNull(),
  expiresAt: ts('expires_at').notNull(),
  createdAt: createdAt(),
});

/** Step 1 (password OK) waiting for step 2 (authenticator code) */
export const pendingLogins = pgTable('pending_logins', {
  id: id(),
  tokenHash: text('token_hash').notNull().unique(),
  adminId: text('admin_id').notNull().references(() => adminUsers.id, { onDelete: 'cascade' }),
  attempts: integer('attempts').notNull().default(0),
  expiresAt: ts('expires_at').notNull(),
});

export const settings = pgTable('settings', {
  id: integer('id').primaryKey().default(1),
  businessName: text('business_name').notNull().default('הדודה שני'),
  businessEmail: text('business_email').notNull().default('shani@example.com'),
  whatsappNumber: text('whatsapp_number').notNull().default(''),
  whatsappMessage: text('whatsapp_message').notNull().default('היי שני, הגעתי מהאתר ואשמח לשמוע על ספרי הלבד'),
  instagramUrl: text('instagram_url').notNull().default(''),
  tiktokUrl: text('tiktok_url').notNull().default(''),
  taxStatus: taxStatus('tax_status').notNull().default('PATUR'),
  vatRate: real('vat_rate').notNull().default(18),
  shippingFee: integer('shipping_fee').notNull().default(3000),
  pickupAddress: text('pickup_address').notNull().default(''),
  aboutTitle: text('about_title').notNull().default(''),
  aboutText: text('about_text').notNull().default(''),
  aboutImageKey: text('about_image_key'),
  accessibilityCoordinator: text('accessibility_coordinator').notNull().default(''),
  photoRetentionDays: integer('photo_retention_days').notNull().default(60),
  ga4Id: text('ga4_id').notNull().default(''),
  metaPixelId: text('meta_pixel_id').notNull().default(''),
  tiktokPixelId: text('tiktok_pixel_id').notNull().default(''),
  updatedAt: ts('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
});

export const consentLogs = pgTable(
  'consent_logs',
  {
    id: id(),
    visitorId: text('visitor_id').notNull(),
    analytics: boolean('analytics').notNull(),
    marketing: boolean('marketing').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('consent_logs_visitor_idx').on(t.visitorId)],
);

export const contactMessages = pgTable('contact_messages', {
  id: id(),
  subject: text('subject').notNull(),
  email: text('email').notNull(),
  message: text('message').notNull(),
  emailed: boolean('emailed').notNull().default(false),
  createdAt: createdAt(),
});

// ---- relations (for db.query.*.findMany({ with: … })) ----
export const productsRelations = relations(products, ({ many }) => ({ images: many(productImages), tiers: many(pricingTiers) }));
export const productImagesRelations = relations(productImages, ({ one }) => ({ product: one(products, { fields: [productImages.productId], references: [products.id] }) }));
export const pricingTiersRelations = relations(pricingTiers, ({ one }) => ({ product: one(products, { fields: [pricingTiers.productId], references: [products.id] }) }));
export const ordersRelations = relations(orders, ({ many }) => ({ items: many(orderItems), history: many(orderStatusEvents) }));
export const orderItemsRelations = relations(orderItems, ({ one, many }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  uploads: many(uploads),
}));
export const uploadsRelations = relations(uploads, ({ one }) => ({ orderItem: one(orderItems, { fields: [uploads.orderItemId], references: [orderItems.id] }) }));
export const orderStatusEventsRelations = relations(orderStatusEvents, ({ one }) => ({ order: one(orders, { fields: [orderStatusEvents.orderId], references: [orders.id] }) }));
export const adminSessionsRelations = relations(adminSessions, ({ one }) => ({ admin: one(adminUsers, { fields: [adminSessions.adminId], references: [adminUsers.id] }) }));
export const pendingLoginsRelations = relations(pendingLogins, ({ one }) => ({ admin: one(adminUsers, { fields: [pendingLogins.adminId], references: [adminUsers.id] }) }));

export type Product = typeof products.$inferSelect;
export type ProductImage = typeof productImages.$inferSelect;
export type PricingTier = typeof pricingTiers.$inferSelect;
export type PageOption = typeof pageOptions.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type AdminUser = typeof adminUsers.$inferSelect;
