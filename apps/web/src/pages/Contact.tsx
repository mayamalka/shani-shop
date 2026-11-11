import { buildWhatsAppLink, contactSchema } from '@shani/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { InstagramIcon, TikTokIcon, WhatsAppIcon } from '../components/Icons';
import { Checkbox, ErrorBox, ErrorSummary, Page, TextArea, TextField } from '../components/ui';
import { api } from '../lib/api';
import { useSettings } from '../lib/queries';

export function ContactPage() {
  const settings = useSettings().data;
  const [f, setF] = useState({ subject: '', email: '', message: '', consent: false, website: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<unknown>(null);
  const wa = settings?.whatsappNumber ? buildWhatsAppLink(settings.whatsappNumber, settings.whatsappMessage) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const r = contactSchema.safeParse(f);
    if (!r.success) {
      const errs: Record<string, string> = {};
      for (const i of r.error.issues) errs[String(i.path[0])] ??= i.message;
      delete errs.website;
      setErrors(errs);
      requestAnimationFrame(() => document.getElementById('error-summary')?.focus());
      return;
    }
    setErrors({});
    setState('sending');
    try {
      await api.post('/api/contact', f);
      setState('sent');
      requestAnimationFrame(() => document.getElementById('contact-sent')?.focus());
    } catch (err) {
      setState('idle');
      setError(err);
    }
  }

  return (
    <Page title="צור קשר">
      <p className="-mt-2 mb-6">שאלה על ספר, הזמנה מיוחדת או סתם להגיד שלום? נשמח לשמוע 💛</p>
      <div className="grid items-start gap-6 md:grid-cols-[1.3fr_1fr]">
        {state === 'sent' ? (
          <div id="contact-sent" tabIndex={-1} role="status" className="card">
            <h2 className="mb-2">ההודעה נשלחה ✓</h2>
            <p>תודה! נחזור אליך לכתובת {f.email} בהקדם (בדרך כלל עד יום עסקים אחד).</p>
          </div>
        ) : (
          <form noValidate onSubmit={submit} className="card" aria-label="טופס יצירת קשר">
            <ErrorSummary errors={errors} />
            {error != null && (
              <div className="mb-4">
                <ErrorBox error={error} />
              </div>
            )}
            <TextField label="נושא הפנייה" required value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} error={errors.subject} maxLength={120} />
            <TextField label="אימייל לחזרה" required type="email" autoComplete="email" dir="ltr" className="[&_input]:text-right" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} error={errors.email} />
            <TextArea label="תוכן הפנייה" required rows={6} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} error={errors.message} maxLength={3000} />
            {/* honeypot: hidden from people and screen readers, bots fill it */}
            <div aria-hidden="true" className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0 [clip-path:inset(50%)]">
              <label>
                אתר אינטרנט
                <input tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} name="website" />
              </label>
            </div>
            <Checkbox
              checked={f.consent}
              onChange={(e) => setF({ ...f, consent: e.target.checked })}
              error={errors.consent}
              label={
                <>
                  אני מסכים/ה שפרטיי ישמשו למענה על הפנייה בלבד (<Link to="/privacy">מדיניות פרטיות</Link>) <span className="text-sale" aria-hidden>*</span>
                </>
              }
            />
            <button type="submit" className="btn" disabled={state === 'sending'}>
              {state === 'sending' ? 'שולח…' : 'שליחה ✉️'}
            </button>
          </form>
        )}

        <div className="grid gap-3">
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 rounded-[18px] bg-wa p-4 text-white no-underline" data-testid="whatsapp-link">
              <WhatsAppIcon width={32} height={32} />
              <span>
                <b className="block text-lg">שליחת הודעה בוואטסאפ</b>
                <span className="text-sm">נפתח עם הודעה מוכנה: ״{settings?.whatsappMessage}״</span>
                <span className="sr-only"> (נפתח בחלון חדש)</span>
              </span>
            </a>
          )}
          {settings?.instagramUrl && (
            <a href={settings.instagramUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 rounded-[18px] bg-[#B0306A] p-4 text-white no-underline">
              <InstagramIcon width={32} height={32} />
              <b className="text-lg">אינסטגרם</b>
              <span className="sr-only"> (נפתח בחלון חדש)</span>
            </a>
          )}
          {settings?.tiktokUrl && (
            <a href={settings.tiktokUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 rounded-[18px] bg-[#111] p-4 text-white no-underline">
              <TikTokIcon width={32} height={32} />
              <b className="text-lg">טיקטוק</b>
              <span className="sr-only"> (נפתח בחלון חדש)</span>
            </a>
          )}
          <div className="card text-[0.95rem]">
            <b>⏰ זמני מענה</b>
            <br />
            א׳–ה׳ 9:00–17:00 · עד יום עסקים אחד
            {settings?.businessEmail && (
              <>
                <br />
                <a href={`mailto:${settings.businessEmail}`} dir="ltr">
                  {settings.businessEmail}
                </a>
              </>
            )}
          </div>
        </div>
      </div>
    </Page>
  );
}
