import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Delete,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import { AuthorizationService } from '../authorization/authorization.service';
import { CurrentUser } from '../authorization/decorators/current-user.decorator';
import { RequirePermissions } from '../authorization/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../authorization/permissions.catalog';
import type { RoleKey } from '../authorization/roles.catalog';
import type { RequestUser } from '../authorization/types/request-user';
// Value imports: these DTO classes are read via NestJS's emitted
// `design:paramtypes` metadata by `ValidationPipe` (through `@Body()`/
// `@Query()`) to know what to instantiate and validate against. A
// `import type` here would make the resolved metatype `Object`, and
// Nest's ValidationPipe silently skips validation for that — see the
// eslint.config.js note for why `consistent-type-imports` is off in this app.
import { AssignRoleDto } from './dto/assign-role.dto';
import { KycReviewDto } from './dto/kyc-review.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { SetEligibilityDto } from './dto/set-eligibility.dto';
import { SetUserStatusDto } from './dto/set-status.dto';
import { UsersService } from './users.service';

/**
 * Administrative user management. Every route here is protected by the
 * global `AuthGuard` (authentication + active-account check) and
 * `PermissionsGuard` (`@RequirePermissions`) — there is no client-trusted
 * role check anywhere in this controller.
 */
@Controller('admin/users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  @RequirePermissions(PERMISSIONS.USERS_VIEW)
  @Get()
  async list(@Query() query: ListUsersQueryDto) {
    return this.usersService.list({
      email: query.email,
      status: query.status,
      kycStatus: query.kycStatus,
      limit: query.limit ?? 25,
      offset: query.offset ?? 0,
    });
  }

  @RequirePermissions(PERMISSIONS.USERS_VIEW)
  @Get(':id')
  async get(@Param('id') id: string) {
    const user = await this.usersService.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  @RequirePermissions(PERMISSIONS.USERS_VIEW)
  @Get(':id/roles')
  async getRoles(@Param('id') id: string) {
    return this.authorizationService.resolve(id);
  }

  @RequirePermissions(PERMISSIONS.USERS_SUSPEND)
  @Patch(':id/status')
  async setStatus(
    @Param('id') id: string,
    @Body() dto: SetUserStatusDto,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.usersService.setStatus({
      userId: id,
      status: dto.status,
      reason: dto.reason,
      actorUserId: actor.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @RequirePermissions(PERMISSIONS.KYC_REVIEW)
  @Post(':id/kyc-review')
  async reviewKyc(
    @Param('id') id: string,
    @Body() dto: KycReviewDto,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.usersService.reviewKyc({
      userId: id,
      decision: dto.decision,
      reason: dto.reason,
      actorUserId: actor.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  /**
   * Restricts (or restores) the single account-wide eligibility flag that
   * gates betting, withdrawals, and deposits — a risk/compliance action,
   * not a profile edit, so this is gated on `users.suspend` (held by
   * `risk`/`admin`) rather than `users.update`.
   */
  @RequirePermissions(PERMISSIONS.USERS_SUSPEND)
  @Post(':id/eligibility')
  async setEligibility(
    @Param('id') id: string,
    @Body() dto: SetEligibilityDto,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.usersService.setEligibility({
      userId: id,
      status: dto.status,
      reason: dto.reason,
      actorUserId: actor.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @RequirePermissions(PERMISSIONS.ROLES_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post(':id/roles')
  async assignRole(
    @Param('id') id: string,
    @Body() dto: AssignRoleDto,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ): Promise<void> {
    await this.authorizationService.assignRole({
      targetUserId: id,
      roleKey: dto.roleKey,
      actorUserId: actor.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @RequirePermissions(PERMISSIONS.ROLES_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id/roles/:roleKey')
  async revokeRole(
    @Param('id') id: string,
    @Param('roleKey') roleKey: RoleKey,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ): Promise<void> {
    await this.authorizationService.revokeRole({
      targetUserId: id,
      roleKey,
      actorUserId: actor.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
