import { formatILS } from '@shani/shared';
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { orders as ordersTable } from '../db/schema';
import { esc } from '../lib/email';
import { notFound } from '../lib/http';
import { MockPaymentProvider } from '../lib/payments';

export const paymentRoutes: FastifyPluginAsync = async (app) => {
  const { db, orders, payments, cfg } = app.ctx;

  // Real providers call this server-to-server when a payment completes.
  app.post<{ Params: { provider: string } }>('/webhook/:provider', async (req, reply) => {
    if (req.params.provider !== payments.name) throw notFound();
    const result = await payments.parseWebhook(req.headers, req.body);
    if (!result) return reply.status(401).send({ error: 'BAD_SIGNATURE' });
    if (result.outcome === 'PAID') await orders.markPaid(result.orderId, result.providerRef);
    return { ok: true };
  });

  if (!(payments instanceof MockPaymentProvider)) return;
  const mock = payments;

  // ---- Development only: a fake "secure payment page" standing in for Grow/PayPlus/Cardcom ----
  app.get<{ Params: { orderId: string }; Querystring: { sig?: string } }>('/mock/:orderId', async (req, reply) => {
    const { orderId } = req.params;
    if (!mock.pageSignatureOk(orderId, req.query.sig ?? '')) throw notFound();
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
    if (!order) throw notFound();
    const sig = esc(req.query.sig ?? '');
    const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>תשלום מאובטח (הדמיה)</title>
<style>body{font-family:Arial,sans-serif;background:#eef2f7;color:#1d2433;margin:0;display:grid;place-items:center;min-height:100vh}
main{background:#fff;border-radius:16px;padding:28px;max-width:420px;width:calc(100% - 32px);box-shadow:0 8px 30px rgba(0,0,0,.08)}
h1{font-size:20px;margin:0 0 6px}.amount{font-size:34px;font-weight:700;margin:14px 0}
.note{background:#fff6d6;border:1px solid #f0d27a;border-radius:10px;padding:10px;font-size:14px}
button{width:100%;padding:14px;border-radius:10px;border:0;font-size:17px;font-weight:700;margin-top:12px;cursor:pointer}
.pay{background:#1a56db;color:#fff}.cancel{background:#e5e7eb;color:#1d2433}
button:focus-visible{outline:3px solid #f59e0b;outline-offset:2px}</style></head>
<body><main><h1>עמוד תשלום מאובטח</h1><p>הזמנה ${order.number} · הדודה שני</p>
<div class="amount" aria-label="סכום לתשלום">${esc(formatILS(order.total))}</div>
<p class="note">זהו עמוד <strong>הדמיה</strong> לסביבת פיתוח. באתר האמיתי כאן יופיע עמוד התשלום של חברת הסליקה (אשראי, Bit, Apple Pay, Google Pay).</p>
<form method="post" action="${esc(cfg.API_URL)}/api/payments/mock/${esc(orderId)}">
<input type="hidden" name="sig" value="${sig}">
<button class="pay" name="action" value="pay" type="submit">אישור תשלום</button>
<button class="cancel" name="action" value="cancel" type="submit">ביטול וחזרה לאתר</button>
</form></main></body></html>`;
    return reply.type('text/html; charset=utf-8').send(html);
  });

  app.post<{ Params: { orderId: string }; Body: { sig?: string; action?: string } }>('/mock/:orderId', async (req, reply) => {
    const { orderId } = req.params;
    if (!mock.pageSignatureOk(orderId, req.body?.sig ?? '')) throw notFound();
    if (req.body?.action !== 'pay') return reply.redirect(`${cfg.WEB_URL}/checkout/cancelled`, 303);
    const order = await orders.markPaid(orderId, `MOCK-${Date.now()}`);
    return reply.redirect(`${cfg.WEB_URL}/checkout/success?order=${order.number}`, 303);
  });
};
