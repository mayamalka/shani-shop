import type { PhotoRef, PhotoRole } from '@shani/shared';
import { useId, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { CameraIcon } from './Icons';

export type UploadedPhoto = PhotoRef & { name: string };

export const thumbUrl = (p: Pick<PhotoRef, 'uploadId' | 'token'>) => `/api/uploads/${encodeURIComponent(p.uploadId)}/thumb?token=${encodeURIComponent(p.token)}`;

const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Big phone photos are shrunk in the browser first (faster upload on mobile data). */
async function shrink(file: File): Promise<Blob> {
  if (file.size < 2.5 * 1024 * 1024 || typeof createImageBitmap !== 'function') return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
    return blob ?? file;
  } catch {
    return file;
  }
}

export function PhotoUpload({ role, label, value, onChange, error }: { role: PhotoRole; label: string; value?: UploadedPhoto; onChange: (p: UploadedPhoto | undefined) => void; error?: string }) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [localError, setLocalError] = useState('');

  async function onFile(file: File | undefined) {
    if (!file) return;
    setLocalError('');
    if (!TYPES.includes(file.type)) return setLocalError('ניתן להעלות תמונות JPG, PNG או WEBP בלבד');
    if (file.size > MAX_BYTES * 2) return setLocalError('הקובץ גדול מדי');
    setBusy(true);
    setStatus('מעלה את התמונה…');
    try {
      const fd = new FormData();
      fd.append('role', role);
      fd.append('file', await shrink(file), file.name.replace(/\.\w+$/, '') + '.jpg');
      const r = await api.post<{ uploadId: string; token: string }>('/api/uploads', fd);
      onChange({ uploadId: r.uploadId, token: r.token, role, name: file.name });
      setStatus(`${label}: התמונה הועלתה`);
    } catch (e) {
      setLocalError(e instanceof ApiError ? e.message : 'ההעלאה נכשלה, נסו שוב');
      setStatus('');
    } finally {
      setBusy(false);
    }
  }

  const err = localError || error;
  return (
    <div>
      <span id={`${id}-label`} className="label">
        {label} <span className="text-sale" aria-hidden>*</span>
      </span>
      <div className={`flex min-h-24 items-center gap-3 rounded-2xl border-2 border-dashed p-3 ${err ? 'border-sale bg-[#fff0ee]' : 'border-orange bg-[#FFF4E2]'}`}>
        {value ? (
          <img src={thumbUrl(value)} alt={`${label} שהועלתה`} className="h-16 w-16 flex-none rounded-xl object-cover" width={64} height={64} />
        ) : (
          <span className="grid h-16 w-16 flex-none place-items-center rounded-xl bg-soft text-burnt" aria-hidden>
            <CameraIcon />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <input
            id={id}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="peer sr-only"
            aria-labelledby={`${id}-label ${id}-btn`}
            aria-describedby={err ? `${id}-err` : `${id}-hint`}
            aria-invalid={err ? true : undefined}
            disabled={busy}
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = '';
            }}
            data-testid={`upload-${role}`}
          />
          <label id={`${id}-btn`} htmlFor={id} className="btn-secondary btn-sm cursor-pointer peer-focus-visible:outline-3 peer-focus-visible:outline-[#1f4e9a]">
            {busy ? 'מעלה…' : value ? 'החלפת תמונה' : 'בחירת תמונה'}
          </label>
          {value && !busy && (
            <button type="button" className="ms-2 text-sm text-sale underline" onClick={() => onChange(undefined)}>
              הסרה
            </button>
          )}
          <span id={`${id}-hint`} className="hint mt-1 block truncate">
            {value ? value.name : 'JPG / PNG, עד 10MB'}
          </span>
        </div>
      </div>
      {err && (
        <span id={`${id}-err`} className="error-text">
          {err}
        </span>
      )}
      <span className="sr-only" role="status">
        {status}
      </span>
    </div>
  );
}
