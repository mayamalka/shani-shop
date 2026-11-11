import {
  NAME_RULE_MESSAGE,
  sanitizeName,
  customPriceBreakdown,
  effectivePrice,
  formatILS,
  nextPagePrice,
  personalizationSchema,
  type PageOptionDTO,
  type ProductDTO,
} from '@shani/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { PencilIcon } from '../components/Icons';
import { PagePicker } from '../components/PagePicker';
import { PhotoUpload, type UploadedPhoto } from '../components/PhotoUpload';
import { Checkbox, ErrorBox, ErrorSummary, Loading, Page, PriceTag, QuantityStepper, TextField } from '../components/ui';
import { useAdmin } from '../lib/admin';
import { trackShopEvent } from '../lib/analytics';
import { newCartKey, useCart, type CartItem } from '../lib/cart';
import { usePageOptions, useProduct } from '../lib/queries';
import { NotFoundPage } from './NotFound';

interface FormState {
  childName: string;
  parent1Name: string;
  parent2Name: string;
  photos: Partial<Record<'CHILD' | 'PARENTS', UploadedPhoto>>;
  photoConsent: boolean;
}
const EMPTY: FormState = { childName: '', parent1Name: '', parent2Name: '', photos: {}, photoConsent: false };

function Gallery({ product }: { product: ProductDTO }) {
  const [i, setI] = useState(0);
  const img = product.images[i] ?? product.images[0];
  if (!img) return <div className="aspect-[4/3] rounded-3xl bg-soft" />;
  return (
    <div>
      <img src={img.url} alt={img.alt} className="aspect-[4/3] w-full rounded-3xl object-cover" width={800} height={600} />
      {product.images.length > 1 && (
        <ul className="mt-3 grid grid-cols-5 gap-2" aria-label="תמונות נוספות">
          {product.images.map((im, idx) => (
            <li key={im.id}>
              <button
                type="button"
                onClick={() => setI(idx)}
                aria-label={`הצגת תמונה ${idx + 1} מתוך ${product.images.length}`}
                aria-current={idx === i}
                className={`block overflow-hidden rounded-xl border-[3px] ${idx === i ? 'border-burnt' : 'border-transparent'}`}
              >
                <img src={im.url} alt="" className="aspect-square w-full object-cover" loading="lazy" width={120} height={120} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ProductPage() {
  const { slug = '' } = useParams();
  const product = useProduct(slug);
  if (product.isLoading) return <Page title="טוען…"><Loading /></Page>;
  if (product.error || !product.data) {
    return (product.error as { status?: number } | null)?.status === 404 ? <NotFoundPage /> : <Page title="שגיאה"><ErrorBox error={product.error} /></Page>;
  }
  return <ProductView product={product.data} key={product.data.id} />;
}

function ProductView({ product }: { product: ProductDTO }) {
  const { items, dispatch } = useCart();
  const { admin } = useAdmin();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editKey = params.get('edit');
  const editing = editKey ? items.find((i) => i.key === editKey && i.productId === product.id) : undefined;

  const personalized = product.type !== 'SIMPLE';
  const custom = product.type === 'CUSTOM';
  const pagesQuery = usePageOptions(custom);
  const pricing = product.pricing;

  const [form, setForm] = useState<FormState>(() =>
    editing?.personalization
      ? {
          childName: editing.personalization.childName,
          parent1Name: editing.personalization.parent1Name,
          parent2Name: editing.personalization.parent2Name ?? '',
          photos: Object.fromEntries(editing.personalization.photos.map((p) => [p.role, { ...p, name: 'תמונה שהועלתה' }])),
          photoConsent: true,
        }
      : EMPTY,
  );
  const [pageIds, setPageIds] = useState<string[]>(() => editing?.pages?.map((p) => p.id) ?? []);
  const [qty, setQty] = useState(editing?.quantity ?? 1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [added, setAdded] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    trackShopEvent('view_item', { value: effectivePrice(product) / 100, items: [{ id: product.id, name: product.title, price: effectivePrice(product) / 100, quantity: 1 }] });
  }, [product]);

  // drop selected pages that are no longer offered
  const pageMap = useMemo(() => new Map((pagesQuery.data ?? []).map((p) => [p.id, p])), [pagesQuery.data]);
  useEffect(() => {
    if (pagesQuery.data) setPageIds((ids) => ids.filter((id) => pageMap.has(id)));
  }, [pagesQuery.data, pageMap]);

  const breakdown = useMemo(() => {
    if (!custom || !pricing) return null;
    const n = Math.max(pageIds.length, pricing.minPages);
    try {
      return customPriceBreakdown(Math.min(n, pricing.maxPages), pricing);
    } catch {
      return null;
    }
  }, [custom, pricing, pageIds.length]);
  const unitPrice = custom ? (breakdown?.reduce((s, l) => s + l.subtotal, 0) ?? product.price) : effectivePrice(product);

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (personalized) {
      const r = personalizationSchema.safeParse({
        childName: form.childName,
        parent1Name: form.parent1Name,
        parent2Name: form.parent2Name,
        photos: Object.values(form.photos).map(({ uploadId, token, role }) => ({ uploadId, token, role })),
      });
      if (!r.success) {
        for (const iss of r.error.issues) {
          const key = iss.path[0] === 'photos' ? (iss.message.includes('ההורים') ? 'photo-PARENTS' : 'photo-CHILD') : String(iss.path[0]);
          const empty = key === 'childName' ? !form.childName.trim() : key === 'parent1Name' ? !form.parent1Name.trim() : false;
          const msg = empty ? (key === 'childName' ? 'יש למלא את שם הילד/ה' : 'יש למלא שם של הורה אחד לפחות') : iss.message;
          e[key] ??= msg;
        }
      }
      if (!form.photoConsent) e.photoConsent = 'יש לאשר את השימוש בתמונות להכנת הספר';
    }
    if (custom && pricing && (pageIds.length < pricing.minPages || pageIds.length > pricing.maxPages)) {
      e.pages = `יש לבחור בין ${pricing.minPages} ל־${pricing.maxPages} עמודים (נבחרו ${pageIds.length})`;
    }
    return e;
  }

  function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      setAdded(false);
      requestAnimationFrame(() => document.getElementById('error-summary')?.focus());
      return;
    }
    const item: CartItem = {
      key: editing?.key ?? newCartKey(),
      productId: product.id,
      slug: product.slug,
      type: product.type,
      title: custom ? `${product.title} · ${pageIds.length} עמודים` : product.title,
      imageUrl: product.images[0]?.url ?? null,
      quantity: qty,
      unitPrice,
      ...(personalized
        ? {
            personalization: {
              childName: form.childName.trim(),
              parent1Name: form.parent1Name.trim(),
              parent2Name: form.parent2Name.trim(),
              photos: Object.values(form.photos).map(({ uploadId, token, role }) => ({ uploadId, token, role })),
            },
          }
        : {}),
      ...(custom ? { pages: pageIds.map((id) => ({ id, title: pageMap.get(id)?.title ?? '' })) } : {}),
    };
    if (editing) {
      dispatch({ type: 'replace', key: editing.key, item });
      navigate('/cart');
      return;
    }
    dispatch({ type: 'add', item });
    trackShopEvent('add_to_cart', { value: (unitPrice * qty) / 100, items: [{ id: product.id, name: product.title, price: unitPrice / 100, quantity: qty }] });
    setAdded(true);
    if (personalized) {
      setForm(EMPTY);
      setPageIds([]);
    }
    setQty(1);
    requestAnimationFrame(() => document.getElementById('added-msg')?.focus());
  }

  const count = pageIds.length;
  const formEl = (
          <form noValidate onSubmit={submit} className={custom ? 'mt-8 grid items-start gap-6 lg:grid-cols-[1fr_360px]' : 'card'} aria-label={personalized ? 'התאמה אישית והוספה לסל' : 'הוספה לסל'}>
            <div className="min-w-0">
            <ErrorSummary errors={errors} />
            {personalized && (
              <div className={custom ? 'card mb-6' : ''}>
                {custom && <h2 className="mb-3 text-xl">1. שמות ותמונות</h2>}
                <fieldset>
                  <legend className="mb-2 font-round text-lg text-burnt">שמות</legend>
                  <div className="grid gap-x-4 sm:grid-cols-2">
                    <TextField label="שם הילד/ה" required value={form.childName} onChange={(e) => setForm({ ...form, childName: e.target.value })} error={errors.childName} maxLength={40} autoComplete="off" filter={sanitizeName} filterMessage={NAME_RULE_MESSAGE} />
                    <TextField label="שם הורה" required value={form.parent1Name} onChange={(e) => setForm({ ...form, parent1Name: e.target.value })} error={errors.parent1Name} maxLength={40} autoComplete="off" hint="למשל: אמא מיכל" filter={sanitizeName} filterMessage={NAME_RULE_MESSAGE} />
                    <TextField label="שם הורה נוסף (לא חובה)" value={form.parent2Name} onChange={(e) => setForm({ ...form, parent2Name: e.target.value })} error={errors.parent2Name} maxLength={40} autoComplete="off" filter={sanitizeName} filterMessage={NAME_RULE_MESSAGE} />
                  </div>
                </fieldset>
                <fieldset className="mt-2">
                  <legend className="mb-2 font-round text-lg text-burnt">תמונות</legend>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <PhotoUpload role="CHILD" label="תמונת הילד/ה" value={form.photos.CHILD} onChange={(p) => setForm((f) => ({ ...f, photos: { ...f.photos, CHILD: p } }))} error={errors['photo-CHILD']} />
                    <PhotoUpload role="PARENTS" label="תמונת ההורים" value={form.photos.PARENTS} onChange={(p) => setForm((f) => ({ ...f, photos: { ...f.photos, PARENTS: p } }))} error={errors['photo-PARENTS']} />
                  </div>
                  <p className="hint mt-2">התמונות משמשות רק להכנת הספר, נשמרות באופן פרטי ונמחקות לאחר המשלוח.</p>
                </fieldset>
                <Checkbox
                  checked={form.photoConsent}
                  onChange={(e) => setForm({ ...form, photoConsent: e.target.checked })}
                  error={errors.photoConsent}
                  label={
                    <>
                      אני מאשר/ת שימוש בתמונות שהעליתי (כולל תמונות ילדים) לצורך הכנת הספר בלבד, בהתאם <Link to="/privacy">למדיניות הפרטיות</Link> <span className="text-sale" aria-hidden>*</span>
                    </>
                  }
                />
              </div>
            )}

            {custom && pricing && (
              <div className="mb-6">
                <h2 className="mb-3 text-xl">2. בחירת עמודים</h2>
                {pagesQuery.isLoading && <Loading />}
                {pagesQuery.error && <ErrorBox error={pagesQuery.error} />}
                {pagesQuery.data && <PagePicker pages={pagesQuery.data as PageOptionDTO[]} selected={pageIds} onChange={setPageIds} max={pricing.maxPages} error={errors.pages} />}
              </div>
            )}

            </div>
            {custom && pricing ? (
              <div ref={summaryRef} className="card sticky bottom-0 z-20 !p-3 sm:!p-5 lg:top-28 lg:bottom-auto" aria-labelledby="sum-title">
                <h2 id="sum-title" className="sr-only">
                  סיכום ומחיר
                </h2>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div aria-live="polite" aria-atomic="true">
                    <span className="font-round text-3xl text-burnt">{count}</span>
                    <span> / {pricing.maxPages} עמודים</span>
                    <span className="hint hidden sm:block">
                      מינימום {pricing.minPages} · מקסימום {pricing.maxPages}
                      {count >= pricing.minPages && nextPagePrice(count, pricing) != null && ` · עמוד נוסף: ${formatILS(nextPagePrice(count, pricing)!)}`}
                    </span>
                  </div>
                  <div className="text-end">
                    <span className="block text-2xl font-bold" aria-live="polite">
                      {formatILS(unitPrice)}
                    </span>
                    {count < pricing.minPages && <span className="hint">מחיר ל־{pricing.minPages} עמודים</span>}
                  </div>
                </div>
                <div className="mt-2 hidden h-3 overflow-hidden rounded-full bg-[#F6E3BD] lg:block" aria-hidden>
                  <div className="h-full bg-gradient-to-l from-orange to-sun" style={{ width: `${Math.min(100, (count / pricing.maxPages) * 100)}%` }} />
                </div>
                {breakdown && (
                  <details className="mt-2 hidden text-sm lg:block">
                    <summary className="cursor-pointer text-burnt">פירוט המחיר</summary>
                    <ul className="mt-1">
                      {breakdown.map((l) => (
                        <li key={l.fromPage}>
                          עמודים {l.fromPage}–{l.toPage}: {l.count} × {formatILS(l.pricePerPage)} = {formatILS(l.subtotal)}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <QuantityStepper value={qty} onChange={setQty} label="כמות ספרים" />
                  <button type="submit" className="btn flex-1">
                    {editing ? 'שמירת השינויים' : `הוספה לסל · ${formatILS(unitPrice * qty)}`}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <QuantityStepper value={qty} onChange={setQty} label="כמות" />
                <button type="submit" className="btn flex-1">
                  {editing ? 'שמירת השינויים' : `הוספה לסל · ${formatILS(unitPrice * qty)}`}
                </button>
              </div>
            )}
          </form>
  );
  return (
    <Page title={product.title} heading={false} className="!pt-4">
      <nav aria-label="פירורי לחם" className="mb-3 text-sm text-muted">
        <Link to="/shop">חנות</Link> <span aria-hidden>›</span> <span aria-current="page">{product.title}</span>
      </nav>
      <div className="grid items-start gap-8 md:grid-cols-[1fr_1.1fr]">
        <Gallery product={product} />
        <div>
          <div className="flex items-start justify-between gap-3">
            <h1 id="page-title" tabIndex={-1} className="outline-none">
              {product.title}
            </h1>
            {admin && (
              <Link to={`/admin/products/${product.id}`} className="grid h-11 w-11 flex-none place-items-center rounded-full border-2 border-burnt bg-white text-burnt no-underline" aria-label={`עריכת המוצר ${product.title}`}>
                <PencilIcon width={20} height={20} />
              </Link>
            )}
          </div>
          {product.ageLabel && <span className="pill mt-2">{product.ageLabel}</span>}
          <div className="mt-2 text-2xl">
            {custom ? <span className="font-bold">{formatILS(unitPrice)}</span> : <PriceTag price={product.price} discountPrice={product.discountPrice} discountEndsAt={product.discountEndsAt} />}
          </div>
          <p className="my-4 whitespace-pre-line">{product.description}</p>

          {added && (
            <div id="added-msg" tabIndex={-1} role="status" className="mb-4 rounded-2xl border-2 border-ok bg-[#e9f6ec] p-4 text-ok">
              <b>✓ נוסף לסל!</b>{' '}
              <Link to="/cart" className="font-bold text-ok">
                מעבר לסל הקניות
              </Link>{' '}
              · או המשיכו לבחור
            </div>
          )}

          {!custom && formEl}
        </div>
      </div>
      {custom && formEl}
    </Page>
  );
}
