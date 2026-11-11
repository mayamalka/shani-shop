# הדודה שני — Felt Books Online Shop: Plan

## Context
Shani makes custom handmade felt books for child development. She needs a Hebrew (RTL) online shop that works on desktop and mobile, styled after her logo (warm orange/yellow/cream, rounded hand-drawn look, dashed "stitch" borders, hearts, stars, sun, scissors and glue). It must meet WCAG and Israeli accessibility law, ask for privacy and cookie consent, take payments, and give Shani a secure admin area for products and orders. The folder `/home/mayam/private/shani` is empty, so this is a new build. It has to be fully portable (download, then push to a different GitHub). For now it runs on localhost. Hosting comes later; the plan is managed cloud, written up in the README.

**Deliverable order:** (1) a PowerPoint plan deck with demo mockup images → user review → (2) build the site → (3) tests.

---

## Step 1 — The plan deck (`docs/plan/shani-shop-plan.pptx`)
Built with the `pptx` skill. Mockup images are rendered from real HTML/CSS screens in the brand theme (screenshots taken with Playwright at desktop 1440px and mobile 390px), so the deck shows how the site will actually look.
Slides:
1. Title + logo
2. Goals & scope
3. Brand theme: palette, fonts, UI elements taken from the logo
4. Sitemap & navigation (desktop + mobile hamburger, cart icon top-left as is usual for RTL sites)
5–9. Mockups: Home/About, Shop list, Product page (preset), Custom-pages builder, Cart, Checkout, Contact
10–11. Admin mockups: Login (2FA), Products editor (discount display), Orders dashboard with status filter
12. Architecture & tech stack
13. **Payment options & costs** (table below) + recommendation
14. Accessibility compliance (WCAG 2.1 AA / IS 5568 / accessibility statement)
15. Privacy & consent (cookies, Amendment 13, children's photos)
16. Testing strategy (unit, e2e, a11y, mobile)
17. Analytics: what Israeli shops usually do (for the user's decision)
18. Roadmap / milestones, portability & hosting later

## Payment / checkout options (for the deck; prices are approximate and get checked against current rate cards while building the deck)
Note: Stripe does not accept Israeli merchant accounts, so the realistic options are Israeli payment providers or a full hosted platform.

| Option | What's outsourced | Approx. cost | Notes |
|---|---|---|---|
| A. Full platform (Shopify / Wix eCommerce) | Whole store and checkout | ~$29–79/mo or ~₪100–200/mo + gateway % | Throws away the custom site and limits the custom-pages builder. Not recommended |
| B. **Own cart & checkout + hosted payment page** (Grow/Meshulam, PayPlus, Cardcom, Hyp, Tranzila) | Only the card or Bit/Apple Pay/Google Pay entry | ~₪0–150/mo + ~1–2.5% per transaction (incl. acquirer); some charge ~₪1/txn | **Recommended.** Card data never touches our server (PCI SAQ-A). Supports Bit. Issues a receipt or tax invoice automatically, set to the business's tax status |
| C. PayPal checkout | Payment | ~3.4–4.4% + fixed fee, no monthly fee | Few Israeli buyers use it. Could be offered as an extra option |
| D. Own checkout with direct card API | Card processing | Same as B + PCI-DSS compliance burden | Not recommended |

**DECIDED: B.** We build cart, shipping, customer details and consent ourselves, then redirect to the provider's hosted page. A webhook marks the order paid. The code goes behind a `PaymentProvider` interface, with a **mock provider** for localhost and tests. Which provider (Grow, PayPlus, Cardcom…) is decided later; plugging it in means one adapter file plus env keys. The deck includes a comparison table of B providers to help that choice.

## Analytics — DECIDED: GA4 + Meta Pixel + TikTok Pixel behind a categorized cookie banner
- Banner categories: necessary (always on) / analytics (GA4) / marketing (Meta + TikTok). Nothing non-essential loads before opt-in. Uses Google Consent Mode v2. Choice is saved and logged, and can be reopened from the footer.
- IDs are entered in admin settings; with no ID, that tracker stays off.
- Ecommerce events sent to all three: `page_view`, `view_item`, `add_to_cart`, `begin_checkout`, `purchase` (with value). No personal data and no photos are ever sent.
- **Uses for the data later (a deck slide):** the sales funnel (where people drop off between product, cart, checkout and payment), which products, custom pages and age ranges are popular (to guide new designs), traffic sources (Instagram vs TikTok vs Google), mobile vs desktop behavior, **retargeting ads** to people who added to cart but didn't buy, **lookalike audiences** of buyers on Meta and TikTok, measuring return on ad spend per campaign, and testing price or discount changes.

---

## Step 2 — Build

### Repo structure — one repo, separate client and server (pnpm monorepo)
The site has real server logic (pricing, orders, payment webhooks, auth, uploads, email), so client and server are separate apps. They live in **one repo**, which is easier to download and move to another GitHub, keeps a single CI and versions them together. Each app can still be split into its own repo later.
```
apps/web     – React SPA (Vite + React Router): all pages, client-side routing
apps/api     – Node API (Fastify + TypeScript): auth, products, orders, uploads, payments, email
packages/shared – Zod schemas, types, pricing.ts (used by both, so client and server can't drift)
```

### Stack
- **Client:** React 19 + TypeScript + Vite, **React Router with client-side routing for every page** (shop and admin), TanStack Query for API data, `dir="rtl" lang="he"`. Page titles and meta are set per route (react-helmet-async). Focus moves to the page heading on each route change and is announced to screen readers, which is required for accessibility in a single-page app.
- **Server:** Fastify REST API (`/api/...`), Prisma, served on its own port. In dev the Vite proxy forwards `/api` to it.
- **Tailwind CSS** with brand tokens; fonts: *Varela Round* / *Rubik* (Hebrew, rounded, close to the logo)
- **PostgreSQL + Prisma** (Docker Compose locally)
- **Admin auth (on the server):**
  - Email + password; password hashed with argon2id.
  - **2FA = authenticator app (TOTP)**, not SMS. Shani scans a QR code once with Google Authenticator / Microsoft Authenticator / Authy, then enters the 6-digit code that changes every 30 seconds at each login. No SMS costs, and it can't be hijacked by SIM swapping. She gets **10 one-time backup codes** for a lost phone, shown once and stored hashed. Login is two steps: password, then code.
  - Sessions are random IDs kept in the DB, sent as a httpOnly + Secure + SameSite=Strict cookie (never in localStorage). 8-hour lifetime, a logout that kills the session on the server, and a new session ID on every login.
  - Rate limiting and temporary lockout after failed attempts, CSRF token on writes, and **every admin API route checks the session on the server**. The client hiding admin menus is only for display.
  - The admin is created with the CLI `pnpm create-admin`, which prints the QR code for the authenticator. There is no public signup.
  - Optional later: passkeys (Face ID / fingerprint) as an alternative to the code.
- **Uploads:** a `StorageProvider` interface. Locally files go to a private `/uploads` folder; later S3/R2/Vercel Blob. Type, size and real image content are validated, EXIF/GPS data is stripped (sharp), and customer photos are served only to the admin.
- **Email:** Nodemailer through `EmailProvider`. Locally it goes to **Mailpit** (Docker) so mails can be seen. Used for contact form, order confirmation, and new-order alert to Shani.
- **Validation:** Zod, shared by client and server. Prices are always recalculated on the server, never taken from the client.
- **Cart:** stored in the browser (strictly necessary, no consent needed) and checked against the server at checkout. Uploaded photos are stored per cart item via upload tokens.

### Data model (Prisma)
`Product` (type: PRESET | CUSTOM | SIMPLE, title, description, price, discountPrice?, active, images[]) · `ProductImage` · `PageOption` (custom pages: title, summary, image, minAge, maxAge, active, order) · `PricingTier` (custom: page ranges → price per page; seeded 1–10 @₪30, 11–13 @₪27, 14–15 @₪25; min 10, max 15, editable) · `Order` (number, status: NEW/PAID/IN_PROGRESS/SHIPPED/CANCELLED, customer details, delivery method, address, totals, consent records) · `OrderItem` (snapshot of title/price, personalization: parent & child names, photo refs, chosen pages) · `AdminUser` · `Session` · `Settings` (tax status פטור/מורשה + VAT rate, shipping fee, business email, WhatsApp number + message, Instagram/TikTok URLs, analytics IDs) · `ConsentLog`.

### Public pages
- **Home** (hero with logo, featured products) — linked from the logo
- **אודות** — business story + about Shani (content editable in admin settings)
- **חנות** — product grid. Discounts show as ~~original~~ in red strikethrough + new price in red
- **Product page** — gallery; a personalization form (parent and child names, upload parent and child photos with previews and alt text); custom product adds a **page picker**: cards with image, summary and age range, age filter, live counter "10–15 pages", live tiered price breakdown
- **צור קשר** — form (title, email, description) → email to the business + honeypot/rate limit; **WhatsApp** button `https://wa.me/<num>?text=<preset message>`; Instagram and TikTok links
- **Cart** (icon top-left with item-count badge, as is common on Hebrew RTL sites) — items with thumbnail, title, chosen options (names, photo thumbnails, selected pages), qty stepper, remove, subtotal, shipping, total, "המשך לתשלום"
- **Checkout** — details, delivery (courier with a fee set in settings / self-pickup), consent checkboxes (terms + privacy + **explicit consent to use the child's photos to make the book**), → payment provider → success/failure pages
- **Footer/legal:** תקנון, מדיניות פרטיות, הצהרת נגישות, משלוחים והחזרות (custom-made items are exempt from cancellation under the Consumer Protection Law — stated clearly), cookie preferences link

### Admin (secure, `/admin`)
- Login + 2FA; "Orders" and "Products" appear in the nav only for a valid admin session
- **Products:** edit title, description, price; set or remove discount; upload, reorder and delete gallery photos; activate or deactivate; **add new SIMPLE product**
- **Custom-page options:** add, edit, reorder or disable pages (image, summary, age range); edit pricing tiers, minimum and maximum
- **Orders:** table with status filter + search; order details (customer, items, personalization, download child/parent photos, chosen pages); change status → In progress / Out for delivery (SHIPPED), optional email to the customer
- **Settings:** tax status, shipping fee, contact/social links, analytics IDs, About text
- Photo retention: an action to delete customer photos X days after an order ships (privacy)

### Accessibility (WCAG 2.1 AA + Israeli Equal Rights Regs 2013 / IS 5568)
Semantic HTML, skip link, full keyboard use, visible focus, AA contrast (brand orange is darkened for text where needed and checked with axe), labeled form fields and errors linked with `aria-describedby`, `aria-live` for cart updates, alt text, reduced-motion support, zoom to 200% and reflow at 320px, page title per route. An **accessibility statement page** (required) with an accessibility coordinator contact. A small built-in accessibility menu (text size, high contrast, underline links); no third-party overlay.

### Privacy & consent
Categorized cookie banner (necessary / analytics / marketing) with saved choice + consent log, and a reopen link in the footer. Privacy policy that covers children's photos, how long they are kept and who handles them (Amendment 13). Explicit consent checkboxes at checkout and on the contact form. Every consent requirement is listed in the deck.

### Theme tokens (from the logo)
cream `#FFF8EC` background, paper white `#FFFDF8`, brand orange `#F28C28`, burnt orange `#C8642A` (headings/text-safe), sunshine yellow `#F8C33A`, soft yellow `#FBE3A0`, brown text `#5A3A22`; dashed stitched borders, cloud-shaped hero, rounded 16–24px corners, SVG icons for heart, star, sun, scissors, glue.

### Project layout (portable)
```
shani/
  apps/web/   src/ (routes/, components/, admin/, theme/)  public/ (logo, icons)  tests/ (unit)
  apps/api/   src/ (routes/, auth/, payments/, storage/, email/)  prisma/ (schema, seed)  tests/ (unit + API integration)
  packages/shared/  (zod schemas, types, pricing.ts + tests)
  e2e/        (Playwright)
  docs/plan/shani-shop-plan.pptx  docker-compose.yml (postgres, mailpit)
  .env.example  README.md  .github/workflows/ci.yml  pnpm-workspace.yaml
```
No secrets in the repo (`.env` is git-ignored, `.env.example` documented). The folder is a plain git repo ready to push to any GitHub. The README covers local setup (`docker compose up`, `pnpm i`, `pnpm db:seed`, `pnpm create-admin`, `pnpm dev`) and **the managed-cloud hosting plan for later** (static client on Vercel/Netlify/Cloudflare Pages, API on Render/Railway/Fly, Neon/Supabase Postgres, S3/R2 for images, Resend for email, real payment provider env keys).

---

## Step 3 — Testing & verification
- **API integration (Vitest + Fastify inject + test Postgres):** every admin endpoint rejects requests without a session or 2FA, order creation recalculates prices on the server, status changes work.
- **Unit (Vitest + Testing Library):** `packages/shared/pricing.ts` (tier math: 10 pages = ₪300, 13 = ₪381, 15 = ₪431, rejects <10 or >15, discount wins over price), Zod schemas, cart reducer, VAT/tax-status display, WhatsApp link builder, auth guards (non-admin rejected), payment webhook signature check, upload validation.
- **E2E (Playwright, Chromium + WebKit, desktop + iPhone/Android viewports):** browse → personalize preset → upload photos → cart edit qty/remove → checkout with mock payment → order appears in admin; custom builder min/max limits & live price; contact form (email received in Mailpit); cookie banner (no analytics script before opt-in); admin login + 2FA, edit price/discount → red strikethrough on shop; add simple product; order status change + filter; unauthenticated `/admin` redirects.
- **Accessibility:** `@axe-core/playwright` scan on every page (fails on any serious or critical issue), keyboard-only checkout test, Lighthouse a11y ≥ 95.
- **CI:** GitHub Actions workflow running lint, typecheck, unit and e2e (with Postgres service), so it works the moment it's pushed to the new GitHub.
- **E2E additions:** client-side navigation without full page reloads (focus and title update on each route), a deep link or browser refresh on any route works, the 2FA wrong code is rejected and a backup code works, trackers load only after consent.
- **Manual check:** `pnpm dev` (starts web + api) on localhost, then a pass on a real phone over LAN.
