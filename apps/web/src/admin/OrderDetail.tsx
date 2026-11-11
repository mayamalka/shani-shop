import { DELIVERY_LABELS, formatILS, ORDER_STATUS_LABELS, type OrderDetailDTO, type OrderStatus } from '@shani/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Checkbox, ErrorBox, Loading } from '../components/ui';
import { api } from '../lib/api';
import { StatusBadge } from './Orders';

const ACTIONS: { status: OrderStatus; label: string; primary?: boolean }[] = [
  { status: 'IN_PROGRESS', label: 'סימון "בטיפול"', primary: true },
  { status: 'SHIPPED', label: 'סימון "יצאה למשלוח"', primary: true },
  { status: 'DELIVERED', label: 'סימון "הושלמה"' },
  { status: 'PAID', label: 'החזרה ל"שולמה – ממתינה"' },
  { status: 'CANCELLED', label: 'ביטול הזמנה' },
];

const when = (iso: string) => new Date(iso).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });

/** One order, shown next to the orders list (or alone on a phone). */
export function OrderPanel({ id, backTo, takeFocus }: { id: string; backTo: string; takeFocus?: () => boolean }) {
  const qc = useQueryClient();
  const [notify, setNotify] = useState(true);
  const [msg, setMsg] = useState('');
  const order = useQuery({ queryKey: ['admin-order', id], queryFn: () => api.get<OrderDetailDTO>(`/api/admin/orders/${id}`) });
  const change = useMutation({
    mutationFn: (status: OrderStatus) => api.post<OrderDetailDTO>(`/api/admin/orders/${id}/status`, { status, notifyCustomer: notify }),
    onSuccess: (o) => {
      qc.setQueryData(['admin-order', id], o);
      qc.invalidateQueries({ queryKey: ['admin-orders'] });
      setMsg(`הסטטוס עודכן ל"${ORDER_STATUS_LABELS[o.status]}"${notify ? ' ונשלח מייל ללקוח/ה' : ''}`);
    },
  });

  // opened from the list → move focus (and the screen) to this order so it is announced; not on a direct page load
  const headingRef = useRef<HTMLHeadingElement>(null);
  const loadedId = order.data?.id;
  useEffect(() => {
    if (!loadedId) return;
    setMsg('');
    if (takeFocus?.()) headingRef.current?.focus();
  }, [loadedId, takeFocus]);

  if (order.isLoading) return <Loading />;
  if (order.error || !order.data) return <ErrorBox error={order.error} />;
  const o = order.data;

  return (
    <section aria-labelledby="order-panel-title" data-testid="order-panel">
      <Link to={backTo} className="mb-3 inline-block md:hidden">
        → חזרה לרשימת ההזמנות
      </Link>
      <h2 id="order-panel-title" ref={headingRef} tabIndex={-1} className="mb-4 flex flex-wrap items-center gap-3 text-2xl outline-none">
        הזמנה #{o.number} <StatusBadge status={o.status} />
      </h2>
      <div className="grid items-start gap-5">
        <div className="grid gap-5">
          <section className="card" aria-labelledby="status-h">
            <h3 id="status-h" className="mb-3 text-xl">
              עדכון סטטוס
            </h3>
            {change.error && <ErrorBox error={change.error} />}
            <p role="status" className="mb-2 text-ok">
              {msg}
            </p>
            <div className="grid gap-2">
              {ACTIONS.filter((a) => a.status !== o.status).map((a) => (
                <button key={a.status} type="button" className={a.primary ? 'btn' : a.status === 'CANCELLED' ? 'btn-danger' : 'btn-secondary'} disabled={change.isPending} onClick={() => {
                  if (a.status === 'CANCELLED' && !window.confirm('לבטל את ההזמנה? (ההחזר הכספי מתבצע בממשק חברת הסליקה)')) return;
                  setMsg('');
                  change.mutate(a.status);
                }}>
                  {a.label}
                </button>
              ))}
            </div>
            <Checkbox checked={notify} onChange={(e) => setNotify(e.target.checked)} label="לשלוח ללקוח/ה מייל עדכון" />
          </section>
          <section className="card" aria-labelledby="cust">
            <h3 id="cust" className="mb-2 text-xl">
              לקוח/ה ומשלוח
            </h3>
            <p>
              <b>{o.fullName}</b> · <a href={`tel:${o.phone}`} dir="ltr">{o.phone}</a> · <a href={`mailto:${o.email}`}>{o.email}</a>
            </p>
            <p>
              {DELIVERY_LABELS[o.deliveryMethod]}
              {o.deliveryMethod === 'SHIPPING' && `: ${o.street} ${o.houseNumber}${o.apartment ? `, דירה ${o.apartment}` : ''}, ${o.city}`}
            </p>
            {o.notes && <p className="mt-1">הערות: {o.notes}</p>}
            <p className="hint mt-1">
              הוזמן {when(o.createdAt)}
              {o.paidAt && ` · שולם ${when(o.paidAt)}`}
              {o.paymentRef && ` · אסמכתא ${o.paymentRef}`}
              {o.marketingOptIn && ' · אישר/ה דיוור'}
            </p>
          </section>

          {o.items.map((it) => (
            <section key={it.id} className="card" aria-label={it.title}>
              <h3 className="mb-1 text-xl">
                {it.title} × {it.quantity}
              </h3>
              <p className="hint mb-2">
                {formatILS(it.unitPrice)} ליחידה · {formatILS(it.unitPrice * it.quantity)}
              </p>
              {it.childName && (
                <p>
                  <b>שמות:</b> {it.childName} (ילד/ה) · {it.parent1Name}
                  {it.parent2Name && ` · ${it.parent2Name}`}
                </p>
              )}
              {it.pages.length > 0 && (
                <div className="mt-2">
                  <b>עמודים ({it.pages.length}):</b>
                  <ol className="mt-1 list-decimal ps-6 text-[0.95rem]">
                    {it.pages.map((p) => (
                      <li key={p.id}>{p.title}</li>
                    ))}
                  </ol>
                </div>
              )}
              {it.productType !== 'SIMPLE' && (
                <div className="mt-3">
                  <b>תמונות:</b>
                  {o.photosDeletedAt ? (
                    <p className="hint">התמונות נמחקו ב־{when(o.photosDeletedAt)} (מדיניות פרטיות).</p>
                  ) : (
                    <ul className="mt-2 flex flex-wrap gap-3">
                      {it.photos.map((ph) => (
                        <li key={ph.id} className="text-center">
                          <a href={ph.url} target="_blank" rel="noopener noreferrer">
                            <img src={ph.url} alt={ph.role === 'CHILD' ? `תמונת ${it.childName ?? 'הילד/ה'}` : 'תמונת ההורים'} className="h-28 w-28 rounded-xl border-2 border-line object-cover" width={112} height={112} loading="lazy" />
                          </a>
                          <a href={`${ph.url}?download=1`} className="mt-1 block text-sm" download>
                            ⬇ הורדה<span className="sr-only"> – {ph.role === 'CHILD' ? 'תמונת הילד/ה' : 'תמונת ההורים'}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </section>
          ))}
        </div>

        <div className="grid gap-5">
          <section className="card" aria-labelledby="sum-h">
            <h3 id="sum-h" className="mb-2 text-xl">
              סכומים
            </h3>
            <dl>
              <div className="flex justify-between"><dt>מוצרים</dt><dd>{formatILS(o.subtotal)}</dd></div>
              <div className="flex justify-between"><dt>משלוח</dt><dd>{formatILS(o.shipping)}</dd></div>
              {o.vatIncluded > 0 && <div className="flex justify-between"><dt>מתוכם מע״מ</dt><dd>{formatILS(o.vatIncluded)}</dd></div>}
              <div className="mt-1 flex justify-between border-t-2 border-dashed border-line pt-2 text-lg font-bold"><dt>סה״כ</dt><dd>{formatILS(o.total)}</dd></div>
            </dl>
          </section>
          <section className="card" aria-labelledby="hist-h">
            <h3 id="hist-h" className="mb-2 text-xl">
              היסטוריה
            </h3>
            <ol className="text-[0.95rem]">
              {o.history.map((h, i) => (
                <li key={i} className="flex justify-between gap-2 border-b border-dashed border-line py-1 last:border-0">
                  <span>{ORDER_STATUS_LABELS[h.status]}</span>
                  <span className="text-muted">{when(h.at)}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </section>
  );
}
