import { normalizePlace } from '@shani/shared';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

export interface ComboOption {
  value: string;
  label: string;
}

const MAX_SHOWN = 60;

/** Matches anywhere in the name. Order: name starts with the text → a word starts with it → contains it. */
export function filterOptions(options: ComboOption[], query: string): ComboOption[] {
  const q = normalizePlace(query);
  if (!q) return options.slice(0, MAX_SHOWN);
  const starts: ComboOption[] = [];
  const wordStarts: ComboOption[] = [];
  const contains: ComboOption[] = [];
  for (const o of options) {
    const n = normalizePlace(o.label);
    if (n.startsWith(q)) starts.push(o);
    else if (n.includes(' ' + q)) wordStarts.push(o);
    else if (n.includes(q)) contains.push(o);
    if (starts.length >= MAX_SHOWN) break;
  }
  return [...starts, ...wordStarts, ...contains].slice(0, MAX_SHOWN);
}

/**
 * Searchable dropdown (ARIA 1.2 combobox): type to filter, arrows to move, Enter to choose, Esc to close.
 * Only a value from the list counts as selected.
 */
export function Combobox({
  label,
  options,
  value,
  onChange,
  required,
  disabled,
  error,
  hint,
  placeholder,
  loading,
  testId,
}: {
  label: string;
  options: ComboOption[];
  /** selected option value ('' = none) */
  value: string;
  onChange: (option: ComboOption | null) => void;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  hint?: string;
  placeholder?: string;
  loading?: boolean;
  testId?: string;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const selected = options.find((o) => o.value === value) ?? null;
  const [text, setText] = useState(selected?.label ?? '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  // keep the text in sync when the selection changes from outside (e.g. city changed → street cleared)
  useEffect(() => {
    setText(selected?.label ?? '');
  }, [selected?.label]);

  const shown = useMemo(() => filterOptions(options, open && text !== selected?.label ? text : ''), [options, text, open, selected?.label]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  const choose = (o: ComboOption) => {
    setText(o.label);
    setOpen(false);
    onChange(o);
  };

  const commitTyped = () => {
    // leaving the field: accept an exact (normalized) match, otherwise keep the text but nothing is selected
    const exact = options.find((o) => normalizePlace(o.label) === normalizePlace(text));
    if (exact && exact.value !== value) choose(exact);
    else if (!exact && value) onChange(null);
    setOpen(false);
  };

  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;

  return (
    <div className="relative mb-4" data-testid={testId}>
      <div className="label">
        <label htmlFor={id}>{label}</label>
        {required && (
          <span className="text-sale" aria-hidden>
            {' '}*
          </span>
        )}
      </div>
      <input
        id={id}
        type="text"
        role="combobox"
        className="input"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && shown[active] ? `${id}-opt-${active}` : undefined}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        disabled={disabled}
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => setTimeout(commitTyped, 120)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, shown.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && open && shown[active]) {
            e.preventDefault();
            choose(shown[active]!);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      <ul
        id={listId}
        ref={listRef}
        role="listbox"
        aria-label={label}
        hidden={!open || disabled}
        className="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-2xl border-2 border-line bg-white py-1 shadow-lg"
      >
        {loading && <li className="px-4 py-2 text-muted">טוען…</li>}
        {!loading && shown.length === 0 && <li className="px-4 py-2 text-muted">לא נמצאו תוצאות</li>}
        {!loading &&
          shown.map((o, i) => (
            <li
              key={o.value}
              id={`${id}-opt-${i}`}
              data-index={i}
              role="option"
              aria-selected={o.value === value}
              className={`cursor-pointer px-4 py-2 ${i === active ? 'bg-soft' : ''} ${o.value === value ? 'font-bold' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(o)}
            >
              {o.label}
            </li>
          ))}
      </ul>
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
