import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useConsent } from '../lib/consent';
import { Checkbox } from './ui';
import { Dialog } from './Dialog';

/** First-visit consent banner + "cookie settings" dialog. Nothing optional loads before a "yes". */
export function CookieBanner() {
  const { consent, save, preferencesOpen, openPreferences, closePreferences } = useConsent();
  const [analytics, setAnalytics] = useState(consent.analytics);
  const [marketing, setMarketing] = useState(consent.marketing);
  useEffect(() => {
    if (preferencesOpen) {
      setAnalytics(consent.analytics);
      setMarketing(consent.marketing);
    }
  }, [preferencesOpen, consent.analytics, consent.marketing]);

  return (
    <>
      {!consent.decided && !preferencesOpen && (
        <section
          aria-labelledby="cookie-title"
          className="fixed inset-x-0 bottom-0 z-40 border-t-[3px] border-dashed border-orange bg-white p-4 shadow-[0_-6px_20px_rgba(90,58,34,.15)] md:px-8"
          data-testid="cookie-banner"
        >
          <div className="mx-auto flex max-w-6xl flex-col gap-4 md:flex-row md:items-center">
            <div className="flex-1 text-[0.95rem]">
              <h2 id="cookie-title" className="mb-1 font-sans text-base font-bold text-brown">
                🍪 אנחנו משתמשים בעוגיות
              </h2>
              <p>
                עוגיות הכרחיות מפעילות את האתר ואת סל הקניות. בהסכמתכם נשתמש גם בעוגיות סטטיסטיקה (Google Analytics) ושיווק (Meta, TikTok) כדי לשפר את האתר
                והפרסום. <Link to="/privacy">מדיניות פרטיות</Link>
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="button" className="btn" onClick={() => save({ analytics: true, marketing: true })}>
                אישור הכל
              </button>
              <button type="button" className="btn-secondary" onClick={() => save({ analytics: false, marketing: false })}>
                הכרחיות בלבד
              </button>
              <button type="button" className="btn-secondary" onClick={openPreferences}>
                התאמה אישית
              </button>
            </div>
          </div>
        </section>
      )}

      <Dialog open={preferencesOpen} onClose={closePreferences} title="הגדרות עוגיות" labelledBy="cookie-prefs-title">
        <p className="mb-3 text-[0.95rem]">אפשר לשנות את הבחירה בכל עת דרך הקישור "הגדרות עוגיות" בתחתית האתר.</p>
        <Checkbox label={<><b>הכרחיות</b> – סל קניות, אבטחה, שמירת הבחירות שלך. תמיד פעילות.</>} checked disabled readOnly />
        <Checkbox label={<><b>סטטיסטיקה</b> – Google Analytics: אילו עמודים נצפים ואיפה גולשים נתקעים. ללא פרטים מזהים.</>} checked={analytics} onChange={(e) => setAnalytics(e.target.checked)} />
        <Checkbox label={<><b>שיווק</b> – Meta Pixel ו־TikTok Pixel: מדידת פרסומות והצגת מודעות רלוונטיות.</>} checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" className="btn" onClick={() => save({ analytics, marketing })}>
            שמירת הבחירה
          </button>
          <button type="button" className="btn-secondary" onClick={() => save({ analytics: true, marketing: true })}>
            אישור הכל
          </button>
        </div>
      </Dialog>
    </>
  );
}
