import type { CustomPricing, PageOptionDTO, ProductDTO, PublicSettings } from '@shani/shared';
import { asc, eq } from 'drizzle-orm';
import type { DB, Tx } from '../db';
import { settings, type PageOption, type PricingTier, type Product, type ProductImage, type Settings } from '../db/schema';
import { publicUrl } from '../lib/storage';

export type ProductWithRelations = Product & { images: ProductImage[]; tiers: PricingTier[] };

export async function findProduct(db: DB, where: { id?: string; slug?: string }): Promise<ProductWithRelations | undefined> {
  return db.query.products.findFirst({
    where: (p, { eq: e }) => (where.id ? e(p.id, where.id) : e(p.slug, where.slug!)),
    with: { images: { orderBy: (i) => [asc(i.sortOrder)] }, tiers: true },
  });
}

export async function listProducts(db: DB, onlyActive: boolean): Promise<ProductWithRelations[]> {
  return db.query.products.findMany({
    where: onlyActive ? (p, { eq: e }) => e(p.active, true) : undefined,
    with: { images: { orderBy: (i) => [asc(i.sortOrder)] }, tiers: true },
    orderBy: (p) => [asc(p.sortOrder), asc(p.createdAt)],
  });
}

export function pricingOf(p: ProductWithRelations): CustomPricing | undefined {
  if (p.type !== 'CUSTOM') return undefined;
  return {
    minPages: p.minPages ?? 10,
    maxPages: p.maxPages ?? 15,
    tiers: [...p.tiers].sort((a, b) => a.fromPage - b.fromPage).map((t) => ({ fromPage: t.fromPage, toPage: t.toPage, pricePerPage: t.pricePerPage })),
  };
}

export function productDTO(p: ProductWithRelations): ProductDTO {
  return {
    id: p.id,
    slug: p.slug,
    type: p.type,
    title: p.title,
    description: p.description,
    ageLabel: p.ageLabel,
    price: p.price,
    discountPrice: p.discountPrice,
    discountEndsAt: p.discountEndsAt?.toISOString() ?? null,
    active: p.active,
    sortOrder: p.sortOrder,
    images: [...p.images].sort((a, b) => a.sortOrder - b.sortOrder).map((i) => ({ id: i.id, url: publicUrl(i.fileKey)!, alt: i.alt || p.title })),
    pricing: pricingOf(p),
  };
}

export function pageOptionDTO(o: PageOption): PageOptionDTO {
  return {
    id: o.id,
    title: o.title,
    summary: o.summary,
    minAge: o.minAge,
    maxAge: o.maxAge,
    imageUrl: publicUrl(o.imageKey),
    active: o.active,
    sortOrder: o.sortOrder,
  };
}

export async function getSettings(db: Tx): Promise<Settings> {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  if (row) return row;
  await db.insert(settings).values({ id: 1 }).onConflictDoNothing();
  const [created] = await db.select().from(settings).where(eq(settings.id, 1));
  return created!;
}

export function settingsDTO(s: Settings): PublicSettings {
  const { id: _id, updatedAt: _u, aboutImageKey, ...rest } = s;
  return { ...rest, aboutImageUrl: publicUrl(aboutImageKey) };
}
