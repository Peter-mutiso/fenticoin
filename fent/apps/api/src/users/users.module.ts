import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { SessionModule } from '../auth/session.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [SessionModule, AuditModule, AuthorizationModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
