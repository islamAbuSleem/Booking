import 'dotenv/config'
import { defineConfig } from 'prisma/config'

/**
 * Prisma CLI config. Prisma 7 removed `datasource.url` / `datasource.directUrl` from
 * `schema.prisma` (a `url` there is a P1012 hard error), so both URLs live here.
 *
 * Migrations and Studio run against the DIRECT (non-pooled) URL: the schema engine needs
 * a session that a transaction-pooler can legally drop. The API process never reads this
 * file — it connects through a `PrismaNeon` driver adapter on the POOLED `DATABASE_URL`.
 *
 * `DIRECT_URL` falls back to `DATABASE_URL` so `prisma generate` (which loads this file
 * and needs no connection at all) works on a machine that only has the runtime URL.
 * Falling back for *generate* is harmless; the fallback would only matter for a migration,
 * which needs a real direct URL anyway.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env['DIRECT_URL'] ?? process.env['DATABASE_URL'] ?? '',
  },
})
