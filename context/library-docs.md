# Library & Platform Docs

## Neon Postgres + Prisma

### Connection
Neon is a Postgres host, not an ORM. Prisma is the client.
- Runtime: use the **pooled** connection string (`-pooler` host) with
  `connection_limit=1` or PgBouncer transaction mode. Neon scales read replicas by
  pooling; a long-lived direct connection will exhaust the plan.
- Migrations: use the **direct** (non-pooled) URL.
- Two URLs, both from the same Neon project:
  ```
  DATABASE_URL="postgresql://...-pooler..../db?sslmode=require"
  DIRECT_URL="postgresql://..../db?sslmode=require"
  ```
- Serverless driver: `@prisma/adapter-neon` when running on Fly.io/Render with
  `@neondatabase/serverless`, otherwise the standard Prisma client is fine. Do not mix
  the two.

### Prisma schema setup
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

### Singleton client (NestJS)
One `PrismaService` for the whole app, extending `PrismaClient` and implementing
`OnModuleInit` / `OnModuleDestroy`. Prisma opens a connection pool; instantiating per
request leaks connections.

```ts
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name)

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
- Transactions for anything that must not interleave. Availability checks run in a
  `Serializable` transaction with a retry on `P2034` (write conflict).
- `select` only the columns a response needs. Never `include` a whole relation tree on
  a list endpoint.
- Always bound parameters via Prisma — never build SQL strings from user input.
- Map errors at the boundary: `P2002` unique violation → 409, `P2025` not found → 404,
  `P2003` FK violation → 400, `P2034` write conflict → retry.
- `Decimal` for anything needing exact arithmetic beyond cents. Integers for money.

## Shared package
Zod schemas in `packages/shared` define the contract; both apps import them.

```ts
// packages/shared/src/schemas/hotel.ts
import { z } from 'zod'

export const hotelSearchQuery = z.object({
  city: z.string().min(1).optional(),
  checkIn: z.string().date().optional(),
  checkOut: z.string().date().optional(),
  guests: z.coerce.number().int().min(1).max(20).default(2),
  minPrice: z.coerce.number().int().min(0).optional(),
  amenities: z.array(z.string()).default([]),
})

export type HotelSearchQuery = z.infer<typeof hotelSearchQuery>
```

```ts
// NestJS controller — one schema, no duplicated DTO interface
@Get()
findAll(@Query(new ZodValidationPipe(hotelSearchQuery)) query: HotelSearchQuery) {
  return this.hotelsService.findAll(query)
}
```
`z.coerce` matters: query strings arrive as strings.

## Server vs client
- **Server (API):** Prisma client, Stripe secret key, JWT signing, OAuth client secret,
  Cloudinary API secret, `DIRECT_URL`.
- **Browser:** Stripe publishable key, Cloudinary signed upload params, `NUXT_PUBLIC_*`.
- Never import server code into `apps/web`. A shared package module that touches
  `process.env` or a server SDK is server-only — keep it out of `packages/shared`.

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

- Create the PaymentIntent on the **server** with an `idempotencyKey` derived from the
  booking reference. A retried request must not create a second charge.
- The browser confirms with `@stripe/stripe-js` using the returned `clientSecret`.
- The server never marks a booking `CONFIRMED` from the browser's success callback.
  It waits for `payment_intent.succeeded` on the webhook.
- Verify the webhook with `stripe.webhooks.constructEvent` against the **raw** request
  body. Do not parse JSON before verifying — signature verification will fail.
- The webhook must be idempotent: Stripe retries, so a repeated event returns 200
  without double-writing.
- Amounts are integer cents. Never trust a client-sent amount; recompute on the server.
