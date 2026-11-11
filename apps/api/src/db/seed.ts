/**
 * Starter data: settings, the 3 books, the custom-page catalog and placeholder pictures.
 * Safe to run again – it only creates what is missing and never overwrites admin edits.
 */
import { count, eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { loadConfig } from '../config';
import { LocalStorage, type StorageProvider } from '../lib/storage';
import { feltSvg } from './art';
import { createDb, runMigrations, type DB } from './index';
import { pageOptions, pricingTiers, productImages, products, settings } from './schema';

async function picture(storage: StorageProvider, art: string, i: number): Promise<string> {
  const key = `public/seed-${art}-${randomBytes(3).toString('hex')}.webp`;
  await storage.put(key, await sharp(Buffer.from(feltSvg(art, i))).webp({ quality: 85 }).toBuffer());
  return key;
}

const ABOUT = `היי, אני שני 💛
[טקסט לדוגמה – להחלפה: בעמוד אודות, לחצי על העיפרון]
גננת לשעבר ואמא, שהתאהבה בלבד, בחוטים ובחיוך של ילד שמגלה משהו חדש בפעם הראשונה.
כל ספר נתפר אצלי בסטודיו, עמוד אחרי עמוד, עם התמונות והשמות של המשפחה שלכם – כדי שהספר הראשון של הילד יהיה באמת שלו.`;

const PRODUCTS = [
  {
    slug: 'preset-1-3', type: 'PRESET' as const, title: 'ספר מוכן לגילאי 1–3', ageLabel: 'גילאי 1–3', sortOrder: 1, price: 30000,
    description: '12 עמודי לבד רכים: משפחה, צבעים, צורות, חיות ומגע. העמוד הראשון והאחרון נתפרים עם התמונות והשמות שלכם.',
    art: ['family', 'balloon', 'house', 'fish', 'cat'],
  },
  {
    slug: 'preset-3-5', type: 'PRESET' as const, title: 'ספר מוכן לגילאי 3–5', ageLabel: 'גילאי 3–5', sortOrder: 2, price: 30000,
    description: 'רוכסנים, כפתורים, שרוכים, ספירה ושעון – אתגרים לידיים קטנות. 12 עמודים עם התמונות והשמות של המשפחה.',
    art: ['car', 'apple', 'clock', 'flower', 'shoe'],
  },
  {
    slug: 'custom-book', type: 'CUSTOM' as const, title: 'ספר בהרכבה אישית', ageLabel: 'גילאי 1–5 · בחירה חופשית', sortOrder: 3, price: 30000,
    description: 'בחרו 10–15 עמודים מתוך הקטלוג – לכל עמוד יש תמונה, הסבר וגיל מומלץ. כולל עמוד משפחה עם התמונות והשמות שלכם.',
    art: ['book', 'star', 'rainbow'],
  },
];

const PAGES: [string, string, string, number, number][] = [
  ['family', 'המשפחה שלי', 'תמונות ההורים והילד עם השמות – זיהוי, שיום ותחושת שייכות', 1, 5],
  ['cat', 'החתול שמתחבא', 'מרימים דש בד ומגלים את החתול – משחק "קוקו" ותפיסת קביעות האובייקט', 1, 2],
  ['balloon', 'בלונים וצבעים', 'מתאימים בלונים לפי צבע ומשיימים צבעים', 1, 3],
  ['fish', 'אקווריום', 'דגים על חוט מחליקים מצד לצד – מעקב עין־יד', 1, 3],
  ['house', 'הבית שלי', 'דלתות וחלונות נפתחים – מה מסתתר בפנים?', 1, 3],
  ['moon', 'לילה טוב', 'מכסים את הדובי בשמיכה – טקס רגוע לפני השינה', 1, 3],
  ['book', 'מילים ראשונות', 'חפצים מוכרים מהבית עם המילה שלהם – העשרת אוצר מילים', 1, 3],
  ['sun', 'מזג אוויר', 'מדביקים שמש, ענן וגשם על סקוטש ומדברים על היום', 2, 4],
  ['star', 'כוכבים בלילה', 'סופרים כוכבים ומכירים יום ולילה', 2, 4],
  ['rainbow', 'קשת בענן', 'מסדרים פסים לפי צבע וסדר – רצף והתאמה', 2, 4],
  ['heart', 'הלב שלי – רגשות', 'פרצופים מתחלפים: שמח, עצוב, כועס – מדברים על רגשות', 2, 5],
  ['car', 'רכב עם רוכסן', 'פותחים רוכסן ומגלים מי נוסע ברכב', 3, 5],
  ['apple', 'עץ התפוחים', 'קוטפים ומונים תפוחים מ־1 עד 5', 3, 5],
  ['flower', 'גינה בכפתורים', 'מכפתרים פרחים לגבעול – מוטוריקה עדינה', 3, 5],
  ['clock', 'מה השעה?', 'מזיזים מחוגים ולומדים את שגרת היום', 4, 5],
  ['shoe', 'שרוכים', 'משחילים ושורכים נעל – מיומנות יומיומית', 4, 5],
  ['tree', 'ארבע עונות', 'מלבישים את העץ לפי העונה', 4, 5],
];

export async function seed(db: DB, storage: StorageProvider, log: (m: string) => void = console.log) {
  await runMigrations(db);
  await db
    .insert(settings)
    .values({
      id: 1,
      businessEmail: 'shani@example.com',
      aboutTitle: 'היי, אני שני',
      aboutText: ABOUT,
      pickupAddress: '[כתובת לאיסוף – יש לעדכן בהגדרות]',
      accessibilityCoordinator: 'שני – רכזת נגישות · [טלפון/אימייל – יש לעדכן בהגדרות]',
    })
    .onConflictDoNothing();

  for (const p of PRODUCTS) {
    const [exists] = await db.select({ id: products.id }).from(products).where(eq(products.slug, p.slug));
    if (exists) continue;
    const { art, ...data } = p;
    const keys = await Promise.all(art.map((a, i) => picture(storage, a, i + p.sortOrder)));
    const custom = p.type === 'CUSTOM';
    const [created] = await db
      .insert(products)
      .values({ ...data, ...(custom ? { minPages: 10, maxPages: 15 } : {}) })
      .returning({ id: products.id });
    const productId = created!.id;
    if (custom) {
      await db.insert(pricingTiers).values([
        { productId, fromPage: 1, toPage: 10, pricePerPage: 3000 },
        { productId, fromPage: 11, toPage: 13, pricePerPage: 2700 },
        { productId, fromPage: 14, toPage: 15, pricePerPage: 2500 },
      ]);
    }
    await db.insert(productImages).values(keys.map((fileKey, i) => ({ productId, fileKey, sortOrder: i, alt: `${p.title} – עמוד לדוגמה ${i + 1}` })));
    log(`created product: ${p.title}`);
  }

  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(pageOptions);
  if (n === 0) {
    for (const [i, [art, title, summary, minAge, maxAge]] of PAGES.entries()) {
      await db.insert(pageOptions).values({ title, summary, minAge, maxAge, sortOrder: i, imageKey: await picture(storage, art, i) });
    }
    log(`created ${PAGES.length} custom-book pages`);
  }
  log('seed done');
}

// run as a script: npm run db:seed
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cfg = loadConfig();
  const { db, pool } = createDb(cfg.DATABASE_URL);
  seed(db, new LocalStorage(cfg.UPLOAD_DIR))
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
