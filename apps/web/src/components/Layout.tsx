import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useAdmin, useLogout } from '../lib/admin';
import { loadTrackers, trackPageView } from '../lib/analytics';
import { useCart } from '../lib/cart';
import { useConsent } from '../lib/consent';
import { useSettings } from '../lib/queries';
import { A11yMenu } from './A11yMenu';
import { CookieBanner } from './CookieBanner';
import { CartIcon, CloseIcon, MenuIcon } from './Icons';

type NavItem = { to: string; label: string; end?: boolean };
const MAIN_NAV: NavItem[] = [
  { to: '/', label: 'דף הבית', end: true },
  { to: '/about', label: 'אודות' },
  { to: '/shop', label: 'חנות' },
  { to: '/contact', label: 'צור קשר' },
];
const ADMIN_NAV: NavItem[] = [
  { to: '/admin/orders', label: 'הזמנות' },
  { to: '/admin/pages', label: 'עמודי הרכבה' },
  { to: '/admin/settings', label: 'הגדרות' },
];

/** Desktop menu with one underline bar that slides to the current page (instant when "reduce motion" is on). */
function DesktopNav({ links }: { links: NavItem[] }) {
  const listRef = useRef<HTMLUListElement>(null);
  const { pathname } = useLocation();
  const [bar, setBar] = useState<{ left: number; width: number } | null>(null);
  const [animate, setAnimate] = useState(false);

  const measure = useCallback(() => {
    const ul = listRef.current;
    const active = ul?.querySelector<HTMLElement>('a[aria-current="page"]');
    if (!ul || !active) return setBar(null);
    const a = active.getBoundingClientRect();
    const u = ul.getBoundingClientRect();
    setBar({ left: a.left - u.left + 8, width: a.width - 16 });
  }, []);

  useLayoutEffect(measure, [measure, pathname, links.length]);
  useEffect(() => {
    // first position without sliding in from nowhere; afterwards slide
    const t = requestAnimationFrame(() => setAnimate(true));
    const ul = listRef.current;
    const ro = typeof ResizeObserver !== 'undefined' && ul ? new ResizeObserver(measure) : null;
    if (ro && ul) ro.observe(ul);
    document.fonts?.ready.then(measure).catch(() => undefined);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(t);
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure]);

  return (
    <nav aria-label="תפריט ראשי" className="hidden md:block">
      <ul ref={listRef} className="relative flex flex-wrap items-center gap-x-5 gap-y-1 pb-1.5 text-[1.05rem]">
        {links.map((l) => (
          <li key={l.to}>
            <NavLink
              to={l.to}
              end={l.end}
              className={({ isActive }) => `block rounded-lg px-2 py-1 font-medium no-underline transition-colors ${isActive ? 'text-burnt' : 'text-brown hover:text-burnt'}`}
            >
              {l.label}
            </NavLink>
          </li>
        ))}
        <span
          aria-hidden
          data-testid="nav-indicator"
          className={`pointer-events-none absolute bottom-0 h-[3px] rounded-full bg-sun motion-reduce:transition-none ${animate ? 'transition-[left,width,opacity] duration-300 ease-out' : ''}`}
          style={{ left: bar?.left ?? 0, width: bar?.width ?? 0, opacity: bar ? 1 : 0 }}
        />
      </ul>
    </nav>
  );
}

function Header() {
  const { count } = useCart();
  const { admin } = useAdmin();
  const logout = useLogout();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  const links = [...MAIN_NAV, ...(admin ? ADMIN_NAV : [])];
  const navClass = ({ isActive }: { isActive: boolean }) =>
    `block rounded-lg px-2 py-2 font-medium no-underline ${isActive ? 'text-burnt underline decoration-sun decoration-[3px] underline-offset-8' : 'text-brown hover:text-burnt'}`;

  return (
    <header className="stitch sticky top-0 z-30 border-x-0 border-t-0 bg-paper/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2 md:px-8">
        <Link to="/" className="flex-none" aria-label="הדודה שני – לדף הבית">
          <img src="/logo.png" alt="" width={120} height={76} className="h-14 w-auto md:h-[76px]" />
        </Link>

        <DesktopNav links={links} />

        <div className="flex items-center gap-2">
          {admin && (
            <button type="button" onClick={logout} className="btn-secondary btn-sm hidden md:inline-flex">
              יציאה מניהול
            </button>
          )}
          <button
            type="button"
            className="grid h-12 w-12 place-items-center rounded-full border-2 border-line bg-white text-burnt md:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? 'סגירת תפריט' : 'פתיחת תפריט'}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <CloseIcon /> : <MenuIcon />}
          </button>
          <Link
            to="/cart"
            className="relative grid h-12 w-12 place-items-center rounded-full border-2 border-line bg-white text-burnt"
            aria-label={count ? `סל הקניות, ${count} פריטים` : 'סל הקניות, ריק'}
            data-testid="cart-link"
          >
            <CartIcon />
            {count > 0 && (
              <span className="absolute -top-1.5 -left-1.5 grid h-6 min-w-6 place-items-center rounded-full border-2 border-white bg-burnt px-1 text-xs font-bold text-white" aria-hidden>
                {count}
              </span>
            )}
          </Link>
        </div>
      </div>

      <nav id="mobile-nav" aria-label="תפריט ראשי" hidden={!open} className="border-t-2 border-dashed border-line px-4 pb-4 md:hidden">
        <ul className="grid gap-1 pt-2 text-lg">
          {links.map((l) => (
            <li key={l.to}>
              <NavLink to={l.to} end={l.end} className={navClass}>
                {l.label}
              </NavLink>
            </li>
          ))}
          {admin && (
            <li>
              <button type="button" onClick={logout} className="btn-secondary btn-sm mt-2">
                יציאה מניהול
              </button>
            </li>
          )}
        </ul>
      </nav>
    </header>
  );
}

function Footer() {
  const { openPreferences } = useConsent();
  const year = new Date().getFullYear();
  return (
    <footer className="stitch mt-12 border-x-0 border-b-0 bg-paper">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-sm md:px-8">
        <nav aria-label="מידע משפטי">
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            <li>
              <Link to="/terms">תקנון</Link>
            </li>
            <li>
              <Link to="/privacy">מדיניות פרטיות</Link>
            </li>
            <li>
              <Link to="/accessibility">הצהרת נגישות</Link>
            </li>
            <li>
              <Link to="/shipping">משלוחים והחזרות</Link>
            </li>
            <li>
              <button type="button" className="text-burnt underline-offset-2 hover:underline" onClick={openPreferences}>
                הגדרות עוגיות
              </button>
            </li>
          </ul>
        </nav>
        <p className="text-muted">
          © {year} הדודה שני · ספרי לבד בעבודת יד ·{' '}
          <Link to="/admin/login" className="text-muted">
            כניסת מנהלת
          </Link>
        </p>
      </div>
    </footer>
  );
}

/** After client-side navigation: scroll up, move focus to the new page's heading, announce it, log a page view. */
function RouteChangeHandler() {
  const { pathname } = useLocation();
  const first = useRef(true);
  const prevPath = useRef(pathname);
  const [announcement, setAnnouncement] = useState('');
  const { consent } = useConsent();
  const settings = useSettings();

  useEffect(() => {
    if (settings.data && consent.decided) loadTrackers(settings.data, consent);
  }, [settings.data, consent]);

  useEffect(() => {
    // inside the orders split view, picking an order is handled by the order panel (no jump to the top)
    const withinOrders = /^\/admin\/orders\/[^/]+$/.test(pathname) && prevPath.current.startsWith('/admin/orders');
    prevPath.current = pathname;
    const t = window.setTimeout(() => {
      if (!first.current && !withinOrders) {
        window.scrollTo(0, 0);
        document.getElementById('page-title')?.focus({ preventScroll: true });
        setAnnouncement(document.title);
      }
      first.current = false;
      trackPageView(pathname, document.title);
    }, 60);
    return () => window.clearTimeout(t);
  }, [pathname]);

  return (
    <div className="sr-only" aria-live="polite" aria-atomic="true" data-testid="route-announcer">
      {announcement}
    </div>
  );
}

export function Layout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only-focusable fixed top-2 right-2 z-50 rounded-full bg-burnt px-5 py-3 font-bold text-white">
        דילוג לתוכן הראשי
      </a>
      <Header />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <Outlet />
      </main>
      <Footer />
      <RouteChangeHandler />
      <A11yMenu />
      <CookieBanner />
    </div>
  );
}
