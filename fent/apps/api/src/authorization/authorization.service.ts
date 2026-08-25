import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { AuditLogService } from '../audit/audit-log.service';
import { DRIZZLE_CLIENT } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.types';
import { rolePermissions, userRoles } from '../database/schema';
import type { PermissionKey } from './permissions.catalog';
import { ALL_ROLES, ROLES, type RoleKey } from './roles.catalog';

export interface ResolvedAuthorization {
  roles: RoleKey[];
  permissions: PermissionKey[];
}

export interface RoleChangeContext {
  targetUserId: string;
  roleKey: RoleKey;
  actorUserId: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Resolves a user's current roles/permissions fresh from the database on
 * every call — see `TokenService`'s doc comment for why nothing here is
 * cached in a JWT: a revoked role or a suspended account must take effect
 * on the very next request, not whenever a token happens to expire.
 */
@Injectable()
export class AuthorizationService {
  constructor(
    @Inject(DRIZZLE_CLIENT) private readonly db: DrizzleDb,
    private readonly auditLog: AuditLogService,
  ) {}

  async resolve(userId: string): Promise<ResolvedAuthorization> {
    const roleRows = await this.db
      .select({ roleKey: userRoles.roleKey })
      .from(userRoles)
      .where(eq(userRoles.userId, userId));
    const roles = roleRows.map((r) => r.roleKey as RoleKey);

    if (roles.length === 0) {
      return { roles: [], permissions: [] };
    }

    const permissionRows = await this.db
      .select({ permissionKey: rolePermissions.permissionKey })
      .from(userRoles)
      .innerJoin(rolePermissions, eq(rolePermissions.roleKey, userRoles.roleKey))
      .where(eq(userRoles.userId, userId));

    const permissions = [...new Set(permissionRows.map((r) => r.permissionKey as PermissionKey))];
    return { roles, permissions };
  }

  async assignRole(context: RoleChangeContext): Promise<void> {
    if (!ALL_ROLES.includes(context.roleKey)) {
      throw new BadRequestException(`Unknown role: ${context.roleKey}`);
    }

    await this.db
      .insert(userRoles)
      .values({
        userId: context.targetUserId,
        roleKey: context.roleKey,
        grantedBy: context.actorUserId,
      })
      .onConflictDoNothing();

    await this.auditLog.record({
      actorUserId: context.actorUserId,
      action: 'role.granted',
      targetType: 'user',
      targetId: context.targetUserId,
      after: { roleKey: context.roleKey },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }

  async revokeRole(context: RoleChangeContext): Promise<void> {
    const existing = await this.db
      .select()
      .from(userRoles)
      .where(and(eq(userRoles.userId, context.targetUserId), eq(userRoles.roleKey, context.roleKey)))
      .limit(1);

    if (existing.length === 0) return;

    if (context.roleKey === ROLES.SUPER_ADMIN) {
      const superAdminCount = await this.countUsersWithRole(ROLES.SUPER_ADMIN);
      if (superAdminCount <= 1) {
        throw new ConflictException('Cannot revoke the last super_admin role on the platform');
      }
    }

    await this.db
      .delete(userRoles)
      .where(and(eq(userRoles.userId, context.targetUserId), eq(userRoles.roleKey, context.roleKey)));

    await this.auditLog.record({
      actorUserId: context.actorUserId,
      action: 'role.revoked',
      targetType: 'user',
      targetId: context.targetUserId,
      before: { roleKey: context.roleKey },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }

  private async countUsersWithRole(roleKey: RoleKey): Promise<number> {
    const rows = await this.db
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .where(eq(userRoles.roleKey, roleKey));
    return rows.length;
  }
}
