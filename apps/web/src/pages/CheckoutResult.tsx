import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Page } from '../components/ui';
import { trackShopEvent } from '../lib/analytics';
import { useCart } from '../lib/cart';
import { PENDING_ORDER_KEY } from './Checkout';

export function CheckoutSuccessPage() {
  const [params] = useSearchParams();
  const number = params.get('order');
  const { dispatch } = useCart();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    dispatch({ type: 'clear' });
    try {
      const pending = JSON.parse(sessionStorage.getItem(PENDING_ORDER_KEY) ?? 'null') as { number: number; total: number; items: { productId: string; title: string; unitPrice: number; quantity: number }[] } | null;
      if (pending && String(pending.number) === number) {
        trackShopEvent('purchase', {
          value: pending.total / 100,
          transactionId: String(pending.number),
          items: pending.items.map((l) => ({ id: l.productId, name: l.title, price: l.unitPrice / 100, quantity: l.quantity })),
        });
      }
      sessionStorage.removeItem(PENDING_ORDER_KEY);
    } catch {
      /* ignore */
    }
  }, [dispatch, number]);

  return (
    <Page title="תודה! ההזמנה התקבלה" heading="תודה! ההזמנה התקבלה 💛">
      <div className="card max-w-2xl">
        {number && (
          <p className="text-lg">
            מספר הזמנה: <b data-testid="order-number">{number}</b>
          </p>
        )}
        <p className="my-3">שלחנו אישור הזמנה לאימייל. כל ספר נתפר במיוחד עבורכם – זמן ההכנה כ־3 שבועות, ונעדכן אתכם בכל שלב.</p>
        <Link to="/shop" className="btn">
          חזרה לחנות
        </Link>
      </div>
    </Page>
  );
}

export function CheckoutCancelledPage() {
  return (
    <Page title="התשלום בוטל">
      <div className="card max-w-2xl">
        <p className="mb-4">התשלום לא הושלם ולא חויבתם. הסל שלכם שמור – אפשר לנסות שוב בכל רגע.</p>
        <div className="flex flex-wrap gap-3">
          <Link to="/checkout" className="btn">
            לנסות שוב
          </Link>
          <Link to="/cart" className="btn-secondary">
            חזרה לסל
          </Link>
        </div>
      </div>
    </Page>
  );
}
