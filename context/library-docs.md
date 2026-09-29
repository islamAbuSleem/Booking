# Library & Platform Docs

## Neon Postgres + Prisma

### Connection
Neon is a Postgres host, not an ORM. Prisma is the client. **Prisma 7 changed all of
this — the patterns below are 7.10-specific and do not apply to Prisma 5/6.**

- Runtime: the **pooled** connection string (`-pooler` host). Neon scales by pooling; a
  long-lived direct connection exhausts the plan.
- Migrations and the Prisma CLI: the **direct** (non-pooled) URL.
- Two URLs, same Neon project:
  ```
  DATABASE_URL="postgresql://...-pooler..../db?sslmode=require&connect_timeout=10"
  DIRECT_URL="postgresql://..../db?sslmode=require"
  ```
- **Use `connect_timeout`, not `pool_timeout`.** The latter is a `pg` connection option
  and the Neon adapter does not understand it.

### Prisma 7 breaking changes that bite

Four of these are hard errors, verified against the 7.10.0 binary:

| Old (Prisma 5/6) | Prisma 7 | Severity |
|---|---|---|
| `datasource.db.url = env(...)` | **Removed.** `prisma generate` fails with `P1012` | hard error |
| `datasource.db.directUrl` | **Removed.** Only `provider` is accepted | hard error |
| `generator.provider = "prisma-client-js"` | Deprecated. `prisma-client` is the default and `output` is **required** | breaking |
| No driver adapter | **Required** for all databases in v7 | breaking |
| `migrate dev` auto-ran `generate` + seed | **No longer does.** Add `prisma generate` to the build script explicitly | silent |
| `new PrismaNeon(pool)` | `new PrismaNeon(configObject)` — takes a `PoolConfig`, **not** a `pg.Pool` | breaking |

Also: **the `prisma` npm `latest` dist-tag points at `8.0.0-rc`.** Pin `7.10.0`
explicitly in `package.json` or a fresh install pulls a prerelease.

### Prisma schema setup
`nest new` scaffolds the API as **ESM** (`"type": "module"`, `module: nodenext`), so the
Prisma generator's ESM defaults are correct here. Do **not** force CJS.

```prisma
// backend/prisma/schema.prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}
```

**The CJS trap, for reference only.** If the API were CommonJS, the generator would
infer ESM anyway and emit `import.meta.url` plus `./enums.ts` imports. That **compiles
clean** — generated files carry `// @ts-nocheck`, hiding the type error — and then dies
at runtime with `ReferenceError: exports is not defined in ES module scope`. Forcing
`moduleFormat = "cjs"` alone still fails with `Cannot find module './internal/class.ts'`;
you would need both `moduleFormat = "cjs"` and `importFileExtension = "js"`. This project
avoids the whole trap by being ESM.

Because the API is `nodenext` ESM, **relative imports need explicit `.js` extensions** —
including Prisma's generated client:

```ts
import { PrismaClient } from '../generated/prisma/client.js'
```

### CLI config
URLs no longer live in the schema. The CLI reads `prisma.config.ts` at the backend
package root:

```ts
// backend/prisma.config.ts
import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  datasource: { url: env('DIRECT_URL') },
})
```

### Client instantiation — a driver adapter is required
```ts
import { PrismaClient } from './generated/prisma/client.js'
import { PrismaNeon } from '@prisma/adapter-neon'

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })
```

Import from the **generated path**, never `@prisma/client`. Do not pass a Prisma
Postgres / Accelerate URL here — it expects a direct or pooler Postgres string.

### Singleton client (NestJS)
One `PrismaService` for the whole app, extending `PrismaClient` and implementing
`OnModuleInit` / `OnModuleDestroy`. Prisma opens a connection pool; instantiating per
request leaks connections.

```ts
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name)

  constructor(config: ConfigService) {
    // `super()` must be the first statement, so the adapter is built inline.
    super({ adapter: new PrismaNeon({ connectionString: config.getOrThrow('DATABASE_URL') }) })
  }

  async onModuleInit(): Promise<void> {
    await this.$connect()
    this.logger.log('[prisma] connected')
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect()
  }
}
```

### Conventions
- `createMany` for seeds and bulk inserts — bypasses per-row hooks, far faster.
- Transactions for anything that must not interleave.
- `select` only the columns a response needs. Never `include` a whole relation tree on
  a list endpoint.
- Always bound parameters via Prisma — never build SQL strings from user input.
- `Decimal` for anything needing exact arithmetic beyond cents. Integers for money.

### Error codes and the serializable retry
`P2002` unique, `P2003` FK, `P2025` not found, `P2034` write conflict — **unchanged in
Prisma 7**. Import `PrismaClientKnownRequestError` and the `Prisma` namespace from the
**generated client**, not `@prisma/client`.

**Do not rely on `P2034` alone for the availability transaction.** The current Prisma
docs recommend matching the Postgres `sqlState` on `error.cause`, and their own two
examples disagree about which signal is canonical — `P2034` is not guaranteed to fire
for every `40001`. Match both:

```ts
const source = error instanceof Error && error.cause ? error.cause : error
const sqlState = typeof source === 'object' && source && 'sqlState' in source ? source.sqlState : null
if (sqlState !== '40001' && sqlState !== '40P01' && !isP2034(error)) throw error
// else retry, bounded
```

`40001` is serialization failure, `40P01` is deadlock. Both are retryable. This is the
exact code path T20's "two concurrent requests for the last room" test exercises — it
is the one place a wrong retry condition silently allows an oversell.

## API contract — no shared package

There is **no `packages/shared`**. `backend/` and `frontend/` are separate projects with
their own `package.json` and `node_modules`; they never import each other's source. A
hand-maintained shared package was considered and rejected: it is a third thing to
version, it silently couples two independently-deployable units, and it drifts from the
DTOs it claims to describe.

Instead, **contract-first**. The backend is the single source of truth for the API shape:

1. `backend` owns every Zod schema and DTO.
2. `@nestjs/swagger` emits an OpenAPI document at `/api/docs-json`.
3. That document is committed as `openapi.json` and the frontend's types are **generated**
   from it (`openapi-typescript`, or hand-typed wrappers over the generated file).
4. Regenerating types is a script, not a hand edit. A contract change that is not
   regenerated fails review.

This is strictly better than a shared package: the spec is machine-checkable, the
frontend cannot drift from the backend without a visible diff, and there is no import
across the deploy boundary.

### Where validation lives
- **Boundary validation is the backend's job.** The global `ValidationPipe` plus a Zod
  pipe reject bad input before it reaches a service.
- The frontend validates for **UX only** — instant feedback, no round trip. Its rules may
  be looser than the backend's, never stricter, or users hit errors the form said were
  impossible.
- Never trust a client-sent total, count, or status. Recompute server-side.

### Zod 4 notes
Zod is at 4.x. Date validation moved to the top level:
- `z.iso.date()` for `YYYY-MM-DD` (stay dates — matches the Postgres `DATE` columns)
- `z.iso.datetime()` for full timestamps
- `z.email()` replaced `z.string().email()`
- The Zod 3 forms `z.string().date()` and `z.string().email()` are **gone**.

Query params arrive as strings, so use `z.coerce`:
```ts
export const hotelSearchQuery = z.object({
  city: z.string().trim().min(1).max(120).optional(),
  checkIn: z.iso.date().optional(),
  checkOut: z.iso.date().optional(),
  guests: z.coerce.number().int().min(1).max(20).default(2),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
}).refine((q) => !q.checkIn || !q.checkOut || q.checkOut > q.checkIn, {
  message: 'checkOut must be after checkIn',
  path: ['checkOut'],
})

export type HotelSearchQuery = z.infer<typeof hotelSearchQuery>
```

The controller parses with this schema and receives a typed object — it never inspects
raw query params.

## Server vs client
- **Server (API):** Prisma client, Stripe secret key, JWT signing, OAuth client secret,
  Cloudinary API secret, `DIRECT_URL`.
- **Browser:** Stripe publishable key, Cloudinary signed upload params, `NUXT_PUBLIC_*`.
- Never import server code into `frontend/`. A module that touches
  `process.env` or a server SDK is server-only and belongs in the backend.

## Storage: Cloudinary
Signed direct upload. The API signs, the browser uploads, the API verifies ownership.

```ts
// API: mint a signed upload config scoped to this host's folder
const timestamp = Math.floor(Date.now() / 1000)
const signature = crypto
  .createHash('sha1')
  .update(`folder=${folder}&timestamp=${timestamp}${process.env.CLOUDINARY_API_SECRET}`)
  .digest('hex')

return { cloudName, apiKey, timestamp, folder, signature }
```

The client then posts `file`, `api_key`, `timestamp`, `signature`, `folder` to
`https://api.cloudinary.com/v1_1/{cloudName}/image/upload` and gets back
`{ secure_url, public_id }`. Persist **both** the `url` and the `public_id` — deletes
and transformations need the `public_id`, and the `url` alone is not enough.

Validate on persist that `public_id` starts with the folder prefix owned by the
requesting host, so one user cannot attach another user's upload to a listing.

## Payments: Stripe
Test mode only in the MVP. Test card `4242 4242 4242 4242`, any future expiry, any CVC.

### Client
`stripe@22`. `new` is required. **Omit `apiVersion`** — the SDK pins it
(`2026-08-26.dahlia` in 22.6.2) and passing a different string is a type error.

```ts
export const STRIPE = Symbol('STRIPE')

@Global()
@Module({
  providers: [{
    provide: STRIPE,
    useFactory: (): Stripe => new Stripe(process.env.STRIPE_SECRET_KEY!, {
      maxNetworkRetries: 2,
    }),
  }],
  exports: [STRIPE],
})
export class StripeModule {}
```

`import Stripe from 'stripe'` — default import. Inject via a symbol token, not the class
as a provider key.

### PaymentIntent
`idempotencyKey` lives on **`RequestOptions`, the second positional argument** — never
mixed into the params object. v22 enforces `params` first, `options` last.

```ts
const intent = await this.stripe.paymentIntents.create(
  { amount: 12900, currency: 'usd', automatic_payment_methods: { enabled: true },
    metadata: { bookingId: booking.id } },
  { idempotencyKey: `booking:${booking.id}` },
)
```

Use `metadata` for the internal reference, not `description`. Amounts are integer cents.
The server never accepts a client-sent amount.

### Webhooks — the raw body problem
`constructEvent` needs the **raw, unparsed** body. The correct NestJS 12 approach is the
app-level `rawBody` flag, **not** a per-route body-parser workaround.

```ts
const app = await NestFactory.create<NestExpressApplication>(AppModule, {
  rawBody: true, // do NOT also pass bodyParser: false — mutually exclusive
})
```

```ts
@Post('webhooks/stripe')
@HttpCode(200)
async handle(
  @Req() req: RawBodyRequest<Request>,
  @Headers('stripe-signature') signature: string | undefined,
) {
  if (!signature) throw new BadRequestException('Missing stripe-signature')
  if (!req.rawBody) throw new BadRequestException('Missing raw body')

  let event: Stripe.Event
  try {
    event = this.stripe.webhooks.constructEvent(
      req.rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET!,
    )
  } catch (err) {
    throw new BadRequestException(`Webhook verification failed: ${(err as Error).message}`)
  }
  await this.dispatch(event)
  return { received: true }
}
```

Three traps:
- **`@Body({ bodyParser: false })` does not exist.** It is absent from every published
  `@nestjs/common` from 5.4.0 to 12.1.1 — `ParameterDecoratorOptions` accepts only
  `schema` and `pipes`. Widely copied blog posts are wrong. Use `rawBody: true`.
- Calling `app.use(express.json())` yourself **silently sets `rawBody` to `undefined`**
  and verification fails with a confusing error. To change the body limit, use
  `app.useBodyParser('json', { limit: '1mb' })`, which respects `rawBody`.
- `constructEvent` **throws on a thin event** (`object === 'v2.core.event'`) and on an
  already-parsed object. Feed it the `Buffer`.

`@nestjs/common` 12.1 also ships a `@RawBody()` param decorator, which is cleaner than
reaching for `@Req()`.

### Refunds
There is no "partial" flag — **partial *is* the presence of `amount`**. Omit `amount`
for a full refund.

```ts
await this.stripe.refunds.create(
  { payment_intent: 'pi_3abc', amount: 2500, reason: 'requested_by_customer',
    metadata: { bookingId } },
  { idempotencyKey: `refund:${bookingId}:2500` },
)
```

`reason: 'fraudulent'` adds the card to Stripe's block lists — a real side effect, not
just a label.

Webhook events: prefer `refund.created` / `refund.updated` / `refund.failed` over the
legacy `charge.refunded`. Typed as `Stripe.RefundCreatedEvent` etc.

**Treat the API call as "accepted", not "done."** Refunds can land in `pending` and
later fail. Reconcile by webhook. This is the mechanism behind D11 — a refund is
"accepted" until a `succeeded` event, which is exactly why the invariant is *at most one
`succeeded` refund* and not *at most one attempt*.

### Stripe errors
Branch with `instanceof`, not on the `type` string:

| Retryable | Terminal |
|---|---|
| `Stripe.errors.StripeConnectionError` | `Stripe.errors.StripeCardError` |
| `Stripe.errors.StripeRateLimitError` | `Stripe.errors.StripeInvalidRequestError` |
| `Stripe.errors.StripeAPIError` (5xx) | `Stripe.errors.StripeAuthenticationError` |

As a *type* position only the `InstanceType<typeof Stripe.errors.StripeError>` form
compiles in v22. Isolate the retryable check in one helper — the next major reclassifies
one of these cases.
