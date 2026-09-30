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
