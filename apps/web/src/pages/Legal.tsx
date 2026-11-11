/**
 * Legal pages – DRAFT TEXTS. They cover what Israeli law expects (Consumer Protection Law, Privacy Protection Law
 * incl. Amendment 13, Equal Rights for Persons with Disabilities regulations), but must be reviewed by a lawyer
 * before going live. Business details come from admin settings.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Page } from '../components/ui';
import { useSettings } from '../lib/queries';

const UPDATED = '09/11/2026';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-xl">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Page title={title}>
      <article className="card max-w-3xl leading-relaxed">
        {children}
        <p className="hint mt-6">עודכן לאחרונה: {UPDATED}</p>
      </article>
    </Page>
  );
}

export function TermsPage() {
  const s = useSettings().data;
  return (
    <LegalPage title="תקנון האתר">
      <Section title="כללי">
        <p>האתר מופעל על ידי {s?.businessName ?? 'הדודה שני'} ("העסק"). השימוש באתר וביצוע הזמנה מהווים הסכמה לתקנון זה. התקנון מנוסח בלשון נקבה/זכר מטעמי נוחות בלבד ומיועד לכל המגדרים.</p>
      </Section>
      <Section title="המוצרים וההזמנה">
        <p>ספרי הלבד מיוצרים בעבודת יד לפי ההזמנה, עם הפרטים והתמונות שהלקוח/ה מסר/ה. ייתכנו הבדלים קלים בין התמונות באתר לבין המוצר, הנובעים מעבודת היד ומהבדים.</p>
        <p>זמן ההכנה המשוער הוא כ־3 שבועות ממועד התשלום, בתוספת זמן המשלוח. נעדכן במייל על כל שינוי.</p>
        <p>הלקוח/ה אחראי/ת לכך שיש לו/ה זכות להשתמש בתמונות שהועלו, ושהשמות שנמסרו נכונים.</p>
      </Section>
      <Section title="מחירים ותשלום">
        <p>המחירים באתר בשקלים חדשים. {s?.taxStatus === 'MURSHE' ? 'המחירים כוללים מע״מ.' : 'העסק הוא עוסק פטור ולכן לא נגבה מע״מ.'} התשלום מתבצע בעמוד מאובטח של חברת סליקה; פרטי כרטיס האשראי אינם נשמרים אצלנו. מחיר המבצע, כשמוצג, הוא המחיר שנגבה בפועל.</p>
      </Section>
      <Section title="ביטול עסקה">
        <p>
          לפי חוק הגנת הצרכן, התשמ״א–1981, הזכות לבטל עסקה אינה חלה על טובין שיוצרו במיוחד בעבור הצרכן/ית. ספר מותאם אישית ניתן לביטול ללא עלות רק לפני תחילת הייצור (סטטוס "שולמה – ממתינה"). מוצרים
          שאינם מותאמים אישית ניתנים לביטול לפי הוראות החוק – ראו <Link to="/shipping">משלוחים והחזרות</Link>.
        </p>
      </Section>
      <Section title="אחריות">
        <p>הספרים מיועדים לשימוש תחת השגחת מבוגר. יש לבדוק את הספר מדי פעם ולהפסיק להשתמש בו אם חלק כלשהו נפרם. העסק אינו אחראי לנזק שנגרם משימוש שלא בהתאם להוראות.</p>
      </Section>
      <Section title="יצירת קשר">
        <p>
          לכל שאלה: <Link to="/contact">עמוד צור קשר</Link>
          {s?.businessEmail && (
            <>
              {' '}או במייל <a href={`mailto:${s.businessEmail}`}>{s.businessEmail}</a>
            </>
          )}
          .
        </p>
      </Section>
    </LegalPage>
  );
}

export function PrivacyPage() {
  const s = useSettings().data;
  return (
    <LegalPage title="מדיניות פרטיות">
      <Section title="מי אנחנו">
        <p>{s?.businessName ?? 'הדודה שני'} אחראית על המידע שנאסף באתר. אנו מכבדים את פרטיותך ופועלים לפי חוק הגנת הפרטיות, התשמ״א–1981 ותקנותיו, כולל תיקון 13.</p>
      </Section>
      <Section title="איזה מידע נאסף ולמה">
        <ul className="list-disc space-y-1 ps-5">
          <li><b>פרטי הזמנה</b> – שם, טלפון, אימייל וכתובת: לביצוע ההזמנה, המשלוח והקבלה.</li>
          <li><b>תמונות ושמות להתאמה אישית</b> (כולל תמונות של ילדים): אך ורק לתפירת הספר.</li>
          <li><b>פניות בטופס צור קשר</b> – לצורך מענה בלבד.</li>
          <li><b>עוגיות</b> – הכרחיות לתפעול האתר והסל; עוגיות סטטיסטיקה ושיווק רק בהסכמתך.</li>
        </ul>
      </Section>
      <Section title="תמונות של ילדים">
        <p>התמונות נשמרות באחסון פרטי, נגישות רק לבעלת העסק, ומידע המיקום (GPS) שבקובץ נמחק אוטומטית. התמונות נמחקות {s?.photoRetentionDays ?? 60} יום לאחר שההזמנה נשלחה. תמונות שהועלו ללא הזמנה נמחקות בתוך יומיים.</p>
      </Section>
      <Section title="עוגיות וכלי מדידה">
        <p>
          בהסכמתך בלבד אנו משתמשים ב־Google Analytics (סטטיסטיקה) וב־Meta Pixel ו־TikTok Pixel (שיווק), כדי להבין איך משתמשים באתר ולמדוד פרסום. לכלים אלה לא נשלחים שמות, טלפונים, כתובות או תמונות.
          אפשר לשנות את ההסכמה בכל עת דרך "הגדרות עוגיות" בתחתית האתר.
        </p>
      </Section>
      <Section title="שיתוף מידע">
        <p>המידע לא נמכר. הוא מועבר רק לספקים הנדרשים להפעלת השירות: חברת הסליקה (תשלום), חברת המשלוחים, ספק האחסון וספק הדיוור – ורק במידה הנדרשת.</p>
      </Section>
      <Section title="דיוור">
        <p>נשלח עדכונים ומבצעים רק אם סימנת הסכמה לכך. אפשר להסיר את עצמך בכל עת בקישור שבמייל או בפנייה אלינו.</p>
      </Section>
      <Section title="הזכויות שלך">
        <p>
          ניתן לבקש לעיין במידע, לתקן אותו או למחוק אותו (בכפוף לחובות שמירת מסמכים לפי דין) דרך <Link to="/contact">צור קשר</Link>
          {s?.businessEmail && <> או בכתובת <a href={`mailto:${s.businessEmail}`}>{s.businessEmail}</a></>}.
        </p>
      </Section>
      <Section title="אבטחה">
        <p>האתר מוצפן (HTTPS), הגישה לממשק הניהול מוגנת בסיסמה ובאימות דו־שלבי, ופרטי אשראי אינם נשמרים אצלנו.</p>
      </Section>
    </LegalPage>
  );
}

export function AccessibilityStatementPage() {
  const s = useSettings().data;
  return (
    <LegalPage title="הצהרת נגישות">
      <Section title="מחויבות לנגישות">
        <p>אנו רואים חשיבות רבה בהנגשת האתר לכלל האוכלוסייה, כולל אנשים עם מוגבלות, בהתאם לחוק שוויון זכויות לאנשים עם מוגבלות, התשנ״ח–1998 ותקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות), התשע״ג–2013.</p>
      </Section>
      <Section title="רמת הנגישות">
        <p>האתר הונגש בהתאם לתקן הישראלי ת״י 5568 ברמה AA, המבוסס על הנחיות WCAG, ונבנה לפי WCAG 2.1 ברמה AA.</p>
      </Section>
      <Section title="מה עשינו">
        <ul className="list-disc space-y-1 ps-5">
          <li>ניווט מלא במקלדת, סימון פוקוס ברור וקישור "דילוג לתוכן הראשי".</li>
          <li>תמיכה בקוראי מסך: כותרות מסודרות, תוויות לשדות, טקסט חלופי לתמונות והכרזה על שינויים (סל, מחירים, מעבר עמוד).</li>
          <li>ניגודיות צבעים תקנית, תמיכה בהגדלת טקסט עד 200% ובמסכים צרים.</li>
          <li>תפריט נגישות: הגדלת טקסט, ניגודיות גבוהה, הדגשת קישורים ועצירת אנימציות.</li>
          <li>הודעות שגיאה ברורות בטפסים, המקושרות לשדה הרלוונטי.</li>
        </ul>
      </Section>
      <Section title="דפדפנים וטכנולוגיות">
        <p>האתר נבדק בדפדפני Chrome, Safari, Edge ו־Firefox בגרסאותיהם העדכניות, במחשב ובטלפון, ועם קוראי המסך NVDA ו־VoiceOver.</p>
      </Section>
      <Section title="מגבלות ידועות">
        <p>תמונות שמעלים הלקוחות להתאמה אישית אינן כוללות תיאור טקסטואלי. אם נתקלת ברכיב שאינו נגיש – נשמח לדעת ולתקן.</p>
      </Section>
      <Section title="רכז/ת נגישות ופניות">
        <p>{s?.accessibilityCoordinator || 'פרטי רכז/ת הנגישות יעודכנו בקרוב.'}</p>
        <p>
          ניתן לפנות גם דרך <Link to="/contact">עמוד צור קשר</Link>
          {s?.businessEmail && <> או במייל <a href={`mailto:${s.businessEmail}`}>{s.businessEmail}</a></>}. נשתדל להשיב בתוך 3 ימי עסקים.
        </p>
      </Section>
    </LegalPage>
  );
}

export function ShippingPage() {
  const s = useSettings().data;
  return (
    <LegalPage title="משלוחים והחזרות">
      <Section title="זמני הכנה ומשלוח">
        <p>כל ספר נתפר במיוחד – זמן ההכנה כ־3 שבועות מהתשלום. לאחר מכן המשלוח בשליח עד הבית אורך 3–5 ימי עסקים.</p>
        <p>
          עלות משלוח: {s ? `${(s.shippingFee / 100).toLocaleString('he-IL')} ₪` : '…'}. איסוף עצמי ללא עלות{s?.pickupAddress ? ` (${s.pickupAddress})` : ''} – בתיאום מראש.
        </p>
      </Section>
      <Section title="ביטול והחזרות">
        <p>מוצרים בהתאמה אישית (עם שמות ותמונות) אינם ניתנים לביטול לאחר תחילת הייצור, כקבוע בחוק הגנת הצרכן לגבי טובין שיוצרו במיוחד בעבור הצרכן. ביטול לפני תחילת הייצור – החזר מלא.</p>
        <p>מוצרים שאינם מותאמים אישית ניתנים לביטול בתוך 14 יום מקבלתם, כשהם באריזתם ולא נעשה בהם שימוש. דמי ביטול: עד 5% ממחיר העסקה או 100 ₪ – הנמוך מביניהם, בהתאם לחוק.</p>
      </Section>
      <Section title="פגם או נזק">
        <p>
          קיבלת מוצר פגום? נשמח לתקן או להחליף. יש לפנות אלינו דרך <Link to="/contact">צור קשר</Link> עם תמונה של הפגם.
        </p>
      </Section>
    </LegalPage>
  );
}
