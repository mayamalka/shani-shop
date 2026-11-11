import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api';

/** Cookie consent: necessary (always) / analytics (GA4) / marketing (Meta + TikTok pixels). */
export interface ConsentState {
  decided: boolean;
  analytics: boolean;
  marketing: boolean;
  visitorId: string;
  /** bump when the cookie policy changes to ask again */
  version: number;
}

export const CONSENT_VERSION = 1;
const KEY = 'shani:consent';

function load(): ConsentState {
  const fresh: ConsentState = { decided: false, analytics: false, marketing: false, visitorId: crypto.randomUUID(), version: CONSENT_VERSION };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh;
    const s = JSON.parse(raw) as ConsentState;
    if (s.version !== CONSENT_VERSION || typeof s.visitorId !== 'string') return { ...fresh, visitorId: s.visitorId ?? fresh.visitorId };
    return s;
  } catch {
    return fresh;
  }
}

interface ConsentContextValue {
  consent: ConsentState;
  save: (choice: { analytics: boolean; marketing: boolean }) => void;
  preferencesOpen: boolean;
  openPreferences: () => void;
  closePreferences: () => void;
}

const Ctx = createContext<ConsentContextValue | null>(null);

export function ConsentProvider({ children }: { children: ReactNode }) {
  const [consent, setConsent] = useState<ConsentState>(load);
  const [preferencesOpen, setOpen] = useState(false);

  const save = useCallback((choice: { analytics: boolean; marketing: boolean }) => {
    setConsent((prev) => {
      const next = { ...prev, ...choice, decided: true, version: CONSENT_VERSION };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      // proof of consent (anonymous visitor id only)
      api.post('/api/consent', { visitorId: next.visitorId, analytics: next.analytics, marketing: next.marketing }).catch(() => undefined);
      return next;
    });
    setOpen(false);
  }, []);

  // withdrawing consent must stop tracking that already loaded → simplest reliable way is a reload
  useEffect(() => {
    const w = window as unknown as { __trackersLoaded?: { analytics: boolean; marketing: boolean } };
    const loaded = w.__trackersLoaded;
    if (loaded && ((loaded.analytics && !consent.analytics) || (loaded.marketing && !consent.marketing))) window.location.reload();
  }, [consent.analytics, consent.marketing]);

  const value = useMemo(
    () => ({ consent, save, preferencesOpen, openPreferences: () => setOpen(true), closePreferences: () => setOpen(false) }),
    [consent, save, preferencesOpen],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useConsent() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useConsent outside ConsentProvider');
  return c;
}
