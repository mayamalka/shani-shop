import { Link } from 'react-router';
import { ProductCard } from '../components/ProductCard';
import { ErrorBox, Loading } from '../components/ui';
import { useProducts } from '../lib/queries';

const BENEFITS = [
  { icon: '✋', title: 'מוטוריקה עדינה', text: 'רוכסנים, כפתורים, סקוטש ושרוכים' },
  { icon: '💬', title: 'שפה ושיום', text: 'מילים, צבעים, צורות ורגשות' },
  { icon: '👨‍👩‍👧', title: 'זהות ומשפחה', text: 'התמונות והשמות שלכם בתוך הספר' },
  { icon: '🧵', title: 'תפור ביד בישראל', text: 'חומרים בטוחים, תפרים כפולים' },
];

export function HomePage() {
  const products = useProducts();
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-10">
      <title>הדודה שני – ספרי לבד אישיים בעבודת יד</title>
      <section className="relative grid items-center gap-8 rounded-[48px] border-[3px] border-dashed border-soft bg-paper p-6 md:grid-cols-[1.2fr_1fr] md:p-12" aria-labelledby="page-title">
        <div>
          <span className="pill">✂️ בעבודת יד, באהבה</span>
          <h1 id="page-title" tabIndex={-1} className="mt-3 outline-none md:text-5xl">
            ספרי לבד אישיים
            <br />
            שמלמדים, מרגיעים ומצחיקים
          </h1>
          <p className="my-5 max-w-xl text-lg">ספרים רכים ממשי בד, עם התמונות והשמות של המשפחה שלכם – לפיתוח מוטוריקה עדינה, שפה וזיכרון, לגילאי 1–5.</p>
          <div className="flex flex-wrap gap-3">
            <Link to="/shop" className="btn">
              לחנות ←
            </Link>
            <Link to="/about" className="btn-secondary">
              הכירו את שני
            </Link>
          </div>
        </div>
        <img src="/logo.png" alt="" className="mx-auto w-full max-w-sm" width={480} height={303} />
      </section>

      <section aria-labelledby="our-books" className="mt-12">
        <h2 id="our-books">הספרים שלנו</h2>
        {products.isLoading && <Loading />}
        {products.error && <ErrorBox error={products.error} />}
        <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {products.data?.slice(0, 6).map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      </section>

      <section aria-labelledby="why" className="mt-12">
        <h2 id="why">למה ספר לבד?</h2>
        <ul className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {BENEFITS.map((b) => (
            <li key={b.title} className="card text-center">
              <span className="block text-3xl" aria-hidden>
                {b.icon}
              </span>
              <b className="mt-1 block">{b.title}</b>
              <span className="text-sm text-muted">{b.text}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
