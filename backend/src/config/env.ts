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

  /**
   * T14 — JWT is set as an httpOnly cookie. 32+ characters so it has at least
   * 256 bits of entropy when random. Required: a missing secret fails at boot,
   * not at the first login. A copy of the .env.example placeholder is refused
   * for the same reason — shipping it would mean every deployment shares a
   * secret an attacker already has.
   */
  JWT_SECRET: z
    .string()
    .refine((value) => value !== JWT_SECRET_PLACEHOLDER, {
      message: `JWT_SECRET is still the .env.example placeholder — generate one with "openssl rand -base64 48"`,
    })
    .refine((value) => value.length >= 32, {
      message: 'JWT_SECRET must be 32 or more characters',
    }),

  /** T14 — doubles as the auth-cookie lifetime (see `auth/cookie.ts`). */
  JWT_EXPIRES_IN: z.string().min(1).default('7d'),

  JWT_ISSUER: z.string().min(1).default('booking-api'),
  JWT_AUDIENCE: z.string().min(1).default('booking-web'),

  /**
   * T15 — OAuth is optional in local dev and in tests. Missing values do NOT
   * fail boot; the strategies fall back to placeholder credentials so the app
   * builds and tests pass, and only a real provider redirect fails at runtime.
   * Callback URLs must be registered with each provider for manual verification;
   * the expected values are the defaults below (see also the strategy comments).
   */
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z
    .string()
    .default('http://localhost:3000/api/auth/google/callback'),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GITHUB_CALLBACK_URL: z
    .string()
    .default('http://localhost:3000/api/auth/github/callback'),

  /**
   * T21 — Cloudinary is optional, exactly like OAuth (T15). Every value is `.default`ed
   * to a placeholder, so a missing variable does NOT fail boot and the app builds and
   * tests pass without credentials. `sign` returns the placeholder config, and only a
   * real browser upload against a placeholder cloud fails at runtime. No Cloudinary SDK
   * is used anywhere: `sign` is a pure HMAC-SHA1 function and `destroy` is a plain fetch
   * behind the `CLOUDINARY` DI token, both faked in tests (context/build-plan.md, T21 /
   * decision D58). The placeholders are unmistakably fake so a real deployment that forgot
   * to set them is obvious, not silent.
   */
  CLOUDINARY_CLOUD_NAME: z
    .string()
    .default('booking-upload-placeholder')
    .describe('Cloudinary cloud name. Placeholder default; set a real cloud to upload.'),
  CLOUDINARY_API_KEY: z
    .string()
    .default('00000000000000000000000')
    .describe('Cloudinary API key. Returned to the browser on purpose (signed uploads).'),
  CLOUDINARY_API_SECRET: z
    .string()
    .default('cloudinary-upload-placeholder-secret')
    .describe('Cloudinary API secret. Stays server-side; signs uploads and the destroy.'),
  CLOUDINARY_UPLOAD_PATH: z
    .string()
    .default('booking/hotels/')
    .describe('The folder prefix owned by the platform; each host appends their own id.'),
  /**
   * T26 — Stripe is optional in local dev and in tests, exactly like OAuth (T15) and
   * Cloudinary (T21). A missing key does NOT fail boot: the client is constructed lazily
   * and throws a 503 only when a payment route actually runs without credentials, so the
   * app builds and the whole suite passes with no keys. Test mode only — no live keys,
   * ever (D7). `STRIPE_WEBHOOK_SECRET` belongs to T27 and is validated there.
   */
  STRIPE_SECRET_KEY: z.string().optional(),
  /**
   * T27 — verifies webhook signatures. Optional at boot like the secret key; a webhook
   * call without it is a 503, and a forged signature is a 400 that names nothing about
   * why verification failed.
   */
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
});

/** The exact string `.env.example` used to ship, kept so it can be refused by name. */
export const JWT_SECRET_PLACEHOLDER = 'replace-me-with-32-plus-random-bytes';

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
