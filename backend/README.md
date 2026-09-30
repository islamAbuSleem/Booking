# Booking — backend

NestJS 12, ESM, the HTTP API for the hotel booking platform. Postgres is Neon via
Prisma 7 with a driver adapter; the database schema lives in `prisma/schema.prisma`.

This project is **not** a workspace member of anything. `backend/` and `frontend/` are
independent: separate `package.json`, separate `node_modules`, separate lockfiles,
separate deploys. They never import each other — the only contract is the HTTP API
described by `openapi.json`, and the frontend's types are generated from it.

## Setup

```bash
# from the repository root — this installs the frontend too
npm install

cp backend/.env.example backend/.env   # then fill in DATABASE_URL and JWT_SECRET
```

`DATABASE_URL` is the pooled Neon URL used at runtime, `DIRECT_URL` the direct one used
by the Prisma CLI for migrations. Getting them backwards exhausts the Neon connection
budget.

## Run

Always from the repository root, so the two halves stay in step:

```bash
npm run dev:backend     # watch mode on :3000
npm run dev:frontend    # Nuxt, in a second terminal
```

`backend/` alone accepts `npm --prefix backend run <script>`, but `npm run start` and
`npm run start:dev` here are the Nest defaults and are **not** the project's workflow.
The check that gates every ticket is the root one:

```bash
npm run verify    # builds both projects, runs the tests, lints both
```

## Database

```bash
npm run db:migrate --prefix backend   # or: npm --prefix backend run db:migrate
npm run db:seed --prefix backend
```

Migrations are not committed in this phase. The schema is the source of truth and the
baseline is generated on the first `prisma migrate dev` against a real database.

## API surface

Everything lives under `/api`. `bootstrap.ts` is the single place that configures the
app — prefix, CORS, the validation pipe, the error envelope and the OpenAPI routes — so
a test can boot the same application the entry point does.

The OpenAPI document is served as raw JSON at `/api/openapi.json` and browsable at
`/api/docs`. Regenerate `openapi.json` after a DTO or route change and commit the result:

```bash
npm --prefix backend run openapi
```

## Tests

```bash
npm run test:backend                      # unit + HTTP, via Vitest
npm --prefix backend run test:e2e         # e2e suite
npm --prefix backend run test:cov         # coverage
```

## Conventions

`context/code-standards.md` is the contract: no `any`, no non-null assertions outside
tests, services are the only place that touches `PrismaService`, and every thrown error
is an `HttpException` translated into the `{ success, error }` envelope by
`AllExceptionsFilter`.
