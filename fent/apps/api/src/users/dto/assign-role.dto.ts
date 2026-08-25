import { IsIn } from 'class-validator';

import { ALL_ROLES, type RoleKey } from '../../authorization/roles.catalog';

export class AssignRoleDto {
  @IsIn(ALL_ROLES)
  roleKey!: RoleKey;
}
