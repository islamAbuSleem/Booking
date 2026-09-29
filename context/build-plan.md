# Build Plan

**Verify command for every ticket:** `npm run build && npm run test` from the repo root.
No ticket is done until that passes.

**Stack:** Nuxt 4 (web) · NestJS 12 (api) · Prisma 7 + Neon Postgres · Cloudinary · Stripe test mode

Monorepo is npm workspaces: `apps/web`, `apps/api`, `packages/shared`, `context/`.

Ticket format: **UI** (frontend) · **Logic** (behaviour) · **API** (contract).

---

## Phase 1 — Foundation (mock-first)

No DB, no real auth. Every page renders from mock JSON in `apps/web/app/utils/mock/`.
This phase exists so layout and information architecture are settled and testable before
any wiring.

### T1 — Monorepo scaffold and tooling
- **UI:** none.
- **Logic:** npm workspaces root with `build` / `test` / `lint` / `format` / `dev`
  scripts that fan out to workspaces. TypeScript strict everywhere. ESLint flat config +
  Prettier in both apps. Jest configured in the API. `packages/shared` builds to
  `dist/` and is consumed as a workspace dep.
- **API:** N/A.
- **Verify:** `npm run build` green from an empty scaffold. `npm run test` runs (0 tests
  is a pass). `npm run lint` clean.

### T2 — Design system and app shell
- **UI:** `main.css` with Tailwind v4 `@theme` tokens from `context/ui-tokens.md`.
  `layouts/default.vue` (header, footer, nav) and `layouts/dashboard.vue` (sidebar).
  Base components: `BaseButton`, `BaseInput`, `BaseSelect`, `BaseCard`, `BaseBadge`,
  `BaseModal`, `BaseSpinner`, `BasePagination`, `BaseEmptyState`, `BaseSkeleton`,
  `BaseAlert`.
- **Logic:** tokens compile to working Tailwind utilities. Responsive at 375 / 768 /
  1280. Skip link and focus-visible styles present. **`@nuxtjs/i18n` is installed and
  configured here**, with `en` as the only locale and `strategy: 'no_prefix'` so URLs are
  unchanged. Every ticket from T4 on writes user-facing strings through `$t()` as it
  builds, so T30 is a verification pass and not a 40-file refactor.
- **Design system:** implement `context/design.md` — the editorial travel direction, the
  asymmetric grid, hairline-over-shadow separation, square corners, the 4px spacing
  scale, and the motion tokens. Load Fraunces, Archivo, and IBM Plex Mono via
  `@nuxtjs/google-fonts` with only the weights listed in `ui-tokens.md`.
- **API:** N/A.
- **Verify:** build passes; tokens render (no `text-[#hex]` anywhere — grep confirms);
  `$t('...')` resolves in a layout and emits no missing-key warnings; every contrast pair
  in the `ui-tokens.md` table is verified with a contrast checker; the token hairline
  and the ink-on-terracotta failure case are both confirmed handled.

### T3 — Mock data layer
- **UI:** none.
- **Logic:** `app/utils/mock/` exports typed fixtures: 12 hotels across 4 cities, 3-5
  room types each, amenities, reviews, sample bookings, sample users for each role.
  Images from a placeholder image service, stable URLs.
- **API:** N/A — mock JSON only.
- **Verify:** build passes; fixtures typed against the shared schemas with no `any`.

### T4 — Home page
- **UI:** `app/pages/index.vue`. Asymmetric 5/7 hero — text and search widget on the left,
  a 16:9 courtyard photograph bleeding past the right grid edge. Featured hotels grid,
  destinations strip, ink footer. Full layout and card anatomy in
  `context/stitch-prompts.md` (Screen 1) and `context/design.md`.
- **Logic:** search widget routes to `/hotels` with query params. Featured section
  renders from mock fixtures. `useSeoMeta` with title, description, OG tags.
- **API:** N/A — mock.

### T5 — Hotels list + filters
- **UI:** `app/pages/hotels/index.vue`. Filter sidebar (city, dates, guests, price range,
  amenities), sort control, result count, responsive card grid, pagination, loading
  skeletons, empty state.
- **Logic:** filters live in the query string and are shareable. Filtering and sorting
  run against mock fixtures. Debounced price input. Mobile filter drawer.
- **API:** N/A — mock.

### T6 — Hotel detail
- **UI:** `app/pages/hotels/[id].vue`. Image gallery with cover, room type cards
  (name, beds, max guests, price/night, availability), amenities grid, review list with
  rating breakdown, location block, sticky booking bar.
- **Logic:** `useAsyncData` keyed on the route param. Gallery lightbox with keyboard
  navigation. Reviews sorted newest-first with an overall average.
- **API:** N/A — mock.

### T7 — Booking flow
- **UI:** `app/pages/hotels/[id]/book.vue`. Date range picker (check-in / check-out),
  guest count, room selection, price breakdown (nightly × nights + fees + total), guest
  details form, confirm button.
- **Logic:** nights computed from the date range, checkout excluded. Total recomputed
  on every change. Dates validated (checkout after checkin, not in the past). Form
  validated with a shared Zod schema.
- **API:** N/A — mock quote.

### T8 — Bookings pages
- **UI:** `app/pages/bookings/index.vue` (upcoming / past tabs, status badges) and
  `app/pages/bookings/[id].vue` (detail, property snapshot, price breakdown, cancel
  button with confirmation modal).
- **Logic:** tabs filter mock bookings by status. Cancel is a local state change behind
  a confirm modal.
- **API:** N/A — mock.

### T9 — Auth pages
- **UI:** `app/pages/login.vue` and `app/pages/register.vue`. Email/password form, Google
  button, GitHub button, error and loading states, register shows a "list your property"
  host-intent checkbox.
- **Logic:** forms validated by shared Zod schemas. Errors surface inline. Submit
  redirects to a stored `redirect` query param or `/`. Mock session writes a fake user
  to a cookie.
- **API:** N/A — mock.

### T10 — Host dashboard
- **UI:** `app/pages/dashboard/host/index.vue` (property table, status badges, incoming
  bookings, at-a-glance stats), `new.vue` (listing wizard: details → amenities → photos
  → room types), `[id]/edit.vue` (edit listing, rooms, blackout dates).
- **Logic:** wizard steps validate before advancing. Photo step shows local previews.
  Blackout date ranges prevent overlap with themselves. Mock mutations update local
  state.
- **API:** N/A — mock.

### T11 — Admin dashboard
- **UI:** `app/pages/dashboard/admin/index.vue` (stats, pending listings queue, user
  table, review moderation queue). Tabs for Listings / Users / Reviews.
- **Logic:** approve / reject / hide actions update local state with a confirm step.
- **API:** N/A — mock.

---

## Phase 2 — Domain (database and API)

### T12 — Database schema, migration, seed
- **UI:** none.
- **Logic:** full Prisma schema per `context/architecture.md` — 12 tables. Initial
  migration. Seed script creating 3 users (one per role), 12 hotels across 4 cities with
  rooms, amenities, images, and a few completed bookings with reviews. Seed is
  idempotent and re-runnable.
- **Price storage (load-bearing for T39):** `rooms` has **no** price column. Prices live
  in `room_prices` as one row per `(room_id, currency)`, composite PK. `currencies` is
  seeded now with `USD` active, and every room gets exactly one `USD` price row. Phase 5
  multi-currency is then an INSERT — never an amendment to a populated table. Do not
  "simplify" this by adding `price_per_night_cents` to `rooms`; the whole point is to avoid
  migrating live pricing data later.
- **API:** N/A.
- **Verify:** `prisma migrate dev` applies; `prisma db seed` populates; `npm run build`
  passes; re-running the seed produces no duplicate rows.

### T13 — API foundation
- **UI:** none.
- **Logic:** `main.ts` with CORS, global `ValidationPipe`, the `{ success, data?, error? }`
  interceptor, the exception filter translating `HttpException` and Prisma codes, the
  Zod validation pipe, request logging with a `[module]` prefix, Swagger at `/docs`.
  `GET /api/health`.
- **API:** `GET /api/health` → `{ success: true, data: { status, db } }`.
- **Verify:** build passes; a 404 returns the error envelope, not Nest's default body.

### T14 — Auth: email/password
- **UI:** none yet (T23 wires it).
- **Logic:** `users` module. Register with bcrypt (12 rounds), login issuing a JWT set as
  an httpOnly, SameSite=Lax, Secure cookie. `AuthGuard` (global) with `@Public()`.
  `@CurrentUser()` decorator. `JwtAuthGuard` + `RolesGuard` for role checks.
- **API:**
  ```
  POST /api/auth/register   { email, password, name, wantsToHost } -> { user, token }
  POST /api/auth/login      { email, password }                      -> { user, token }
  POST /api/auth/logout                                               -> 204
  GET  /api/auth/me                                                 -> { user }
  ```
  `wantsToHost` promotes a new user to `HOST`; otherwise `GUEST`.
- **Verify:** build + tests pass. Unit tests cover the guard: no token → 401, wrong role
  → 403, `@Public()` route → 200.

### T15 — Auth: Google and GitHub OAuth
- **UI:** none yet.
- **Logic:** Passport strategies for both providers. Callback route exchanges the code,
  upserts the user keyed on `(email, oauthProvider, oauthAccountId)`, issues the same
  cookie as T14. Accounts with a matching existing email link rather than duplicate.
- **API:**
  ```
  GET /api/auth/google        -> 302 to provider
  GET /api/auth/google/callback
  GET /api/auth/github        -> 302 to provider
  GET /api/auth/github/callback
  ```
- **Verify:** build passes; callback issues a session and redirects to the frontend.

### T16 — Hotels read API
- **UI:** T4–T6 still on mock; no change.
- **Logic:** `hotels` module. `findAll` filters by city, price range, amenities, and
  guest capacity, paginated and sorted, returning only `PUBLISHED` hotels.
  `findOne` returns the detail payload (rooms, amenities, images, review summary) and
  404s on a non-`PUBLISHED` hotel for non-owners.
- **API:**
  ```
  GET /api/hotels?city=&checkIn=&checkOut=&guests=&minPrice=&maxPrice=&amenities=&sort=&page=&pageSize=
    -> { data: { items: HotelCard[], total, page, pageSize } }
  GET /api/hotels/:id -> { data: HotelDetail }
  ```
  404 → `code: "HOTEL_NOT_FOUND"`.
- **Verify:** build + tests. Only `PUBLISHED` rows are returned; a 404 uses the envelope.

### T17a — API client and home page wiring
- **UI:** `app/utils/api.ts` — one place that unwraps the `{ success, data, error }`
  envelope, normalizes thrown errors into a typed `ApiError { code, message, details }`,
  and attaches the session cookie. `/` (T4) switches from mock to real data.
- **Logic:** `useAsyncData` with unique keys. The featured-hotels section on the home page
  reads the real list endpoint with a limit. The search widget still routes to `/hotels`.
- **API:** consumes T16.
- **Verify:** build passes; `/` renders real seeded hotels server-side with no console
  errors. Every `$fetch` in the app now goes through `api.ts` — a grep for bare `$fetch`
  against the API base returns nothing.

### T17b — Hotels list wiring
- **UI:** `/hotels` (T5) switches from mock to real data. Filters map to query params.
- **Logic:** filters and sort stay in the query string and are parsed back out on load, so
  a shared or reloaded URL restores the exact result set. Pagination maps to `page` /
  `pageSize`. Loading skeleton, empty state, and error state all driven by the real
  response.
- **API:** consumes T16.
- **Verify:** build passes; `/hotels` renders server-side; applying a filter changes the
  URL and the result set together, and reloading that URL reproduces it.

### T17c — Hotel detail wiring
- **UI:** `/hotels/[id]` (T6) switches from mock to real data.
- **Logic:** `useAsyncData` keyed on `hotel:${route.params.id}`. Gallery, room cards,
  amenities, and review summary all come from the detail payload. A 404 renders the
  not-found state, not an unhandled error.
- **API:** consumes T16.
- **Verify:** build passes; `/hotels/[id]` renders server-side. Navigating between two
  hotel URLs does not leak the first hotel's data (the unique-key rule in
  `context/ui-rules.md`).

Three separate tickets rather than one because each is an independent diff with its own
failure mode. If a wiring bug appears, it is localizable to a single page.

### T18 — Availability and quote
- **UI:** T7 switches its price breakdown to the real quote endpoint.
- **Logic:** `bookings/availability` service. Given a room and a half-open date range,
  count overlapping `CONFIRMED`/`PENDING` bookings plus overlapping blackouts; the room
  is bookable when the total is below `total_inventory` and every night has inventory
  above zero. Quote returns per-night prices, subtotal, fees, total, and
  `holdExpiresAt`.
- **API:**
  ```
  GET  /api/hotels/:id/availability?checkIn=&checkOut=&guests=
    -> { data: { rooms: [{ room, available, remainingPerNight }] } }
  POST /api/bookings/quote  { roomId, checkIn, checkOut, guests }
    -> { data: { nights, subtotalCents, feesCents, totalCents, currency, breakdown } }
  ```
  Unavailable → `code: "ROOM_UNAVAILABLE"`.
- **Verify:** build + unit tests for the availability math: exact-fit, one over
  capacity, partial blackout, back-to-back stays not double-counted, multi-night with a
  blackout on a middle night.

### T19 — Favorites
- **UI:** heart toggle on `HotelCard` and the hotel detail page; a favourites route is
  **out of scope** — only the toggle ships.
- **Logic:** authenticated-only. Toggle is idempotent. Unique `(userId, hotelId)` with
  a 409 on a duplicate insert.
- **API:**
  ```
  POST   /api/favorites   { hotelId }  -> 201 { data: Favorite }
  DELETE /api/favorites/:hotelId      -> 204
  ```
  Unauthenticated → 401.
- **Verify:** build + tests that toggling twice returns to the original state.

### T20 — Bookings API
- **UI:** T8 wires to real data.
- **Logic:** create a booking in a `Serializable` transaction with a retry on `P2034`,
  re-checking availability inside the transaction to prevent oversell. Generates a
  human-readable `reference`. List the current user's bookings, get one (403 for
  someone else's), cancel (guarded to `CONFIRMED` only). Booking totals are a
  server-computed snapshot; the client-sent price is ignored.
- **API:**
  ```
  POST   /api/bookings        { roomId, checkIn, checkOut, guests, guestName, guestEmail, guestPhone }
    -> 201 { data: Booking }
  GET    /api/bookings        -> { data: { items: Booking[] } }
  GET    /api/bookings/:id    -> { data: Booking }
  POST   /api/bookings/:id/cancel -> { data: Booking }
  ```
  Wrong user → 403 `NOT_BOOKING_OWNER`. Sold out → 409 `ROOM_UNAVAILABLE`.
- **Verify:** build + tests. Two concurrent booking requests for the last room produce
  exactly one success.

### T21 — Cloudinary upload
- **UI:** T10's photo step uploads for real with progress and a retry on failure.
- **Logic:** `POST /api/uploads/sign` returns a signed, folder-scoped upload config. The
  browser uploads directly to Cloudinary and posts the result back. The API validates
  the `publicId` folder prefix matches the requesting host before accepting it. Deleting
  an image removes it from Cloudinary by `publicId`.
- **API:**
  ```
  POST /api/uploads/sign     { }  -> { data: { cloudName, apiKey, timestamp, folder, signature } }
  POST /api/uploads/attach   { hotelId, roomId?, url, publicId, altText, isCover }
    -> 201 { data: HotelImage }
  DELETE /api/uploads/:publicId    -> 204
  ```
  Foreign `publicId` → 403.
- **Verify:** build passes; an image survives a round trip and renders on the detail page.

### T22 — Host listing management API
- **UI:** T10 wires to real data.
- **Logic:** `hotels` write endpoints. A host may only touch their own listings —
  enforced by a query filter on `hostId`, never by trusting the request body. New
  listings are created `PENDING`. Full CRUD on rooms, amenities, and blackout dates.
  Slug generated from the name, unique-ified on collision.
- **API:**
  ```
  GET    /api/host/hotels                 -> { data: { items: Hotel[] } }
  POST   /api/host/hotels                 -> 201 { data: Hotel }   (status: PENDING)
  GET    /api/host/hotels/:id             -> { data: Hotel }
  PATCH  /api/host/hotels/:id             -> { data: Hotel }
  DELETE /api/host/hotels/:id             -> 204
  POST   /api/host/hotels/:id/rooms       -> 201 { data: Room }
  PATCH  /api/host/rooms/:roomId          -> { data: Room }
  DELETE /api/host/rooms/:roomId          -> 204
  POST   /api/host/rooms/:roomId/blackouts -> 201 { data: BlackoutDate }
  DELETE /api/host/blackouts/:id          -> 204
  GET    /api/host/bookings                -> { data: { items: Booking[] } }
  ```
  Non-owner → 403 `NOT_HOTEL_OWNER`. Host role required on all of them.
- **Verify:** build + tests that host B gets 403 on host A's hotel.

### T23 — Wire auth into the frontend
- **UI:** login, register, and the OAuth buttons hit the real API. `useAuth()`
  composable, session cookie handling, and `auth` route middleware. Header shows the
  signed-in user and a role-aware nav. Logout works.
- **Logic:** middleware redirects unauthenticated users away from `/dashboard/*` and
  wrong-role users away from `/dashboard/admin`. **This is UX only** — the API's guards
  are the real enforcement.
- **API:** consumes T14 and T15.
- **Verify:** build passes. A guest hitting `/dashboard/host` is redirected; a forged
  request to a host endpoint still 403s from the API.

### T24 — Reviews
- **UI:** review form on `/bookings/[id]` once a booking is `COMPLETED`; review list and
  rating breakdown on the hotel detail page; moderation queue in admin (T11).
- **Logic:** one review per booking, enforced by the unique constraint on `bookingId`.
  Only the booking's owner may review, and only for a `COMPLETED` stay. A confirmed
  booking cannot be reviewed. Recalculate the hotel's aggregate rating on write.
- **API:**
  ```
  POST  /api/hotels/:id/reviews { bookingId, rating, title, body } -> 201 { data: Review }
  GET   /api/hotels/:id/reviews?page= -> { data: { items, total, average } }
  GET   /api/bookings/:id/reviewable   -> { data: { canReview, reason? } }
  ```
  Duplicate → 409 `ALREADY_REVIEWED`. Not the owner → 403. Not completed → 400.
- **Verify:** build + tests for all three rejection paths.

### T25 — Admin moderation
- **UI:** T11 wires to real data.
- **Logic:** `admin` module, `RolesGuard` with the `ADMIN` role. Approve / reject /
  suspend listings, suspend users, hide reviews. Every admin action is audit-logged to
  the API log with the acting admin's id. An admin cannot suspend themselves.
- **API:**
  ```
  GET   /api/admin/stats                     -> { data: Stats }
  GET   /api/admin/listings?status=          -> { data: { items: Hotel[] } }
  PATCH /api/admin/listings/:id/status       { status } -> { data: Hotel }
  GET   /api/admin/users?query=&role=        -> { data: { items: User[] } }
  PATCH /api/admin/users/:id/status          { status } -> { data: User }
  GET   /api/admin/reviews?status=           -> { data: { items: Review[] } }
  PATCH /api/admin/reviews/:id/status        { status } -> { data: Review }
  ```
  Non-admin → 403 `ADMIN_REQUIRED`.
- **Verify:** build + tests that a `HOST` gets 403 on every route in this module.

---

## Phase 3 — Advanced (payments, limits, i18n)

### T26 — Stripe payment intent
- **UI:** none yet.
- **Logic:** `payments` module. `POST /api/payments/intent` creates a PaymentIntent for a
  `PENDING` booking using the server-recomputed amount and an `idempotencyKey` derived
  from the booking reference. Amounts are always integer cents. The API never accepts a
  client-sent amount.
- **API:**
  ```
  POST /api/payments/intent { bookingId } -> { data: { clientSecret, paymentIntentId, amountCents } }
  GET  /api/payments/:bookingId          -> { data: Payment }
  ```
  Booking not `PENDING` → 400. Booking not owned → 403.
- **Verify:** build + tests asserting a repeated call with the same key creates one
  PaymentIntent.

### T27 — Stripe webhook
- **UI:** none.
- **Logic:** `POST /api/payments/webhook` verifies the signature against the **raw**
  body with `stripe.webhooks.constructEvent`, then handles `payment_intent.succeeded`
  (booking → `CONFIRMED`, payment row upserted, receipt URL stored) and
  `payment_intent.payment_failed` (booking → `CANCELLED`, release the inventory hold).
  Fully idempotent — Stripe retries, so a repeated event must 200 without double-writing.
- **API:**
  ```
  POST /api/payments/webhook (raw body, signature header) -> 200
  ```
  Bad signature → 400 `INVALID_SIGNATURE`. Unknown event → 200, ignored.
- **Verify:** build + tests: valid signature confirms, invalid signature 400s, a
  duplicated event does not create a second `CONFIRMED` transition.

### T28 — Checkout UI
- **UI:** the booking flow's confirm step becomes a real Stripe Elements form. Booking
  status on `/bookings` shows `AWAITING_PAYMENT` while the intent is open, then
  `CONFIRMED` on webhook confirmation. Failure state offers a retry.
- **Logic:** the browser confirms the PaymentIntent with the `clientSecret`, but the
  displayed confirmation comes from the server's booking record — never from the
  client-side Stripe callback. Polls briefly, then falls back to a manual refresh.
- **API:** consumes T26 and T27.
- **Verify:** build passes. A test card `4242 4242 4242 4242` completes a booking end to
  end and it appears in `/bookings` as `CONFIRMED`.

### T29 — Rate limiting
- **UI:** none. The 429 body renders through the standard `BaseAlert` error path.
- **Logic:** `@nestjs/throttler`. Auth 5 / 15 min / IP; booking and payment mutations 20 /
  min / user; public reads 120 / min / IP. A 429 returns the standard envelope with
  `code: "RATE_LIMITED"` and a `Retry-After` header.
- **API:** no new routes; existing routes change behaviour.
- **Verify:** build + tests asserting the 429 envelope and the `Retry-After` header.

### T30 — i18n scaffolding
- **UI:** `@nuxtjs/i18n` with `en` as the only locale. Every user-facing string in Phases
  1-3 moves into locale files.
- **Logic:** no hardcoded strings left in templates. Dates, numbers, and currency go
  through `Intl`.
- **API:** N/A.
- **Verify:** build passes. `grep` finds no user-facing literal in a template.

---

## Phase 4 — Polish

### T31 — SEO
- **UI:** `@nuxtjs/sitemap` generating `/`, `/hotels`, and every `PUBLISHED` hotel detail
  URL. `robots.txt` disallowing `/dashboard`, `/login`, `/register`. Canonicals on all
  indexable pages. `Hotel` JSON-LD on the detail page. Unique title and description per
  page. Filter permutations canonicalize back to `/hotels`.
- **Logic:** dynamic routes prerendered or SSR-rendered with a stable slug URL.
- **API:** `GET /api/sitemap/urls` returns the list of publishable hotel slugs.
- **Verify:** build passes; view-source on `/hotels/[id]` shows title, description, OG
  tags, canonical, and JSON-LD in the initial HTML.

### T32 — Accessibility audit
- **UI:** all pages from every phase.
- **Logic:** full keyboard pass, focus order, contrast check against the tokens in
  `context/ui-tokens.md`, `aria-label` on icon buttons, focus trap in modals, skip link,
  error announcements in live regions. WCAG 2.1 AA.
- **API:** N/A.
- **Verify:** `npm run build` passes. Axe reports zero serious or critical violations on
  `/`, `/hotels`, `/hotels/[id]`, `/login`, `/dashboard/host`.

### T32b — Performance baseline and UX pass
- **UI:** `/`, `/hotels`, `/hotels/[id]`, `/hotels/[id]/book`, `/bookings`,
  `/dashboard/host`.
- **Logic:** measures against the budgets in `context/code-standards.md` — LCP under 2.5s,
  CLS under 0.1, INP under 200ms, public page JS under 200KB gzipped, all measured on a
  throttled mobile profile. Every image verified to have explicit dimensions, a Cloudinary
  transform, and correct lazy/priority loading. No list over 50 items rendering unpaginated.
  Sequential awaits that do not depend on each other are parallelised. Then a keyboard-only
  walk of the whole flow, and a check that every async surface handles loading, empty, and
  error, and that a failed submit preserves form input.
- **API:** N/A.
- **Verify:** `npm run build` passes. Trace numbers are **recorded in
  `context/progress-tracker.md` as the baseline** — a later regression against a recorded
  number fails the ticket that caused it.

### T33 — Test suite completion
- **UI:** none.
- **Logic:** the remaining unit tests. Availability math, pricing, role guards,
  webhook signature verification, concurrency on the last room, ownership checks.
- **API:** N/A.
- **Verify:** `npm run test` green with no skipped suites.

### T34 — Deploy configuration
- **UI:** none.
- **Logic:** env var contracts for all three deploy targets, `Dockerfile` for the API,
  Vercel/Netlify config for the web app, a documented `.env.example` per app, a Neon
  setup runbook, and a first-deploy checklist covering migrations, OAuth callback URLs,
  the Stripe webhook URL, and Cloudinary credentials.
- **API:** N/A.
- **Verify:** `npm run build` passes from a clean checkout with only `.env` files
  missing.

---

## Phase 5 — Deferred features

Not cancelled, just sequenced last. Every one of these depends on booking data that only
exists once the MVP flow works, and each is additive — none of them change the Phase 1-4
contracts. Do not start this phase until T1-T34 are verified and merged.

### T35 — Messaging: threads and messages
- **UI:** `/messages` (conversation list, unread badges) and `/messages/[id]` (thread
  view, composer, read receipts). `/dashboard/host/messages` is the host-side equivalent,
  filtered to that host's guests. A "Message host" action on `/bookings/[id]`.
- **Logic:** one thread per `(bookingId, guestId, hostId)`, created on first message and
  reused thereafter. A thread is only reachable by its two participants — the query always
  filters on `guestId` or `hostId` from the authenticated user, never on a client-supplied
  id alone. Polling every 10s, with unread counts on both sides. Marking a thread read
  clears the counter for that participant only.
- **API:**
  ```
  GET    /api/threads                 -> { data: { items: Thread[] } }
  POST   /api/threads                 { bookingId, body } -> 201 { data: Thread }
  GET    /api/threads/:id/messages?before=  -> { data: { items: Message[] } }
  POST   /api/threads/:id/messages    { body } -> 201 { data: Message }
  POST   /api/threads/:id/read        -> { data: { unreadCount: 0 } }
  ```
  Non-participant → 403 `NOT_THREAD_PARTICIPANT`. Body over 5000 chars → 400.
- **Verify:** build + tests. Host B cannot read a thread they are not part of; unread
  counts are independent per participant.

### T36 — Messaging: live delivery
- **UI:** threads move from polling to a live connection. A reconnect banner appears when
  the socket drops, and polling takes over automatically.
- **Logic:** Socket.IO gateway in the API, authenticated with the same JWT cookie as HTTP.
  Rooms are keyed by `threadId`; a server-side membership check runs before every join, so
  a crafted `threadId` never subscribes to someone else's thread. Reconnection refetches
  missed messages via `?before=` rather than trusting a replay buffer.
- **API:** no HTTP routes added. Gateway at `/socket.io`, events `message:new`,
  `message:read`.
- **Verify:** build + tests. A socket authenticated as host B is refused a join on host
  A's thread.

### T37 — Cancellation policy engine
- **UI:** a cancellation policy editor in `/dashboard/host/hotels/[id]/edit` (tiered
  rules: days before check-in → refund percentage, plus a no-refund window). The guest
  sees the same policy as a plain-language table on the booking detail page.
- **Logic:** `cancellation_policies` with an ordered tier list, one policy per hotel, with
  a sensible default applied when a hotel has none. The refund for a cancellation is
  computed **once, by the API**, from the whole elapsed time between booking and check-in.
  A pure function — no clock reads inside it, the timestamp is passed in, so the
  calculation is fully testable.
- **API:**
  ```
  GET   /api/hotels/:id/cancellation-policy   -> { data: Policy }
  PUT   /api/host/hotels/:id/cancellation-policy { tiers, noRefundWithinHours } -> { data: Policy }
  POST  /api/bookings/:id/cancellation-quote  -> { data: { refundPercent, refundCents, currency, policyVersion } }
  ```
  Not cancellable → 400 with the reason.
- **Verify:** build + tests. Tier boundaries, a cancellation inside the no-refund window,
  a cancellation at exactly the boundary day, and a fully refundable early cancellation.

### T38 — Stripe refunds
- **UI:** the cancel action shows the quoted refund amount and calls Stripe. Booking
  detail shows refund status (`none` / `pending` / `succeeded` / `failed`).
- **Logic:** cancelling a `CONFIRMED` booking creates a refund against the original
  PaymentIntent, using the amount from T37's quote — never a client-sent amount. Writes an
  append-only `refunds` row and flips the booking to `CANCELLED`, releasing the inventory
  hold. Confirmation is webhook-driven like payment.
- **The refund invariant is "at most one `succeeded` refund", not "at most one
  attempt."** A failed refund must never strand the guest's money: if the Stripe call
  fails transiently the booking is already `CANCELLED` but the refund is `failed`, and the
  guest needs a way back. So:
  - `POST /cancel` on an already-cancelled booking returns the existing refund and its
    status. It does **not** 409 — a duplicate cancel is a read, not an error.
  - A `failed` refund is retried via `POST /bookings/:id/refund/retry`, which creates a
    **new** `refunds` row (the ledger is append-only) and links it to the same booking.
  - A `succeeded` refund blocks any further refund: retry returns 409 `ALREADY_REFUNDED`.
- **API:**
  ```
  POST /api/bookings/:id/cancel           { } -> { data: { booking, refund } }
  POST /api/bookings/:id/refund/retry     { } -> { data: { refund } }
  GET  /api/bookings/:id/refunds               -> { data: { items: Refund[] } }
  ```
  Not the owner → 403. No payment captured → 400. Already `succeeded` → 409.
- **Verify:** build + tests. A test refund appears in Stripe test mode and the ledger has
  exactly one `succeeded` row. Specifically: a failed Stripe call leaves the booking
  cancelled and the refund `failed`; a retry creates a **second** row that succeeds; and
  retrying after success 409s. No path double-refunds.

### T39 — Multi-currency
- **UI:** a currency selector in the header; a per-currency price column in the host room
  editor; a currency picker in the host analytics view. Prices display in the selected
  currency with the original amount available on hover.
- **Logic:** `currencies` and `room_prices` hold per-room prices per currency. FX rates are
  pulled on a schedule into `fx_rates`. A booking **pins the rate it used**, so changing
  rates later never rewrites an existing total. Conversion happens at the quote step and is
  frozen into the booking row at create. Stripe is handed the amount in the charge currency.
- **API:**
  ```
  GET  /api/currencies                        -> { data: { items: Currency[] } }
  GET  /api/hotels/:id/prices?currency=      -> { data: { items: RoomPrice[] } }
  PUT  /api/host/rooms/:roomId/prices/:currency { priceCents } -> { data: RoomPrice }
  GET  /api/fx-rates?base=&quote=            -> { data: { rate, asOf } }
  ```
  `POST /api/bookings/quote` gains a `currency` field.
- **Verify:** build + tests. A booking created at one rate is unchanged after the rate
  moves; a missing direct rate falls back through the inverse rather than returning 1.

### T40 — Transactional email
- **UI:** `/settings/notifications` (per-type toggles) and a confirmation notice after a
  booking or cancellation. No change to the booking flow itself.
- **Logic:** templates for booking confirmation, cancellation, refund, review request, and
  new message. Each event writes to `email_outbox` **inside the same transaction** as the
  state change, so a booking is never confirmed without its confirmation email queued. A
  separate worker process drains the queue with retry and backoff. Preferences are checked
  before enqueueing. Booking detail and receipts are rendered as HTML and must be legible
  in both light and dark client themes.
- **API:**
  ```
  GET   /api/notification-preferences            -> { data: Preferences }
  PATCH /api/notification-preferences            { ... } -> { data: Preferences }
  GET   /api/bookings/:id/receipt               -> { data: { html } }
  ```
  The worker itself is a process entry point, not a route.
- **Verify:** build + tests. Disabling a preference suppresses that email and no other;
  a provider failure leaves the booking intact and the row retryable.

### T41 — Host analytics dashboard
- **UI:** `/dashboard/host/analytics`. Revenue over time, occupancy rate, average daily
  rate, booking count, top-performing rooms, a booking-source split, and a date-range
  filter. Comparison against the previous period of equal length.
- **Logic:** a nightly `@nestjs/schedule` job upserts `revenue_daily` per hotel. The
  dashboard reads the rollup, never scanning `bookings` at request time. ADR is
  `revenue / rooms_sold`; occupancy is `rooms_sold / available_inventory`, where inventory
  excludes blackout dates. A re-run for a past date is idempotent. Cancelled and refunded
  bookings are excluded from revenue.
- **API:**
  ```
  GET /api/host/analytics/summary?from=&to=  -> { data: { revenueCents, bookings, adrCents, occupancyRate, currency } }
  GET /api/host/analytics/timeseries?from=&to=&granularity=day|month
    -> { data: { items: [{ date, revenueCents, roomsSold, occupancyRate }] } }
  GET /api/host/analytics/top-rooms?from=&to=  -> { data: { items: [...] } }
  ```
  Scoped to the authenticated host's own hotels.
- **Verify:** build + tests. The rollup matches a hand-computed fixture; re-running for a
  date does not double-count; a host sees only their own numbers.

### T42 — Email worker deployment
- **UI:** none.
- **Logic:** the `worker:email` entry point, deployed as a second process from the same
  Docker image. Health check, graceful shutdown mid-drain, and a documented command for
  draining a stuck queue.
- **API:** N/A.
- **Verify:** build passes; the worker starts, drains the outbox, and exits cleanly on
  `SIGTERM`.

