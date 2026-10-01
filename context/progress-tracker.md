# Progress Tracker

## Current Status

**Spec phase: COMPLETE.** All architecture decisions locked at intake. No open questions.

| Decision | Value | Locked |
|---|---|---|
| Scope | Fullstack | yes |
| Frontend | Nuxt 4.5.x (Vue 3, SSR), Tailwind CSS 4.3.x via `@tailwindcss/vite` | yes |
| Backend | NestJS 12.1.x | yes |
| Database | Neon Postgres via Prisma 7.10.x, pooled URL at runtime + direct URL for migrations | yes |
| ORM | Prisma 7.10.x, Neon adapter, `prisma-client` generator | yes |
| Repository | Two independent projects: `backend/` (NestJS 12) + `frontend/` (Nuxt 4), one repo (D36) | yes |
| Branching | One branch per ticket off `feature/full-build` (D51) | yes |
| Deploy | Two units, separate builds and lockfiles | yes |
| Deploy | Two units, separate builds and lockfiles | yes |
| Auth | Email/password (**Argon2id**) + Google OAuth + GitHub OAuth, JWT in httpOnly cookie | yes |
| Roles | `GUEST`, `HOST`, `ADMIN` — enforced by NestJS guards | yes |
| Images | Cloudinary, signed direct upload, folder scoped per host | yes |
| Payments | Stripe test mode, PaymentIntent + webhook confirmation | yes |
| Validation | Zod 4, backend-owned; frontend types generated from `openapi.json` (D38) | yes |
| Styling | Tailwind v4 + CSS custom properties in `@theme`, no hardcoded hex | yes |
| Monorepo | **None** — `backend/` and `frontend/` are independent projects, no workspace (D36) | yes |
| Shared package | **None.** API contract generated from `openapi.json` (D38) | yes |
| BE module system | ESM / `nodenext`, as scaffolded by `nest new` (D37) | yes |
| BE tests | **Vitest** 4.1.x, not Jest (D37) | yes |
| BE lint | **oxlint** `--type-aware` (D37) | yes |
| FE lint | **ESLint** via `@nuxt/eslint` (D37) | yes |
| TypeScript | 6.0.x, as scaffolded (D37) | yes |
| Verify command | `npm run verify` from the repo root | yes |
| Aesthetic | Editorial Travel Guide — paper/ink/terracotta, hairline rules, square corners, asymmetric grid | yes |
| Type | Fraunces (display) · Archivo (UI) · IBM Plex Mono (references) | yes |
| Dark mode | Not in the MVP (D22) | yes |
| Corner radius | 2px max everywhere; **no pills** (D23) | yes |
| Functional typeface | Archivo Narrow (tables, labels, UI); Archivo (prose) (D24) | yes |
| Table density | 64px rows, nowrap badges, fixed action columns (D27) | yes |
| Wordmark | "The Gazette · EST. 2024" — **provisional**, unratified (D26) | no |
| Maps | Placeholder only, no provider yet (D28) | no |
| Spec files | `context/*.md` (this directory) | yes |

## Ticket Checklist

### Phase 1 — Foundation
- [x] T1 Project scaffold and tooling
- [x] T2 Design system and app shell
- [x] T3 Mock data layer
- [x] T4 Home page
- [x] T5 Hotels list + filters
- [x] T6 Hotel detail
- [x] T7 Booking flow
- [x] T8 Bookings pages
- [x] T9 Auth pages
- [x] T10 Host dashboard
- [x] T11 Admin dashboard

### Phase 2 — Domain
- [x] T12 Database schema, migration, seed
- [x] T13 API foundation
- [x] T13a OpenAPI contract and frontend type generation
- [x] T14 Auth: email/password
- [x] T15 Auth: Google and GitHub OAuth
- [x] T16 Hotels read API
- [x] T17a API client and home page wiring
- [x] T17b Hotels list wiring
- [x] T17c Hotel detail wiring
- [x] T18 Availability and quote
- [x] T19 Favorites
- [x] T20 Bookings API
- [x] T21 Cloudinary upload
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
- **D26 — "The Gazette" is provisional, not decided.** The model invented the name and
  reused it in 6 of 10 generations. **Default adopted so the build is not blocked:** keep
  it, because all 10 design references say it and renaming is a single-token find-and-
  replace, not a redesign. It is not ratified. It is a print-parody name for a real
  product, which is fine for a design system and possibly wrong for a brand — that
  judgement belongs to the owner. **Trigger to revisit:** before any real user sees the
  app, and definitely before T34 (deploy). If it changes, it is one token, not a refactor.
- **D27 — Density is now rule-governed, not taste.** 64px table rows, `nowrap` on badges
  and actions, fixed-width action columns, one money format per context, aligned stat
   cards, rating bars normalised to visible min–max. These came from defects observed in
  the renders, and they are in `ui-tokens.md` so they apply to every table, not just the
  one that was wrong.
- **D28 — Maps: placeholder only, no provider chosen.** `/hotels/[id]` has a Location
  section; the design references use a map screenshot carrying third-party attribution,
  which is not shippable. **Default adopted:** a static styled placeholder with the
  address and a link out to directions, with the component seam kept so a provider can be
  dropped in. No provider is named until someone has an API key and a reason to want
  one. `T6` builds the placeholder; the seam is the deliverable, not the map.
- **D29 — Three research findings invalidated parts of the spec. Corrected before T1.**
  Parallel agents verified against installed packages rather than docs indexes, and in
  three cases the docs were stale or wrong. Recorded here because each is a hard error
  that would have surfaced as a confusing runtime failure:
  1. **Prisma 7 removed `datasource.url` and `directUrl`.** The upgrade guide calls it
     "deprecated"; 7.10.0 rejects it with `P1012`. URLs now live in `prisma.config.ts`
     (CLI, `DIRECT_URL`) and a `PrismaNeon` adapter (runtime, pooled `DATABASE_URL`).
  2. **`prisma-client-js` is deprecated and `output` is required.** A driver adapter is
     now mandatory for all databases. The Neon adapter takes a **config object**, not a
     `pg.Pool` — the widely-shown `new PrismaNeon(pool)` form is stale.
  3. **`@Body({ bodyParser: false })` is not a real API.** It is absent from every
     published `@nestjs/common` from 5.4.0 to 12.1.1. It is a hallucinated pattern copied
     across blog posts. The correct approach is `rawBody: true` at the app level.
- **D30 — Pin `prisma@7.10.0` exactly.** The npm `latest` dist-tag points at
  `8.0.0-rc`. An unpinned install pulls a prerelease of the ORM into a booking system.
- **D31 — Argon2id replaces bcrypt.** OWASP now scopes bcrypt to legacy systems. bcrypt
  is CPU-hard only and **silently truncates at 72 bytes**, so the 72-char cap is not
  even enforceable from the user's side. 19 MiB / t=2 / p=1.
- **D32 — Superseded by D37, kept because the underlying NestJS 12 facts still hold.**
  NestJS 12's core packages are ESM-only. There used to be a risk here: a CommonJS build
  would need `require(esm)`, which needs Node ≥20.19, and Jest on top of that needed
  Node ≥24.9 or it failed with `ERR_REQUIRE_ASYNC_MODULE` — an error pointing nowhere near
  its cause. `nest new` scaffolds ESM, so **the whole class of problem is gone**. Two
  NestJS 12 behaviours survive and are real: `@Optional()` is no longer inherited by
  subclasses (re-declare it), and lifecycle hook order now follows the component
  hierarchy, so do not assume an `onModuleInit` ordering.
- **D33 — `@nuxt/fonts` 0.14, and it is ZERO-CONFIG.** Confirmed by inspecting the
  installed package: it augments no `NuxtConfig` key at all, so the `fonts: { families:
  [...] }` block suggested by the docs index **does not exist** and fails typecheck.
  It reads the families declared in the CSS `@theme` block, downloads them at build
  time, self-hosts them, and applies automatic metric fallbacks. All four families
  (Fraunces, Archivo, Archivo Narrow, IBM Plex Mono) download and appear in the built
  CSS. `@nuxtjs/google-fonts` remains unmaintained and was not used. Note this makes
  the build **network-dependent** — it fetches from `fonts.gstatic.com` unless cached.
- **D34 — RESOLVED at T2, by measurement not by inference. `@theme` tokens work in this
  layout.** The build was run and the emitted CSS inspected. Two findings:
  1. **The `@source` directives in `main.css` are what make it work.** Tailwind v4
     auto-detects from the CWD, which in a nested project is ambiguous, so `main.css`
     declares `@source '../app'` and friends explicitly. Do not delete them as
     "redundant" — that is the whole reason the tokens compiled.
  2. **Tailwind v4 tree-shakes unused theme variables.** `--color-rule`,
     `--color-surface-alt`, and `--font-display` were absent from the first build
     because nothing referenced them yet. They appeared the moment a component used
     them. This is correct behaviour, not a broken config — but it means a token can
     look "missing" in the output when it is merely unused. **Never reference a
     `var(--color-*)` token in hand-written CSS unless a utility also uses it**, or the
     variable will not be emitted and the declaration silently falls back to nothing.
- **D35 — Dynamic class construction breaks Tailwind v4 detection.** `bg-${color}-600`
  is invisible to the scanner. Map props to complete static class names, or use
  `@source inline(...)` to safelist. This affects every `BaseButton` variant and is the
  most likely cause of a missing style that only shows up in production. **Applied at
  T2:** `BaseButton` and `BaseBadge` both hold a `Record<Variant, string>` of complete
  class strings rather than assembling them.
- **D36 — The repo is two independent projects, not a workspace.** `backend/` and
  `frontend/`, each with its own `package.json`, `node_modules`, and lockfile. No
  `packages/shared`, no workspace. The root `package.json` holds delegating scripts only.
  A frontend change cannot break the API build, and the two deploy independently.
- **D37 — Both projects are generated by their official CLIs and the generated toolchain
  is kept, not overridden.** `nest new` and `nuxi init` produce specific choices that
  differ from the earlier hand-written spec: **ESM** (`nodenext`), **Vitest** (not Jest),
  **oxlint** on the backend, **ESLint** via `@nuxt/eslint` on the frontend, and
  **TypeScript 6**. Overriding these buys tidiness at the cost of friction in every
  `nest generate` and every framework doc lookup. Two linters coexist on purpose.
- **D38 — There is no shared package, so the API contract is generated.** This was the
  genuine cost of D36 and it needed a real answer. `packages/shared` was the single source
  of truth for Zod schemas; removing it reopens the drift problem. The replacement is
  **contract-first**: the backend owns all schemas and DTOs, `@nestjs/swagger` emits
  `openapi.json`, and the frontend's types are *generated* from it (T13a). This is
  strictly better than the shared package it replaces — the spec is machine-checkable,
  the frontend cannot drift without a visible diff, and no import crosses the deploy
  boundary.
- **D39 — Two `rawBody`/`ValidationPipe`/CORS settings were applied at scaffold, not
  retrofitted.** `rawBody: true` in particular: forgetting it until T27 means a signature
  verification failure whose error message points nowhere near the cause. Cheap now,
  expensive later.
- **D40 — The frontend has no test runner, and that is recorded rather than papered over.**
  A `test` script that trivially passes would report green while testing nothing, which
  is worse than a missing script. Frontend testing arrives with the contract ticket
  (T13a) and T17d.
- **D41 — `@nestjs/mau` carries 5 transitive advisories and is not force-fixed.** All five
  trace to one dev-only dependency via `inquirer`→`external-editor`→`tmp` and `undici`.
  `npm audit fix --force` proposes `@nestjs/mau@0.0.6`, a **downgrade** from 0.2.6. Not
  applied. `mau` is only used by `nest deploy` and never ships. Revisit if it is ever
  used in CI.
- **D42 — Subagents work, but only after an opencode restart.** Three attempts failed with
  an opencode session-store insert error; a restart fixed it immediately. The FE/BE
  fan-out is therefore viable, and the ownership fence is what makes it safe: the FE
  agent owns `frontend/`, the BE agent owns `backend/`, and the orchestrator owns
  `context/`, root `package.json`, and all verification. **Neither agent runs the root
  build** — `npm run verify` builds both projects and the two agents would fight over
  the same caches. Verified in practice at T5/T6 + T12/T13/T13a/T16.
- **D43 — Ratings are stored and displayed on a 1–5 scale. Resolved after a real
  contradiction between the two agents.** `context/architecture.md` specifies
  `reviews.rating` as 1–5 and the backend followed it; the T3 frontend fixtures used
  1–10 (9.4, 1,284 reviews). Only one is right. **Decision: 1–5 everywhere, no
  transform layer.** Displaying "9.4" when the review input range is 1–5 misstates the
  scale, and a hidden ×2 in a display helper is exactly the kind of thing that drifts.
  Fixtures rescaled; review counts were NOT rescaled (a first attempt halved them too and
  was reverted — counts are a different quantity entirely). If a 1–10 display is ever
  wanted, it is a deliberate, documented product decision, not a formatting preference.
- **D44 — `minPrice` and `maxPrice` are MAJOR units (150 = $150), the one place in the
  API where money is not integer cents.** Everything else money-shaped is integer cents.
  Kept because a user typing a price filter means dollars, and converting their input is
  more surprising than the internal inconsistency. Documented in the OpenAPI description
  for both params. **This is a known sharp edge** — if it ever causes confusion, convert
  at the edge rather than making it a second convention.
- **D45 — `null` is never `0` in API money and rating fields.** `priceFrom`,
  `rooms[].price`, and `rating.average` are all nullable: a hotel with no price row in
  the requested currency returns `null`, and a hotel with no visible reviews returns
  `rating: { average: null, totalReviews: 0 }`. A missing price must render as "—", not
  "$0", because free is a real state and null is a real state and they are not the same.
- **D46 — Hotels search sorts and paginates in memory.** "Cheapest room that fits N
  guests" and "average rating" are derived values, not columns, so the filter reads all
  matching rows and cuts the page in the service. Correct and narrow for MVP, but it
  will not scale. The seam is marked in the code. Needs a SQL view or a denormalised
  column before the result set outgrows memory — not before.
- **D47 — Seeded users have `password_hash = null`.** Argon2id is T14's dependency and
  no credential hash was committed. Seeded accounts cannot log in until T14 exists; that
  is intentional, not an oversight.
- **D48 — The "never centre" rule is scoped to editorial contexts, not forms.** A T7–T11
  agent centred the auth column per Stitch Screen 6 and flagged it against `design.md`'s
  global rule. Kept the centred auth and **amended the spec instead of the code**. The
  rule was written for prose and display; a 420px single-purpose form centred is the
  established convention, and left-aligning it looks broken. When a global rule meets a
  legitimate exception, scope the rule — do not pretend the exception is not there.
- **D49 — `format:check` is red on ~50 frontend files and will stay red until the
  linter/formatter ownership is settled.** This is NOT Prettier version drift (3.9.9
  everywhere). The FE agent ran `eslint --fix`, which reformatted to ESLint `stylistic`
  taste, and Prettier now disagrees on those same files. Blind `prettier --write` would
  flip them back and re-break ESLint on the next `--fix` — churning 50 files to no
  lasting effect. **Rule: Prettier owns formatting, ESLint owns linting.** Resolving it
  means turning off the conflicting `stylistic` rules, which is its own ticket, not a
  side effect of a feature commit. `format:check` is deliberately NOT in the `npm run
  verify` gate, so this does not block the build.
- **D50 — Rating display bands assumed a 10-scale on 1–5 data.** `HotelBookingPanel`
  mapped `>= 9` to "Excellent", so every real hotel (max 5.0) fell through to "Mixed".
  Fixed to 4.5 / 4.0 / 3.5 / 3.0 thresholds. A display bug that no typecheck, build, or
  lint can see — only reading the rendered values catches it.
- **D51 — One branch per ticket, not one branch for the build.** `feature/full-build` is
  the **integration branch**: it is always green and never carries feature work that has
  not been verified on its own branch. Every ticket gets `feat/T<n>-<slug>` cut from
  `feature/full-build`, is built, tested and committed there, is pushed as its own branch,
  and is then fast-forward merged back. The history of T1–T17 is batched onto
  `feature/full-build` and is **not** rewritten — that branch has been pushed and rebased
  against remote work already, and force-pushing a shared branch to retroactively split
  past commits risks losing someone else's work for no gain. The rule applies from T18
  forward. **Consequence: a worktree can only be on one branch, so the FE and BE agents
  no longer run in parallel on separate branches** — the pair becomes sequential, one
  ticket branch at a time. If parallel agents become valuable again, the answer is a
  second `git worktree` per agent, not a shared branch.
- **D52 — The availability rule in `architecture.md` was off by one and has been
  corrected in the spec, not worked around in code.** It read
  `confirmed bookings + blackouts <= total_inventory`, which makes a room with
  `total_inventory: 2` and two overlapping bookings **bookable**. T18's own text
  contradicts this twice — "the total is below `total_inventory`" and "every night has
  inventory above zero" — and the ticket's two conditions agree with each other, so the
  spec sentence was the outlier. The rule is now per night: a room is bookable only when
  every night in `[checkIn, checkOut)` has `total_inventory - overlappingBookings >= 1`
  and no blackout covers it. `PENDING` bookings count as overlaps, not just `CONFIRMED`:
  T20 creates a booking `PENDING` before Stripe confirms payment, so a `CONFIRMED`-only
  rule would oversell the first pending hold. The "exact-fit" case in T18's verify list
  is therefore **not bookable** — that test is the one that pins this decision.
- **D53 — `feature/full-build` is frozen. New work goes on a new branch, and a feature is
  built by a pair of agents, not by one.** D51 above made `feature/full-build` the
  integration branch that feature branches merge back into; that part is **superseded** —
  the branch is not a merge target and takes no further commits. It is left at `b6287d0`
  (`be45aec` plus the two process and spec commits D51 and D52 landed on it in error) and
  is read-only from here. The rule:
  - Each ticket gets `feat/T<n>-<slug>`, cut from the previous ticket's branch, so the
    branches stack in build order and no single branch accumulates the whole product.
  - A ticket that spans both projects is built by a **pair**: one backend agent fenced to
    `backend/`, one frontend agent fenced to `frontend/`, both on that ticket's branch. The
    fence in `working-notes.md` is what makes them safe to run at once — they share no
    file, not because they share a branch.
  - **One commit per ticket, made by the orchestrator**, after both halves are reviewed and
    `npm run verify` is green. Agents never commit, push, or switch branches.
  - Each feature branch is pushed as its own ref. Nothing is force-pushed, and the T1–T17
    batched history is never rewritten.
  - `context/` is orchestrator-owned, so the ticket commit carries its own checkbox.
- **D54 — "The toggle is idempotent" and "409 on a duplicate insert" are different
  claims, so the endpoints are split rather than the ticket being satisfied halfway.**
  The *toggle* a guest performs is idempotent; the *endpoints* are not, and the composite
  primary key on `favorites` is the only thing that makes that true. The sequence a client
  toggle is written against, pinned by a test: **POST → 201, POST → 409, DELETE → 204,
  DELETE → 204, POST → 201**. `DELETE` returns 204 even when the row was never there,
  because un-favouriting something you never favourited is something a toggle does on
  purpose, and a 404 there would raise an error for a state the guest caused. Three
  consequences worth keeping:
  - A duplicate insert needs its **own** error code, `FAVORITE_EXISTS`, not the generic
    `CONFLICT` that `translatePrismaError` gives every `P2002`. Without it the frontend
    cannot tell "already saved, keep the heart filled" from a real failure, and a double
    tap looks broken. The P2002 is read in the repository and mapped to `null`; the service
    raises the 409.
  - **There is no Zod union of error codes.** `errorBodySchema.code` is `z.string()`, so
    `ApiErrorEnvelope.code` is a plain `string` in the generated frontend types and the
    frontend branches on an untyped literal. Switching it to `z.enum(ERROR_CODES)` is a
    type change for every endpoint's consumer and is deliberately deferred to its own
    ticket rather than smuggled into a feature commit.
  - `POST /favorites` checks **bare** hotel existence, so a draft hotel's id is favouritable
    and answers 201. Accepted rather than fixed: no guest can *discover* a draft's uuid,
    because both public hotel reads 404 anything not `PUBLISHED`, so the only caller who
    could is the host who already owns it. Favouriting your own draft is harmless.
- **The `favourite` heart is un-hydrated by design.** T19 ships writes only, so there is no
  read to ask "is this heart filled?", and the frontend keeps the state in memory and
  renders un-pressed on every load. It is deliberately **not** persisted to
  `localStorage`: a stored `pressed: true` outlives the reload and tells a guest their
  shortlist has a hotel in it when the row may never have been written. The list endpoint
  is the later ticket that fixes this, and hydration belongs there. Until then a heart can
  read empty when it is filled — visible, logged, and the cheapest honest option.
- **D55 — The T20 `Booking` read DTO embeds a `hotel` display snapshot and `room.name`**,
  so T8's detail page renders the property with no second fetch (the ticket's "property
  snapshot"). Money is a server-computed snapshot in the booking's own currency;
  `totalCents` is always `subtotalCents + feesCents`; `nights` is `checkOut - checkIn`
  (half-open, reused from T18). Consequences:
  - The create body accepts `guestName`/`guestEmail`/`guestPhone`, **Zod-validates them,
    and does not persist them** — the `bookings` table has no such columns and T12's
    migration cannot be re-run without a database. T26/T27 (payments) is what books them a
    home.
  - `GET /bookings/:id` is 404 `BOOKING_NOT_FOUND` when the row is absent and 403
    `NOT_BOOKING_OWNER` when it exists but belongs to a different guest.
  - **Cancel is guarded to `status === 'CONFIRMED'` only** (the ticket's words). Any other
    status is 409 `INVALID_CANCEL_STATE`. A refund is out of scope (T38); T20 only flips
    the status. The tension is logged in `bookings.service.ts`: a fresh PENDING booking
    cannot be cancelled until T26 confirms it.
  - `reference` = a 2-letter prefix constant (`GB`, matching the schema's `GB-4821`
    example) + 4 zero-padded digits, regenerated up to 3 times on a `P2002` collision, then
    a 500 `INTERNAL_ERROR`. A 409 would mislead — the room *is* available; the server just
    could not mint a reference.
  - The write sits in a `Serializable` `prisma.$transaction`; T18's exported pure
    predicates re-run the availability check *inside* the transaction on the tx client, and
    the whole transaction retries on `isRetryableWriteConflict` (`P2034`/`40001`/`40P01`),
    up to 3 attempts, terminal state 409 `ROOM_UNAVAILABLE`. The oversell proof is the unit
    test "sells the last unit to exactly one of two interleaved creates", not the e2e.
- **D56 — T20's frontend wires T8 only; the create flow is deliberately deferred.** The
  two trip pages read `GET /bookings` and `GET /bookings/:id` and cancel through
  `POST /bookings/:id/cancel`. The booking *create* button on T7 stays the local mock in
  T20 — creating a real booking means the payment tickets (T26-T28) that take the hold and
  charge the card, so wiring a bare create now would be a half feature. Fallback rules: a
  401 (sign-in is T23, so anonymous is the everyday case) or a transport failure degrades to
  the fixture store; a 404/403 on the detail is an *answer*, not "nothing" — it renders the
  not-found state, and no fixture is papered over it. The cancel button shows for
  `CONFIRMED` only, matching the API guard, in the live world and the fixture world alike.
- **D57 — The OpenAPI generator clobbered sibling components' schemas; T20's `Booking`
  shipped with a wrong generated type, and the defect is in `document.ts`, not the ticket.**
  Each named schema is converted by its *own* `z.toJSONSchema(..., { reused: 'ref' })`
  call, and Zod names the anonymous sub-schemas it hoists **per call** (`__schema0`,
  `__schema1`, ...). Those per-call names were all hoisted into one shared
  `components.schemas` map, so a `__schema0` that is a string in one call was silently
  replaced by a `__schema0` that is an integer in the next. `Booking.hotel.coverImage`
  (a `string | null`) therefore generated as `number | null` on the frontend, which the T20
  agent had to cast around. Fixed by namespacing each component's anonymous defs as
  `${Name}~__schemaN` (registered CamelCase names stay global, since they are identical
  across calls) and rewriting the refs through the same rename. This is a T13a-era latent
  bug that T20 — the first schema with a nested nullable string — finally poked. The fix
  is in `backend/src/openapi/document.ts`, regenerated `backend/openapi.json`, and a re-run
  of `gen:api`; the T13a drift-guard test still passes because it compares the in-memory
  document against the *regenerated* file, so both move together.
- **D58 — Cloudinary is optional infrastructure, like OAuth (T15).** `CLOUDINARY_CLOUD_NAME`,
  `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` are optional with placeholder defaults;
  the app builds and tests pass without creds. No SDK is used: `sign` is pure HMAC-SHA1,
  and the single server-side call (`destroy`) is a `fetch` behind a `CLOUDINARY` token faked
  in tests. Placeholder defaults: `cloudName='booking-upload-placeholder'`,
  `apiKey='00000000000000000000000'`, `apiSecret='cloudinary-upload-placeholder-secret'`,
  `uploadPath='booking/hotels/'`. A real deployment overrides them.
- **D58b — The upload folder is host-scoped: `booking/hotels/{hostId}/` (the ticket's
  "folder scoped per host" + "folder prefix matches the requesting host"). Architecture.md's
  `{hotelId}` is corrected to `{hostId}`; the prefix check is a plain string `startsWith`
  and does not query the DB.
- **D59 — `attach` does not check hotel ownership; that is T22's responsibility.** T21
  validates only the `publicId` folder prefix (a DB-free string check). A host can attach an
  image to any `hotelId` if the `publicId` prefix matches their own folder — T22's host-ownership
  query-filter rule is what closes this. If T22 lands without that check, a host could attach
  images to another host's hotel.

## Notes

- **Unfixed, and it will bite on a real database: `id`/`slug` lookups cast a string to
  uuid.** `prisma-hotels.repository.ts` resolves a hotel with
  `where: { OR: [{ id: hotelIdOrSlug }, { slug: hotelIdOrSlug }] }`, and T18's
  `findHotelRooms` copies the shape. Postgres will cast the `id` comparison to uuid and
  raise `invalid input syntax for type uuid` the moment the value is a real slug, which is
  what the frontend links to (`/hotels/{slug}`). No unit test catches it because the
  repository is mocked. Fix by branching on the shape of the input (uuid → `findUnique`,
  otherwise `findFirst` on `slug`) rather than OR-ing both. Left alone here because it is
  T16 code, not T18's diff, but it must land before anything is run against Neon.
- `POST /api/bookings/quote` checks the room and its availability but never checks that the
  room's hotel is `PUBLISHED`, so a host can price a stay in their own draft listing. Not
  reachable by a guest (room uuids are not guessable and the detail read 404s a draft), and
  the availability read does 404. Worth closing when T20 creates the booking that actually
  needs a published hotel.
- Running two `npm run verify` processes at once makes two backend test files fail with
  collection errors. It is the `.output`/`dist` fight `working-notes.md` warns the agents
   about, and the orchestrator walked straight into it. One verify at a time.
- **Two T20 follow-ups, deliberately not folded into T20.** (1) `Booking.room.name` is in
  the contract but T8's detail has no room line — cheap to add later, so it was left
  surgical. (2) After cancelling on the detail page, a client-side-cached `/bookings`
  index still shows the pre-cancel status until reload (the same "stale data across
  navigations" class as the hotels pages); in fallback mode a detail cancel does not
  propagate to the index either. Neither blocks T20; note them if the trips pages start to
  feel stale.
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
