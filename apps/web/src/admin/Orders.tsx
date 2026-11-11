import { formatILS, ORDER_STATUS_LABELS, type OrderStatus, type OrderSummaryDTO } from '@shani/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { OrderPanel } from './OrderDetail';
import { ErrorBox, Loading, Page } from '../components/ui';
import { api } from '../lib/api';

export const STATUS_STYLE: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'bg-[#eee] text-[#444]',
  PAID: 'bg-[#E3F1FF] text-[#174D8C]',
  IN_PROGRESS: 'bg-[#FFF1C9] text-[#6B4800]',
  SHIPPED: 'bg-[#DDF3E2] text-[#1E6B35]',
  DELIVERED: 'bg-[#E9E3F7] text-[#4B2A85]',
  CANCELLED: 'bg-[#FDE2E1] text-[#9B1C1C]',
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`inline-block rounded-full px-3 py-0.5 text-sm font-bold whitespace-nowrap ${STATUS_STYLE[status]}`}>{ORDER_STATUS_LABELS[status]}</span>;
}

const TABS: { key: OrderStatus | 'ALL'; label: string }[] = [
  { key: 'ALL', label: 'הכל' },
  { key: 'PAID', label: ORDER_STATUS_LABELS.PAID },
  { key: 'IN_PROGRESS', label: ORDER_STATUS_LABELS.IN_PROGRESS },
  { key: 'SHIPPED', label: ORDER_STATUS_LABELS.SHIPPED },
  { key: 'DELIVERED', label: ORDER_STATUS_LABELS.DELIVERED },
  { key: 'CANCELLED', label: ORDER_STATUS_LABELS.CANCELLED },
];

interface ListResponse {
  orders: OrderSummaryDTO[];
  total: number;
  page: number;
  pageSize: number;
  counts: Partial<Record<OrderStatus, number>>;
}

const date = (iso: string) => new Date(iso).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Orders list + the selected order beside it (on phones: one at a time). */
export default function AdminOrders() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const qs = params.toString() ? `?${params}` : '';
  const orderHref = (orderId: string) => `/admin/orders/${orderId}${qs}`;
  // an order picked from the list gets focus (and is scrolled into view); a direct page load does not
  const pickedFromList = useRef(false);
  const takeFocus = useCallback(() => {
    const v = pickedFromList.current;
    pickedFromList.current = false;
    return v;
  }, []);
  const status = (params.get('status') as OrderStatus | null) ?? 'ALL';
  const page = Number(params.get('page') ?? 1);
  const [search, setSearch] = useState(params.get('q') ?? '');
  const q = params.get('q') ?? '';

  // search as you type (debounced)
  useEffect(() => {
    const t = setTimeout(() => {
      if (search !== q) setParams((p) => { const n = new URLSearchParams(p); if (search) n.set('q', search); else n.delete('q'); n.delete('page'); return n; }, { replace: true });
    }, 350);
    return () => clearTimeout(t);
  }, [search, q, setParams]);

  const list = useQuery({
    queryKey: ['admin-orders', status, q, page],
    queryFn: () => api.get<ListResponse>(`/api/admin/orders?${new URLSearchParams({ ...(status !== 'ALL' ? { status } : {}), ...(q ? { q } : {}), page: String(page) })}`),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
  const counts = list.data?.counts ?? {};
  const all = Object.values(counts).reduce((s, n) => s + (n ?? 0), 0);
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;

  const setStatus = (s: string) => setParams((p) => { const n = new URLSearchParams(p); if (s === 'ALL') n.delete('status'); else n.set('status', s); n.delete('page'); return n; });

  return (
    <Page title={id ? 'פרטי הזמנה' : 'הזמנות'} heading="הזמנות" className="max-w-7xl">
      <div className={id ? 'md:grid md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:items-start md:gap-6' : ''}>
      <div
        className={id ? 'hidden md:block' : ''}
        data-orders-list
        onClickCapture={(e) => {
          if ((e.target as HTMLElement).closest('a[href^="/admin/orders/"]')) pickedFromList.current = true;
        }}
      >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div role="group" aria-label="סינון לפי סטטוס" className="flex flex-wrap gap-2">
          {TABS.map((t) => {
            const n = t.key === 'ALL' ? all : (counts[t.key] ?? 0);
            return (
              <button key={t.key} type="button" className="chip" aria-pressed={status === t.key} onClick={() => setStatus(t.key)} data-testid={`tab-${t.key}`}>
                {t.label} <span className="ms-1 rounded-full bg-soft px-2 text-xs">{n}</span>
              </button>
            );
          })}
        </div>
        <label className="w-full max-w-xs">
          <span className="sr-only">חיפוש הזמנה</span>
          <input type="search" className="input" placeholder="🔍 שם, טלפון, אימייל או מספר הזמנה" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>

      {list.isLoading && <Loading />}
      {list.error && <ErrorBox error={list.error} />}
      {list.data && list.data.orders.length === 0 && <p className="card text-center text-muted">אין הזמנות להצגה.</p>}

      {list.data && list.data.orders.length > 0 && (
        <>
          {/* desktop table */}
          <div className={`card !p-2 ${id ? 'hidden' : 'hidden md:block'}`}>
            <table className="w-full border-collapse text-[0.95rem]">
              <caption className="sr-only">רשימת הזמנות</caption>
              <thead>
                <tr className="border-b-2 border-dashed border-line text-right text-muted">
                  <th scope="col" className="p-2 font-medium">#</th>
                  <th scope="col" className="p-2 font-medium">לקוח/ה</th>
                  <th scope="col" className="p-2 font-medium">תאריך</th>
                  <th scope="col" className="p-2 font-medium">פריטים</th>
                  <th scope="col" className="p-2 font-medium">סה״כ</th>
                  <th scope="col" className="p-2 font-medium">סטטוס</th>
                </tr>
              </thead>
              <tbody>
                {list.data.orders.map((o) => (
                  <tr key={o.id} className="border-b border-[#F6E8CC] hover:bg-[#FFF4E2]" data-testid="order-row">
                    <td className="p-2">
                      <Link to={orderHref(o.id)} className="font-bold">
                        {o.number}
                      </Link>
                    </td>
                    <td className="p-2">{o.fullName}</td>
                    <td className="p-2">{date(o.createdAt)}</td>
                    <td className="p-2">{o.itemCount}</td>
                    <td className="p-2">{formatILS(o.total)}</td>
                    <td className="p-2">
                      <StatusBadge status={o.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* phone cards */}
          <ul className={`grid gap-3 ${id ? '' : 'md:hidden'}`}>
            {list.data.orders.map((o) => (
              <li key={o.id} data-testid="order-card">
                <Link
                  to={orderHref(o.id)}
                  aria-current={o.id === id ? 'true' : undefined}
                  className={`card block !p-4 text-brown no-underline ${o.id === id ? '!border-solid !border-burnt !bg-[#FFF4E2]' : ''}`}
                >
                  <span className="flex items-center justify-between">
                    <b className="text-burnt">#{o.number}</b>
                    <StatusBadge status={o.status} />
                  </span>
                  <span className="mt-1 block">{o.fullName}</span>
                  <span className="hint block">
                    {date(o.createdAt)} · {o.itemCount} פריטים · {formatILS(o.total)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <nav aria-label="דפדוף" className="mt-4 flex items-center justify-center gap-3">
              <button className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => setParams((p) => { const n = new URLSearchParams(p); n.set('page', String(page - 1)); return n; })}>
                הקודם
              </button>
              <span>
                עמוד {page} מתוך {pages}
              </span>
              <button className="btn-secondary btn-sm" disabled={page >= pages} onClick={() => setParams((p) => { const n = new URLSearchParams(p); n.set('page', String(page + 1)); return n; })}>
                הבא
              </button>
            </nav>
          )}
        </>
      )}
      </div>
      {id && (
        <div className="md:sticky md:top-28 md:max-h-[calc(100dvh-8rem)] md:overflow-y-auto md:rounded-[var(--radius-card)] md:border-2 md:border-dashed md:border-line md:bg-paper md:p-5">
          <OrderPanel id={id} backTo={`/admin/orders${qs}`} takeFocus={takeFocus} />
        </div>
      )}
      </div>
    </Page>
  );
}
