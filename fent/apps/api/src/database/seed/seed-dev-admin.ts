/* eslint-disable no-console */
import { randomBytes } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { PasswordService } from '../../auth/services/password.service';
import { ROLES } from '../../authorization/roles.catalog';
import { authIdentities, userProfiles, userRoles, users } from '../schema';

/**
 * Creates (or promotes) a local super_admin user for development.
 *
 * Safety, not convenience, is the point of every check below:
 *  - Hard-refuses to run when NODE_ENV=production, full stop — this is not
 *    configurable away, unlike the ALLOW_DEV_SEED flag.
 *  - Additionally requires ALLOW_DEV_SEED=true, so it can't fire by accident
 *    from a CI job or a copy-pasted command.
 *  - Never hardcodes a credential. If DEV_ADMIN_PASSWORD isn't supplied, a
 *    fresh random one is generated and printed exactly once — it is not
 *    recoverable afterwards (only its scrypt hash is stored, same as any
 *    other user's password).
 */
async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run the dev admin seed with NODE_ENV=production');
  }
  if (process.env.ALLOW_DEV_SEED !== 'true') {
    throw new Error('Set ALLOW_DEV_SEED=true to confirm you want to run the dev admin seed');
  }

  const email = process.env.DEV_ADMIN_EMAIL;
  if (!email) throw new Error('DEV_ADMIN_EMAIL is required');
  const normalizedEmail = email.trim().toLowerCase();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL must be set');

  const generatedPassword = process.env.DEV_ADMIN_PASSWORD ?? randomBytes(18).toString('base64url');
  const passwordService = new PasswordService();

  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client);

  const [existing] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);

  let userId: string;

  if (existing) {
    userId = existing.id;
    console.log(`User ${normalizedEmail} already exists (${userId}); ensuring super_admin role only.`);
  } else {
    const passwordHash = await passwordService.hash(generatedPassword);
    const [created] = await db
      .insert(users)
      .values({ email: normalizedEmail, emailVerifiedAt: new Date(), status: 'active' })
      .returning();
    userId = created!.id;

    await db.insert(userProfiles).values({ userId, displayName: 'Dev Admin' });
    await db.insert(authIdentities).values({ userId, provider: 'password', passwordHash });

    console.log('Created dev admin user:');
    console.log(`  email:    ${normalizedEmail}`);
    console.log(`  password: ${generatedPassword}`);
    console.log('  (this password is shown once and is not recoverable — store it now if you generated it)');
  }

  await db
    .insert(userRoles)
    .values({ userId, roleKey: ROLES.SUPER_ADMIN })
    .onConflictDoNothing();

  console.log(`Granted ${ROLES.SUPER_ADMIN} to ${normalizedEmail}.`);
  await client.end();
}

main().catch((error: unknown) => {
  console.error('Dev admin seed failed:', error);
  process.exitCode = 1;
});
