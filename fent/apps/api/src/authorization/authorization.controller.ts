import { Controller, Get } from '@nestjs/common';

import { RequirePermissions } from './decorators/require-permissions.decorator';
import { PERMISSION_DEFINITIONS, PERMISSIONS } from './permissions.catalog';
import { ROLE_DEFINITIONS } from './roles.catalog';

/**
 * Read-only views over the compile-time role/permission catalogs. Gated on
 * `roles.manage` rather than a separate `roles.view` — the catalog only
 * matters to someone who can also act on it via the existing
 * `POST/DELETE admin/users/:id/roles` routes (also `roles.manage`), so a
 * finer-grained read-only permission isn't worth adding for two static
 * arrays.
 */
@Controller('admin')
export class AuthorizationController {
  @RequirePermissions(PERMISSIONS.ROLES_MANAGE)
  @Get('roles')
  listRoles() {
    return { items: ROLE_DEFINITIONS };
  }

  @RequirePermissions(PERMISSIONS.ROLES_MANAGE)
  @Get('permissions')
  listPermissions() {
    return { items: PERMISSION_DEFINITIONS };
  }
}
