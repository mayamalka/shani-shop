import { useState } from 'react';
import { Link } from 'react-router';
import { useA11y, type A11yPrefs } from '../lib/a11y';
import { Dialog } from './Dialog';
import { AccessibilityIcon } from './Icons';

const SIZES: { value: A11yPrefs['textScale']; label: string }[] = [
  { value: 1, label: 'רגיל' },
  { value: 1.15, label: 'גדול' },
  { value: 1.3, label: 'גדול מאוד' },
];

/** Our own small accessibility menu (no third-party overlay). */
export function A11yMenu() {
  const [open, setOpen] = useState(false);
  const { prefs, set, reset } = useA11y();
  const toggle = (key: 'contrast' | 'underlineLinks' | 'reduceMotion', label: string) => (
    <button type="button" className="chip w-full text-start" aria-pressed={prefs[key]} onClick={() => set({ [key]: !prefs[key] })}>
      {prefs[key] ? '✓ ' : ''}
      {label}
    </button>
  );
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed top-1/3 right-0 z-30 grid h-12 w-12 place-items-center rounded-l-2xl bg-[#1F4E9A] text-white shadow-lg"
        aria-label="תפריט נגישות"
        aria-haspopup="dialog"
        data-testid="a11y-button"
      >
        <AccessibilityIcon width={28} height={28} />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="נגישות" labelledBy="a11y-title">
        <fieldset className="mb-4">
          <legend className="mb-2 font-bold">גודל טקסט</legend>
          <div className="flex flex-wrap gap-2">
            {SIZES.map((s) => (
              <button key={s.value} type="button" className="chip" aria-pressed={prefs.textScale === s.value} onClick={() => set({ textScale: s.value })}>
                {s.label}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-2">
          {toggle('contrast', 'ניגודיות גבוהה')}
          {toggle('underlineLinks', 'הדגשת קישורים')}
          {toggle('reduceMotion', 'עצירת אנימציות')}
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <button type="button" className="btn-secondary btn-sm" onClick={reset}>
            איפוס הגדרות
          </button>
          <Link to="/accessibility" onClick={() => setOpen(false)}>
            הצהרת נגישות
          </Link>
        </div>
      </Dialog>
    </>
  );
}
