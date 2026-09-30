# Project Overview

## About
A hotel booking platform. Guests discover hotels, check availability, book rooms, and pay.
Hosts list and manage their properties. Admins moderate the platform.

## Problem
No small-team hotel listing product that combines discovery, availability-aware booking, and
host self-service in one deployable monorepo. Existing options are either marketplace-only
(Airbnb-style, no hotel availability) or booking-engine-only (no host dashboard).

## Scope
**Fullstack.** Nuxt 4 frontend + NestJS 12 API + Neon Postgres (Prisma) + Cloudinary images +
Stripe test-mode payments.

## Pages / Routes

| Route | Access | Purpose |
|---|---|---|
| `/` | public | Hero, featured hotels, destinations |
| `/hotels` | public | Search + filters (city, dates, guests, price, amenities) |
| `/hotels/[id]` | public | Property detail, room types, amenities, reviews, availability |
| `/hotels/[id]/book` | guest | Date/guest picker, price breakdown, Stripe checkout |
| `/bookings` | guest | Upcoming + past trips |
| `/bookings/[id]` | guest | Single booking detail, cancel |
| `/login` | public | Email/password + Google + GitHub |
| `/register` | public | Email/password signup, choose host intent |
| `/dashboard/host` | host | Property list, incoming bookings, revenue at a glance |
| `/dashboard/host/hotels/new` | host | Create listing wizard |
| `/dashboard/host/hotels/[id]/edit` | host | Edit listing, rooms, photos, blackout dates |
| `/dashboard/admin` | admin | Users, listings, reviews moderation |
| `/messages` | guest | Conversation list (Phase 5) |
| `/messages/[threadId]` | guest | Thread with the host (Phase 5) |
| `/dashboard/host/messages` | host | Guest conversations (Phase 5) |
| `/dashboard/host/analytics` | host | Revenue, occupancy, booking trends (Phase 5) |
| `/settings/notifications` | any | Email notification preferences (Phase 5) |

## User Flows

1. **Guest books a room**
   `/` → `/hotels` (filters applied) → `/hotels/[id]` (pick room type) →
   `/hotels/[id]/book` (dates + guests) → availability check → Stripe PaymentIntent →
   webhook confirms → booking appears in `/bookings`.

2. **Host manages a property**
   `/register` (host intent) → `/dashboard/host/hotels/new` (details, amenities, photos to
   Cloudinary, room types with nightly price + inventory) → listing goes `PENDING` →
   admin approves → listing is public. Host then adds blackout dates and sees bookings.

3. **Admin moderates**
   `/dashboard/admin` → approve/reject pending listings → suspend users →
   hide reviews.

4. **Guest and host talk about a stay** *(Phase 5)*
   `/bookings/[id]` → "Message host" → `/messages/[threadId]` → host replies from
   `/dashboard/host/messages`. One thread per `(booking, guest, host)`; unread counts on
   both sides.

5. **Guest cancels** *(Phase 5)*
   `/bookings/[id]` → cancel → the policy attached to the booked room decides the refund
   amount → the API calls Stripe → the booking becomes `CANCELLED` and the refund status
   is shown. The guest sees the exact amount before confirming.

6. **Host reads their numbers** *(Phase 5)*
   `/dashboard/host/analytics` → revenue over time, occupancy rate, average daily rate,
   top rooms, booking source split, date-range filter.

## In Scope

### MVP (Phases 1-4)
- Email/password + Google + GitHub OAuth, JWT in httpOnly cookie
- Three roles: `GUEST`, `HOST`, `ADMIN`, enforced server-side by NestJS guards
- Hotel/room CRUD with Cloudinary image upload
- Availability-aware search (date range + guest count against room inventory)
- Booking lifecycle: `PENDING` → `CONFIRMED` → `COMPLETED` / `CANCELLED`
- Stripe test-mode checkout with webhook-driven confirmation
- Reviews (only from guests with a completed booking)
- Favorites / wishlist
- Per-user favorites and trip management
- SEO on public pages (SSR meta, OG tags, sitemap)
- WCAG AA, i18n scaffolding (EN only), rate limiting on auth + booking

### Phase 5 — deferred, still committed
Nothing here is cancelled. It is sequenced after the MVP is solid because each item
depends on booking data that only exists once the core flow works.
- **Messaging** — host↔guest threads scoped to a booking, unread counts, WebSocket
  delivery with polling fallback
- **Cancellation + refunds** — per-hotel policy with tiers, refund computed by the API,
  Stripe partial refunds, refund ledger
- **Multi-currency** — a `currencies` table, per-room prices per currency, a stored FX
  rate snapshot on the booking so historical totals never re-convert
- **Notifications** — transactional email for booking, cancellation, refund, and review
  requests, plus per-user notification preferences
- **Host analytics** — revenue, occupancy rate, ADR, top rooms, trends

## Working notes
Operational knowledge that is not domain spec — the parallel-agent ownership fence,
environment tooling traps, and corrections already made — lives in
context/working-notes.md. Read it alongside this file.

## Out of Scope (still not planned)
- Mobile native apps
- Multi-language content beyond EN
- Push notifications and SMS
- Live chat while a stay is in progress (messaging is booking-scoped only)
- Loyalty points, coupons, and promo codes
- Tax and VAT calculation (a flat fee stands in for MVP)
- Instant book / request-to-book approval workflow

## Success Criteria
1. `npm run build` passes at repo root (typecheck + build both apps).
2. `npm run test` passes (Vitest unit tests for API services).
3. A guest can complete a Stripe test-mode booking end-to-end and see it in `/bookings`.
4. A host can create a listing with a photo and a room type, and it becomes publicly
   searchable once approved.
5. Role guards block guest → `/dashboard/host` and non-admin → `/dashboard/admin` on the
   server, not just in the UI.
6. Availability search never returns a room that is overbooked for the requested dates.
7. *(Phase 5)* A guest can cancel a confirmed booking and the refund amount matches the
   policy shown to them before they confirmed, verified against a Stripe test refund.
8. *(Phase 5)* A guest and the host can exchange messages on a booking thread, and the
   unread count is correct for both.
9. *(Phase 5)* A booking made in a non-USD currency keeps its original total when FX rates
   change.
