# Progress Tracker

## Current Status

**Spec phase: COMPLETE.** All architecture decisions locked at intake. No open questions.

| Decision | Value | Locked |
|---|---|---|
| Scope | Fullstack | yes |
| Frontend | Nuxt 4.5.x (Vue 3, SSR), Tailwind CSS 4.3.x via `@tailwindcss/vite` | yes |
| Backend | NestJS 12.1.x | yes |
| Database | Neon Postgres via Prisma 7.10.x, pooled URL at runtime + direct URL for migrations | yes |
| ORM | Prisma | yes |
| Monorepo | npm workspaces: `apps/web`, `apps/api`, `packages/shared`, `context/` | yes |
| Auth | Email/password (bcrypt) + Google OAuth + GitHub OAuth, JWT in httpOnly cookie | yes |
| Roles | `GUEST`, `HOST`, `ADMIN` — enforced by NestJS guards | yes |
| Images | Cloudinary, signed direct upload, folder scoped per host | yes |
| Payments | Stripe test mode, PaymentIntent + webhook confirmation | yes |
| Validation | Zod schemas in `packages/shared`, single source of truth | yes |
| Styling | Tailwind v4 + CSS custom properties in `@theme`, no hardcoded hex | yes |
| Verify command | `npm run build && npm run test` from the repo root | yes |
| Aesthetic | Editorial Travel Guide — paper/ink/terracotta, hairline rules, square corners, asymmetric grid | yes |
| Type | Fraunces (display) · Archivo (UI) · IBM Plex Mono (references) | yes |
| Dark mode | Not in the MVP (D22) | yes |
| Corner radius | 2px max everywhere; **no pills** (D23) | yes |
| Functional typeface | Archivo Narrow (tables, labels, UI); Archivo (prose) (D24) | yes |
| Table density | 64px rows, nowrap badges, fixed action columns (D27) | yes |
| Wordmark | "The Gazette · EST. 2024" — **proposal, unconfirmed** (D26) | no |
| Maps | Undecided; placeholder for now (D28) | no |
| Spec files | `context/*.md` (this directory) | yes |

## Ticket Checklist

### Phase 1 — Foundation
- [ ] T1 Monorepo scaffold and tooling
- [ ] T2 Design system and app shell
- [ ] T3 Mock data layer
- [ ] T4 Home page
- [ ] T5 Hotels list + filters
- [ ] T6 Hotel detail
- [ ] T7 Booking flow
- [ ] T8 Bookings pages
- [ ] T9 Auth pages
- [ ] T10 Host dashboard
- [ ] T11 Admin dashboard

### Phase 2 — Domain
- [ ] T12 Database schema, migration, seed
- [ ] T13 API foundation
- [ ] T14 Auth: email/password
- [ ] T15 Auth: Google and GitHub OAuth
- [ ] T16 Hotels read API
- [ ] T17a API client and home page wiring
- [ ] T17b Hotels list wiring
- [ ] T17c Hotel detail wiring
- [ ] T18 Availability and quote
- [ ] T19 Favorites
- [ ] T20 Bookings API
- [ ] T21 Cloudinary upload
- [ ] T22 Host listing management API
- [ ] T23 Wire auth into the frontend
- [ ] T24 Reviews
- [ ] T25 Admin moderation

### Phase 3 — Advanced
- [ ] T26 Stripe payment intent
- [ ] T27 Stripe webhook
- [ ] T28 Checkout UI
- [ ] T29 Rate limiting
- [ ] T30 i18n scaffolding

### Phase 4 — Polish
- [ ] T31 SEO
- [ ] T32 Accessibility audit
- [ ] T32b Performance baseline and UX pass
- [ ] T33 Test suite completion
- [ ] T34 Deploy configuration

### Phase 5 — Deferred features
- [ ] T35 Messaging: threads and messages
- [ ] T36 Messaging: live delivery
- [ ] T37 Cancellation policy engine
- [ ] T38 Stripe refunds
- [ ] T39 Multi-currency
- [ ] T40 Transactional email
- [ ] T41 Host analytics dashboard
- [ ] T42 Email worker deployment

## Decisions

- **D1 — The five features skipped at intake are deferred, not cancelled.** Host↔guest
  messaging, the cancellation policy / refund engine, multi-currency, transactional
  email, and host analytics are all committed as Phase 5 (T35-T42). They were sequenced
  last because each depends on booking data that only exists once the core flow works.
  *Reversible:* none of them change a Phase 1-4 contract, so they can be pulled forward
  or dropped without touching anything already built.
- **D2 — Availability is a range, not a night count.** A stay is half-open
  (`checkIn <= d < checkOut`), so back-to-back stays on the same room never overlap.
  Encoded in the availability math and its tests (T18).
- **D3 — The API never trusts a client-sent amount or a client-side payment result.**
  Booking totals are recomputed server-side, and `CONFIRMED` happens only on a verified
  Stripe webhook (T20, T26, T27).
- **D4 — Ownership is checked by query filter, not by request body.** A host listing
  query always includes `hostId` from the authenticated user (T22).
- **D5 — Frontend route middleware is UX, not security.** The NestJS guards are the
  enforcement boundary. A user who bypasses the client route still gets a 403 (T23).
- **D6 — i18n ships EN-only but every string is extracted from day one.** T30 is a
  mechanical pass, not a retrofit. Adding a locale later is config, not refactoring.
- **D7 — Stripe in test mode only.** No live keys, no refunds, no cancellation policy
  in the MVP. Revisit alongside the refund engine (D1).
- **D8 — Phase 1 is mock-first on purpose.** Layout, information architecture, and
  responsive behaviour are settled and reviewable before any wiring, so wiring tickets
  stay small.
- **D9 — Messaging is booking-scoped.** A thread requires a booking and exists only
  between that booking's guest and the host of the booked room. No open-ended
  guest-to-guest or platform-wide chat.
- **D10 — A booking pins its FX rate.** Conversion happens at the quote step and the rate
  is frozen onto the booking row. Rate changes never rewrite an existing total. This is
  the reason `fx_rates` is append-only rather than a single current-rate row.
- **D11 — Refunds are an append-only ledger.** `refunds` rows are never mutated; a
  correction is a new row. A booking can be refunded at most once — a second cancel 409s
  rather than issuing a second Stripe refund.
- **D12 — Transactional email is queued, not sent inline.** The outbox row is written in
  the same transaction as the state change, and a separate worker drains it. A mail
  provider outage must never roll back a confirmed booking.
- **D13 — Analytics read a rollup, not raw bookings.** A nightly scheduled job writes
  `revenue_daily`; the dashboard queries it. Keeps a heavy read off the request path and
  makes the numbers reproducible. Re-running a date is an upsert, not an append.
- **D14 — Extract at the second duplicate, not the third.** Normally the advice is "three
  occurrences justify an abstraction". Lowered to two because in a project of this size
  the third occurrence usually arrives after the two copies have already diverged, and
  reconciling them is more expensive than extracting them. The guard against over-
  extraction is the conceptual-similarity test: wrong extraction costs more than
  duplication.
- **D15 — SOLID applies at module and service boundaries, not inside a function.** Applying
  it literally produces one interface per class and a class per method, which is ceremony
  that makes the code harder to read than the duplication it replaced. The practical test
  is D: a pure domain function must be callable with no Nest container, no Prisma, and no
  network. If it is not, the dependency is inverted wrong.
- **D16 — No props drilling; slots are the default answer.** A prop chain longer than two
  levels of pass-through, or a prop a component does not read, is drilling. The resolution
  order is slot → provide/inject → composable → store. Vue's slot model makes "parent owns
  data, child owns layout" the natural shape, so most drilling is avoidable without any
  global state.
- **D17 — Performance and UX are budgeted, not deferred.** Concrete budgets (LCP 2.5s,
  CLS 0.1, INP 200ms, 200KB gzipped public JS) live in `context/code-standards.md` and are
  measured in T32b. The measured numbers become the recorded baseline, so a later
  regression fails the ticket that caused it instead of being discovered at the end.
- **D18 — One ticket per branch.** A branch maps to one ticket in the build plan, named
  `feat/T12-prisma-schema`. Unrelated tickets on one branch make a failing build
  impossible to attribute.
- **D19 — The aesthetic is "Editorial Travel Guide": warm paper, ink, deep terracotta,
  hairline rules, no shadows, square corners.** Chosen over the generic marketplace card
  grid, which is the default an AI produces and the thing a user has already seen ten
  thousand times. Photography is the only saturated element so the images carry the
  colour. Layout is asymmetric (5/7 splits, text never centred) and density is
  deliberately non-uniform — airy on discovery surfaces, tight on transactional ones.
- **D20 — Terracotta on ink is a contrast failure, by design of the palette.** Ink
  `#1F1B16` on accent `#A63D22` measures about 2.6:1. White `#FFFDFA` on accent is about
  6.4:1. Because the brand colour and the text colour are both "the obvious ones", the
  instinct will be to put ink on terracotta. `ui-tokens.md` states the rule and T2
  verifies it. `--color-accent-bright` at 4.0:1 is large-text-only.
- **D21 — `context/stitch-prompts.md` generates reference designs, it does not specify
  them.** Stitch is used to explore layouts quickly; `context/design.md` and
  `context/ui-tokens.md` are authoritative. On any conflict the design system wins and the
  prompt is corrected. Stitch cannot hold a system across prompts, so the System Style
  prompt is re-pasted per screen and a rejection clause exists for drifted output.
- **D22 — Dark mode is not in the MVP.** The `ui-rules.md` reference to legible email in
  dark clients is a client-side email concern, not a second app theme. A dark palette is a
  future ticket with its own contrast audit, not something to build speculatively.
- **D23 — Pills are struck entirely.** The two Stitch themes disagreed (one allowed
  `9999px` for status badges, one forbade pills outright) and my draft tokens said pills
  for status only — three sources, three answers, and the renders came out square anyway.
  Ruled: **no `r-full` token exists.** Every badge and chip is `r-sm` (2px). The tinted
  wash plus label text already carry the status, and a pill fights the hairline grid.
- **D24 — Archivo Narrow is adopted for the functional layer.** Not in the original spec;
  both themes chose it independently and the rendered tables prove why. Split: Narrow for
  tables, stat cards, labels, buttons, and form controls; regular Archivo for long-form
  prose. Narrow everywhere including prose is a real legibility cost and that is the one
  place the density push yields.
- **D25 — Print costume is cut; editorial layout is kept.** The explorations invented a
  fictional institution — volume numbers, inspection counts, registry refs, ledger hashes,
  "Curator's Pick" endorsements. All removed. The distinction: whitespace, asymmetry,
  hairlines, and a serif *are* the aesthetic; invented institutional history is noise that
  displaces the real navigation. `The Gazette · EST. 2024` is kept as the one piece of
  masthead theatre that is actually the brand.
- **D26 — "The Gazette" is a proposal, not a decision.** The model invented the name and
  reused it in 6 of 10 generations. It is the owner's call. Renaming is one token, not a
  redesign — do not let it harden into the codebase before it is confirmed.
- **D27 — Density is now rule-governed, not taste.** 64px table rows, `nowrap` on badges
  and actions, fixed-width action columns, one money format per context, aligned stat
   cards, rating bars normalised to visible min–max. These came from defects observed in
  the renders, and they are in `ui-tokens.md` so they apply to every table, not just the
  one that was wrong.
- **D28 — Maps are undecided.** `/hotels/[id]` has a Location section; the references use
  a map screenshot carrying third-party attribution, which is not shippable. Build a
  static styled placeholder with a link out to directions, keep the component seam, and
  do not invent a provider decision. Flagged rather than silently assumed.

## Notes

- NestJS is on **12.1.x**, not 11 as the intake default suggested. The intake options
  predated the current release line; 12 is what `npm view @nestjs/core version` reports.
- Prisma is on **7.10.x**. Check for breaking changes in the generated client before
  T12.
- `@nuxtjs/tailwindcss` is **not** used — it targets Tailwind v3. The v4 path is the
  first-party `@tailwindcss/vite` plugin with a CSS-first `@theme` block.
- Two Neon URLs are required and they are easy to swap by mistake: pooled
  (`-pooler` host) at runtime, direct at migration time. Getting this backwards
  exhausts the connection budget.
- OAuth callback URLs must be registered with Google and GitHub before T15 can be
  verified manually. Do that when T14 lands.
- The Stripe webhook URL must be publicly reachable (tunnel or deployed API) before T27
  can be verified end to end.
- **T37-T41 add tables that are not in the T12 migration.** The Prisma schema is
  extended in those tickets, not amended retroactively. Do not pre-create the Phase 5
  tables in T12 — an unused table is a migration to carry forever.
- The email worker (T42) is a second process from the same image. Any new env var the
  worker needs is also needed by the API, because the API is what enqueues.
- T41 needs `@nestjs/schedule`. That is the only new runtime dependency Phase 5
  introduces; confirm its version against the NestJS 12 compatibility table before
  adding it.
- D10 and D11 are the two Phase 5 rules most likely to be got wrong under time pressure.
  Both have explicit tests in their tickets for that reason.
- **D11 was corrected after review.** It originally said "a second cancel 409s", which
  locked a guest out of their money whenever a Stripe refund failed transiently — the
  booking was already `CANCELLED` and there was no way to retry. The invariant is now
  **at most one `succeeded` refund**, with a `failed` refund retryable via a new row.
  See T38.
- **D14 and D15 pull in opposite directions and that is intentional.** D14 says extract
  early, D15 says do not fragment. The line is granularity: extract a *pattern* early,
  do not shatter a *function* into interface-sized pieces. When in doubt, prefer the
  simpler code and note the tension in this file.
- The performance budgets in `context/code-standards.md` are only meaningful once T32b
  has recorded real numbers. Before that they are targets, not measurements — do not
  claim a budget is met until it has been traced.
- **The contrast ratios in `ui-tokens.md` are hand-computed**, not machine-verified. They
  are close enough to be useful for design decisions, but the pairs sitting near the
  4.5:1 line — `warning` at ~4.5:1 and `accent-bright` at ~4.0:1 — have almost no margin.
  Verify both with a real contrast checker before relying on them, and if either fails,
  darken the token rather than relaxing the rule.
- **`design/` is 13 folders and only 10 are the chosen direction.** Two are discarded
  single-screen branches (`home_editorial_travel_guide`, `home_grand_tour_dispatch`) and
  one is an orphan (`editorial_hotel_guide_logo`) with no follow-on screens. The logo
  needs its own decision — it is the only artifact from a discarded branch. Do not treat
  any of it as spec; see the defect register in `context/design.md`.
- `home_grand_tour_dispatch` has a generation artifact worth remembering: a nav bar and a
  "Login / Sign up" link rendered **inside** the hero photograph. Text baked into an image
  asset. Review every image before use in T21 (Cloudinary).
