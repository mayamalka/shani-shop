import { checkoutSchema, digitsOnly, formatILS, NAME_RULE_MESSAGE, sanitizeName, type CityDTO } from '@shani/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router';
import { Combobox } from '../components/Combobox';
import { LockIcon } from '../components/Icons';
import { Checkbox, ErrorBox, ErrorSummary, Page, TextArea, TextField } from '../components/ui';
import { trackShopEvent } from '../lib/analytics';
import { api, ApiError } from '../lib/api';
import { toLineInput, useCart } from '../lib/cart';
import { useSettings } from '../lib/queries';
import { useQuote } from '../lib/useQuote';

const FIELD_LABELS: Record<string, string> = {
  'customer.fullName': 'fullName',
  'customer.phone': 'phone',
  'customer.email': 'email',
  'delivery.city': 'city',
  'delivery.street': 'street',
  'delivery.houseNumber': 'houseNumber',
  'delivery.apartment': 'apartment',
  'consents.terms': 'terms',
  'consents.photos': 'photos',
};

export const PENDING_ORDER_KEY = 'shani:pending-order';

export function CheckoutPage() {
  const { items } = useCart();
  const settings = useSettings();
  const [f, setF] = useState({
    fullName: '', phone: '', email: '', method: 'SHIPPING' as 'SHIPPING' | 'PICKUP',
    cityCode: '', street: '', houseNumber: '', apartment: '', notes: '', terms: false, photos: false, marketing: false,
  });
  // official list of Israeli localities and their streets (data.gov.il), loaded only for home delivery
  const cities = useQuery({ queryKey: ['geo-cities'], queryFn: () => api.get<CityDTO[]>('/api/geo/cities'), staleTime: Infinity, enabled: f.method === 'SHIPPING' });
  const streets = useQuery({
    queryKey: ['geo-streets', f.cityCode],
    queryFn: () => api.get<string[]>(`/api/geo/streets?city=${f.cityCode}`),
    staleTime: Infinity,
    enabled: f.method === 'SHIPPING' && !!f.cityCode,
  });
  const cityOptions = useMemo(() => (cities.data ?? []).map((c) => ({ value: String(c.code), label: c.name })), [cities.data]);
  const streetOptions = useMemo(() => (streets.data ?? []).map((s) => ({ value: s, label: s })), [streets.data]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const quote = useQuote(items, f.method);
  const q = quote.data;
  const tracked = useRef(false);
  const needsPhotos = items.some((i) => i.personalization);

  useEffect(() => {
    if (q && !tracked.current) {
      tracked.current = true;
      trackShopEvent('begin_checkout', { value: q.total / 100, items: q.lines.map((l) => ({ id: l.productId, name: l.title, price: l.unitPrice / 100, quantity: l.quantity })) });
    }
  }, [q]);

  if (items.length === 0 && !busy) return <Navigate to="/cart" replace />;

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value });

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setSubmitError(null);
    const body = {
      customer: { fullName: f.fullName, phone: f.phone, email: f.email },
      delivery: {
        method: f.method,
        cityCode: f.cityCode ? Number(f.cityCode) : undefined,
        city: cityOptions.find((c) => c.value === f.cityCode)?.label ?? '',
        street: f.street,
        houseNumber: f.houseNumber,
        apartment: f.apartment,
        notes: f.notes,
      },
      items: items.map(toLineInput),
      consents: { terms: f.terms, photos: needsPhotos ? f.photos : false, marketing: f.marketing },
    };
    const r = checkoutSchema.safeParse(body);
    if (!r.success) {
      const e: Record<string, string> = {};
      for (const iss of r.error.issues) {
        const key = FIELD_LABELS[iss.path.join('.')];
        if (key) e[key] ??= iss.message;
      }
      setErrors(e);
      requestAnimationFrame(() => document.getElementById('error-summary')?.focus());
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const res = await api.post<{ orderId: string; number: number; total: number; redirectUrl: string }>('/api/orders', body);
      try {
        sessionStorage.setItem(PENDING_ORDER_KEY, JSON.stringify({ number: res.number, total: res.total, items: q?.lines ?? [] }));
      } catch {
        /* ignore */
      }
      // → the payment provider's secure page
      window.location.assign(res.redirectUrl);
    } catch (e) {
      setBusy(false);
      if (e instanceof ApiError) {
        const fe = e.fieldErrors();
        const mapped: Record<string, string> = {};
        for (const [k, v] of Object.entries(fe)) if (FIELD_LABELS[k]) mapped[FIELD_LABELS[k]!] = v;
        if (Object.keys(mapped).length) setErrors(mapped);
      }
      setSubmitError(e);
      requestAnimationFrame(() => document.getElementById('submit-error')?.focus());
    }
  }

  const pickup = settings.data?.pickupAddress;
  return (
    <Page title="פרטים ותשלום">
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
        <form id="checkout-form" noValidate onSubmit={submit} className="card" aria-label="פרטי הזמנה">
          <ErrorSummary errors={errors} />
          {submitError != null && (
            <div id="submit-error" tabIndex={-1} className="mb-4">
              <ErrorBox error={submitError} />
              {submitError instanceof ApiError && ['CART_CHANGED', 'PHOTO_EXPIRED'].includes(submitError.code) && (
                <Link to="/cart" className="mt-2 inline-block">
                  חזרה לסל לעדכון
                </Link>
              )}
            </div>
          )}

          <fieldset className="mb-5">
            <legend className="mb-3 font-round text-xl text-burnt">פרטי המזמין/ה</legend>
            <div className="grid gap-x-4 sm:grid-cols-2">
              <TextField label="שם מלא" required autoComplete="name" maxLength={80} value={f.fullName} onChange={set('fullName')} error={errors.fullName} filter={sanitizeName} filterMessage={NAME_RULE_MESSAGE} />
              <TextField
                label="טלפון נייד"
                required
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                dir="ltr"
                className="[&_input]:text-right"
                maxLength={10}
                placeholder="0501234567"
                value={f.phone}
                onChange={set('phone')}
                error={errors.phone}
                filter={(v) => digitsOnly(v, 10)}
                filterMessage="ספרות בלבד"
              />
            </div>
            <TextField label="אימייל" required type="email" autoComplete="email" dir="ltr" className="[&_input]:text-right" value={f.email} onChange={set('email')} error={errors.email} hint="לשם יישלחו אישור ההזמנה והקבלה" />
          </fieldset>

          <fieldset className="mb-5">
            <legend className="mb-3 font-round text-xl text-burnt">אופן קבלה</legend>
            {(['SHIPPING', 'PICKUP'] as const).map((m) => (
              <label key={m} className={`mb-2 flex cursor-pointer items-center gap-3 rounded-2xl border-2 bg-white p-4 ${f.method === m ? 'border-burnt bg-[#FFF4E2]' : 'border-line'}`}>
                <input type="radio" name="method" value={m} checked={f.method === m} onChange={() => setF({ ...f, method: m })} className="h-5 w-5 accent-burnt" />
                <span className="flex-1">
                  <b>{m === 'SHIPPING' ? 'משלוח עד הבית' : 'איסוף עצמי'}</b>
                  <span className="hint block">{m === 'SHIPPING' ? 'שליח · 3–5 ימי עסקים מסיום ההכנה' : `${pickup ? pickup + ' · ' : ''}נתאם מועד בוואטסאפ`}</span>
                </span>
                <b>{m === 'SHIPPING' ? formatILS(settings.data?.shippingFee ?? 0) : 'חינם'}</b>
              </label>
            ))}
            {f.method === 'SHIPPING' && (
              <div className="mt-3 grid gap-x-4 sm:grid-cols-2">
                <Combobox
                  label="יישוב"
                  required
                  options={cityOptions}
                  loading={cities.isLoading}
                  value={f.cityCode}
                  onChange={(o) => setF((x) => ({ ...x, cityCode: o?.value ?? '', street: o?.value === x.cityCode ? x.street : '' }))}
                  error={errors.city}
                  placeholder="הקלידו לחיפוש…"
                  testId="city-combobox"
                />
                <Combobox
                  label="רחוב"
                  required
                  options={streetOptions}
                  loading={streets.isLoading}
                  disabled={!f.cityCode}
                  value={f.street}
                  onChange={(o) => setF((x) => ({ ...x, street: o?.value ?? '' }))}
                  error={errors.street}
                  placeholder={f.cityCode ? 'הקלידו לחיפוש…' : 'בחרו קודם יישוב'}
                  testId="street-combobox"
                />
                <TextField label="מספר בית" required inputMode="numeric" maxLength={4} value={f.houseNumber} onChange={set('houseNumber')} error={errors.houseNumber} filter={(v) => digitsOnly(v, 4)} filterMessage="ספרות בלבד" />
                <TextField label="דירה (לא חובה)" inputMode="numeric" maxLength={4} value={f.apartment} onChange={set('apartment')} error={errors.apartment} filter={(v) => digitsOnly(v, 4)} filterMessage="ספרות בלבד" />
              </div>
            )}
            <TextArea label="הערות להזמנה (לא חובה)" rows={2} value={f.notes} onChange={set('notes')} maxLength={500} />
          </fieldset>

          <fieldset>
            <legend className="mb-1 font-round text-xl text-burnt">אישורים</legend>
            <Checkbox
              checked={f.terms}
              onChange={set('terms')}
              error={errors.terms}
              label={
                <>
                  קראתי ואני מסכים/ה <Link to="/terms" target="_blank">לתקנון</Link> ול<Link to="/privacy" target="_blank">מדיניות הפרטיות</Link> <span className="text-sale" aria-hidden>*</span>
                </>
              }
            />
            {needsPhotos && (
              <Checkbox
                checked={f.photos}
                onChange={set('photos')}
                error={errors.photos}
                label={
                  <>
                    אני מאשר/ת שימוש בתמונות שהעליתי (כולל תמונות ילדים) אך ורק להכנת הספר, ומחיקתן {settings.data?.photoRetentionDays ?? 60} יום לאחר המשלוח <span className="text-sale" aria-hidden>*</span>
                  </>
                }
              />
            )}
            <Checkbox checked={f.marketing} onChange={set('marketing')} label="אשמח לקבל עדכונים ומבצעים במייל (לא חובה)" />
            <p className="hint mt-2">ספרים בהתאמה אישית מיוצרים במיוחד עבורכם ולכן אינם ניתנים לביטול לאחר תחילת הייצור, בהתאם לחוק הגנת הצרכן.</p>
          </fieldset>
        </form>

        <aside className="card lg:sticky lg:top-28" aria-labelledby="order-summary">
          <h2 id="order-summary" className="mb-3">
            ההזמנה שלך
          </h2>
          {quote.error && <ErrorBox error={quote.error} />}
          <dl aria-live="polite">
            {q?.lines.map((l) => (
              <div key={l.index} className="flex justify-between gap-3 py-1 text-[0.95rem]">
                <dt>
                  {l.title} × {l.quantity}
                </dt>
                <dd className="flex-none">{formatILS(l.lineTotal)}</dd>
              </div>
            ))}
            <div className="flex justify-between py-1 text-[0.95rem]">
              <dt>משלוח</dt>
              <dd>{q ? formatILS(q.shipping) : '…'}</dd>
            </div>
            <div className="mt-2 flex justify-between border-t-2 border-dashed border-line pt-3 text-xl font-bold">
              <dt>סה״כ</dt>
              <dd data-testid="checkout-total">{q ? formatILS(q.total) : '…'}</dd>
            </div>
          </dl>
          <button type="submit" form="checkout-form" className="btn mt-4 w-full" disabled={busy || !q || q.problems.length > 0}>
            <LockIcon width={20} height={20} /> {busy ? 'מעבירים לתשלום…' : 'מעבר לתשלום מאובטח'}
          </button>
          <p className="hint mt-3 text-center">התשלום מתבצע בעמוד המאובטח של חברת הסליקה (אשראי, Bit, Apple Pay, Google Pay). פרטי האשראי לא עוברים דרכנו.</p>
        </aside>
      </div>
    </Page>
  );
}
