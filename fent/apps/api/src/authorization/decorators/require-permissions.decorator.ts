import { SetMetadata } from '@nestjs/common';

import type { PermissionKey } from '../permissions.catalog';

export const REQUIRED_PERMISSIONS_KEY = 'requiredPermissions';

/** All listed permissions must be present — see `PermissionsGuard`. */
export const RequirePermissions = (...permissions: PermissionKey[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);
