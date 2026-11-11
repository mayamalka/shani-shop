import { formatILS, isDiscountActive } from '@shani/shared';
import { useId, useRef, useState, type ChangeEvent, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ApiError } from '../lib/api';

/**
 * Every page: sets the browser tab title and renders the page's single <h1>.
 * The h1 gets focus after client-side navigation so screen readers announce the new page.
 */
export function Page({ title, heading, children, className = '' }: { title: string; heading?: ReactNode | false; children?: ReactNode; className?: string }) {
  return (
    <div className={`mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-10 ${className}`}>
      <title>{`${title} – הדודה שני`}</title>
      {heading !== false && (
        <h1 id="page-title" tabIndex={-1} className="mb-4 outline-none">
          {heading ?? title}
        </h1>
      )}
      {children}
    </div>
  );
}

export function Loading({ label = 'טוען…' }: { label?: string }) {
  return (
    <p role="status" className="py-10 text-center text-muted">
      <span className="me-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-burnt border-t-transparent align-[-2px]" aria-hidden />
      {label}
    </p>
  );
}

export function ErrorBox({ error, children }: { error?: unknown; children?: ReactNode }) {
  const msg = error instanceof ApiError || error instanceof Error ? error.message : null;
  return (
    <div role="alert" className="rounded-2xl border-2 border-sale bg-[#fff0ee] p-4 text-sale">
      {children ?? msg ?? 'משהו השתבש. נסו שוב.'}
    </div>
  );
}

interface FieldShell {
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
}

function Shell({ id, label, error, hint, required, className = '', children }: FieldShell & { id: string; children: ReactNode }) {
  return (
    <div className={`mb-4 ${className}`}>
      <div className="label">
        <label htmlFor={id}>{label}</label>
        {/* visual marker only – "required" is announced from the input itself */}
        {required && (
          <span className="text-sale" aria-hidden>
            {' '}*
          </span>
        )}
      </div>
      {children}
      {hint && (
        <span id={`${id}-hint`} className="hint mt-1 block">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${id}-error`} className="error-text">
          {error}
        </span>
      )}
    </div>
  );
}

const describedBy = (id: string, hint?: ReactNode, error?: string) => [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;

type TextFieldProps = FieldShell &
  InputHTMLAttributes<HTMLInputElement> & {
    /** cleans the value while typing (e.g. letters only / digits only) */
    filter?: (value: string) => string;
    /** shown (and announced) when the filter removed something the user typed */
    filterMessage?: string;
  };

export function TextField({ label, error, hint, required, className, filter, filterMessage, onChange, ...rest }: TextFieldProps) {
  const auto = useId();
  const id = rest.id ?? auto;
  // Hebrew/phone keyboards may "compose" text – never touch the value mid-composition, only when it is committed.
  const composing = useRef(false);
  const [rejected, setRejected] = useState(false);

  const apply = (e: ChangeEvent<HTMLInputElement>) => {
    if (filter && !composing.current) {
      const clean = filter(e.target.value);
      if (clean !== e.target.value) {
        e.target.value = clean;
        setRejected(true);
      } else if (rejected) setRejected(false);
    }
    onChange?.(e);
  };

  const shownHint = rejected && filterMessage ? <span className="font-medium text-burnt">{filterMessage}</span> : hint;
  return (
    <Shell id={id} label={label} error={error} hint={shownHint} required={required} className={className}>
      <input
        id={id}
        className="input"
        required={required}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, shownHint, error)}
        onChange={apply}
        onCompositionStart={() => (composing.current = true)}
        onCompositionEnd={(e) => {
          composing.current = false;
          apply({ ...e, target: e.currentTarget, currentTarget: e.currentTarget } as unknown as ChangeEvent<HTMLInputElement>);
        }}
        {...rest}
      />
      {filterMessage && (
        <span className="sr-only" aria-live="polite">
          {rejected ? filterMessage : ''}
        </span>
      )}
    </Shell>
  );
}

export function TextArea({ label, error, hint, required, className, ...rest }: FieldShell & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const auto = useId();
  const id = rest.id ?? auto;
  return (
    <Shell id={id} label={label} error={error} hint={hint} required={required} className={className}>
      <textarea id={id} className="input min-h-28" required={required} aria-required={required || undefined} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} {...rest} />
    </Shell>
  );
}

export function SelectField({ label, error, hint, required, className, children, ...rest }: FieldShell & SelectHTMLAttributes<HTMLSelectElement>) {
  const auto = useId();
  const id = rest.id ?? auto;
  return (
    <Shell id={id} label={label} error={error} hint={hint} required={required} className={className}>
      <select id={id} className="input" aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} {...rest}>
        {children}
      </select>
    </Shell>
  );
}

export function Checkbox({ label, error, className = '', ...rest }: { label: ReactNode; error?: string; className?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const auto = useId();
  const id = rest.id ?? auto;
  return (
    <div className={`my-3 ${className}`}>
      <div className="flex items-start gap-3">
        <input id={id} type="checkbox" className="mt-1 h-5 w-5 flex-none accent-burnt" aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} {...rest} />
        <label htmlFor={id} className="text-[0.95rem]">
          {label}
        </label>
      </div>
      {error && (
        <span id={`${id}-error`} className="error-text ms-8">
          {error}
        </span>
      )}
    </div>
  );
}

/** Regular price, or discount: old price struck through in red + new price in red. */
export function PriceTag({ price, discountPrice = null, discountEndsAt = null, from = false, className = '' }: { price: number; discountPrice?: number | null; discountEndsAt?: string | null; from?: boolean; className?: string }) {
  const sale = isDiscountActive({ price, discountPrice, discountEndsAt });
  if (!sale) {
    return <span className={`font-bold ${className}`}>{from ? `החל מ־${formatILS(price)}` : formatILS(price)}</span>;
  }
  return (
    <span className={`inline-flex flex-wrap items-baseline gap-2 font-bold ${className}`}>
      <span className="text-sale">
        <span className="sr-only">מחיר מבצע: </span>
        {formatILS(discountPrice!)}
      </span>
      <s className="text-[0.85em] font-medium text-sale">
        <span className="sr-only">במקום </span>
        {formatILS(price)}
      </s>
    </span>
  );
}

export function QuantityStepper({ value, onChange, label, max = 10 }: { value: number; onChange: (n: number) => void; label: string; max?: number }) {
  return (
    <div role="group" aria-label={label} className="inline-flex items-center rounded-full border-2 border-line bg-white">
      <button type="button" className="h-11 w-11 text-2xl text-burnt disabled:opacity-40" aria-label="הוספת יחידה" onClick={() => onChange(value + 1)} disabled={value >= max}>
        +
      </button>
      <output className="min-w-8 text-center font-bold" aria-live="polite" aria-label={`כמות ${value}`}>
        {value}
      </output>
      <button type="button" className="h-11 w-11 text-2xl text-burnt disabled:opacity-40" aria-label="הפחתת יחידה" onClick={() => onChange(value - 1)} disabled={value <= 1}>
        −
      </button>
    </div>
  );
}

/** Shown at the top of a form after a failed submit; links jump to each field. */
export function ErrorSummary({ errors, id = 'error-summary' }: { errors: Record<string, string>; id?: string }) {
  const entries = Object.entries(errors);
  if (!entries.length) return null;
  return (
    <div id={id} tabIndex={-1} role="alert" className="mb-5 rounded-2xl border-2 border-sale bg-[#fff0ee] p-4">
      <p className="mb-1 font-bold text-sale">יש לתקן {entries.length === 1 ? 'שדה אחד' : `${entries.length} שדות`}:</p>
      <ul className="list-disc ps-5 text-sale">
        {entries.map(([k, v]) => (
          <li key={k}>{v}</li>
        ))}
      </ul>
    </div>
  );
}
