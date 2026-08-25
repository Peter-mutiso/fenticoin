import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { ConfigModule } from '../config/config.module';
import { TokenService } from './services/token.service';

/**
 * Split out from `AuthModule` so `AuthorizationModule` (which needs
 * `TokenService` to verify access tokens in `AuthGuard`) doesn't have to
 * import the whole registration/login module and risk a circular
 * dependency (`AuthModule` also depends on `AuthorizationService`).
 */
@Module({
  imports: [ConfigModule, JwtModule.register({})],
  providers: [TokenService],
  exports: [TokenService],
})
export class TokenModule {}
