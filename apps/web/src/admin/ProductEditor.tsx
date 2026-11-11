import { customBookPrice, formatILS, validateTiers, type ProductDTO } from '@shani/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Checkbox, ErrorBox, Loading, Page, PriceTag, TextArea, TextField } from '../components/ui';
import { api, ApiError } from '../lib/api';

export const toAgorot = (s: string): number | null => {
  const n = Number(String(s).replace(',', '.').trim());
  return s.trim() === '' || !Number.isFinite(n) || n < 0 ? null : Math.round(n * 100);
};
const toShekelStr = (a: number | null | undefined) => (a == null ? '' : String(a / 100));
const dateOnly = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-CA') : '');

interface Form {
  title: string;
  description: string;
  ageLabel: string;
  price: string;
  discountPrice: string;
  discountEndsAt: string;
  active: boolean;
  sortOrder: string;
  /** customer enters child + parent names and uploads photos (PRESET) – or a plain product (SIMPLE) */
  personalized: boolean;
}

/** photos chosen for a product that isn't saved yet – uploaded right after it's created */
interface PendingImage {
  file: File;
  url: string;
  alt: string;
}

function fromProduct(p?: ProductDTO): Form {
  return {
    title: p?.title ?? '',
    description: p?.description ?? '',
    ageLabel: p?.ageLabel ?? '',
    price: toShekelStr(p?.price),
    discountPrice: toShekelStr(p?.discountPrice),
    discountEndsAt: dateOnly(p?.discountEndsAt ?? null),
    active: p?.active ?? true,
    sortOrder: String(p?.sortOrder ?? 10),
    personalized: p ? p.type !== 'SIMPLE' : false,
  };
}

export default function AdminProductEditor() {
  const { id } = useParams();
  const isNew = !id;
  const product = useQuery({ queryKey: ['admin-product', id], queryFn: () => api.get<ProductDTO>(`/api/admin/products/${id}`), enabled: !isNew });
  if (!isNew && product.isLoading) return <Page title="עריכת מוצר"><Loading /></Page>;
  if (!isNew && (product.error || !product.data)) return <Page title="עריכת מוצר"><ErrorBox error={product.error} /></Page>;
  return <Editor product={product.data} key={product.data?.id ?? 'new'} />;
}

function Editor({ product }: { product?: ProductDTO }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [f, setF] = useState<Form>(() => fromProduct(product));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState(() => {
    const m = sessionStorage.getItem('shani:product-msg');
    sessionStorage.removeItem('shani:product-msg');
    return m ?? '';
  });
  const [pending, setPending] = useState<PendingImage[]>([]);
  const custom = product?.type === 'CUSTOM';
  useEffect(() => () => pending.forEach((p) => URL.revokeObjectURL(p.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = (p: ProductDTO) => {
    qc.setQueryData(['admin-product', p.id], p);
    qc.invalidateQueries({ queryKey: ['admin-products'] });
    qc.invalidateQueries({ queryKey: ['products'] });
    qc.invalidateQueries({ queryKey: ['product', p.slug] });
  };

  const save = useMutation({
    mutationFn: async (body: unknown) => {
      if (product) return api.put<ProductDTO>(`/api/admin/products/${product.id}`, body);
      let created = await api.post<ProductDTO>('/api/admin/products', body);
      // new product: upload the photos chosen in the form, in order (a failed photo never blocks the saved product)
      let failed = 0;
      for (const [i, img] of pending.entries()) {
        setMsg(`מעלה תמונה ${i + 1} מתוך ${pending.length}…`);
        const fd = new FormData();
        fd.append('alt', img.alt);
        fd.append('file', img.file);
        try {
          created = await api.post<ProductDTO>(`/api/admin/products/${created.id}/images`, fd);
        } catch {
          failed++;
        }
      }
      if (failed) sessionStorage.setItem('shani:product-msg', `המוצר נשמר, אבל ${failed} תמונות לא הועלו – אפשר להוסיף אותן כאן למטה.`);
      return created;
    },
    onSuccess: (p) => {
      refresh(p);
      setMsg('נשמר ✓');
      if (!product) {
        pending.forEach((x) => URL.revokeObjectURL(x.url));
        setPending([]);
        navigate(`/admin/products/${p.id}`, { replace: true });
      }
    },
    onError: (e) => {
      if (e instanceof ApiError) setErrors(e.fieldErrors());
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    const errs: Record<string, string> = {};
    const price = custom ? product!.price : toAgorot(f.price);
    const discount = f.discountPrice.trim() ? toAgorot(f.discountPrice) : null;
    if (!f.title.trim()) errs.title = 'יש למלא כותרת';
    if (price == null) errs.price = 'מחיר לא תקין';
    if (f.discountPrice.trim() && discount == null) errs.discountPrice = 'מחיר מבצע לא תקין';
    if (discount != null && price != null && discount >= price) errs.discountPrice = 'מחיר המבצע חייב להיות נמוך מהמחיר הרגיל';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    save.mutate({
      title: f.title,
      description: f.description,
      ageLabel: f.ageLabel,
      price,
      discountPrice: custom ? null : discount,
      discountEndsAt: !custom && discount != null && f.discountEndsAt ? new Date(`${f.discountEndsAt}T23:59:59`).toISOString() : null,
      active: f.active,
      sortOrder: Number(f.sortOrder) || 0,
      ...(custom ? {} : { personalized: f.personalized }),
    });
  }

  const del = useMutation({
    mutationFn: () => api.del(`/api/admin/products/${product!.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-products'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      navigate('/shop');
    },
  });

  const previewPrice = toAgorot(f.price) ?? 0;
  const previewDiscount = toAgorot(f.discountPrice);

  return (
    <Page title={product ? `עריכת מוצר: ${product.title}` : 'מוצר חדש'} className="max-w-4xl">
      <Link to="/shop" className="mb-4 inline-block">
        → חזרה לחנות
      </Link>
      <form noValidate onSubmit={submit} className="card" aria-label="פרטי המוצר">
        {save.error && !Object.keys(errors).length && <ErrorBox error={save.error} />}
        <Checkbox label="מוצג בחנות" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
        <div className="grid gap-x-4 sm:grid-cols-[2fr_1fr]">
          <TextField label="כותרת" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} error={errors.title} />
          <TextField label="תווית גיל (לא חובה)" value={f.ageLabel} onChange={(e) => setF({ ...f, ageLabel: e.target.value })} hint="למשל: גילאי 1–3" />
        </div>
        <TextArea label="תיאור" rows={4} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} error={errors.description} />
        <div className="grid gap-x-4 sm:grid-cols-2">
          {custom ? (
            <p className="mb-4">
              <b>מחיר:</b> נקבע לפי מדרגות המחיר לעמוד (למטה). מחיר התחלתי: {formatILS(product!.price)}
            </p>
          ) : (
            <TextField label="מחיר רגיל (₪)" required inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} error={errors.price} />
          )}
          <TextField label="סדר הצגה" inputMode="numeric" value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: e.target.value })} hint="מספר קטן מוצג ראשון" />
        </div>

        {!custom && (
          <fieldset className="mb-4 rounded-2xl border-2 border-line bg-white p-4">
            <legend className="px-2 font-round text-lg text-burnt">התאמה אישית</legend>
            <p className="hint mb-2">האם הלקוח צריך למלא שמות ולהעלות תמונות כשהוא מזמין את המוצר?</p>
            {[
              { v: true, title: 'כן – עם שמות ותמונות', text: 'הלקוח ימלא את שם הילד/ה ושם ההורה, ויעלה תמונה של הילד/ה ותמונה של ההורים (כמו בספרים המוכנים).' },
              { v: false, title: 'לא – מוצר רגיל', text: 'בלי פרטים נוספים, רק כמות והוספה לסל.' },
            ].map((o) => (
              <label key={String(o.v)} className={`mb-2 flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-3 ${f.personalized === o.v ? 'border-burnt bg-[#FFF4E2]' : 'border-line'}`}>
                <input type="radio" name="personalized" className="mt-1 h-5 w-5 accent-burnt" checked={f.personalized === o.v} onChange={() => setF({ ...f, personalized: o.v })} />
                <span>
                  <b>{o.title}</b>
                  <span className="hint block">{o.text}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}

        {!product && <PendingImages images={pending} onChange={setPending} />}

        {!custom && (
          <fieldset className="mb-4 rounded-2xl border-2 border-[#F3B9B0] bg-[#FFF0EE] p-4">
            <legend className="px-2 font-round text-lg text-burnt">הנחה</legend>
            <div className="grid gap-x-4 sm:grid-cols-2">
              <TextField label="מחיר מבצע (₪)" inputMode="decimal" value={f.discountPrice} onChange={(e) => setF({ ...f, discountPrice: e.target.value })} error={errors.discountPrice} hint="ריק = ללא הנחה" />
              <TextField label="בתוקף עד (לא חובה)" type="date" value={f.discountEndsAt} onChange={(e) => setF({ ...f, discountEndsAt: e.target.value })} />
            </div>
            <p className="hint">תצוגה בחנות:</p>
            <div className="text-xl">
              <PriceTag price={previewPrice} discountPrice={previewDiscount} />
            </div>
            {previewDiscount != null && previewDiscount < previewPrice && <p className="hint mt-1">בקופה ייגבה {formatILS(previewDiscount)}</p>}
            {f.discountPrice && (
              <button type="button" className="btn-danger btn-sm mt-3" onClick={() => setF({ ...f, discountPrice: '', discountEndsAt: '' })}>
                הסרת ההנחה
              </button>
            )}
          </fieldset>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button className="btn" disabled={save.isPending}>
            {save.isPending ? 'שומר…' : 'שמירה'}
          </button>
          <span role="status" className="font-bold text-ok">
            {msg}
          </span>
          {product && product.type !== 'CUSTOM' && (
            <button type="button" className="btn-danger ms-auto" disabled={del.isPending} onClick={() => window.confirm(`למחוק את "${product.title}"?`) && del.mutate()}>
              מחיקת מוצר
            </button>
          )}
        </div>
      </form>

      {product && <ImagesManager product={product} onChange={refresh} />}
      {product && custom && <PricingEditor product={product} onChange={refresh} />}
    </Page>
  );
}

/** Photo picker for a new product (before it exists on the server). */
function PendingImages({ images, onChange }: { images: PendingImage[]; onChange: (imgs: PendingImage[]) => void }) {
  const [error, setError] = useState('');
  return (
    <fieldset className="mb-4 rounded-2xl border-2 border-line bg-white p-4">
      <legend className="px-2 font-round text-lg text-burnt">תמונות המוצר</legend>
      <p className="hint mb-3">התמונה הראשונה היא התמונה הראשית בחנות. אפשר להוסיף, לסדר ולמחוק תמונות גם אחרי השמירה.</p>
      {error && <ErrorBox>{error}</ErrorBox>}
      {images.length > 0 && (
        <ul className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((img, i) => (
            <li key={img.url} className="rounded-2xl border-2 border-line bg-white p-2">
              <img src={img.url} alt={img.alt || `תמונה ${i + 1}`} className="aspect-[4/3] w-full rounded-xl object-cover" />
              {i === 0 && <span className="pill mt-1 text-xs">ראשית</span>}
              <label className="mt-2 block text-sm">
                תיאור לנגישות
                <input className="input mt-1 !py-1.5 text-sm" value={img.alt} onChange={(e) => onChange(images.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)))} />
              </label>
              <button
                type="button"
                className="mt-2 text-sm text-sale underline"
                onClick={() => {
                  URL.revokeObjectURL(img.url);
                  onChange(images.filter((_, j) => j !== i));
                }}
              >
                הסרה<span className="sr-only"> של תמונה {i + 1}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="btn-secondary btn-sm cursor-pointer has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-[#1f4e9a]">
        + בחירת תמונות
        <input
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          data-testid="new-product-images"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = '';
            const ok = files.filter((f) => ['image/jpeg', 'image/png', 'image/webp'].includes(f.type) && f.size <= 10 * 1024 * 1024);
            setError(ok.length < files.length ? 'חלק מהקבצים לא נוספו – אפשר רק JPG / PNG / WEBP עד 10MB' : '');
            onChange([...images, ...ok.map((file) => ({ file, url: URL.createObjectURL(file), alt: '' }))]);
          }}
        />
      </label>
    </fieldset>
  );
}

function ImagesManager({ product, onChange }: { product: ProductDTO; onChange: (p: ProductDTO) => void }) {
  const [alt, setAlt] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<ProductDTO>) => {
    setError(null);
    setBusy(true);
    try {
      onChange(await fn());
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const move = (i: number, dir: -1 | 1) => {
    const ids = product.images.map((x) => x.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    void run(() => api.put(`/api/admin/products/${product.id}/images/order`, { imageIds: ids }));
  };

  return (
    <section className="card mt-6" aria-labelledby="gal-h">
      <h2 id="gal-h" className="mb-1 text-xl">
        גלריית תמונות
      </h2>
      <p className="hint mb-3">התמונה הראשונה היא התמונה הראשית בחנות. אפשר לשנות סדר עם החצים.</p>
      {error != null && <ErrorBox error={error} />}
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {product.images.map((img, i) => (
          <li key={img.id} className="rounded-2xl border-2 border-line bg-white p-2">
            <img src={img.url} alt={img.alt} className="aspect-[4/3] w-full rounded-xl object-cover" />
            {i === 0 && <span className="pill mt-1 text-xs">ראשית</span>}
            <label className="mt-2 block text-sm">
              תיאור לנגישות
              <input className="input mt-1 !py-1.5 text-sm" defaultValue={img.alt} onBlur={(e) => e.target.value !== img.alt && run(() => api.patch(`/api/admin/images/${img.id}`, { alt: e.target.value }))} />
            </label>
            <div className="mt-2 flex items-center justify-between gap-1">
              <button type="button" className="btn-secondary btn-sm !px-3" disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label={`הזזת תמונה ${i + 1} קדימה`}>
                →
              </button>
              <button type="button" className="btn-secondary btn-sm !px-3" disabled={busy || i === product.images.length - 1} onClick={() => move(i, 1)} aria-label={`הזזת תמונה ${i + 1} אחורה`}>
                ←
              </button>
              <button type="button" className="text-sm text-sale underline" disabled={busy} onClick={() => window.confirm('למחוק את התמונה?') && run(() => api.del(`/api/admin/images/${img.id}`))}>
                מחיקה<span className="sr-only"> של תמונה {i + 1}</span>
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-4 grid items-end gap-3 rounded-2xl border-2 border-dashed border-orange bg-[#FFF4E2] p-4 sm:grid-cols-[1fr_auto]">
        <TextField label="תיאור התמונה החדשה (לנגישות)" value={alt} onChange={(e) => setAlt(e.target.value)} className="!mb-0" hint="מה רואים בתמונה, למשל: עמוד עם רוכסן ומכונית" />
        <label className="btn cursor-pointer has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-[#1f4e9a]">
          {busy ? 'מעלה…' : '+ הוספת תמונה'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={busy}
            data-testid="product-image-input"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              const fd = new FormData();
              fd.append('alt', alt);
              fd.append('file', file);
              void run(() => api.post(`/api/admin/products/${product.id}/images`, fd)).then(() => setAlt(''));
            }}
          />
        </label>
      </div>
    </section>
  );
}

function PricingEditor({ product, onChange }: { product: ProductDTO; onChange: (p: ProductDTO) => void }) {
  const p = product.pricing!;
  const [minPages, setMin] = useState(String(p.minPages));
  const [maxPages, setMax] = useState(String(p.maxPages));
  const [tiers, setTiers] = useState(p.tiers.map((t) => ({ fromPage: String(t.fromPage), toPage: String(t.toPage), price: toShekelStr(t.pricePerPage) })));
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => setMsg(''), [minPages, maxPages, tiers]);

  const parsed = {
    minPages: Number(minPages),
    maxPages: Number(maxPages),
    tiers: tiers.map((t) => ({ fromPage: Number(t.fromPage), toPage: Number(t.toPage), pricePerPage: toAgorot(t.price) ?? -1 })),
  };
  let preview = '';
  try {
    validateTiers(parsed);
    preview = `${parsed.minPages} עמודים = ${formatILS(customBookPrice(parsed.minPages, parsed))} · ${parsed.maxPages} עמודים = ${formatILS(customBookPrice(parsed.maxPages, parsed))}`;
  } catch {
    preview = '';
  }

  const save = useMutation({
    mutationFn: () => api.put<ProductDTO>(`/api/admin/products/${product.id}/pricing`, parsed),
    onSuccess: (prod) => {
      onChange(prod);
      setMsg('המחירים נשמרו ✓');
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'שגיאה'),
  });

  return (
    <section className="card mt-6" aria-labelledby="tiers-h">
      <h2 id="tiers-h" className="mb-1 text-xl">
        מחיר לפי מספר עמודים
      </h2>
      <p className="hint mb-3">כל מדרגה קובעת מחיר לעמוד. המדרגות צריכות לכסות את כל העמודים מ־1 ועד המקסימום, ברצף.</p>
      <div className="grid max-w-md grid-cols-2 gap-x-4">
        <TextField label="מינימום עמודים" inputMode="numeric" value={minPages} onChange={(e) => setMin(e.target.value)} />
        <TextField label="מקסימום עמודים" inputMode="numeric" value={maxPages} onChange={(e) => setMax(e.target.value)} />
      </div>
      <table className="w-full max-w-xl text-[0.95rem]">
        <caption className="sr-only">מדרגות מחיר</caption>
        <thead>
          <tr className="text-right text-muted">
            <th scope="col" className="p-1 font-medium">מעמוד</th>
            <th scope="col" className="p-1 font-medium">עד עמוד</th>
            <th scope="col" className="p-1 font-medium">מחיר לעמוד (₪)</th>
            <th scope="col"><span className="sr-only">פעולות</span></th>
          </tr>
        </thead>
        <tbody>
          {tiers.map((t, i) => (
            <tr key={i}>
              {(['fromPage', 'toPage', 'price'] as const).map((k) => (
                <td key={k} className="p-1">
                  <input
                    className="input !py-1.5"
                    inputMode="decimal"
                    aria-label={`${k === 'fromPage' ? 'מעמוד' : k === 'toPage' ? 'עד עמוד' : 'מחיר לעמוד'} – מדרגה ${i + 1}`}
                    value={t[k]}
                    onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))}
                  />
                </td>
              ))}
              <td className="p-1">
                <button type="button" className="text-sm text-sale underline" disabled={tiers.length === 1} onClick={() => setTiers(tiers.filter((_, j) => j !== i))}>
                  הסרה<span className="sr-only"> של מדרגה {i + 1}</span>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="btn-secondary btn-sm mt-2" onClick={() => setTiers([...tiers, { fromPage: String(Number(tiers.at(-1)?.toPage ?? 0) + 1), toPage: '', price: '' }])}>
        + מדרגה
      </button>
      <p className="mt-3" aria-live="polite">
        {preview ? <b>{preview}</b> : <span className="text-sale">המדרגות עדיין לא שלמות</span>}
      </p>
      {error && <ErrorBox>{error}</ErrorBox>}
      <div className="mt-3 flex items-center gap-3">
        <button type="button" className="btn" disabled={!preview || save.isPending} onClick={() => { setError(''); save.mutate(); }}>
          שמירת מחירים
        </button>
        <span role="status" className="font-bold text-ok">
          {msg}
        </span>
      </div>
    </section>
  );
}
