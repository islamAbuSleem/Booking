import { z } from 'zod';

/**
 * T13 — every environment variable the API reads, validated once at boot.
 *
 * A missing or malformed required variable fails here, at startup, instead of at the
 * first request that happens to need it (context/code-standards.md, "Configuration").
 * Nothing else in the codebase reads `process.env` directly.
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),

  /**
   * Comma-separated. Credentials are enabled on CORS, so `*` is never valid and the
   * schema rejects it rather than trusting the operator to remember.
   */
  FRONTEND_ORIGIN: z
    .string()
    .default('http://localhost:3000')
    .refine((value) => !value.split(',').includes('*'), {
      message:
        'FRONTEND_ORIGIN must not be "*" because CORS credentials are enabled',
    }),

  /** POOLED Neon URL. Used by the PrismaNeon driver adapter at runtime. */
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required (pooled Neon connection string)'),

  /** DIRECT Neon URL. Only the Prisma CLI needs it; the API process does not. */
  DIRECT_URL: z.string().min(1).optional(),

  LOG_LEVEL: z
    .enum(['log', 'error', 'warn', 'debug', 'verbose'])
    .default('log'),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`[config] invalid environment — ${issues}`);
  }
  return result.data;
}
