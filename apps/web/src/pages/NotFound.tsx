import { Link } from 'react-router';
import { Page } from '../components/ui';

export function NotFoundPage() {
  return (
    <Page title="העמוד לא נמצא">
      <div className="card max-w-xl">
        <p className="mb-4">אופס, העמוד שחיפשתם לא קיים (אולי הקישור השתנה).</p>
        <div className="flex flex-wrap gap-3">
          <Link to="/" className="btn">
            לדף הבית
          </Link>
          <Link to="/shop" className="btn-secondary">
            לחנות
          </Link>
        </div>
      </div>
    </Page>
  );
}
