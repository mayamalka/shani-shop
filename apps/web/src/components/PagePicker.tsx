import { ageRangeLabel, type PageOptionDTO } from '@shani/shared';
import { useState } from 'react';
import { CheckIcon } from './Icons';

const AGE_FILTERS = [
  { key: 'all', label: 'הכל', min: 0, max: 99 },
  { key: '1-2', label: '1–2', min: 1, max: 2 },
  { key: '2-3', label: '2–3', min: 2, max: 3 },
  { key: '3-4', label: '3–4', min: 3, max: 4 },
  { key: '4-5', label: '4–5', min: 4, max: 5 },
];

/** Grid of page cards; each is a real checkbox (keyboard + screen-reader friendly). */
export function PagePicker({ pages, selected, onChange, max, error }: { pages: PageOptionDTO[]; selected: string[]; onChange: (ids: string[]) => void; max: number; error?: string }) {
  const [age, setAge] = useState('all');
  const f = AGE_FILTERS.find((a) => a.key === age)!;
  const visible = pages.filter((p) => p.maxAge >= f.min && p.minAge <= f.max);
  const full = selected.length >= max;

  const toggle = (id: string, on: boolean) => {
    if (on && !selected.includes(id) && !full) onChange([...selected, id]);
    if (!on) onChange(selected.filter((x) => x !== id));
  };

  return (
    <fieldset aria-describedby={error ? 'pages-error' : 'pages-help'}>
      <legend className="sr-only">בחירת עמודים לספר</legend>
      <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="סינון עמודים לפי גיל">
        <span className="font-bold" aria-hidden>
          סינון לפי גיל:
        </span>
        {AGE_FILTERS.map((a) => (
          <button key={a.key} type="button" className="chip" aria-pressed={a.key === age} onClick={() => setAge(a.key)}>
            {a.label}
          </button>
        ))}
      </div>
      <p id="pages-help" className="hint mb-3">
        סמנו את העמודים שתרצו בספר. {full && <b className="text-burnt">הגעתם למקסימום – כדי להוסיף עמוד יש להסיר אחר.</b>}
      </p>
      {error && (
        <p id="pages-error" className="error-text mb-3">
          {error}
        </p>
      )}
      <ul className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {visible.map((p) => {
          const on = selected.includes(p.id);
          const disabled = !on && full;
          return (
            <li key={p.id}>
              <label
                className={`relative block h-full cursor-pointer rounded-[20px] border-[3px] bg-paper p-3 transition-colors has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-[#1f4e9a] ${
                  on ? 'border-burnt bg-[#FFF4E2]' : 'border-line'
                } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                <input type="checkbox" className="sr-only" checked={on} disabled={disabled} onChange={(e) => toggle(p.id, e.target.checked)} data-testid="page-option" />
                <span
                  className={`absolute top-5 left-5 z-10 grid h-8 w-8 place-items-center rounded-full border-2 border-burnt ${on ? 'bg-burnt text-white' : 'bg-white text-transparent'}`}
                  aria-hidden
                >
                  <CheckIcon width={18} height={18} />
                </span>
                <span className="mb-2 block aspect-[4/3] overflow-hidden rounded-2xl bg-soft">
                  {p.imageUrl && <img src={p.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" width={400} height={300} />}
                </span>
                {/* wrap-anywhere: a long word (e.g. a code or number in the title) must wrap, not push the 2-column grid past a 320px screen */}
                <span className="block font-round text-[1.05rem] font-bold text-burnt wrap-anywhere">{p.title}</span>
                <span className="my-1 block text-sm leading-snug text-muted wrap-anywhere">{p.summary}</span>
                <span className="pill text-xs">{ageRangeLabel(p.minAge, p.maxAge)}</span>
              </label>
            </li>
          );
        })}
      </ul>
      {visible.length === 0 && <p className="text-muted">אין עמודים בטווח הגילאים הזה.</p>}
    </fieldset>
  );
}
