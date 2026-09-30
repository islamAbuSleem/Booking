import 'dotenv/config';

/**
 * Test environment. The API refuses to boot without a `DATABASE_URL`
 * (context/code-standards.md, "Configuration"), and `AppModule` is imported at module
 * evaluation time, so a placeholder has to exist before the first import.
 *
 * Nothing dials it: the HTTP tests override `PrismaService` and `HOTELS_REPOSITORY`, and
 * the unit tests never build an application at all. `??=` means a real URL in `.env`
 * still wins, so this only fills a gap.
 */
process.env['DATABASE_URL'] ??= 'postgresql://test:test@localhost:5432/test';
process.env['NODE_ENV'] ??= 'test';
// T14 — AppModule validates JWT_SECRET at import time. Unit tests never sign a
// real token with it; the HTTP tests override the auth providers. A real secret
// in `.env` still wins, so this only fills a gap.
process.env['JWT_SECRET'] ??= 'test-test-test-test-test-test-00';
