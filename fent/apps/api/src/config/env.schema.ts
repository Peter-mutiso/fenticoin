import { z } from 'zod';

/**
 * The single source of truth for what environment variables the API needs
 * and what shape they must have. Fails fast (and loudly) at startup if the
 * environment is misconfigured, rather than failing confusingly later on
 * first use — see `validateEnv` below.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  // Postgres connection string. Required in all environments — there is no
  // safe placeholder for a database URL, so misconfiguration must fail
  // startup rather than silently run against nothing.
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .refine((v) => v.startsWith('postgres://') || v.startsWith('postgresql://'), {
      message: 'DATABASE_URL must be a postgres:// or postgresql:// connection string',
    }),

  // Comma-separated list of origins allowed to call this API from a browser.
  CORS_ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((v) => v.split(',').map((origin) => origin.trim()).filter(Boolean)),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Public base URL of the *frontend*, used to build links sent to users
  // (email verification, password reset, OAuth redirects).
  APP_BASE_URL: z.string().url().default('http://localhost:3000'),

  // Signs access tokens (JWT) and short-lived internal challenge tokens
  // (e.g. the "password verified, now provide 2FA code" step). Must be at
  // least 32 bytes of real entropy — generate with `openssl rand -hex 32`.
  AUTH_JWT_SECRET: z
    .string()
    .min(32, 'AUTH_JWT_SECRET must be at least 32 characters of real entropy'),
  AUTH_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  AUTH_REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  // Symmetric key (AES-256-GCM) used only to encrypt 2FA TOTP secrets at
  // rest. Exactly 32 bytes, hex-encoded (64 hex chars). Generate with
  // `openssl rand -hex 32`. Rotating this key invalidates existing 2FA
  // enrollments (users would need to re-enroll) — treat it like any other
  // long-lived secret, not something to rotate casually.
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)'),

  // --- Optional provider credentials -----------------------------------
  // Each external provider is fully optional at the env level: if unset,
  // its endpoints respond with a clear "not configured" error instead of
  // silently pretending to succeed. Never partially configure a provider —
  // the checks below fail startup if only some of a group's vars are set.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),

  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),

  // Explicit opt-in to a real market-data provider. Unset means: dev-fixture
  // prices outside production, and a loud "not configured" error (never a
  // silent guess) in production — see markets/providers/providers.module.ts.
  MARKET_DATA_PROVIDER: z.enum(['coingecko']).optional(),
  COINGECKO_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

const PROVIDER_GROUPS = [
  { name: 'Google OAuth', keys: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'] },
  { name: 'Twilio SMS', keys: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER'] },
] as const;

/**
 * Parses and validates `process.env`. Throws a single, readable error
 * listing every problem found, instead of a raw Zod stack trace, so a
 * misconfigured deployment fails with an actionable message in its logs.
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  const groupIssues: string[] = [];
  for (const group of PROVIDER_GROUPS) {
    const values = group.keys.map((key) => result.data[key]);
    const setCount = values.filter((v) => v !== undefined && v !== '').length;
    if (setCount > 0 && setCount < group.keys.length) {
      groupIssues.push(
        `  - ${group.name}: set either all of [${group.keys.join(', ')}] or none of them`,
      );
    }
  }
  if (groupIssues.length > 0) {
    throw new Error(`Invalid environment configuration:\n${groupIssues.join('\n')}`);
  }

  return result.data;
}
