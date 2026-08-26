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
  /** `'demo'` for a server-provisioned demo shadow account — see `users.accountType`. Never trust a client-supplied equivalent; this is resolved fresh from the DB on every request. */
  accountType: 'real' | 'demo';
  /** Set only when `accountType === 'demo'` — the real user this shadow belongs to. */
  demoOfUserId: string | null;
}
