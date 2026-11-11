import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/** Accessibility menu preferences – remembered in this browser only. */
export interface A11yPrefs {
  textScale: 1 | 1.15 | 1.3;
  contrast: boolean;
  underlineLinks: boolean;
  reduceMotion: boolean;
}

const DEFAULTS: A11yPrefs = { textScale: 1, contrast: false, underlineLinks: false, reduceMotion: false };
const KEY = 'shani:a11y';

function load(): A11yPrefs {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return DEFAULTS;
  }
}

const Ctx = createContext<{ prefs: A11yPrefs; set: (p: Partial<A11yPrefs>) => void; reset: () => void } | null>(null);

export function A11yProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<A11yPrefs>(load);
  useEffect(() => {
    const html = document.documentElement;
    html.style.setProperty('--text-scale', String(prefs.textScale));
    html.classList.toggle('a11y-contrast', prefs.contrast);
    html.classList.toggle('a11y-underline', prefs.underlineLinks);
    html.classList.toggle('a11y-reduce-motion', prefs.reduceMotion);
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
      /* ignore */
    }
  }, [prefs]);
  const value = useMemo(
    () => ({ prefs, set: (p: Partial<A11yPrefs>) => setPrefs((x) => ({ ...x, ...p })), reset: () => setPrefs(DEFAULTS) }),
    [prefs],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useA11y() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useA11y outside A11yProvider');
  return c;
}
