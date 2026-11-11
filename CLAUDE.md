# CLAUDE.md – handoff notes for the next agent

Online shop for **הדודה שני** (Shani): custom handmade felt books for child development. Hebrew, RTL, desktop + phone.
User-facing setup docs are in [README.md](README.md). The approved plan (deck + mockups + written plan) is in [docs/plan/](docs/plan/).
This file is for whoever works on the code next: what exists, why it is the way it is, and what is still open.

## Status (as of 2026-11-09, round 3)

- **Plan approved** (deck: `docs/plan/shani-shop-plan.pptx`), **site built**, user review rounds 1–2 fixed, **all tests green**:
  typecheck, ESLint (0 warnings), 34 shared + 19 web + 74 API (unit + integration) tests, 89 Playwright e2e (desktop + Android; 4 desktop-only tests skip on mobile by design).
- `npm audit --omit=dev` → 0 vulnerabilities (after upgrading @fastify/static 10, nodemailer 10, sharp 0.35, zod 4).
- **Not committed to git yet** – the user will push to their own GitHub. Commit only when asked.
- Runs on localhost only. Hosting is deliberately deferred (user prefers managed cloud later – see README).

### Open items (waiting on the user / later)
1. **Payment provider**: user chose "option B" (own checkout + provider's hosted payment page) but not which provider (Grow / PayPlus / Cardcom). Today: `MockPaymentProvider`. Adapter steps are in README → "Payments".
2. **Real content**: product photos, custom-page catalog pictures, About text, business email, WhatsApp, Instagram/TikTok URLs, pickup address, accessibility coordinator – all editable in admin → הגדרות / ניהול מוצרים / עמודי הרכבה. Seed data has clearly marked placeholders.
3. **Legal pages** (`apps/web/src/pages/Legal.tsx`) are drafts → need lawyer review before launch.
4. **Hosting** (Render/Railway/Fly + Neon/Supabase + R2/S3 + Resend). Cloud photo storage needs a `StorageProvider` implementation (`apps/api/src/lib/storage.ts`).
5. iPhone/WebKit e2e has never run in this environment (browsers can't be downloaded here); it runs in GitHub Actions.
6. **Shipping fee shown in the cart before the customer chooses delivery** – the user finds this odd but said **"don't change it yet"**. Cart quotes with `SHIPPING`; delivery is chosen at checkout. Wait for the user's decision.
7. **Real email sending**: `EMAIL_TRANSPORT=file` writes to `.outbox/` – nothing is sent. Needs SMTP credentials from the user (README → "Sending real emails").
8. ~~"Typing stops after 2 letters" in Hebrew~~ – **resolved: not a site bug**; the user's local Ubuntu lacked a Hebrew keyboard input source.

## Picking up next session

- Local state on this machine: `.env` (dev secret, port 54329), `.local-db/` (database with seed data, a demo admin `shani@example.com` and a test order), `uploads/`, `.outbox/`. All git-ignored. If the admin password/authenticator is unknown, reset it: `npm run create-admin -- --email shani@example.com`.
- Start: `npm run db:local` (keep running) → `npm run dev` → http://localhost:5173 (user opens it via VS Code port forwarding).
- Nothing is committed to git yet.

## User decisions (don't re-litigate)

- **Admin UX = edit in place** (round 2): no separate products page – products are edited from the shop (pencil on each card / on the product page, "+ הוספת מוצר" on the shop page); the About page title, text and picture are edited on the About page itself (pencils), not in settings. Orders = split view (list + selected order side by side, like the deck mockup).
- **Product types**: when adding/editing a product the admin chooses "with names + photos" (type `PRESET` – shopper must give child + parent names and child + parents photos) or "plain product" (`SIMPLE`). Only the custom book (`CUSTOM`) can't be switched or deleted. API field: `personalized` on product create/update.
- **Unpaid checkouts are not orders**: hidden from the admin entirely and deleted after 7 days.

- Hebrew RTL site; pages: Home, About, Shop, Contact (+ cart, checkout, legal). Cart icon **top-left** (RTL convention).
- Products: preset book 1–3 (₪300), preset book 3–5 (₪300), custom book: pick 10–15 pages; pages 1–10 ₪30, 11–13 ₪27, 14–15 ₪25. Personalization = child name, parent name(s), child photo, parents photo.
- Admin: edit products (title, description, price, gallery), **discount separate from price** (old price struck through in red, new price red, discount price is charged), add simple products, manage custom pages + price tiers, incoming orders with statuses (in progress / out for delivery) and status filter.
- Admin 2FA = **authenticator app (TOTP), not SMS**, + 10 backup codes. No auth state in localStorage.
- Analytics: **GA4 + Meta Pixel + TikTok Pixel, only after cookie consent** (categorized banner).
- Delivery: courier (fee from settings) or free self-pickup. Tax status **עוסק פטור** now, switchable to עוסק מורשה in settings.
- One repo, separate client and server apps; **client-side routing** for all pages.
- Tests: unit + e2e required. Project must be portable (download → push to another GitHub).

## Deviations from the written plan (and why)

| Plan said | Built | Why |
|---|---|---|
| pnpm | **npm workspaces** | corepack/pnpm download blocked here; npm = one less tool for the user |
| Prisma | **Drizzle ORM + pg** | `binaries.prisma.sh` is blocked here; Drizzle is pure JS. Migrations are committed SQL in `apps/api/drizzle/` and run automatically on API start |
| Mailpit for local mail | `EMAIL_TRANSPORT=file` default (writes `.outbox/*.json|html`); Mailpit still in docker-compose for `smtp` | Docker not usable by this user here |
| react-helmet-async | React 19 native `<title>` in components | not needed in React 19 |

## Architecture

```
packages/shared   zod schemas (Hebrew error messages), price calculator, types, labels, WhatsApp link. Imported as TS source by both apps.
apps/api          Fastify 5. src/server.ts = buildApp() (plugins, CSP, origin check, error handler, routes). src/index.ts = migrate + listen + photo purge timer.
  src/routes      public.ts (catalog, quote, uploads, orders, contact, consent) · payments.ts (webhook + mock page) · auth.ts (login/verify/me/logout + requireAdmin) · admin.ts
  src/services    catalog.ts · orders.ts (quote/create/markPaid/setStatus/list/detail/purgePhotos) · auth.ts (argon2, TOTP, lockout, sessions) · notifications.ts (emails)
  src/lib         crypto (AES-GCM for TOTP secret, HMAC) · storage (LocalStorage, keys public/… private/…) · images (sharp) · email · payments · http (HttpError, parse())
  src/db          schema.ts (Drizzle tables) · index.ts (createDb, runMigrations) · seed.ts (exported seed() + CLI) · ensure.ts (create/reset DB for tests) · art.ts (placeholder SVG art)
apps/web          React 19 + Vite 7 + React Router 7 (createBrowserRouter) + TanStack Query + Tailwind 4.
  src/pages       shop pages · src/admin (lazy-loaded) · src/components (Layout, ui.tsx form kit, PhotoUpload, PagePicker, CookieBanner, A11yMenu, Dialog)
  src/lib         api.ts (fetch + CSRF header) · cart.tsx (reducer + localStorage) · consent.tsx · analytics.ts · a11y.tsx · admin.ts · useQuote.ts
e2e               Playwright. server.ts starts a fresh DB + seed + known admin and serves the built web app from the API on :3101.
```

Key flows:
- **Money is integer agorot everywhere.** Prices are always recalculated on the server (`OrderService.quote`); client prices are display-only.
- **Order**: `POST /api/orders` → validates, checks photo tokens, creates order `PENDING_PAYMENT`, returns provider `redirectUrl` → provider → `markPaid()` (idempotent) via webhook or the mock page → emails to customer + business → `/checkout/success?order=N`.
- **Customer photos**: `POST /api/uploads` → re-encoded JPEG, metadata/GPS stripped, stored under `private/`, returns `{uploadId, token}`; only the token holder (thumb) or admin can read. Purged: shipped/delivered/cancelled orders after `photoRetentionDays` (default 60), unpaid orders after 7 days, orphan uploads after 2 days (timer every 6h + admin button).
- **Admin auth**: login → `pl` cookie (5 min) → TOTP/backup code → `sid` cookie (httpOnly, SameSite=Strict, path `/api`, 8h, server-side session, hashed) + CSRF token (header `x-csrf-token` on non-GET). 5 failures → 15-min lock. TOTP step replay blocked (`lastTotpStep`). `requireAdmin` runs on every `/api/admin/*` route. The web's `shani:admin-ui-hint` localStorage flag only decides whether to call `/me`; it grants nothing.
- **Origin check** in `server.ts` rejects non-GET requests whose `Origin` isn't WEB_URL/API_URL (webhooks exempt). Helmet's referrer policy is set to `strict-origin-when-cross-origin` on purpose: `no-referrer` makes browsers send `Origin: null` on form posts, which broke the payment page.
- **SPA a11y**: every page renders `<Page>` (ui.tsx) → `<title>` + the single `h1#page-title`. `RouteChangeHandler` (Layout.tsx) focuses the h1, announces the title, scrolls up and sends the page view after each navigation.

## Conventions

- UI text is Hebrew; code, comments and commit messages are English. Validation messages live in `packages/shared/src/schemas.ts`, so client and server show the same text.
- Reuse `components/ui.tsx` (`TextField`, `Checkbox`, `PriceTag`, `ErrorSummary`, `QuantityStepper`, `Page`) – they carry the label/aria/error wiring. The visual `*` sits **outside** `<label>` so accessible names stay clean (tests rely on exact label text).
- Colors only via theme tokens in `apps/web/src/index.css`. `orange`/`sun` are decoration only (fail contrast as text). Links inside text are underlined (WCAG 1.4.1) – use `no-underline` only for buttons/nav/cards.
- Never position things off-screen with `left:-9999px` (RTL pages scroll to the left → horizontal scroll). Use `sr-only`/clip.
- Schema change → edit `apps/api/src/db/schema.ts` → `npm run db:generate -w @shani/api` → commit the new SQL in `apps/api/drizzle/`.
- New admin endpoint → put it in `routes/admin.ts` (the `preHandler` guard covers it) and add an integration test that it 401s without a session.
- **Names** (child, parents, full name): letters of any language + space, hyphen, apostrophe/geresh only, 2–40 chars (`NAME_ALLOWED` in `packages/shared/src/text.ts`). Phone: Israeli numbers, digits only. House/flat number: digits only.
- `TextField` takes `filter` + `filterMessage`: cleans the value while typing (`sanitizeName`, `digitsOnly`) and tells the user why; it skips filtering during IME composition – keep it that way.
- `Combobox` (components/Combobox.tsx) = accessible searchable dropdown; only a list value counts as selected. Used for locality and street at checkout.
- SQL injection: all DB access is Drizzle with bound parameters – never build SQL strings from input (`sql\`\`` template only with `${}` params). Tests in `apps/api/test/orders.test.ts` → "SQL injection".
- Admin-only UI on public pages: check `useAdmin().admin` and render the pencil/buttons; the API still enforces auth. Admin routes: `/admin/orders[/:id]` (split view), `/admin/products/new|:id` (editor; `/admin/products` redirects to `/shop`), `/admin/pages`, `/admin/settings`.
- Orders split view: `Orders.tsx` renders the list + `OrderPanel` (OrderDetail.tsx). `RouteChangeHandler` (Layout.tsx) does **not** move focus/scroll for `/admin/orders → /admin/orders/:id`; the panel focuses its own heading when an order was picked from the list (`takeFocus`).
- zod is **v4** (`{ error: '…' }` not `errorMap`; `parse()` in `lib/http.ts` returns `z.output`).

## Commands

```bash
npm run db:local            # PostgreSQL from npm on :54329 (no Docker) – data in .local-db/
npm run db:seed             # migrations + seed (idempotent)
npm run create-admin -- --email x@y   # ADMIN_PASSWORD / ADMIN_TOTP_SECRET / ADMIN_QUIET=1 for non-interactive
npm run dev                 # api :3001 + web :5173 (vite proxies /api and /media)
npm run typecheck && npm run lint && npm test
PW_CHANNEL=chrome npm run test:e2e    # in this environment (uses installed Google Chrome; WebKit skipped)
```

## Environment gotchas (this machine)

- Outbound downloads are partly blocked: Prisma engines, corepack/pnpm, Playwright browsers all fail. npm registry works but is **slow** (installs can take 10+ minutes – run them in the background).
- npm 11 blocks install scripts unless approved: root `package.json` → `allowScripts` (argon2, sharp, esbuild, @embedded-postgres/linux-x64). Add new native packages there.
- Docker exists but the user has no permission to the socket → use `npm run db:local`.
- `pkill -f vite` (or any pattern that matches your own shell command) kills your own Bash call – stop background tasks by ID instead.

## Work log

1. **Plan**: requirements gathered; payment options researched (Stripe doesn't serve Israeli merchants; option B chosen); deck built with pptxgenjs from HTML mockups rendered in headless Chrome (`docs/plan/mockups/*.html` + `img/`).
2. **Build**: shared package → API (first Prisma, switched to Drizzle when engine download failed) → web app → admin area.
3. **Tests**: unit (shared/web/api), API integration (Fastify inject against a real Postgres `shani_test`), Playwright e2e (`shani_e2e`). Fixes the tests surfaced: label/asterisk naming, link underlines (axe `link-in-text-block`), `Origin: null` from helmet referrer policy, RTL horizontal overflow from the honeypot field, mobile summary bar size, accessibility button moved to a side tab.
4. **Hardening**: upgraded vulnerable deps (zod 3→4 required `errorMap`→`error`), production build verified (`SERVE_WEB=true node apps/api/dist/index.js` serves site + API on one port).
5. **Docs**: README (setup, tests, payments, hosting, GitHub move, security), this file.
6. **User review round 1** (user ran the site on this machine):
   - Desktop menu: one underline bar slides between items (`DesktopNav` in Layout.tsx; no animation with reduced motion).
   - Names limited to letters (+ space, hyphen, geresh) on product page and checkout; typed digits/symbols are removed with a message. Server validates the same.
   - Cart: removing an item shows an 8-second "undo" notice (`restore` action in the cart reducer).
   - Checkout: phone = digits only (mobile/landline format checked); address order is now locality → street → house number → flat, locality and street are searchable dropdowns from the official registry (`apps/api/data/il-addresses.json.gz`, built by `scripts/update-addresses.mjs`; API `/api/geo/cities`, `/api/geo/streets?city=`; server rejects unknown locality/street). DB: `orders.city_code`, `orders.house_number` (migration 0001).
   - Footer link "כניסת מנהלת" → `/admin/login` (the user couldn't find the admin login).
   - Government street data sometimes has reversed parentheses `)…(` – fixed in the import script.
   - Explained to the user: emails are written to `.outbox/`, not sent, until SMTP is configured.
7. **User review round 2 (admin)**:
   - Removed the "ניהול מוצרים" menu item/page. Shop shows a pencil on each product + "+ הוספת מוצר" when the admin is logged in, and also lists hidden products (badge "מוסתר מהחנות"; their card opens the editor). Pencil next to the title on the product page.
   - About page: pencils to edit title and text in place (`PATCH /api/admin/about`), picture upload/remove on the page (`POST|DELETE /api/admin/about/image`, `settings.about_image_key`, migration 0002). Removed About fields from the settings screen/schema.
   - Orders: split view (list + order panel), status filters/search kept in the URL while switching orders, status actions at the top of the panel; on phones the order opens full-screen with a back link.
   - "ממתינה לתשלום" (customer reached the payment page but didn't pay): removed from the admin list/counts/tabs; `purgePhotos()` now deletes those records entirely after 7 days (`abandonedCheckoutsDeleted`).
8. **User review round 3 (add product)**: photos can be chosen in the "new product" form itself (uploaded right after the product is created; a failed photo never blocks the saved product), and the form asks whether the product needs names + photos (`PRESET`) or not (`SIMPLE`); the same choice is editable later. Personalized products (except the custom book) can now be deleted.
