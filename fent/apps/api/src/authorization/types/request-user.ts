import type { PermissionKey } from '../permissions.catalog';
import type { RoleKey } from '../roles.catalog';

/** Attached to `req.user` by `AuthGuard` after verifying the access token and session. */
export interface RequestUser {
  id: string;
  email: string;
  status: string;
  sessionId: string;
  roles: RoleKey[];
  permissions: PermissionKey[];
}
