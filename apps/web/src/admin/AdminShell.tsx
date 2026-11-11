import { Navigate, Outlet, useLocation } from 'react-router';
import { Loading } from '../components/ui';
import { useAdmin } from '../lib/admin';

/** Every /admin page: the server is asked who is logged in; no session → login page. */
export default function AdminShell() {
  const { admin, isLoading } = useAdmin({ force: true });
  const loc = useLocation();
  if (isLoading) return <Loading label="בודק הרשאות…" />;
  if (!admin) return <Navigate to={`/admin/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  return <Outlet />;
}
