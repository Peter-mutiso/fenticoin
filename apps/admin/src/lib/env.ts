import { z } from 'zod';

/**
 * Only `NEXT_PUBLIC_*` variables belong here — anything in this file ends
 * up inlined into the browser bundle. Server-only secrets must never be
 * read through this module; they belong in the API, not the frontend.
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url().default('http://localhost:4000'),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

let cached: PublicEnv | undefined;

export function getPublicEnv(): PublicEnv {
  if (cached) return cached;

  const result = publicEnvSchema.safeParse({
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  });

  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid public environment configuration: ${issues.join(', ')}`);
  }

  cached = result.data;
  return cached;
}
