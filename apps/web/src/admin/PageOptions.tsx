import { ageRangeLabel, type PageOptionDTO } from '@shani/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { Checkbox, ErrorBox, Loading, Page, TextArea, TextField } from '../components/ui';
import { api, ApiError } from '../lib/api';

type Draft = { title: string; summary: string; minAge: string; maxAge: string; active: boolean; sortOrder: string };
const toDraft = (p?: PageOptionDTO): Draft => ({
  title: p?.title ?? '',
  summary: p?.summary ?? '',
  minAge: String(p?.minAge ?? 1),
  maxAge: String(p?.maxAge ?? 5),
  active: p?.active ?? true,
  sortOrder: String(p?.sortOrder ?? 100),
});
const toBody = (d: Draft) => ({ title: d.title, summary: d.summary, minAge: Number(d.minAge), maxAge: Number(d.maxAge), active: d.active, sortOrder: Number(d.sortOrder) || 0 });

function PageForm({ page, onDone }: { page?: PageOptionDTO; onDone: () => void }) {
  const qc = useQueryClient();
  const [d, setD] = useState<Draft>(() => toDraft(page));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [imgBusy, setImgBusy] = useState(false);
  const [imgErr, setImgErr] = useState<unknown>(null);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-pages'] });
    qc.invalidateQueries({ queryKey: ['page-options'] });
  };
  const save = useMutation({
    mutationFn: () => (page ? api.put<PageOptionDTO>(`/api/admin/page-options/${page.id}`, toBody(d)) : api.post<PageOptionDTO>('/api/admin/page-options', toBody(d))),
    onSuccess: () => {
      invalidate();
      onDone();
    },
    onError: (e) => e instanceof ApiError && setErrors(e.fieldErrors()),
  });
  const del = useMutation({
    mutationFn: () => api.del(`/api/admin/page-options/${page!.id}`),
    onSuccess: () => {
      invalidate();
      onDone();
    },
  });

  async function upload(file: File) {
    setImgBusy(true);
    setImgErr(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await api.post(`/api/admin/page-options/${page!.id}/image`, fd);
      invalidate();
    } catch (e) {
      setImgErr(e);
    } finally {
      setImgBusy(false);
    }
  }

  return (
    <form
      noValidate
      className="mt-3 rounded-2xl border-2 border-dashed border-orange bg-[#FFF4E2] p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      aria-label={page ? `עריכת העמוד ${page.title}` : 'עמוד חדש'}
    >
      {save.error && !Object.keys(errors).length && <ErrorBox error={save.error} />}
      <TextField label="שם העמוד" required value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} error={errors.title} />
      <TextArea label="תקציר (מה עושים בעמוד ומה זה מפתח)" required rows={2} value={d.summary} onChange={(e) => setD({ ...d, summary: e.target.value })} error={errors.summary} />
      <div className="grid grid-cols-3 gap-x-3">
        <TextField label="מגיל" inputMode="numeric" value={d.minAge} onChange={(e) => setD({ ...d, minAge: e.target.value })} error={errors.minAge} />
        <TextField label="עד גיל" inputMode="numeric" value={d.maxAge} onChange={(e) => setD({ ...d, maxAge: e.target.value })} error={errors.maxAge} />
        <TextField label="סדר" inputMode="numeric" value={d.sortOrder} onChange={(e) => setD({ ...d, sortOrder: e.target.value })} />
      </div>
      <Checkbox label="זמין לבחירה" checked={d.active} onChange={(e) => setD({ ...d, active: e.target.checked })} />
      {page && (
        <div className="mb-3">
          {imgErr != null && <ErrorBox error={imgErr} />}
          <label className="btn-secondary btn-sm cursor-pointer has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-[#1f4e9a]">
            {imgBusy ? 'מעלה…' : page.imageUrl ? 'החלפת תמונה' : 'הוספת תמונה'}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={imgBusy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f); }} />
          </label>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-sm" disabled={save.isPending}>
          {page ? 'שמירה' : 'הוספת עמוד'}
        </button>
        <button type="button" className="btn-secondary btn-sm" onClick={onDone}>
          ביטול
        </button>
        {page && (
          <button type="button" className="btn-danger btn-sm ms-auto" onClick={() => window.confirm(`למחוק את "${page.title}"? הזמנות קיימות לא יושפעו.`) && del.mutate()}>
            מחיקה
          </button>
        )}
      </div>
    </form>
  );
}

export default function AdminPageOptions() {
  const list = useQuery({ queryKey: ['admin-pages'], queryFn: () => api.get<PageOptionDTO[]>('/api/admin/page-options') });
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <Page title="עמודי הספר בהרכבה אישית" className="max-w-5xl">
      <p className="-mt-2 mb-4">
        אלה העמודים שהלקוחות בוחרים מהם בספר בהרכבה אישית. המחירים לפי מספר העמודים נקבעים ב<Link to="/admin/products">עריכת המוצר</Link>.
      </p>
      <button type="button" className="btn mb-4" onClick={() => setEditing('new')} aria-expanded={editing === 'new'}>
        + עמוד חדש
      </button>
      {editing === 'new' && <PageForm onDone={() => setEditing(null)} />}
      {list.isLoading && <Loading />}
      {list.error && <ErrorBox error={list.error} />}
      <ul className="mt-4 grid gap-3">
        {list.data?.map((p) => (
          <li key={p.id} className="card !p-4">
            <div className="flex items-center gap-4">
              <div className="h-16 w-20 flex-none overflow-hidden rounded-xl bg-soft">{p.imageUrl && <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />}</div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg">
                  {p.title} {!p.active && <span className="text-sm font-normal text-sale">(מוסתר)</span>}
                </h2>
                <p className="hint truncate">
                  {ageRangeLabel(p.minAge, p.maxAge)} · {p.summary}
                </p>
              </div>
              <button type="button" className="btn-secondary btn-sm" aria-expanded={editing === p.id} onClick={() => setEditing(editing === p.id ? null : p.id)}>
                עריכה<span className="sr-only"> של {p.title}</span>
              </button>
            </div>
            {editing === p.id && <PageForm page={p} onDone={() => setEditing(null)} />}
          </li>
        ))}
      </ul>
    </Page>
  );
}
