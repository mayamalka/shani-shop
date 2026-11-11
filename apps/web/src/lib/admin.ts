import type { AdminMe } from '@shani/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, setCsrfToken } from './api';

/**
 * Who is logged in is decided ONLY by the server (httpOnly session cookie).
 * This flag just avoids asking the server "am I admin?" for every ordinary visitor;
 * it grants nothing – every admin request is checked by the server.
 */
const HINT = 'shani:admin-ui-hint';
export const setAdminHint = (on: boolean) => {
  try {
    if (on) localStorage.setItem(HINT, '1');
    else localStorage.removeItem(HINT);
  } catch {
    /* ignore */
  }
};
const hasHint = () => {
  try {
    return localStorage.getItem(HINT) === '1';
  } catch {
    return false;
  }
};

export function useAdmin(opts: { force?: boolean } = {}) {
  const q = useQuery({
    queryKey: ['admin-me'],
    enabled: opts.force || hasHint(),
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      try {
        const me = await api.get<AdminMe>('/api/admin/auth/me');
        setCsrfToken(me.csrfToken);
        return me;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          setAdminHint(false);
          setCsrfToken(null);
          return null;
        }
        throw e;
      }
    },
  });
  return { admin: q.data ?? null, isLoading: q.isLoading && (opts.force || hasHint()), refetch: q.refetch };
}

export function useLogout() {
  const qc = useQueryClient();
  return async () => {
    await api.post('/api/admin/auth/logout').catch(() => undefined);
    setCsrfToken(null);
    setAdminHint(false);
    qc.setQueryData(['admin-me'], null);
    qc.removeQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('admin') });
  };
}
