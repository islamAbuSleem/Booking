# Code Standards

## Language & types
- TypeScript `strict: true` in both apps. No `any`. Use `unknown` and narrow.
- No non-null assertions (`!`) outside of tests. Prefer `??` defaults and guards.
- Named exports. No default exports, except in files that must interop with a
  framework entry point (`nuxt.config.ts`, `main.ts`).
- Zod schemas in `packages/shared` are the single source of truth for input types.
  API DTOs are `z.infer<typeof Schema>`; do not hand-write a parallel interface.
- Money is always integer cents in a `number`, formatted only at the edges.
- Dates crossing the API boundary are ISO 8601 strings; convert to `Date` at the call
  site. Hotel stay dates are date-only (`YYYY-MM-DD`).

## NestJS API
- One module per domain in `src/modules/`. Each has `controller.ts`, `service.ts`,
  `dto/`, and `*.spec.ts`.
- Controllers are thin: parse and delegate. Business logic lives in the service.
- Services are the only place that touches `PrismaService`.
- **Every** thrown error is an `HttpException` with a status code. Never leak a raw
  Prisma error, a stack trace, or an internal message to the client.
- Prisma errors are translated at the boundary: `P2002` → 409, `P2025` → 404,
  `P2003` → 400.
- Guards enforce authorization; `@Public()` from `common/decorators` opts a route out.
  A route with no decorator defaults to authenticated.
- No business queries in controllers or in the client.
- `class-validator`/`class-transformer` validation via a global `ValidationPipe` with
  `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`.

### Error contract
Every response from the API uses one envelope:

```ts
{ success: true, data: T }
{ success: false, error: { code: string, message: string, details?: unknown } }
```

`error.code` is a stable machine-readable string (`HOTEL_NOT_FOUND`,
`ROOM_UNAVAILABLE`, `PAYMENT_FAILED`). Clients branch on `code`, never on `message`.

### Logging
- `Logger` from `@nestjs/common`, never `console.log`.
- Log with a `[module]` prefix: `this.logger.log('[bookings] created', reference)`.
- Never log passwords, tokens, JWTs, Stripe secrets, or full card data.

## Nuxt web
- Path alias `~/` → `app/`, `@/` → project root (configured in `nuxt.config.ts`).
- Follow `context/ui-rules.md` for components, data fetching, and a11y.
- No `any` in `<script setup>`. Type `useFetch` results from the shared schemas.
- Environment variables: `NUXT_PUBLIC_*` for client-visible, plain `NUXT_*` for
  server-only. Read via `useRuntimeConfig()`.

## Validation & errors (FE)
- Wrap every API call site so the envelope is unwrapped once, in
  `app/utils/api.ts`. No component should read `.error` off a raw `$fetch` result.
- Show API error messages to the user; log the `code` for support triage.

## Git
- **One branch per feature, one ticket per branch.** A branch maps to a single ticket in
  `context/build-plan.md` or one coherent group from the same phase. Never mix unrelated
  tickets on one branch.
- Branch naming: `feat/<ticket>-<slug>`, `fix/<ticket>-<slug>`, `chore/<ticket>-<slug>`
  — e.g. `feat/T12-prisma-schema`. The ticket number keeps branches traceable to the plan.
- Branch from an up-to-date `main`. Rebase on `main` before requesting review, never
  merge `main` into a long-lived feature branch.
- Never commit directly to `main`. Never force-push. Never rewrite published history.
- Conventional-ish commit subjects: `feat:`, `fix:`, `chore:`, `refactor:`, `test:`.
  The subject says what changed; the body says why when it is not obvious.
- One logical change per commit. A commit that touches the API, the schema, and the
  formatter is three commits.
- Update `context/progress-tracker.md` in the same commit that completes a ticket, and
  `context/ui-registry.md` in the commit that adds a component.

---

# Additional rules (from intake)

## Testing
- Jest for the API. One `*.spec.ts` per service, colocated.
- Cover, at minimum: availability math (overlap, inventory, blackout), the pricing
  breakdown, role guards, and the Stripe webhook signature check.
- Pure functions get the most thorough unit tests. Controllers get route-level tests
  only when a branch is security-relevant.
- `npm run test` must pass with no skipped suites.

## Lint & format
- ESLint flat config in both apps, extending `eslint:recommended` +
  `typescript-eslint` strict presets. Prettier for formatting.
- `npm run lint` and `npm run format:check` run in CI and before any commit.
- `@typescript-eslint/no-floating-promises` and `no-misused-promises` are errors — an
  unhandled promise in a route handler is a real bug.

## SEO
- SSR meta on all public pages via `useSeoMeta`. Unique title and description per page.
- Open Graph and Twitter card tags on hotel detail pages.
- `@nuxtjs/sitemap` generating `/`, `/hotels`, and every `PUBLISHED` hotel detail URL.
- Canonical URLs set on all indexable pages. `robots.txt` disallows `/dashboard`,
  `/login`, `/register`.
- Clean, stable slug URLs. Never index filter permutations — canonicalize back to
  `/hotels` with the filters in the query string.

## i18n
- `@nuxtjs/i18n`, `en` only in MVP, but all user-facing strings go through `$t()`.
- No string concatenation for sentences — use interpolation with placeholders.
- Dates, numbers, and currency formatted through `Intl`, not hand-rolled strings.

## Accessibility
- WCAG 2.1 AA as the bar for every page.
- Axe in CI against the built pages; zero violations in serious/critical.
- Full keyboard operability: no keyboard traps outside modals, logical tab order.
- Color is never the only signal for state — pair with text or an icon.

## Rate limiting
- `@nestjs/throttler`. Limits: auth endpoints 5 req / 15 min / IP; booking and payment
  mutation endpoints 20 req / min / user; public reads 120 req / min / IP.
- A 429 returns the standard envelope with `code: "RATE_LIMITED"` and a `Retry-After`
  header.

---

# Engineering rules (added after intake)

These are obligations, not suggestions. Each one has a check that can fail a review or a
build. Where a rule is a judgement call, the test for whether it was followed is given.

## One component per file
- One component per file, always. Two components in one file is a split, not a style
  choice.
- A file exports exactly one component, plus its props interface and any types that
  belong to it.
- A component that needs a sub-piece gets a **child component file**, not a second
  component in the same file.
- **Extract at two components, not three.** When the same markup or logic appears in two
  places, extract it immediately. Waiting for a third occurrence is the usual reason
  refactoring gets skipped and the duplication compounds.
- Register every component in `context/ui-registry.md` when it is created.
- **Check:** `rg "^\s*const\s+\w+\s*=\s*defineComponent" ` in `apps/web/app` returns one
  hit per file. Or a component file containing two `defineComponent`/`export default`.

## No props drilling
A prop passed through a component that does not itself use it is drilling. The component
in the middle is coupled to data it has no opinion about, and every level of the tree
changes when the leaf's needs change.

Resolution order — use the first one that fits:

1. **Slot.** The parent owns the data, the child owns the layout. This is the default
   answer and it is almost always right. Scoped slots when the child needs to shape the
   content.
2. **Provide / inject** with a typed injection key. For a genuine cross-cutting
   dependency — theme, current user, form context — that many unrelated subtrees need.
   Never for a value only one subtree uses.
3. **Composable** (`useX()`). When several unrelated components need the same derived
   state. Share it with `createSharedComposable` or a Pinia store.
4. **Store or route state.** For state that genuinely outlives a single component.

Rules:
- No prop chain longer than **two** levels of pass-through.
- A component must not accept a prop it does not read, even to forward it.
- No prop named `...rest` or `options` used to forward a bag of undeclared values down.
- Injection keys live in one file and are typed. A bare string key is not allowed.
- **Check:** for each prop, does this component read it? If not, it is drilling — replace
  it with a slot, inject, or move the state up.

## Reuse over duplication
- The third occurrence of a pattern is a defect. The second is a warning.
- When extracting, ask whether the duplicates are *conceptually* the same thing, not
  merely textually similar. Two price formatters that happen to look alike but model
  different concepts should stay separate. Wrong extraction is more expensive than
  duplication.
- Where shared code goes:
  - Pure domain logic, Zod schemas, shared types → `packages/shared`. No framework
    imports, no `process.env`, no server SDKs.
  - Vue-specific reusable logic → `apps/web/app/composables/`, auto-imported.
  - API logic shared by two or more modules → `apps/api/src/common/`. Not by creating a
    cross-module import.
- A module may import from `common/` and from other modules. A module may **not** be
  imported sideways by a sibling module's internals — go through the owning module's
  public surface or lift the code to `common/`.
- **Check:** `rg` for a snippet that already exists before writing it. Duplicated logic
  is found by search, not by review.

## SOLID
Applied at module and service boundaries. Not applied inside a single function — one
clear function beats five interface-sized pieces.

- **S — Single responsibility.** A service changes for one reason. `BookingsService`
  creates, quotes, and reads bookings; it does not also send email or compute analytics.
  If a class has a comment header listing three unrelated verbs, it is two classes.
- **O — Open/closed.** Adding a behaviour adds a module; it does not add an `if` to an
  existing one. A second payment provider is a new implementation behind the same
  interface, not a branch inside `PaymentsService`.
- **L — Liskov.** A subtype must honour the contract. A `Refundable` that silently
  returns nothing for a partial amount is a violation, and a caller depending on the
  interface will break.
- **I — Interface segregation.** Depend on the narrowest interface that works. A service
  that only reads should not receive write capability just because it shares a
  dependency with another service.
- **D — Dependency inversion.** Domain logic depends on an interface or DI token, not on
  `PrismaService` or the Stripe SDK directly. The infrastructure wires them. This is what
  makes availability and pricing logic unit-testable without a database.
- **Check:** a pure domain function must be callable with no Nest container, no Prisma,
  and no network. If it is not, dependency inversion is missing and the tests will be
  slow and flaky.

## Performance
Performance is a requirement, not a later optimisation pass. Budgets:

- **Page weight** — under 200KB gzipped of JS for any public page. Hotel lists and detail
  pages must not ship a component library wholesale.
- **LCP under 2.5s** at the 75th percentile on a throttled mobile connection. The hero
  image on a hotel detail page is `priority`; everything below the fold is lazy.
- **CLS under 0.1** — every image and embed declares its dimensions. No content injected
  above existing content.
- **INP under 200ms** — no long task over 50ms. Break up large list renders.
- **Images** — served through Cloudinary with an explicit width and format. No raw
  originals in a `<img>`. Always set `width` and `height`.
- **Data** — select only the columns a response needs, paginate every list, and never
  request the full entity graph to render a card. `GET /api/hotels` must not return
  reviews, images at full size, or room inventory.
- **Waterfalls** — independent requests run concurrently. Two sequential `await`s that
  do not depend on each other are a bug.
- **Client bundles** — no server-only code reachable from a component. Cloudinary,
  Stripe secret, and Prisma stay in the API.
- **Lists** — anything over ~50 items is paginated or virtualized, not rendered at once.
- **Reactivity** — no expensive computation in a template. Use `computed`, and only for
  values that genuinely need to be derived.
- **Check:** run a performance trace on `/`, `/hotels`, and `/hotels/[id]` in T32 and
  record the numbers in `context/progress-tracker.md`. A regression against the recorded
  baseline fails the ticket.

## User experience
- Every async surface has three states handled: loading, empty, and error. An empty state
  offers the next action — never a bare "No results".
- A failure never discards user input. A submit that errors keeps the form filled.
- Destructive and irreversible actions confirm first, and the confirmation names the
  thing being destroyed ("Cancel booking HB-4821?").
- Optimistic updates for cheap, reversible toggles — favouriting. Roll back visibly on
  failure. Never optimistic for payments or anything with a side effect the user cannot
  undo.
- Loading buttons show progress and are disabled while in flight. No double submit.
- Filters and pagination survive a back navigation.
- No layout shift on load. No content jumping when a skeleton resolves.
- `prefers-reduced-motion` is respected. No animation on a payment or confirmation path.
- Feedback is immediate. Optimistic like, instant validation, visible pending state.
- Keyboard and screen-reader users get the same affordances — see the accessibility
  rules.
- **Check:** walk the flow once per phase with the keyboard only. Anything unreachable is
  a bug.

## Best practice
- **Security.** Validate every input at the boundary with a shared Zod schema. Never
  interpolate user input into a query — Prisma parameterizes, raw SQL does not. Never log
  a token, password, or card number. Ownership is a query filter, never a client-supplied
  id. Authorization is enforced server-side on every route; frontend middleware is UX.
- **Consistency.** State changes that span tables run in a transaction. A state change
  and its side effect (an email enqueue, a refund row) are in the *same* transaction or
  neither happens.
- **Idempotency.** Payment, refund, and webhook handlers are idempotent, because the
  provider will retry. A repeated call must not double-write.
- **Errors.** Every thrown error is an `HttpException` with a status. Internal errors are
  logged with context and returned as a generic message. The client gets a stable `code`
  to branch on, never a stack trace.
- **Observability.** `Logger` with a `[module]` prefix, a request id threaded through the
  log lines for one request, and no silent `catch {}`. An empty catch block is a defect.
- **Configuration.** All env access through a validated config module. A missing required
  var fails at boot, not at the first request that needs it.
- **Git.** Branch per feature, one branch per ticket or coherent group. Never on `main`.
  Never force-push.
