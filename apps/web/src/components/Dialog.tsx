import { useEffect, useRef, type ReactNode } from 'react';
import { CloseIcon } from './Icons';

/** Native <dialog>: traps focus, closes on Esc, returns focus to the opener – accessible by default. */
export function Dialog({ open, onClose, title, children, labelledBy = 'dialog-title' }: { open: boolean; onClose: () => void; title: string; children: ReactNode; labelledBy?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal?.();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      onClose={onClose}
      onCancel={onClose}
      className="m-auto w-[min(92vw,520px)] rounded-[var(--radius-card)] border-2 border-dashed border-line bg-paper p-0 text-brown backdrop:bg-black/40"
    >
      {open && (
        <div className="p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <h2 id={labelledBy} className="text-xl">
              {title}
            </h2>
            <button type="button" onClick={onClose} className="grid h-10 w-10 flex-none place-items-center rounded-full border-2 border-line bg-white text-burnt" aria-label="סגירה">
              <CloseIcon width={20} height={20} />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
