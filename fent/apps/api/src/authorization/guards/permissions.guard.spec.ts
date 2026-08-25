import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';

import { PermissionsGuard } from './permissions.guard';

function createContext(user: { permissions: string[] } | undefined): ExecutionContext {
  const request = { user };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  it('allows access when no permissions are required', () => {
    const reflector = { getAllAndOverride: () => undefined } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);
    expect(guard.canActivate(createContext({ permissions: [] }))).toBe(true);
  });

  it('allows access when the user holds all required permissions', () => {
    const reflector = { getAllAndOverride: () => ['users.view', 'kyc.view'] } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);
    const context = createContext({ permissions: ['users.view', 'kyc.view', 'reports.view'] });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('denies access when a required permission is missing', () => {
    const reflector = { getAllAndOverride: () => ['wallet.adjust'] } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);
    const context = createContext({ permissions: ['users.view'] });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('denies access when there is no authenticated user at all', () => {
    const reflector = { getAllAndOverride: () => ['users.view'] } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);
    expect(() => guard.canActivate(createContext(undefined))).toThrow(ForbiddenException);
  });

  // One case per permission gate introduced by the admin control panel
  // (Section 2 of the implementation plan) — proves a request lacking
  // that specific new permission is rejected, using the same
  // fake-context/fake-Reflector harness as every case above.
  describe('new admin control panel endpoints', () => {
    const deniedCases: { name: string; permission: string }[] = [
      { name: 'KYC review (POST admin/users/:id/kyc-review)', permission: 'kyc.review' },
      { name: 'eligibility restriction (POST admin/users/:id/eligibility)', permission: 'users.suspend' },
      { name: 'audit log read (GET admin/audit-logs)', permission: 'audit.view' },
      { name: 'manual bonus grant (POST admin/wallet/:userId/grant-bonus)', permission: 'wallet.adjust' },
      { name: 'reports (GET admin/reports/*)', permission: 'reports.view' },
      { name: 'roles/permissions catalog (GET admin/roles, GET admin/permissions)', permission: 'roles.manage' },
    ];

    it.each(deniedCases)('denies $name to a caller missing $permission', ({ permission }) => {
      const reflector = { getAllAndOverride: () => [permission] } as unknown as Reflector;
      const guard = new PermissionsGuard(reflector);
      const context = createContext({ permissions: ['users.view'] }); // some unrelated permission, never the one required
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it.each(deniedCases)('allows $name to a caller holding $permission', ({ permission }) => {
      const reflector = { getAllAndOverride: () => [permission] } as unknown as Reflector;
      const guard = new PermissionsGuard(reflector);
      const context = createContext({ permissions: [permission] });
      expect(guard.canActivate(context)).toBe(true);
    });
  });
});
