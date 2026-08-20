import { ALL_PERMISSIONS, PERMISSION_DEFINITIONS } from './permissions.catalog';
import { ALL_ROLES, ROLE_DEFINITIONS, ROLES } from './roles.catalog';

describe('RBAC catalog consistency', () => {
  it('defines a description for every permission', () => {
    expect(PERMISSION_DEFINITIONS.map((p) => p.key).sort()).toEqual([...ALL_PERMISSIONS].sort());
  });

  it('defines every role exactly once, matching ALL_ROLES', () => {
    expect(ROLE_DEFINITIONS.map((r) => r.key).sort()).toEqual([...ALL_ROLES].sort());
  });

  it('only references permissions that exist in the permission catalog', () => {
    const known = new Set(ALL_PERMISSIONS);
    for (const role of ROLE_DEFINITIONS) {
      for (const permission of role.permissions) {
        expect(known.has(permission)).toBe(true);
      }
    }
  });

  it('gives the user role no administrative permissions', () => {
    const userRole = ROLE_DEFINITIONS.find((r) => r.key === ROLES.USER);
    expect(userRole?.permissions).toEqual([]);
  });

  it('gives super_admin every permission in the catalog', () => {
    const superAdmin = ROLE_DEFINITIONS.find((r) => r.key === ROLES.SUPER_ADMIN);
    expect([...(superAdmin?.permissions ?? [])].sort()).toEqual([...ALL_PERMISSIONS].sort());
  });

  it('reserves roles.manage and settings.manage for super_admin only', () => {
    const rolesManageHolders = ROLE_DEFINITIONS.filter((r) => r.permissions.includes('roles.manage')).map(
      (r) => r.key,
    );
    const settingsManageHolders = ROLE_DEFINITIONS.filter((r) =>
      r.permissions.includes('settings.manage'),
    ).map((r) => r.key);

    expect(rolesManageHolders).toEqual([ROLES.SUPER_ADMIN]);
    expect(settingsManageHolders).toEqual([ROLES.SUPER_ADMIN]);
  });
});
