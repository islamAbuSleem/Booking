# Architecture

## Scope Decision
**Fullstack.** Confirmed at intake: hotel booking requires auth, users, persistence,
dashboard, and payments.

## Stack

| Layer | Choice | Version |
|---|---|---|
| FE framework | Nuxt (Vue 3, SSR) | 4.5.x |
| FE styling | Tailwind CSS via `@tailwindcss/vite` | 4.3.x |
| FE data | `useFetch` / `useAsyncData` with `$fetch` to API | — |
| i18n | `@nuxtjs/i18n`, EN only | latest |
| SEO | `@nuxtjs/sitemap` + `useSeoMeta` | latest |
| BE | NestJS | 12.1.x |
| BE ORM | Prisma | 7.10.x |
| DB | Neon Postgres (serverless, pooled connection) | — |
| Auth | Passport JWT (httpOnly cookie) + Google/GitHub OAuth | — |
| Payments | Stripe test mode | 22.x |
| Storage | Cloudinary (hotel/room photos) | — |
| Validation | Zod in `packages/shared`, driven by DTOs | latest |
| Testing | Jest (API unit tests) | latest |
| Lint/format | ESLint + Prettier | latest |
| Monorepo | npm workspaces | — |

## Structure

```
Booking/
  apps/
    web/                  # Nuxt 4
      app/
        assets/css/main.css
        components/
        composables/
        layouts/
        middleware/
        pages/
        plugins/
        utils/
      shared/             # Nuxt auto-imported shared utils/types
      server/             # Nuxt server routes (BFF proxy / OAuth callback only)
      public/
      nuxt.config.ts
    api/                  # NestJS 12
      prisma/
        schema.prisma
        seed.ts
      src/
        main.ts
        app.module.ts
        common/           # guards, decorators, filters, interceptors
        config/
        prisma/           # PrismaService
        modules/
          auth/           # controller, service, strategies, dto
          hotels/
          rooms/
          amenities/
          bookings/
          reviews/
          favorites/
          payments/
          users/
          admin/
      test/
  packages/
    shared/               # Zod schemas, DTO types, shared enums, money utils
      src/
  context/
```

## System Boundaries

- **`apps/web`** — presentation only. No direct DB access. Talks to the API over HTTPS
  with a bearer token read from the httpOnly cookie (sent by the browser automatically)
  or via the Nuxt server proxy.
- **`apps/api`** — the only system that touches Postgres. Owns auth, authorization,
  availability math, and Stripe secret keys.
- **Stripe** — calls back into the API via signed webhooks. The API never trusts the
  browser's "payment succeeded" claim.
- **Cloudinary** — the API issues signed upload params; the browser uploads directly,
  then sends the resulting `url` + `public_id` back to the API.
- **`packages/shared`** — pure TypeScript. Zod schemas and inferred types used by both
  apps. No framework imports.

### Phase 5 boundaries (deferred)

- **WebSocket gateway** — a Socket.IO gateway inside the API, authenticated with the same
  JWT cookie. Carries new-message events only. Clients poll on a timer as a fallback, so
  a blocked socket degrades rather than breaks.
- **Email worker** — a separate process entry point in `apps/api` (`npm run worker:email`)
  that drains `email_outbox`. Decoupled from the web process so a slow or failing mail
  provider never blocks a booking request. Runs alongside the API, same image.
- **Analytics rollup** — a scheduled job (`@nestjs/schedule`) that writes `revenue_daily`
  nightly. Dashboard reads the rollup, not raw `bookings`. A re-run for a past date is
  idempotent (upsert).
- **FX rates** — pulled from a provider on a schedule and stored in `fx_rates`. A booking
  stores the rate it used, so a later rate change never rewrites history.

## Data Flow

**Read (SSR hotel list):**
Browser → Nuxt SSR renders → `$fetch(GET /api/hotels?...dates&guests)` →
NestJS controller → availability service → Prisma → Neon → response →
rendered HTML delivered. Filters live in the query string so pages are shareable and
cacheable.

**Write (booking + payment):**
1. Browser → `POST /api/bookings/quote` (dates, roomTypeId, guests) → API returns a
   price breakdown and a `holdExpiresAt`.
2. Browser → `POST /api/payments/intent` → API creates a Stripe PaymentIntent, returns
   `clientSecret`.
3. Browser → Stripe.js confirms the PaymentIntent with the test card.
4. Stripe → `POST /api/payments/webhook` (signature verified) → API marks the booking
   `CONFIRMED` and records the payment.
5. Browser polls or refreshes `/bookings` to see `CONFIRMED`.

## Deploy Boundary

Three independently deployable units, three deploy targets:

| Unit | Target | Notes |
|---|---|---|
| `apps/web` | Vercel or Netlify | SSR, needs `NUXT_PUBLIC_API_BASE` |
| `apps/api` | Fly.io or Render | Long-running Node, needs `DATABASE_URL`, `JWT_SECRET`, `STRIPE_SECRET_KEY`, `CLOUDINARY_*`, OAuth client secrets |
| `apps/api` (email worker) | Fly.io or Render | Same image, `npm run worker:email`. Only from Phase 5 (T42) |
| Neon Postgres | Neon hosted | Connection pooler URL for runtime, direct URL for migrations |
| Cloudinary | Cloudinary | Free tier |
| SMTP / email provider | Resend or Postmark | Only from Phase 5 (T42) |

`packages/shared` is built to the workspace and consumed by both — it ships with the
deploys, it is not deployed.

## DB Schema

`users`, `hotels`, `rooms`, `room_prices`, `bookings`, `reviews`, `amenities`,
`hotel_images`, `payments`, `blackout_dates`, `favorites`. Full column-level definition
lives in `apps/api/prisma/schema.prisma`; the logical model and relations are below.

| Table | Key columns | Notes |
|---|---|---|
| `users` | `id`, `email` (unique), `password_hash` (nullable — OAuth users), `name`, `avatar_url`, `role` (`GUEST`\|`HOST`\|`ADMIN`), `oauth_provider`, `oauth_account_id`, `created_at` | Email unique across providers so one person = one account |
| `hotels` | `id`, `host_id` → `users`, `name`, `slug` (unique), `description`, `address_line`, `city`, `country`, `lat`, `lng`, `star_rating`, `status` (`PENDING`\|`PUBLISHED`\|`REJECTED`\|`SUSPENDED`), `check_in_time`, `check_out_time` | Only `PUBLISHED` is returned by public search |
| `rooms` | `id`, `hotel_id` → `hotels`, `name`, `description`, `bed_type`, `max_guests`, `total_inventory` | `total_inventory` caps concurrent bookings. **No price column** — see below |
| `room_prices` | `room_id` → `rooms`, `currency` (ISO 4217), `price_cents` | Per-room price per currency, composite PK `(room_id, currency)`. Exists in Phase 1 with `USD` only, so multi-currency is an INSERT in T39 and never a schema amendment to live data |
| `amenities` | `id`, `name` (unique), `icon` | Global lookup |
| `hotel_amenities` | `hotel_id`, `amenity_id` | Explicit join table, composite PK |
| `hotel_images` | `id`, `hotel_id`, `room_id` (nullable), `url`, `public_id`, `alt_text`, `sort_order`, `is_cover` | `public_id` needed for Cloudinary deletes |
| `blackout_dates` | `id`, `room_id` (nullable — null = whole hotel), `starts_on`, `ends_on`, `reason` | Date-only, inclusive |
| `bookings` | `id`, `reference` (unique, human-readable), `guest_id` → `users`, `room_id` → `rooms`, `check_in`, `check_out`, `guests_count`, `nights`, `subtotal_cents`, `fees_cents`, `total_cents`, `currency`, `status` (`PENDING`\|`CONFIRMED`\|`COMPLETED`\|`CANCELLED`), `created_at` | Denormalized totals are an immutable price snapshot |
| `payments` | `id`, `booking_id` → `bookings`, `stripe_payment_intent_id` (unique), `amount_cents`, `currency`, `status` (`requires_payment`\|`succeeded`\|`refunded`\|`failed`), `receipt_url` | One-to-one with booking |
| `reviews` | `id`, `booking_id` (unique), `author_id`, `hotel_id`, `rating` (1-5), `title`, `body`, `status` (`VISIBLE`\|`HIDDEN`), `created_at` | `booking_id` unique enforces one review per completed stay |
| `favorites` | `user_id`, `hotel_id` | Composite PK |

### Phase 5 tables (deferred, not yet migrated)

Added by T35-T42. Listed here so the model is not renegotiated mid-build.

Nothing in Phase 5 amends a Phase 1-4 table. Where a feature would have changed one —
multi-currency pricing is the one that nearly did — the table was created early in Phase 1
instead, with the Phase 5 behaviour arriving as new rows.

| Table | Key columns | Notes |
|---|---|---|
| `threads` | `id`, `booking_id`, `guest_id`, `host_id`, `last_message_at`, `guest_unread_count`, `host_unread_count` | One thread per `(booking_id, guest_id, host_id)`, unique together |
| `messages` | `id`, `thread_id` → `threads`, `sender_id`, `body`, `read_at`, `created_at` | `read_at` is per-message; a read receipt clears the counter |
| `cancellation_policies` | `id`, `hotel_id` (unique), `tiers` (JSON: array of `{ minDaysBefore, refundPercent }`), `default_refund_percent`, `no_refund_within_hours` | A tier table, not a boolean flag |
| `refunds` | `id`, `booking_id`, `payment_id`, `stripe_refund_id` (unique, nullable until Stripe returns one), `amount_cents`, `currency`, `percent`, `reason`, `status` (`pending`\|`succeeded`\|`failed`), `attempts`, `created_at` | Append-only ledger; never mutate a prior row. The invariant is **at most one `succeeded` refund per booking**, not at most one attempt — see D11 |
| `currencies` | `code` (PK, ISO 4217), `name`, `symbol`, `is_active` | Active currencies only. Seeded in T12 alongside the single USD price |
| `fx_rates` | `base`, `quote`, `rate`, `as_of` | Append-only snapshots; a booking pins the rate it used |
| `notification_preferences` | `user_id`, `booking_confirmation`, `cancellation`, `refund`, `review_request`, `new_message` | All default `true` except `new_message` |
| `email_outbox` | `id`, `user_id`, `template`, `payload` (JSON), `status` (`queued`\|`sent`\|`failed`), `attempts`, `last_error` | Transactional email is queued in the DB and sent by a worker, so a mail failure never rolls back a booking |
| `revenue_daily` | `hotel_id`, `date`, `currency`, `revenue_cents`, `bookings_count`, `rooms_sold` | Rolled up by a nightly job, backfilled on first run. `ADR` and occupancy read from here instead of scanning `bookings`. Composite PK `(hotel_id, date, currency)` |

**Money:** integer cents, never floats. Every money column is paired with a `currency`
column, including the rollup. A booking's totals are an immutable snapshot in the currency
the guest was quoted.

**Pricing:** `rooms` carries no price. Price lives in `room_prices`, one row per
`(room, currency)`, so a currency is added by inserting a row rather than by altering a
populated table. Phase 1 seeds exactly one currency (`USD`) per room; T39 adds more.
A read that needs a price for a currency with no `room_prices` row is an error, not a
silent fallback to zero.

**Dates:** `check_in` / `check_out` are `DATE` (not timestamp) — hotels check in by day.
A stay is a half-open range: `check_in <= d < check_out`, so back-to-back stays never
double-count.

**Availability rule:** a room is bookable for a requested range when
`confirmed bookings overlapping the range + overlapping blackouts <= total_inventory`.
Computed inside a serializable transaction to prevent oversell under concurrency.

## Storage

Cloudinary, folder `booking/hotels/{hotelId}/`. Upload flow: browser requests
`POST /api/uploads/sign` → API returns a signed upload config → browser posts directly to
Cloudinary → browser sends `{ url, publicId }` to the API. The API validates that
`publicId` belongs to a path prefix owned by the requesting host before persisting it.
