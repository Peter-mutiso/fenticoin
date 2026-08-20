import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { CryptoModule } from '../common/crypto/crypto.module';
import { ConfigModule } from '../config/config.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ProvidersModule } from './providers/providers.module';
import { PasswordService } from './services/password.service';
import { TwoFactorService } from './services/two-factor.service';
import { VerificationTokenService } from './services/verification-token.service';
import { SessionModule } from './session.module';
import { TokenModule } from './token.module';

@Module({
  imports: [ConfigModule, TokenModule, SessionModule, UsersModule, AuditModule, CryptoModule, ProvidersModule],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, TwoFactorService, VerificationTokenService],
  exports: [AuthService],
})
export class AuthModule {}
