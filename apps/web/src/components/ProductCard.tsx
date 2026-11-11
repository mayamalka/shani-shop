import { isDiscountActive, type ProductDTO } from '@shani/shared';
import { Link } from 'react-router';
import { PencilIcon } from './Icons';
import { PriceTag } from './ui';

/** `editable` (admin only): pencil button to the product editor + a "hidden" badge for products not shown to shoppers. */
export function ProductCard({ product, headingLevel = 3, editable = false }: { product: ProductDTO; headingLevel?: 2 | 3; editable?: boolean }) {
  const img = product.images[0];
  const H = `h${headingLevel}` as 'h2' | 'h3';
  const sale = isDiscountActive(product);
  const cta = product.type === 'CUSTOM' ? 'להרכבת הספר' : 'לפרטים';
  return (
    <article className="card relative flex flex-col">
      {sale && <span className="absolute top-4 right-4 z-10 rounded-full bg-sale px-3 py-1 text-sm font-bold text-white">מבצע</span>}
      {editable && (
        <Link
          to={`/admin/products/${product.id}`}
          className="absolute top-4 left-4 z-20 grid h-11 w-11 place-items-center rounded-full border-2 border-burnt bg-white text-burnt no-underline shadow"
          aria-label={`עריכת המוצר ${product.title}`}
          data-testid="edit-product"
        >
          <PencilIcon width={20} height={20} />
        </Link>
      )}
      {editable && !product.active && (
        <span className="absolute top-16 left-4 z-10 rounded-full bg-brown px-3 py-1 text-sm font-bold text-white">מוסתר מהחנות</span>
      )}
      <div className="mb-3 aspect-[4/3] overflow-hidden rounded-2xl bg-soft">
        {img && <img src={img.url} alt="" loading="lazy" className="h-full w-full object-cover" width={800} height={600} />}
      </div>
      {product.ageLabel && <span className="pill self-start">{product.ageLabel}</span>}
      <H className="mt-2 mb-1 text-xl">
        <Link
          to={editable && !product.active ? `/admin/products/${product.id}` : `/shop/${product.slug}`}
          className="text-burnt no-underline after:absolute after:inset-0 after:content-['']"
        >
          {product.title}
        </Link>
      </H>
      <p className="mb-4 line-clamp-3 flex-1 text-[0.95rem] text-muted">{product.description}</p>
      <div className="flex items-center justify-between gap-3">
        <PriceTag price={product.price} discountPrice={product.discountPrice} discountEndsAt={product.discountEndsAt} from={product.type === 'CUSTOM'} className="text-lg" />
        <span className="btn btn-sm" aria-hidden>
          {cta}
        </span>
      </div>
    </article>
  );
}
