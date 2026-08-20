/* eslint-disable no-console */
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { PERMISSION_DEFINITIONS } from '../../authorization/permissions.catalog';
import { ROLE_DEFINITIONS } from '../../authorization/roles.catalog';
import { permissions, rolePermissions, roles } from '../schema';

/**
 * Upserts the fixed role/permission catalog into the database. Safe to run
 * in any environment, any number of times — it only ever inserts rows that
 * match the current `permissions.catalog.ts`/`roles.catalog.ts` definitions
 * and updates descriptions, never touches `user_roles` (who has what).
 */
async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL must be set to seed RBAC data');

  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client);

  console.log(`Seeding ${PERMISSION_DEFINITIONS.length} permissions...`);
  for (const permission of PERMISSION_DEFINITIONS) {
    await db
      .insert(permissions)
      .values(permission)
      .onConflictDoUpdate({
        target: permissions.key,
        set: { description: permission.description, category: permission.category },
      });
  }

  console.log(`Seeding ${ROLE_DEFINITIONS.length} roles...`);
  for (const role of ROLE_DEFINITIONS) {
    await db
      .insert(roles)
      .values({ key: role.key, description: role.description })
      .onConflictDoUpdate({ target: roles.key, set: { description: role.description } });

    await db.delete(rolePermissions).where(eq(rolePermissions.roleKey, role.key));
    if (role.permissions.length > 0) {
      await db
        .insert(rolePermissions)
        .values(role.permissions.map((permissionKey) => ({ roleKey: role.key, permissionKey })));
    }
  }

  console.log('RBAC seed complete.');
  await client.end();
}

main().catch((error: unknown) => {
  console.error('RBAC seed failed:', error);
  process.exitCode = 1;
});
