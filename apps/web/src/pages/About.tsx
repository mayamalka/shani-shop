import type { PublicSettings } from '@shani/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { ImageIcon, PencilIcon } from '../components/Icons';
import { ErrorBox, Loading, Page } from '../components/ui';
import { useAdmin } from '../lib/admin';
import { api } from '../lib/api';
import { useSettings } from '../lib/queries';

const VALUES = [
  { title: '✋ לומדים דרך הידיים', text: 'כל עמוד בנוי סביב מיומנות התפתחותית: אחיזה, רוכסן, כפתור, התאמה וספירה.' },
  { title: '🧵 עבודת יד אמיתית', text: 'חומרים בטוחים לתינוקות, תפרים כפולים, נתפר בישראל.' },
  { title: '📸 אישי לגמרי', text: 'הפנים והשמות של המשפחה הופכים את הספר לאהוב במיוחד.' },
];

function EditButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="grid h-10 w-10 flex-none place-items-center rounded-full border-2 border-burnt bg-white text-burnt" aria-label={label}>
      <PencilIcon width={18} height={18} />
    </button>
  );
}

/** Admin-only inline editor: a field + save/cancel. */
function InlineEditor({ label, initial, multiline, onSave, onCancel, busy, error }: { label: string; initial: string; multiline?: boolean; onSave: (v: string) => void; onCancel: () => void; busy: boolean; error: unknown }) {
  const [v, setV] = useState(initial);
  const props = {
    'aria-label': label,
    className: 'input',
    value: v,
    autoFocus: true,
    onChange: (e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => setV(e.target.value),
    onKeyDown: (e: React.KeyboardEvent) => e.key === 'Escape' && onCancel(),
  };
  return (
    <form
      className="mb-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(v);
      }}
    >
      {error != null && <ErrorBox error={error} />}
      {multiline ? <textarea rows={8} {...props} /> : <input {...props} />}
      {multiline && <p className="hint">שורה ריקה = פסקה חדשה</p>}
      <div className="mt-2 flex gap-2">
        <button className="btn btn-sm" disabled={busy}>
          {busy ? 'שומר…' : 'שמירה'}
        </button>
        <button type="button" className="btn-secondary btn-sm" onClick={onCancel}>
          ביטול
        </button>
      </div>
    </form>
  );
}

export function AboutPage() {
  const { data, isLoading } = useSettings();
  const { admin } = useAdmin();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<'title' | 'text' | null>(null);
  const [imgError, setImgError] = useState<unknown>(null);

  const save = useMutation({
    mutationFn: (body: { aboutTitle?: string; aboutText?: string }) => api.patch<PublicSettings>('/api/admin/about', body),
    onSuccess: (s) => {
      qc.setQueryData(['settings'], s);
      setEditing(null);
    },
  });
  const image = useMutation({
    mutationFn: (file: File | null) => {
      if (!file) return api.del<PublicSettings>('/api/admin/about/image');
      const fd = new FormData();
      fd.append('file', file);
      return api.post<PublicSettings>('/api/admin/about/image', fd);
    },
    onSuccess: (s) => {
      setImgError(null);
      qc.setQueryData(['settings'], s);
    },
    onError: setImgError,
  });

  const title = data?.aboutTitle || 'אודות';
  const paragraphs = (data?.aboutText ?? '').split(/\n+/).filter(Boolean);

  return (
    // the admin gets the heading with its own pencil (rendered below)
    <Page title="אודות" heading={admin ? false : title}>
      {admin && editing !== 'title' && (
        <div className="mb-4 flex items-start gap-3">
          <h1 id="page-title" tabIndex={-1} className="outline-none">
            {title}
          </h1>
          <EditButton label="עריכת הכותרת" onClick={() => setEditing('title')} />
        </div>
      )}
      {admin && editing === 'title' && (
        <>
          <h1 id="page-title" tabIndex={-1} className="sr-only">
            עריכת כותרת עמוד אודות
          </h1>
          <InlineEditor label="כותרת עמוד אודות" initial={data?.aboutTitle ?? ''} busy={save.isPending} error={save.error} onCancel={() => setEditing(null)} onSave={(v) => save.mutate({ aboutTitle: v })} />
        </>
      )}
      {isLoading ? (
        <Loading />
      ) : (
        <div className="grid items-center gap-8 md:grid-cols-[1fr_1.4fr]">
          <div className="relative mx-auto w-full max-w-sm">
            <div className="grid aspect-square w-full place-items-center overflow-hidden rounded-[50%_50%_46%_54%/55%_45%_55%_45%] border-4 border-dashed border-orange bg-soft">
              {data?.aboutImageUrl ? (
                <img src={data.aboutImageUrl} alt={`${data.businessName} – תמונה`} className="h-full w-full object-cover" />
              ) : (
                <img src="/logo.png" alt="" className="w-3/4" width={480} height={303} />
              )}
            </div>
            {admin && (
              <div className="absolute inset-x-0 bottom-2 flex flex-wrap justify-center gap-2">
                <label className="btn btn-sm cursor-pointer has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-[#1f4e9a]">
                  <ImageIcon width={18} height={18} /> {image.isPending ? 'מעלה…' : data?.aboutImageUrl ? 'החלפת תמונה' : 'הוספת תמונה'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    data-testid="about-image-input"
                    disabled={image.isPending}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (f) image.mutate(f);
                    }}
                  />
                </label>
                {data?.aboutImageUrl && (
                  <button type="button" className="btn-secondary btn-sm" disabled={image.isPending} onClick={() => window.confirm('להסיר את התמונה?') && image.mutate(null)}>
                    הסרה
                  </button>
                )}
              </div>
            )}
            {imgError != null && (
              <div className="mt-14">
                <ErrorBox error={imgError} />
              </div>
            )}
          </div>
          <div className="text-lg">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="pill">נעים להכיר</span>
              {admin && editing !== 'text' && <EditButton label="עריכת הטקסט" onClick={() => setEditing('text')} />}
            </div>
            {admin && editing === 'text' ? (
              <InlineEditor label="טקסט עמוד אודות" multiline initial={data?.aboutText ?? ''} busy={save.isPending} error={save.error} onCancel={() => setEditing(null)} onSave={(v) => save.mutate({ aboutText: v })} />
            ) : (
              paragraphs.map((p, i) => (
                <p key={i} className="mb-3">
                  {p}
                </p>
              ))
            )}
            <Link to="/shop" className="btn mt-2">
              לספרים ←
            </Link>
          </div>
        </div>
      )}
      <ul className="mt-10 grid gap-5 md:grid-cols-3">
        {VALUES.map((v) => (
          <li key={v.title} className="card">
            <h2 className="mb-1 text-xl">{v.title}</h2>
            <p>{v.text}</p>
          </li>
        ))}
      </ul>
    </Page>
  );
}
