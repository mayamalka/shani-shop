import type { DB } from '../db';
import type { Order, OrderItem } from '../db/schema';
import { DELIVERY_LABELS, formatILS, ORDER_STATUS_LABELS, type ContactInput } from '@shani/shared';
import type { FastifyBaseLogger } from 'fastify';
import { esc, layout, p, table, type EmailProvider } from '../lib/email';
import { getSettings } from './catalog';

const STATUS_MESSAGES: Partial<Record<Order['status'], string>> = {
  IN_PROGRESS: 'התחלנו לתפור את הספר שלכם! נעדכן כשהוא יוצא לדרך.',
  SHIPPED: 'ההזמנה יצאה למשלוח 🚚 (או מוכנה לאיסוף, אם בחרתם באיסוף עצמי).',
  DELIVERED: 'ההזמנה הושלמה. תודה שבחרתם בהדודה שני 💛',
  CANCELLED: 'ההזמנה בוטלה. אם זו טעות – נשמח שתצרו קשר.',
};

/** Emails never block the main action: failures are logged, not thrown. */
export class Notifier {
  constructor(
    private db: DB,
    private email: EmailProvider,
    private log: FastifyBaseLogger,
    private webUrl: string,
  ) {}

  private async safeSend(what: string, fn: () => Promise<void>) {
    try {
      await fn();
    } catch (err) {
      this.log.error({ err }, `email failed: ${what}`);
    }
  }

  async orderPaid(order: Order & { items: OrderItem[] }) {
    const s = await getSettings(this.db);
    const rows: [string, string][] = order.items.map((i) => [`${i.title} × ${i.quantity}`, formatILS(i.unitPrice * i.quantity)]);
    rows.push([DELIVERY_LABELS[order.deliveryMethod], formatILS(order.shipping)], ['סה״כ', formatILS(order.total)]);
    const delivery =
      order.deliveryMethod === 'SHIPPING'
        ? `משלוח אל: ${order.street} ${order.houseNumber}${order.apartment ? ', דירה ' + order.apartment : ''}, ${order.city}`
        : `איסוף עצמי${s.pickupAddress ? ': ' + s.pickupAddress : ''} – נתאם איתך מועד`;

    await this.safeSend('order confirmation', () =>
      this.email.send({
        to: order.email,
        replyTo: s.businessEmail,
        subject: `תודה! הזמנה ${order.number} התקבלה – הדודה שני`,
        html: layout(`תודה ${order.fullName}, ההזמנה התקבלה!`, p(`מספר הזמנה: ${order.number}`) + table(rows) + p(delivery) + p('כל ספר נתפר במיוחד עבורכם – זמן ההכנה כ־3 שבועות. נעדכן במייל בכל שלב.')),
        text: `תודה ${order.fullName}! הזמנה ${order.number} התקבלה. סה״כ ${formatILS(order.total)}. ${delivery}`,
      }),
    );
    await this.safeSend('new order alert', () =>
      this.email.send({
        to: s.businessEmail,
        replyTo: order.email,
        subject: `🧵 הזמנה חדשה ${order.number} – ${order.fullName} – ${formatILS(order.total)}`,
        html: layout(`הזמנה חדשה ${order.number}`, p(`${order.fullName} · ${order.phone} · ${order.email}`) + table(rows) + p(delivery) + `<p><a href="${esc(this.webUrl)}/admin/orders/${esc(order.id)}">לפרטי ההזמנה בניהול</a></p>`),
        text: `הזמנה חדשה ${order.number} מ־${order.fullName}, ${formatILS(order.total)}`,
      }),
    );
  }

  async statusChanged(order: Order) {
    const msg = STATUS_MESSAGES[order.status];
    if (!msg) return;
    const s = await getSettings(this.db);
    await this.safeSend('status update', () =>
      this.email.send({
        to: order.email,
        replyTo: s.businessEmail,
        subject: `עדכון להזמנה ${order.number}: ${ORDER_STATUS_LABELS[order.status]}`,
        html: layout(`עדכון להזמנה ${order.number}`, p(`היי ${order.fullName},`) + p(msg)),
        text: `היי ${order.fullName}, ${msg}`,
      }),
    );
  }

  /** Contact form → business inbox (reply goes straight to the customer). Throws so the form can report failure. */
  async contact(input: ContactInput) {
    const s = await getSettings(this.db);
    await this.email.send({
      to: s.businessEmail,
      replyTo: input.email,
      subject: `פנייה מהאתר: ${input.subject}`,
      html: layout(`פנייה חדשה: ${input.subject}`, p(`מאת: ${input.email}`) + `<div style="white-space:pre-wrap;line-height:1.6">${esc(input.message)}</div>`),
      text: `מאת: ${input.email}\n\n${input.message}`,
    });
  }
}
