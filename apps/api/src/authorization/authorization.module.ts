import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { TokenModule } from '../auth/token.module';
import { AuthorizationController } from './authorization.controller';
import { AuthorizationService } from './authorization.service';
import { AuthGuard } from './guards/auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';

@Module({
  imports: [TokenModule, AuditModule],
  controllers: [AuthorizationController],
  providers: [AuthorizationService, AuthGuard, PermissionsGuard],
  exports: [AuthorizationService, AuthGuard, PermissionsGuard],
})
export class AuthorizationModule {}
