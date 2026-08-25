import { ForbiddenException, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
// Value import: constructor-injected without an explicit `@Inject()` token,
// so Nest resolves it by this type via emitted metadata — must not be
// `import type`. See eslint.config.js for why this rule is off here.
import { Reflector } from '@nestjs/core';

import type { PermissionKey } from '../permissions.catalog';
import { REQUIRED_PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import type { RequestUser } from '../types/request-user';

/**
 * Runs after `AuthGuard` (registration order in `AppModule` matters — see
 * that file) and checks `req.user.permissions`, populated fresh from the
 * database on this same request. An endpoint with no `@RequirePermissions`
 * metadata is allowed for any authenticated user; this guard only ever
 * narrows access, never grants it.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PermissionKey[]>(REQUIRED_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<{ user?: RequestUser }>();
    const granted = new Set(request.user?.permissions ?? []);
    const missing = required.filter((permission) => !granted.has(permission));

    if (missing.length > 0) {
      throw new ForbiddenException(`Missing required permission(s): ${missing.join(', ')}`);
    }

    return true;
  }
}
