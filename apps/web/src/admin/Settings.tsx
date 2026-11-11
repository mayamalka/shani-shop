import type { PublicSettings } from '@shani/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorBox, Loading, Page, SelectField, TextField } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { toAgorot } from './ProductEditor';

export default function AdminSettings() {
  const q = useQuery({ queryKey: ['admin-settings'], queryFn: () => api.get<PublicSettings>('/api/admin/settings') });
  if (q.isLoading) return <Page title="הגדרות"><Loading /></Page>;
  if (q.error || !q.data) return <Page title="הגדרות"><ErrorBox error={q.error} /></Page>;
  return <SettingsForm initial={q.data} />;
}

function SettingsForm({ initial }: { initial: PublicSettings }) {
  const qc = useQueryClient();
  const [s, setS] = useState({ ...initial, shippingFee: String(initial.shippingFee / 100), vatRate: String(initial.vatRate), photoRetentionDays: String(initial.photoRetentionDays) });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const set = (k: keyof typeof s) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setS({ ...s, [k]: e.target.value });

  const save = useMutation({
    mutationFn: () =>
      api.put<PublicSettings>('/api/admin/settings', {
        ...s,
        shippingFee: toAgorot(s.shippingFee) ?? -1,
        vatRate: Number(s.vatRate),
        photoRetentionDays: Number(s.photoRetentionDays),
      }),
    onSuccess: (data) => {
      qc.setQueryData(['admin-settings'], data);
      qc.invalidateQueries({ queryKey: ['settings'] });
      setErrors({});
      setMsg('ההגדרות נשמרו ✓');
    },
    onError: (e) => {
      setMsg('');
      if (e instanceof ApiError) setErrors(e.fieldErrors());
    },
  });
  const purge = useMutation({ mutationFn: () => api.post<{ orders: number; photos: number }>('/api/admin/maintenance/purge-photos') });

  return (
    <Page title="הגדרות" className="max-w-4xl">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setMsg('');
          save.mutate();
        }}
        className="grid gap-6"
      >
        {save.error != null && <ErrorBox error={save.error} />}
        <fieldset className="card">
          <legend className="px-2 font-round text-xl text-burnt">פרטי העסק ויצירת קשר</legend>
          <div className="grid gap-x-4 sm:grid-cols-2">
            <TextField label="שם העסק" value={s.businessName} onChange={set('businessName')} error={errors.businessName} />
            <TextField label="אימייל העסק (לשם מגיעות הזמנות ופניות)" type="email" dir="ltr" value={s.businessEmail} onChange={set('businessEmail')} error={errors.businessEmail} />
            <TextField label="מספר וואטסאפ" type="tel" dir="ltr" value={s.whatsappNumber} onChange={set('whatsappNumber')} error={errors.whatsappNumber} hint="למשל 050-1234567" />
            <TextField label="הודעה מוכנה לוואטסאפ" value={s.whatsappMessage} onChange={set('whatsappMessage')} error={errors.whatsappMessage} />
            <TextField label="קישור לאינסטגרם" dir="ltr" value={s.instagramUrl} onChange={set('instagramUrl')} error={errors.instagramUrl} hint="https://www.instagram.com/…" />
            <TextField label="קישור לטיקטוק" dir="ltr" value={s.tiktokUrl} onChange={set('tiktokUrl')} error={errors.tiktokUrl} hint="https://www.tiktok.com/@…" />
          </div>
          <TextField label="רכז/ת נגישות – שם ודרכי קשר (מוצג בהצהרת הנגישות)" value={s.accessibilityCoordinator} onChange={set('accessibilityCoordinator')} error={errors.accessibilityCoordinator} />
        </fieldset>


        <fieldset className="card">
          <legend className="px-2 font-round text-xl text-burnt">משלוח, מיסוי ופרטיות</legend>
          <div className="grid gap-x-4 sm:grid-cols-2">
            <TextField label="עלות משלוח (₪)" inputMode="decimal" value={s.shippingFee} onChange={set('shippingFee')} error={errors.shippingFee} />
            <TextField label="כתובת לאיסוף עצמי" value={s.pickupAddress} onChange={set('pickupAddress')} />
            <SelectField label="סוג עוסק" value={s.taxStatus} onChange={set('taxStatus')}>
              <option value="PATUR">עוסק פטור (ללא מע״מ)</option>
              <option value="MURSHE">עוסק מורשה (המחירים כוללים מע״מ)</option>
            </SelectField>
            <TextField label="שיעור מע״מ (%)" inputMode="decimal" value={s.vatRate} onChange={set('vatRate')} error={errors.vatRate} hint="רלוונטי לעוסק מורשה" />
            <TextField label="מחיקת תמונות לקוחות אחרי (ימים מהמשלוח)" inputMode="numeric" value={s.photoRetentionDays} onChange={set('photoRetentionDays')} error={errors.photoRetentionDays} />
          </div>
        </fieldset>

        <fieldset className="card">
          <legend className="px-2 font-round text-xl text-burnt">סטטיסטיקה ושיווק</legend>
          <p className="hint mb-3">נטען רק אצל גולשים שאישרו עוגיות. השאירי ריק כדי לכבות.</p>
          <div className="grid gap-x-4 sm:grid-cols-3">
            <TextField label="Google Analytics (GA4)" dir="ltr" placeholder="G-XXXXXXX" value={s.ga4Id} onChange={set('ga4Id')} error={errors.ga4Id} />
            <TextField label="Meta Pixel ID" dir="ltr" placeholder="1234567890" value={s.metaPixelId} onChange={set('metaPixelId')} error={errors.metaPixelId} />
            <TextField label="TikTok Pixel ID" dir="ltr" placeholder="C1ABCDEF…" value={s.tiktokPixelId} onChange={set('tiktokPixelId')} error={errors.tiktokPixelId} />
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <button className="btn" disabled={save.isPending}>
            {save.isPending ? 'שומר…' : 'שמירת הגדרות'}
          </button>
          <span role="status" className="font-bold text-ok">
            {msg}
          </span>
        </div>
      </form>

      <section className="card mt-6" aria-labelledby="purge-h">
        <h2 id="purge-h" className="mb-1 text-xl">
          מחיקת תמונות ישנות
        </h2>
        <p className="mb-3">המערכת מוחקת אוטומטית (כל 6 שעות) תמונות של הזמנות שנשלחו לפני יותר מ־{initial.photoRetentionDays} יום. אפשר גם להפעיל עכשיו:</p>
        <button type="button" className="btn-secondary" disabled={purge.isPending} onClick={() => purge.mutate()}>
          מחיקה עכשיו
        </button>
        <p role="status" className="mt-2">
          {purge.data && `נמחקו ${purge.data.photos} תמונות (${purge.data.orders} הזמנות).`}
        </p>
      </section>
    </Page>
  );
}
