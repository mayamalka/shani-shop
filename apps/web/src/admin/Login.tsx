import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ErrorBox, Page, TextField } from '../components/ui';
import { setAdminHint } from '../lib/admin';
import { api, setCsrfToken } from '../lib/api';

export default function AdminLogin() {
  const [step, setStep] = useState<'password' | 'code'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [useBackup, setUseBackup] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const qc = useQueryClient();

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post('/api/admin/auth/login', { email, password });
      setPassword('');
      setStep('code');
      requestAnimationFrame(() => document.getElementById('otp')?.focus());
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await api.post<{ csrfToken: string }>('/api/admin/auth/verify', useBackup ? { backupCode: code } : { code: code.replace(/\s/g, '') });
      setCsrfToken(r.csrfToken);
      setAdminHint(true);
      await qc.invalidateQueries({ queryKey: ['admin-me'] });
      const next = params.get('next');
      navigate(next && next.startsWith('/admin') ? next : '/admin/orders', { replace: true });
    } catch (err) {
      setError(err);
      setCode('');
      const status = (err as { code?: string }).code;
      if (status === 'LOGIN_EXPIRED') setStep('password');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page title="כניסת מנהלת" heading="כניסת מנהלת 🔐">
      <div className="mx-auto max-w-md">
        {error != null && (
          <div className="mb-4">
            <ErrorBox error={error} />
          </div>
        )}
        {step === 'password' ? (
          <form className="card" onSubmit={submitPassword} aria-labelledby="step1">
            <h2 id="step1" className="mb-4 text-xl">
              שלב 1 מתוך 2: סיסמה
            </h2>
            <TextField label="אימייל" type="email" autoComplete="username" dir="ltr" className="[&_input]:text-right" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <TextField label="סיסמה" type="password" autoComplete="current-password" dir="ltr" className="[&_input]:text-right" required value={password} onChange={(e) => setPassword(e.target.value)} />
            <button className="btn w-full" disabled={busy || !email || !password}>
              {busy ? 'בודק…' : 'המשך'}
            </button>
          </form>
        ) : (
          <form className="card" onSubmit={submitCode} aria-labelledby="step2">
            <h2 id="step2" className="mb-2 text-xl">
              שלב 2 מתוך 2: {useBackup ? 'קוד גיבוי' : 'קוד מאפליקציית האימות'}
            </h2>
            <p className="mb-4 text-[0.95rem]">
              {useBackup ? 'הקלידי אחד מקודי הגיבוי שקיבלת בהגדרה (כל קוד עובד פעם אחת).' : 'פתחי את Google Authenticator / Microsoft Authenticator והקלידי את הקוד בן 6 הספרות של "הדודה שני".'}
            </p>
            <TextField
              id="otp"
              label={useBackup ? 'קוד גיבוי' : 'קוד אימות'}
              inputMode={useBackup ? 'text' : 'numeric'}
              autoComplete="one-time-code"
              dir="ltr"
              className="[&_input]:text-center [&_input]:text-2xl [&_input]:tracking-[0.4em]"
              maxLength={useBackup ? 20 : 6}
              pattern={useBackup ? undefined : '[0-9]{6}'}
              required
              value={code}
              onChange={(e) => setCode(useBackup ? e.target.value.toUpperCase() : e.target.value.replace(/\D/g, ''))}
              autoFocus
            />
            <button className="btn w-full" disabled={busy || (useBackup ? code.length < 8 : code.length !== 6)}>
              {busy ? 'בודק…' : 'כניסה'}
            </button>
            <button type="button" className="mt-3 w-full text-sm text-burnt underline" onClick={() => { setUseBackup(!useBackup); setCode(''); setError(null); }}>
              {useBackup ? 'חזרה לקוד מהאפליקציה' : 'אין גישה לטלפון? כניסה עם קוד גיבוי'}
            </button>
          </form>
        )}
        <p className="hint mt-4 text-center">5 ניסיונות שגויים נועלים את הכניסה ל־15 דקות.</p>
      </div>
    </Page>
  );
}
