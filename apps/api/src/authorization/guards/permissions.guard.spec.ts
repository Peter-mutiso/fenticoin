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
});
