import { Module } from '@nestjs/common';

import { ConfigModule } from '../config/config.module';
import { SessionService } from './services/session.service';
import { TokenModule } from './token.module';

@Module({
  imports: [ConfigModule, TokenModule],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
