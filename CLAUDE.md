# CLAUDE.md – handoff notes for the next agent

Online shop for **הדודה שני** (Shani): custom handmade felt books for child development. Hebrew, RTL, desktop + phone.
User-facing setup docs are in [README.md](README.md). The approved plan (deck + mockups + written plan) is in [docs/plan/](docs/plan/).
This file is for whoever works on the code next: what exists, why it is the way it is, and what is still open.

## Status (as of 2026-11-09, round 3)

- **Plan approved** (deck: `docs/plan/shani-shop-plan.pptx`), **site built**, user review rounds 1–2 fixed, **all tests green**:
  typecheck, ESLint (0 warnings), 34 shared + 19 web + 74 API (unit + integration) tests, 89 Playwright e2e (desktop + Android; 4 desktop-only tests skip on mobile by design).
- `npm audit --omit=dev` → 0 vulnerabilities (after upgrading @fastify/static 10, nodemailer 10, sharp 0.35, zod 4).
- **Not committed to git yet** – the user will push to their own GitHub. Commit only when asked.
- **Hosting decided and built (2026-11-13), not deployed yet**: Kubernetes on Oracle OKE Basic (Always Free A1) + Argo CD – runbook in [deploy/README.md](deploy/README.md). The user still has to create the accounts, run Terraform and fill the placeholders.

### Open items (waiting on the user / later)
1. **Payment provider**: user chose "option B" (own checkout + provider's hosted payment page) but not which provider (Grow / PayPlus / Cardcom). Today: `MockPaymentProvider`. Adapter steps are in README → "Payments".
2. **Real content**: product photos, custom-page catalog pictures, About text, business email, WhatsApp, Instagram/TikTok URLs, pickup address, accessibility coordinator – all editable in admin → הגדרות / ניהול מוצרים / עמודי הרכבה. Seed data has clearly marked placeholders.
3. **Legal pages** (`apps/web/src/pages/Legal.tsx`) are drafts → need lawyer review before launch.
4. **Hosting – first deploy**: follow deploy/README.md → "First-time setup" (OCI + Cloudflare accounts, `terraform apply`, replace placeholders `OWNER` / `shop.example.com` / `ACCOUNT_ID` / `RESERVED_PUBLIC_IP`, Argo CD bootstrap, `seal-secrets.sh`, seed + create-admin). Nothing in `deploy/` or `infra/` has run against a real cluster yet; CI validates manifests (kubeconform) and Terraform (validate).
5. ~~iPhone/WebKit e2e never ran~~ – **ran and passes (2026-11-14)**. Reproduce CI's e2e exactly (Linux, all 3 projects) with Docker: `mcr.microsoft.com/playwright:v1.65.0-noble` + a `postgres:17-alpine` container on one network, `git clone` the repo inside, `npm ci`, `npx playwright test` (Windows fonts differ – a 320px overflow only showed on Linux).
6. **Shipping fee shown in the cart before the customer chooses delivery** – the user finds this odd but said **"don't change it yet"**. Cart quotes with `SHIPPING`; delivery is chosen at checkout. Wait for the user's decision.
7. **Real email sending**: `EMAIL_TRANSPORT=file` writes to `.outbox/` – nothing is sent. Needs SMTP credentials from the user (README → "Sending real emails").
8. ~~"Typing stops after 2 letters" in Hebrew~~ – **resolved: not a site bug**; the user's local Ubuntu lacked a Hebrew keyboard input source.

## Picking up next session

- **Moved to a Windows 11 laptop (2026-11-12)**: Node LTS installed globally via winget. `.local-db/` was re-created fresh (seed data only, test admin `admin@test.local`, no orders). `scripts/local-db.mjs` now passes `--encoding=UTF8` to initdb – Windows otherwise defaults to WIN1252 and Hebrew breaks.
- Local state on this machine: `.env` (dev secret, port 54329), `.local-db/`, `uploads/`, `.outbox/`. All git-ignored. If the admin password/authenticator is unknown, reset it: `npm run create-admin -- --email admin@test.local`.
- Start: `npm run db:local` (keep running) → `npm run dev` → http://localhost:5173 (user opens it via VS Code port forwarding).
- Nothing is committed to git yet.

## User decisions (don't re-litigate)

- **Hosting = Kubernetes** (2026-11-13). Priorities: $0 (one-time payment > monthly), then easiest long-term maintenance; the user is a DevOps engineer, so a harder setup is fine. The user **rejected a single VM and a single combined image** ("old fashioned") → separate `api` and `web` images, OKE Basic (free control plane) on 2 × A1 (1 OCPU/6 GB = the whole 2026 free allowance), frontend = its own nginx pod in the cluster (not Cloudflare Pages), DB = CloudNativePG in-cluster (not Neon), GitOps with Argo CD, Traefik as Gateway API, cert-manager, Sealed Secrets, R2 for files + DB backups, Renovate for updates.

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
  src/lib         crypto (AES-GCM for TOTP secret, HMAC) · storage (LocalStorage | S3Storage for R2 via STORAGE_DRIVER, keys public/… private/…) · images (sharp) · email · payments · http (HttpError, parse())
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

- **Node 26** (Active LTS since 2026-10-28) everywhere: local, CI, images. Node 25+ has its own global `localStorage` that hides jsdom's → `apps/web/vite.config.ts` starts the test workers with `--no-experimental-webstorage`.
- No Docker / kubectl / helm / terraform installed here. Git Bash heredocs here collapse double backslashes into single ones – write files with backslashes via the editor, not `cat <<EOF`.

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
9. **Hosting (Kubernetes)** – see deploy/README.md:
   - App changes (all default to the old local behaviour): `STORAGE_DRIVER=local|s3` + `S3Storage` (hand-written AWS SigV4 in `lib/storage.ts`, tested against the AWS docs example – `npm install` of an SDK was blocked here, and it keeps the image small); `/media/:name` is now a route reading from storage (was `@fastify/static` on a folder); `RUN_MIGRATIONS` / `PURGE_TIMER` flags; `src/jobs.ts` (`purgeOnce`), CLIs `src/cli/migrate.ts`, `src/cli/purge.ts`; tsup builds `dist/{index,migrate,purge,seed,create-admin}.js`; `buildApp({ storage })` for tests.
   - `deploy/docker/` images (Node 26, arm64), nginx `security-headers.conf` mirrors helmet – `test/headers.test.ts` fails if they drift. CI moved to Node 26 and got `images` (build + smoke test) and `manifests` (kubeconform + terraform validate) jobs; `release.yml` pushes images to GHCR and commits tags into `deploy/k8s/app/prod/kustomization.yaml`.
   - Pinned versions (Nov 2026, each ≥ 2 weeks old): argo-cd chart 10.11.6, traefik 42.1.3 (Traefik v3.7, Gateway API v1.6.3 CRDs installed separately – the chart no longer ships them), cert-manager v1.21.3, cloudnative-pg 0.29.1, plugin-barman-cloud 0.8.1 (in-tree `barmanObjectStore` is deprecated), sealed-secrets 2.22.0 (repo moved to `bitnami/sealed-secrets`, chart repo `https://bitnami.github.io/sealed-secrets`), Postgres image `17.10-standard-trixie`, Terraform providers oci 7.32 / cloudflare 5.29 (validated with Terraform 1.16.7).
10. **Hosting automation (2026-11-13, user request)**: Renovate auto-merges patch updates (npm + Dockerfile base images, `automergeType: branch` = no PR/email unless CI fails); minor/major stay PRs. `.github/workflows/k8s-version.yml` (weekly, read-only OCI user via `OCI_CLI_*` secrets) opens a PR bumping the committed `infra/terraform/kubernetes.auto.tfvars`; `terraform apply` after merge stays manual (needs write creds – deliberately kept off GitHub). Restore drill = in-cluster CronJob `restore-drill` (base/restore-drill.yaml, monthly, alpine/k8s image, healthchecks.io dead-man ping) – not a GitHub workflow, because the Kubernetes API is only open to `admin_cidrs`. Node pool no longer ignores image changes → each apply rolls nodes to the newest patched OKE image. Docker Desktop + WSL2 installed on the laptop (restart pending).
11. **Images verified locally (2026-11-13)** with Docker Desktop (installed on the laptop): both images build for amd64 and arm64. The API image ran migrate → seed → server → purge against Postgres 17 + an S3-compatible store (RustFS), with public pictures and private customer photos stored in and served from S3. The web image's SPA fallback, cache headers and CSP check out. Fixes found doing this: **`package-lock.json` pointed all 653 packages at a private JFrog mirror (`infraedge.jfrog.io`, left over from the original build machine) → rewritten to `https://registry.npmjs.org/` (integrity hashes unchanged). The project must only use public resources – never add private registries/mirrors.** The build stages now use `npm ci --include-workspace-root` (TypeScript lives at the root).
12. **First CI run on GitHub (2026-11-14)**: e2e failed only on the 320px test – the page picker card title "עמוד חדש <13 digits>" (created by admin.spec, shared DB) didn't wrap → fixed with `wrap-anywhere` in `PagePicker.tsx`. Repo is public: github.com/mayamalka/shani-shop (OWNER placeholder filled). Deploy tools installed on the laptop: terraform, helm, kubeseal (~/.local/bin), OCI CLI (venv in C:\oci – long paths break deeper folders), gh; kubectl comes with Docker Desktop.
13. **Accounts + first-deploy prep (2026-11-16)**: domain **hadoda-shani.co.il** (LiveDNS) → Cloudflare zone (nameservers lilyana/viddy.ns.cloudflare.com, active); Brevo domain authenticated (brevo-code TXT, DKIM `brevo1/2._domainkey`, `_dmarc p=none`); OCI tenancy in **il-jerusalem-1** (single AD), upgraded to PAYG, Maya has her own admin user + API key in `~/.oci`. State bucket `shani-tfstate` (namespace `axirgrwslxrf`) created; `backend.hcl` and `terraform.tfvars` written (git-ignored). **Kubernetes bumped to v1.37.0** (`kubernetes.auto.tfvars`) – v1.34 was already outside OKE's 3-minor support window; Oracle has OL8/OL9 aarch64 images for 1.37.0. Local kubectl = 1.37.2 in `%LOCALAPPDATA%\Programs\kubectl-1.37`, put first on PATH by `~/.bashrc` (Docker Desktop's kubectl is older and sits in the machine PATH) – run deploy commands from bash. Smart App Control was turned off (it blocked unsigned helm.exe/oci.exe; a winget OCI CLI is now on PATH too). The user's terminal is MSYS2 UCRT64 → user env `MSYS2_PATH_TYPE=inherit` so it sees the Windows PATH.
14. **`terraform apply` done (2026-11-16)**: 25 resources; OKE BASIC v1.37.0, 2 × A1 nodes Ready (OL 9.8, cri-o), reserved LB IP **151.145.90.121**, R2 buckets in `eeur`, Cloudflare zone settings strict/TLS1.2/always-HTTPS, $1 budget. kubeconfig context `context-shani-cvsqezrv7oq`. Placeholders in `deploy/k8s` filled (domain, R2 account ID, LB IP, Let's Encrypt email = hadoda.shani@gmail.com). `infra/terraform/tfplan` is git-ignored now (a saved plan holds the Cloudflare token in plain text). Next: commit + push → release images → Argo CD bootstrap (deploy/README.md step 3–4).
