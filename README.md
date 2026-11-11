# הדודה שני – Online Shop

Hebrew (RTL) online shop for custom handmade felt books: shop, personalization (names + photos), custom page builder, cart, checkout with a hosted payment page, and a secure admin area for products and orders.
Built for desktop and phone, WCAG 2.1 AA / Israeli accessibility regulations, and cookie/photo consent.

The approved plan and its deck are in [`docs/plan/`](docs/plan/) (`shani-shop-plan.pptx`, `PLAN.md`, mockups).

---

## What's inside

```
apps/web         React 19 + Vite + React Router (client-side routing) + Tailwind 4 – the website and admin screens
apps/api         Node + Fastify + Drizzle ORM (PostgreSQL) – prices, orders, uploads, payments, email, admin auth
  drizzle/       SQL migrations (applied automatically when the API starts)
packages/shared  Price calculator, validation rules and types – used by both apps so they always agree
e2e/             Playwright end-to-end tests (desktop, Android, iPhone)
docs/plan/       Plan deck, mockups, written plan
```

## Run it on your computer

Requirements: **Node.js 20.19+ (22 recommended)** and a PostgreSQL database – either Docker, or the built-in no-Docker option.

```bash
npm install
cp .env.example .env            # then edit .env (see below)
```

Start the database (pick one):

```bash
docker compose up -d            # PostgreSQL on 5432 (+ Mailpit email inbox on http://localhost:8025)
# or, without Docker:
npm run db:local                # PostgreSQL from npm on port 54329 – keep this terminal open
```

In `.env` set `DATABASE_URL` to match (both examples are in `.env.example`), and set `APP_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Then:

```bash
npm run db:seed                 # creates tables + the 3 books, 17 custom pages and placeholder pictures
npm run create-admin -- --email shani@example.com
npm run dev                     # website http://localhost:5173 · API http://localhost:3001
```

`create-admin` asks for a password (min. 12 characters), shows a **QR code to scan with Google Authenticator / Microsoft Authenticator / Authy**, and prints **10 one-time backup codes** – save them; they are shown only once. Running it again for the same email resets the password and authenticator.
Log in at **http://localhost:5173/admin/login**.

Open the site on your phone: run `npm run dev`, then browse to `http://<your-computer's-IP>:5173` on the same Wi-Fi.

Emails: by default (`EMAIL_TRANSPORT=file`) **no email is really sent** – every email is written to `.outbox/` (open the `.html` files). With Docker you can set `EMAIL_TRANSPORT=smtp` and read them in Mailpit at http://localhost:8025.

### Sending real emails

Set these in `.env` and restart:

```bash
EMAIL_TRANSPORT=smtp
EMAIL_FROM="הדודה שני <your-address@gmail.com>"
# Gmail: turn on 2-step verification, create an "App password" (Google account → Security → App passwords)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your-address@gmail.com
SMTP_PASS=the-16-letter-app-password
```

For the live site use a sending service (Resend, Postmark, SendGrid – all give SMTP settings) with the shop's own domain. Also set the business email in admin → הגדרות – that's where new-order alerts and contact messages go.

## First things to fill in (admin → הגדרות)

The site runs with placeholders until these are set:

- Business email (orders and contact messages go there), WhatsApp number, Instagram and TikTok links
- About text, pickup address, shipping fee, accessibility coordinator (name + contact – required by law)
- Real product photos (admin → ניהול מוצרים) and the custom-page catalog pictures (admin → עמודי הרכבה)
- Analytics IDs (GA4, Meta Pixel, TikTok Pixel) – optional; trackers load only for visitors who accept cookies
- Tax status: עוסק פטור today; switching to עוסק מורשה shows prices as VAT-inclusive

> ⚖️ **Legal pages** (`apps/web/src/pages/Legal.tsx` – terms, privacy, accessibility statement, shipping & returns) are careful drafts based on Israeli law, but **must be reviewed by a lawyer before going live**.

## Israeli addresses (checkout dropdowns)

Home delivery asks for **locality → street → house number → flat**. Localities and streets come from the official registry on data.gov.il (Population & Immigration Authority – the same data Israel Post's zip-code search uses), stored in `apps/api/data/il-addresses.json.gz` (1,316 localities, ~64k streets). The server only accepts a locality from that list and a street that belongs to it.

Refresh it every few months: `npm run addresses:update` (downloads from data.gov.il). If data.gov.il is unreachable, `node scripts/update-addresses.mjs --from-package <unpacked @il-address/data>` builds the same file from that npm package (which is itself built from data.gov.il).

## Tests

```bash
npm run typecheck && npm run lint
npm test                        # unit tests (shared, web, api) + API integration tests (needs the database running)
npm run test:e2e                # Playwright: builds the site, starts a test server, runs desktop + Android + iPhone
```

- First time for e2e: `npx playwright install --with-deps chromium webkit`
- Tests use separate databases (`shani_test`, `shani_e2e`), created automatically and wiped on each run. Override with `TEST_DATABASE_URL` / `E2E_DATABASE_URL` (e.g. `postgresql://shani:shani@localhost:5432/shani_test` with Docker).
- If Playwright's browsers can't be downloaded, `PW_CHANNEL=chrome npm run test:e2e` uses your installed Google Chrome (the iPhone/WebKit run is skipped then).
- GitHub Actions (`.github/workflows/ci.yml`) runs everything on every push.

What's covered: page pricing (10/13/15 pages = ₪300/₪381/₪431), discounts, server-side price recalculation, photo upload safety (real-image check, GPS/EXIF removal, private access), admin login (2FA, lockout, code reuse, backup codes, CSRF), order flow through payment and emails, order status management and filters, photo auto-deletion, cookie consent (no trackers before "yes"), accessibility (axe scan of every page, keyboard-only checkout, 320px width, focus on navigation).

## Payments – connecting the real provider

Development uses a **mock payment page** (`PAYMENT_PROVIDER=mock`). To go live with Grow / PayPlus / Cardcom:

1. Add one file, e.g. `apps/api/src/lib/payments-grow.ts`, implementing `PaymentProvider` from [`apps/api/src/lib/payments.ts`](apps/api/src/lib/payments.ts):
   - `createPayment()` – call the provider's "create payment page" API with the amount and order number, and return its URL (customers are redirected there; card/Bit details never touch our server).
   - `parseWebhook()` – verify the provider's signature on its server-to-server notification and return `{ orderId, outcome }`.
2. Register it in `server.ts` and allow its name in `config.ts` (`PAYMENT_PROVIDER`), put the keys in `.env`.
3. Set the provider's notification URL to `https://<your-site>/api/payments/webhook/<provider>`, and its success/cancel URLs to `/checkout/success?order=…` and `/checkout/cancelled`.
4. Turn on automatic receipts (קבלה / חשבונית מס-קבלה) in the provider's dashboard.

Refunds are done in the provider's dashboard; marking an order "cancelled" in the admin does not refund.

## Hosting later (preferred: managed cloud)

Nothing here is tied to a host. The recommended setup:

| Part | Suggested service | Notes |
|---|---|---|
| Website + API | **Render / Railway / Fly.io** (one Node service) | `npm ci && npm run build`, start `npm start` with `SERVE_WEB=true` – the API serves the website too (one domain, simplest). Alternatively host `apps/web/dist` on Vercel/Netlify/Cloudflare Pages and proxy `/api` + `/media` to the API. |
| Database | **Neon** or **Supabase** PostgreSQL | set `DATABASE_URL`; migrations run automatically on start; enable daily backups |
| Customer photos & product pictures | **Cloudflare R2 / AWS S3** (private bucket) | implement `StorageProvider` in `apps/api/src/lib/storage.ts` (local folder today) – or use a host with a persistent disk |
| Email | **Resend / Postmark / SendGrid** via SMTP | `EMAIL_TRANSPORT=smtp` + SMTP settings; set up SPF/DKIM for the domain |
| Domain + HTTPS | any registrar + the host's free certificate | set `COOKIE_SECURE=true`, `WEB_URL`/`API_URL` to `https://…`, `NODE_ENV=production`, a new `APP_SECRET` |

Production checklist: new `APP_SECRET` (never reuse the dev one), `COOKIE_SECURE=true`, real payment provider, business details in settings, lawyer-reviewed legal pages, create the admin with `npm run create-admin` on the server.

## Moving this project to another GitHub

The folder is a self-contained git repository (no secrets inside – `.env`, uploads, the local database and test output are git-ignored):

```bash
git add -A && git commit -m "Initial version of the shop"
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

## Security notes

- Admin login = password (argon2id) + 6-digit authenticator code (TOTP), 10 one-time backup codes, 5 failures → 15-minute lock, each code usable once.
- Sessions live on the server; the browser holds only an `httpOnly`, `SameSite=Strict` cookie (nothing in localStorage). 8-hour sessions; logout ends them on the server. Every admin API call checks the session + a CSRF token.
- Prices are always recalculated on the server; forms are validated on both sides with the same rules.
- Customer photos: verified to be real images, re-encoded with all metadata (incl. GPS) removed, stored privately, viewable only by the admin or the uploader (secret token), and auto-deleted after the retention period.
- Security headers (CSP, frame blocking, etc.), cross-site request blocking (Origin check), rate limits on login, uploads, orders and contact.

## Notes on choices made during the build

- **npm workspaces** instead of pnpm – one less tool to install.
- **Drizzle ORM** instead of Prisma (the plan named Prisma) – plain JavaScript with no engine downloads, so installs work behind restrictive networks; migrations are committed SQL files.
