import {
  computeTotals,
  customBookPrice,
  customPriceBreakdown,
  effectivePrice,
  isDiscountActive,
  PricingError,
  type CartLineInput,
  type CheckoutInput,
  type OrderDetailDTO,
  type OrderStatus,
  type OrderSummaryDTO,
  type QuoteLine,
  type QuoteResponse,
} from '@shani/shared';
import { and, asc, count, desc, eq, ilike, inArray, isNull, lt, ne, or, sql, type SQL } from 'drizzle-orm';
import type { DB } from '../db';
import { orderItems, orders, orderStatusEvents, pageOptions, uploads } from '../db/schema';
import { sha256 } from '../lib/crypto';
import { israelAddresses } from '../lib/geo';
import { HttpError, notFound } from '../lib/http';
import type { PaymentProvider } from '../lib/payments';
import type { StorageProvider } from '../lib/storage';
import { getSettings, pricingOf } from './catalog';
import type { Notifier } from './notifications';

const FINAL_STATUSES: OrderStatus[] = ['SHIPPED', 'DELIVERED', 'CANCELLED'];

export class OrderService {
  constructor(
    private db: DB,
    private storage: StorageProvider,
    private notifier: Notifier,
  ) {}

  /** Server-side price calculation – the only source of truth for what is charged. */
  async quote(items: CartLineInput[], delivery: 'SHIPPING' | 'PICKUP'): Promise<QuoteResponse & { pageTitles: Map<string, string> }> {
    const s = await getSettings(this.db);
    const ids = [...new Set(items.map((i) => i.productId))];
    const products = ids.length
      ? await this.db.query.products.findMany({ where: (p) => inArray(p.id, ids), with: { images: true, tiers: true } })
      : [];
    const byId = new Map(products.map((p) => [p.id, p]));
    const allPageIds = [...new Set(items.flatMap((i) => i.pageIds ?? []))];
    const pages = allPageIds.length
      ? await this.db.select().from(pageOptions).where(and(inArray(pageOptions.id, allPageIds), eq(pageOptions.active, true)))
      : [];
    const pageTitles = new Map(pages.map((p) => [p.id, p.title]));

    const lines: QuoteLine[] = [];
    const problems: QuoteResponse['problems'] = [];
    items.forEach((item, index) => {
      const p = byId.get(item.productId);
      if (!p || !p.active) return void problems.push({ index, message: 'המוצר אינו זמין יותר' });
      if (p.type === 'CUSTOM') {
        const pageIds = item.pageIds ?? [];
        if (new Set(pageIds).size !== pageIds.length) return void problems.push({ index, message: 'עמוד נבחר פעמיים' });
        if (pageIds.some((id) => !pageTitles.has(id))) return void problems.push({ index, message: 'חלק מהעמודים שבחרת כבר לא זמינים – יש לעדכן את הבחירה' });
        try {
          const pricing = pricingOf(p)!;
          const unitPrice = customBookPrice(pageIds.length, pricing);
          lines.push({
            index, productId: p.id, title: `${p.title} · ${pageIds.length} עמודים`, unitPrice, regularUnitPrice: null,
            quantity: item.quantity, lineTotal: unitPrice * item.quantity, pageBreakdown: customPriceBreakdown(pageIds.length, pricing),
          });
        } catch (e) {
          if (e instanceof PricingError) problems.push({ index, message: e.message });
          else throw e;
        }
        return;
      }
      const unitPrice = effectivePrice(p);
      lines.push({
        index, productId: p.id, title: p.title, unitPrice, regularUnitPrice: isDiscountActive(p) ? p.price : null,
        quantity: item.quantity, lineTotal: unitPrice * item.quantity,
      });
    });

    const totals = computeTotals({ lines, delivery, shippingFee: s.shippingFee, taxStatus: s.taxStatus, vatRate: s.vatRate });
    return { lines, problems, ...totals, taxStatus: s.taxStatus, pageTitles };
  }

  async create(input: CheckoutInput, provider: PaymentProvider) {
    const q = await this.quote(input.items, input.delivery.method);
    if (q.problems.length) throw new HttpError(409, 'CART_CHANGED', q.problems[0]!.message, q.problems);

    const products = await this.db.query.products.findMany({ where: (p) => inArray(p.id, input.items.map((i) => i.productId)), columns: { id: true, type: true } });
    const typeOf = new Map(products.map((p) => [p.id, p.type]));

    // every personalized book needs names + photos; photos must belong to the uploader (token) and be unused
    const seen = new Set<string>();
    for (const [i, item] of input.items.entries()) {
      if (typeOf.get(item.productId) === 'SIMPLE') continue;
      if (!item.personalization) throw new HttpError(400, 'VALIDATION', 'חסרים פרטי התאמה אישית לספר', [{ path: `items.${i}.personalization`, message: 'חסר' }]);
      for (const ph of item.personalization.photos) {
        if (seen.has(ph.uploadId)) throw new HttpError(400, 'VALIDATION', 'אותה תמונה נבחרה פעמיים');
        seen.add(ph.uploadId);
        const [up] = await this.db.select().from(uploads).where(eq(uploads.id, ph.uploadId));
        if (!up || up.deletedAt || up.orderItemId || up.tokenHash !== sha256(ph.token)) {
          throw new HttpError(400, 'PHOTO_EXPIRED', 'אחת התמונות כבר לא זמינה – יש להעלות אותה מחדש');
        }
      }
    }

    // address must be a real Israeli locality + one of its streets (official registry)
    const ship = input.delivery.method === 'SHIPPING';
    let city = '';
    let street = '';
    if (ship) {
      const geo = israelAddresses();
      const code = input.delivery.cityCode!;
      const name = geo.cityName(code);
      if (!name) throw new HttpError(400, 'VALIDATION', 'יש לבחור יישוב מהרשימה', [{ path: 'delivery.city', message: 'יש לבחור יישוב מהרשימה' }]);
      const official = geo.streetsOf(code).length ? geo.matchStreet(code, input.delivery.street) : input.delivery.street;
      if (!official) throw new HttpError(400, 'VALIDATION', `הרחוב לא נמצא ב${name}`, [{ path: 'delivery.street', message: `הרחוב לא נמצא ב${name} – יש לבחור מהרשימה` }]);
      city = name;
      street = official;
    }

    const s = await getSettings(this.db);
    const now = new Date();
    const order = await this.db.transaction(async (tx) => {
      const [o] = await tx
        .insert(orders)
        .values({
          fullName: input.customer.fullName,
          email: input.customer.email,
          phone: input.customer.phone,
          deliveryMethod: input.delivery.method,
          cityCode: ship ? input.delivery.cityCode! : null,
          city,
          street,
          houseNumber: ship ? input.delivery.houseNumber : '',
          apartment: ship ? input.delivery.apartment : '',
          notes: input.delivery.notes,
          subtotal: q.subtotal,
          shipping: q.shipping,
          total: q.total,
          vatIncluded: q.vatIncluded,
          taxStatus: s.taxStatus,
          paymentProvider: provider.name,
          marketingOptIn: input.consents.marketing,
          termsAcceptedAt: now,
          photosConsentAt: input.consents.photos ? now : null,
        })
        .returning();
      await tx.insert(orderStatusEvents).values({ orderId: o!.id, status: 'PENDING_PAYMENT' });
      for (const line of q.lines) {
        const item = input.items[line.index]!;
        const type = typeOf.get(item.productId)!;
        const pers = type === 'SIMPLE' ? undefined : item.personalization;
        const [created] = await tx
          .insert(orderItems)
          .values({
            orderId: o!.id,
            productId: item.productId,
            productType: type,
            title: line.title,
            unitPrice: line.unitPrice,
            quantity: line.quantity,
            childName: pers?.childName ?? null,
            parent1Name: pers?.parent1Name ?? null,
            parent2Name: pers?.parent2Name || null,
            pages: type === 'CUSTOM' ? (item.pageIds ?? []).map((id) => ({ id, title: q.pageTitles.get(id)! })) : [],
          })
          .returning({ id: orderItems.id });
        for (const ph of pers?.photos ?? []) {
          const r = await tx
            .update(uploads)
            .set({ orderItemId: created!.id, role: ph.role })
            .where(and(eq(uploads.id, ph.uploadId), isNull(uploads.orderItemId), isNull(uploads.deletedAt)))
            .returning({ id: uploads.id });
          if (r.length !== 1) throw new HttpError(409, 'PHOTO_EXPIRED', 'אחת התמונות כבר לא זמינה – יש להעלות אותה מחדש');
        }
      }
      return o!;
    });

    const payment = await provider.createPayment({
      orderId: order.id,
      orderNumber: order.number,
      amount: order.total,
      description: `הזמנה ${order.number} – הדודה שני`,
      customer: { fullName: order.fullName, email: order.email, phone: order.phone },
    });
    if (payment.providerRef) await this.db.update(orders).set({ paymentRef: payment.providerRef }).where(eq(orders.id, order.id));
    return { orderId: order.id, number: order.number, total: order.total, redirectUrl: payment.redirectUrl };
  }

  /** Idempotent: only the first "paid" notification moves the order and sends emails. */
  async markPaid(orderId: string, providerRef: string) {
    const moved = await this.db
      .update(orders)
      .set({ status: 'PAID', paidAt: new Date(), paymentRef: providerRef })
      .where(and(eq(orders.id, orderId), eq(orders.status, 'PENDING_PAYMENT')))
      .returning({ id: orders.id });
    const order = await this.db.query.orders.findFirst({ where: (o, { eq: e }) => e(o.id, orderId), with: { items: true } });
    if (!order) throw notFound('ההזמנה לא נמצאה');
    if (moved.length === 1) {
      await this.db.insert(orderStatusEvents).values({ orderId, status: 'PAID' });
      await this.notifier.orderPaid(order);
    }
    return order;
  }

  async setStatus(orderId: string, status: OrderStatus, notifyCustomer: boolean) {
    if (status === 'PENDING_PAYMENT') throw new HttpError(400, 'BAD_STATUS', 'לא ניתן להחזיר הזמנה למצב "ממתינה לתשלום"');
    const [existing] = await this.db.select().from(orders).where(eq(orders.id, orderId));
    if (!existing) throw notFound('ההזמנה לא נמצאה');
    if (existing.status === status) return existing;
    const [order] = await this.db
      .update(orders)
      .set({ status, ...(status === 'PAID' && !existing.paidAt ? { paidAt: new Date() } : {}) })
      .where(eq(orders.id, orderId))
      .returning();
    await this.db.insert(orderStatusEvents).values({ orderId, status });
    if (notifyCustomer) await this.notifier.statusChanged(order!);
    return order!;
  }

  async list(opts: { status?: OrderStatus; q?: string; page?: number; pageSize?: number }) {
    const pageSize = Math.min(opts.pageSize ?? 25, 100);
    const page = Math.max(1, opts.page ?? 1);
    const q = opts.q?.trim();
    let search: SQL | undefined;
    if (q) {
      const like = `%${q.replace(/[%_\\]/g, '\\$&')}%`;
      const digits = q.replace(/\D/g, '');
      search = or(
        ilike(orders.fullName, like),
        ilike(orders.email, like),
        ...(digits.length >= 3 ? [ilike(orders.phone, `%${digits}%`)] : []),
        ...(/^\d+$/.test(q) ? [eq(orders.number, Number(q))] : []),
      );
    }
    // unfinished checkouts (customer never completed payment) are not orders – never listed, deleted after 7 days
    const notUnpaid = ne(orders.status, 'PENDING_PAYMENT');
    search = and(notUnpaid, search);
    const where = and(opts.status ? eq(orders.status, opts.status) : undefined, search);
    const [rows, [{ total } = { total: 0 }], grouped] = await Promise.all([
      this.db.query.orders.findMany({
        where,
        orderBy: (o) => [desc(o.createdAt)],
        limit: pageSize,
        offset: (page - 1) * pageSize,
        with: { items: { columns: { quantity: true } } },
      }),
      this.db.select({ total: count() }).from(orders).where(where),
      this.db.select({ status: orders.status, n: count() }).from(orders).where(search).groupBy(orders.status),
    ]);
    const counts = Object.fromEntries(grouped.map((g) => [g.status, g.n])) as Partial<Record<OrderStatus, number>>;
    const list: OrderSummaryDTO[] = rows.map((o) => ({
      id: o.id,
      number: o.number,
      createdAt: o.createdAt.toISOString(),
      status: o.status,
      fullName: o.fullName,
      itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
      total: o.total,
    }));
    return { orders: list, total, page, pageSize, counts };
  }

  async detail(orderId: string): Promise<OrderDetailDTO> {
    const o = await this.db.query.orders.findFirst({
      where: (x, { eq: e }) => e(x.id, orderId),
      with: {
        items: { with: { uploads: { where: (u) => isNull(u.deletedAt), orderBy: (u) => [asc(u.role)] } } },
        history: { orderBy: (h) => [asc(h.createdAt)] },
      },
    });
    if (!o) throw notFound('ההזמנה לא נמצאה');
    return {
      id: o.id,
      number: o.number,
      createdAt: o.createdAt.toISOString(),
      status: o.status,
      fullName: o.fullName,
      itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
      total: o.total,
      email: o.email,
      phone: o.phone,
      deliveryMethod: o.deliveryMethod,
      city: o.city,
      street: o.street,
      houseNumber: o.houseNumber,
      apartment: o.apartment,
      notes: o.notes,
      subtotal: o.subtotal,
      shipping: o.shipping,
      vatIncluded: o.vatIncluded,
      paidAt: o.paidAt?.toISOString() ?? null,
      paymentRef: o.paymentRef,
      marketingOptIn: o.marketingOptIn,
      photosDeletedAt: o.photosDeletedAt?.toISOString() ?? null,
      items: o.items.map((i) => ({
        id: i.id,
        productId: i.productId,
        title: i.title,
        productType: i.productType,
        unitPrice: i.unitPrice,
        quantity: i.quantity,
        childName: i.childName,
        parent1Name: i.parent1Name,
        parent2Name: i.parent2Name,
        pages: i.pages ?? [],
        photos: i.uploads.map((u) => ({ id: u.id, role: u.role ?? 'CHILD', url: `/api/admin/uploads/${u.id}` })),
      })),
      history: o.history.map((h) => ({ status: h.status, at: h.createdAt.toISOString() })),
    };
  }

  /**
   * Privacy: delete customer photos
   *  - of orders shipped/delivered/cancelled more than `retentionDays` ago,
   *  - of checkouts never paid after 7 days (the whole record is deleted),
   *  - uploaded but never ordered after 2 days.
   */
  async purgePhotos(retentionDays: number, now = new Date()) {
    const cutoff = new Date(now.getTime() - retentionDays * 86_400_000);
    const unpaidCutoff = new Date(now.getTime() - 7 * 86_400_000);
    const orphanCutoff = new Date(now.getTime() - 2 * 86_400_000);
    const due = await this.db
      .select({ id: orders.id })
      .from(orders)
      .where(
        and(
          isNull(orders.photosDeletedAt),
          or(
            and(
              inArray(orders.status, FINAL_STATUSES),
              sql`not exists (select 1 from ${orderStatusEvents} e where e.order_id = ${orders.id} and e.created_at >= ${cutoff})`,
            ),
            and(eq(orders.status, 'PENDING_PAYMENT'), lt(orders.createdAt, unpaidCutoff)),
          ),
        ),
      );
    const orderIds = due.map((o) => o.id);
    const ofOrders = orderIds.length ? inArray(uploads.orderItemId, this.db.select({ id: orderItems.id }).from(orderItems).where(inArray(orderItems.orderId, orderIds))) : undefined;
    const victims = await this.db
      .select()
      .from(uploads)
      .where(and(isNull(uploads.deletedAt), or(ofOrders, and(isNull(uploads.orderItemId), lt(uploads.createdAt, orphanCutoff)))));
    for (const u of victims) await this.storage.remove(u.fileKey).catch(() => undefined);
    const linked = victims.filter((u) => u.orderItemId).map((u) => u.id);
    const orphans = victims.filter((u) => !u.orderItemId).map((u) => u.id);
    // checkouts that were never paid: delete the whole record (personal details too) after 7 days
    const abandoned = await this.db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.status, 'PENDING_PAYMENT'), lt(orders.createdAt, unpaidCutoff)));
    const abandonedIds = abandoned.map((o) => o.id);
    await this.db.transaction(async (tx) => {
      if (linked.length) await tx.update(uploads).set({ deletedAt: now }).where(inArray(uploads.id, linked));
      if (orphans.length) await tx.delete(uploads).where(inArray(uploads.id, orphans));
      if (orderIds.length) await tx.update(orders).set({ photosDeletedAt: now }).where(inArray(orders.id, orderIds));
      if (abandonedIds.length) {
        await tx.delete(uploads).where(inArray(uploads.orderItemId, tx.select({ id: orderItems.id }).from(orderItems).where(inArray(orderItems.orderId, abandonedIds))));
        await tx.delete(orders).where(inArray(orders.id, abandonedIds));
      }
    });
    return { orders: orderIds.length, photos: victims.length, abandonedCheckoutsDeleted: abandonedIds.length };
  }
}
