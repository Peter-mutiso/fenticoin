import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { SessionModule } from '../auth/session.module';
import { TokenModule } from '../auth/token.module';
import { ConfigModule } from '../config/config.module';
import { UsersModule } from '../users/users.module';
import { WalletModule } from '../wallet/wallet.module';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';

@Module({
  imports: [ConfigModule, AuditModule, SessionModule, TokenModule, UsersModule, WalletModule],
  controllers: [DemoController],
  providers: [DemoService],
})
export class DemoModule {}
