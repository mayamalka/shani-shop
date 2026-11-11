import { formatILS } from '@shani/shared';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { thumbUrl } from '../components/PhotoUpload';
import { ErrorBox, Page, QuantityStepper } from '../components/ui';
import { useCart, type CartItem } from '../lib/cart';
import { useQuote } from '../lib/useQuote';

function ItemOptions({ item }: { item: CartItem }) {
  const p = item.personalization;
  return (
    <dl className="text-[0.95rem] leading-relaxed text-muted">
      {p && (
        <>
          <div>
            <dt className="inline font-medium text-brown">שמות: </dt>
            <dd className="inline">{[p.childName, p.parent1Name, p.parent2Name].filter(Boolean).join(' · ')}</dd>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <dt className="font-medium text-brown">תמונות:</dt>
            {p.photos.map((ph) => (
              <dd key={ph.uploadId}>
                <img src={thumbUrl(ph)} alt={ph.role === 'CHILD' ? 'תמונת הילד/ה' : 'תמונת ההורים'} className="h-10 w-10 rounded-lg border-2 border-white object-cover shadow-[0_0_0_1px_var(--color-line)]" width={40} height={40} />
              </dd>
            ))}
          </div>
        </>
      )}
      {item.pages && item.pages.length > 0 && (
        <div>
          <dt className="inline font-medium text-brown">עמודים ({item.pages.length}): </dt>
          <dd className="inline">{item.pages.map((x) => x.title).join(', ')}</dd>
        </div>
      )}
    </dl>
  );
}

export const UNDO_SECONDS = 8;

/** "Removed – undo" notice. Stays a few seconds; pressing the button puts the item back. */
function UndoToast({ removed, onUndo, onDone }: { removed: { item: CartItem; index: number }; onUndo: () => void; onDone: () => void }) {
  const [left, setLeft] = useState(UNDO_SECONDS);
  useEffect(() => {
    const t = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (left <= 0) onDone();
  }, [left, onDone]);
  return (
    <div role="status" className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-brown px-4 py-3 text-white shadow-lg" data-testid="undo-toast">
      <span className="flex-1">
        <b>{removed.item.title}</b> הוסר מהסל
      </span>
      <button type="button" className="rounded-full bg-white px-4 py-1.5 font-bold text-burnt" onClick={onUndo}>
        ביטול ההסרה <span aria-hidden>({left})</span>
      </button>
    </div>
  );
}

export function CartPage() {
  const { items, count, dispatch } = useCart();
  const [removed, setRemoved] = useState<{ item: CartItem; index: number; id: number } | null>(null);
  const removeSeq = useRef(0);
  const remove = (item: CartItem, index: number) => {
    dispatch({ type: 'remove', key: item.key });
    setRemoved({ item, index, id: ++removeSeq.current });
  };
  const undo = () => {
    if (!removed) return;
    dispatch({ type: 'restore', item: removed.item, index: removed.index });
    setRemoved(null);
    requestAnimationFrame(() => document.getElementById('page-title')?.focus());
  };
  const toast = removed && <UndoToast key={removed.id} removed={removed} onUndo={undo} onDone={() => setRemoved(null)} />;
  const quote = useQuote(items, 'SHIPPING');
  const navigate = useNavigate();
  const q = quote.data;
  const lineFor = (i: number) => q?.lines.find((l) => l.index === i);
  const problemFor = (i: number) => q?.problems.find((p) => p.index === i)?.message;
  const blocked = !q || q.problems.length > 0 || quote.isFetching;

  if (items.length === 0) {
    return (
      <Page title="סל הקניות">
        <div className="card py-10 text-center">
          <p className="mb-4 text-lg">הסל ריק כרגע.</p>
          <Link to="/shop" className="btn">
            לחנות ←
          </Link>
        </div>
        {toast}
      </Page>
    );
  }

  return (
    <Page title="סל הקניות" heading={<>סל הקניות <span className="text-xl text-muted">({count} פריטים)</span></>}>
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
        <section aria-label="פריטים בסל" className="card !p-0">
          <ul>
            {items.map((item, i) => {
              const line = lineFor(i);
              const problem = problemFor(i);
              return (
                <li key={item.key} className="grid grid-cols-[84px_1fr] gap-4 border-b-2 border-dashed border-line p-4 last:border-b-0 sm:grid-cols-[120px_1fr_auto] md:p-5" data-testid="cart-item">
                  <div className="aspect-square overflow-hidden rounded-2xl bg-soft">{item.imageUrl && <img src={item.imageUrl} alt="" className="h-full w-full object-cover" width={120} height={120} />}</div>
                  <div className="min-w-0">
                    <h2 className="mb-1 text-lg">
                      <Link to={`/shop/${item.slug}`} className="no-underline">
                        {item.title}
                      </Link>
                    </h2>
                    <ItemOptions item={item} />
                    {item.type !== 'SIMPLE' && (
                      <Link to={`/shop/${item.slug}?edit=${item.key}`} className="mt-1 inline-block text-sm">
                        עריכת ההתאמה האישית<span className="sr-only"> של {item.title}</span>
                      </Link>
                    )}
                    {problem && (
                      <p role="alert" className="error-text">
                        {problem}
                      </p>
                    )}
                  </div>
                  <div className="col-span-2 flex items-center justify-between gap-3 sm:col-span-1 sm:flex-col sm:items-end">
                    <span className="text-lg font-bold" data-testid="line-total">
                      {line ? formatILS(line.lineTotal) : '—'}
                      {line?.regularUnitPrice != null && (
                        <s className="ms-2 text-sm font-medium text-sale">
                          <span className="sr-only">במקום </span>
                          {formatILS(line.regularUnitPrice * line.quantity)}
                        </s>
                      )}
                    </span>
                    <QuantityStepper value={item.quantity} onChange={(n) => dispatch({ type: 'setQuantity', key: item.key, quantity: n })} label={`כמות – ${item.title}`} />
                    <button type="button" className="text-sm font-medium text-sale underline" onClick={() => remove(item, i)}>
                      הסרה<span className="sr-only"> של {item.title} מהסל</span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <aside className="card lg:sticky lg:top-28" aria-labelledby="summary-title">
          <h2 id="summary-title" className="mb-3">
            סיכום הזמנה
          </h2>
          {quote.error && <ErrorBox error={quote.error} />}
          <dl className="text-[1.05rem]" aria-live="polite" aria-busy={quote.isFetching}>
            <div className="flex justify-between py-1.5">
              <dt>סכום ביניים</dt>
              <dd>{q ? formatILS(q.subtotal) : '…'}</dd>
            </div>
            <div className="flex justify-between py-1.5">
              <dt>משלוח</dt>
              <dd>{q ? formatILS(q.shipping) : '…'}</dd>
            </div>
            <div className="mt-2 flex justify-between border-t-2 border-dashed border-line pt-3 text-xl font-bold">
              <dt>סה״כ לתשלום</dt>
              <dd data-testid="cart-total">{q ? formatILS(q.total) : '…'}</dd>
            </div>
          </dl>
          <p className="hint mt-2">
            איסוף עצמי ללא עלות – בחירה בשלב הבא.
            {q?.taxStatus === 'PATUR' ? ' עוסק פטור – המחירים אינם כוללים מע״מ.' : q ? ` המחירים כוללים מע״מ (${formatILS(q.vatIncluded)}).` : ''}
          </p>
          <button type="button" className="btn mt-4 w-full" disabled={blocked} onClick={() => navigate('/checkout')}>
            המשך לתשלום ←
          </button>
          <Link to="/shop" className="btn-secondary mt-2 w-full">
            המשך קנייה
          </Link>
        </aside>
      </div>
      {toast}
    </Page>
  );
}
