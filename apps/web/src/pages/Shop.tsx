import type { ProductDTO } from '@shani/shared';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { ProductCard } from '../components/ProductCard';
import { ErrorBox, Loading, Page } from '../components/ui';

import { useAdmin } from '../lib/admin';
import { api } from '../lib/api';
import { useProducts } from '../lib/queries';

const FILTERS: { key: string; label: string; match: (p: ProductDTO) => boolean }[] = [
  { key: 'all', label: 'הכל', match: () => true },
  { key: '1-3', label: 'גילאי 1–3', match: (p) => /1\s*[–-]\s*3/.test(p.ageLabel) || p.type === 'CUSTOM' },
  { key: '3-5', label: 'גילאי 3–5', match: (p) => /3\s*[–-]\s*5/.test(p.ageLabel) || p.type === 'CUSTOM' },
  { key: 'custom', label: 'הרכבה אישית', match: (p) => p.type === 'CUSTOM' },
  { key: 'more', label: 'מוצרים נוספים', match: (p) => p.type === 'SIMPLE' },
];

export function ShopPage() {
  const { admin } = useAdmin();
  const publicList = useProducts();
  // the admin also sees hidden products (to edit them); shoppers see only what is on sale
  const adminList = useQuery({ queryKey: ['admin-products'], queryFn: () => api.get<ProductDTO[]>('/api/admin/products'), enabled: !!admin });
  const products = admin ? adminList : publicList;
  const [params, setParams] = useSearchParams();
  const active = FILTERS.find((f) => f.key === params.get('filter')) ?? FILTERS[0]!;
  const list = products.data?.filter(active.match) ?? [];
  return (
    <Page title="החנות">
      <div className="-mt-2 mb-5 flex flex-wrap items-center justify-between gap-3">
        <p>כל ספר נתפר במיוחד עבורכם · זמן הכנה כ־3 שבועות</p>
        {admin && (
          <Link to="/admin/products/new" className="btn btn-sm">
            + הוספת מוצר
          </Link>
        )}
      </div>
      <div role="group" aria-label="סינון מוצרים" className="mb-6 flex flex-wrap gap-2">
        {FILTERS.filter((f) => f.key !== 'more' || products.data?.some(f.match)).map((f) => (
          <button key={f.key} type="button" className="chip" aria-pressed={f.key === active.key} onClick={() => setParams(f.key === 'all' ? {} : { filter: f.key }, { replace: true })}>
            {f.label}
          </button>
        ))}
      </div>
      {products.isLoading && <Loading />}
      {products.error && <ErrorBox error={products.error} />}
      <p className="sr-only" aria-live="polite">
        {products.data ? `מוצגים ${list.length} מוצרים` : ''}
      </p>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((p) => (
          <ProductCard key={p.id} product={p} headingLevel={2} editable={!!admin} />
        ))}
      </div>
      {products.data && list.length === 0 && <p className="py-8 text-center text-muted">אין מוצרים בקטגוריה הזו כרגע.</p>}
    </Page>
  );
}
