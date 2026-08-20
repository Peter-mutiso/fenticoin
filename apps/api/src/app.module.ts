import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';

import { AppConfigService } from './config/app-config.service';
import { ConfigModule } from './config/config.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { BettingModule } from './betting/betting.module';
import { AuthorizationModule } from './authorization/authorization.module';
import { AuthGuard } from './authorization/guards/auth.guard';
import { PermissionsGuard } from './authorization/guards/permissions.guard';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { MarketsModule } from './markets/markets.module';
import { UsersModule } from './users/users.module';
import { WalletModule } from './wallet/wallet.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        pinoHttp: {
          level: config.logLevel,
          genReqId: (req: IncomingMessage) => {
            const header = req.headers['x-request-id'];
            return (Array.isArray(header) ? header[0] : header) ?? randomUUID();
          },
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.body.password',
              'req.body.newPassword',
              'req.body.token',
              'req.body.refreshToken',
              'req.body.code',
            ],
            censor: '[REDACTED]',
          },
          transport: config.isProduction
            ? undefined
            : { target: 'pino-pretty', options: { singleLine: true } },
        },
      }),
    }),
    DatabaseModule,
    HealthModule,
    AuditModule,
    AuthorizationModule,
    AuthModule,
    UsersModule,
    WalletModule,
    MarketsModule,
    BettingModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    // Order matters: AuthGuard must run before PermissionsGuard, since it's
    // what populates `req.user` (identity + freshly-resolved permissions)
    // that PermissionsGuard then checks against. Both run on every route
    // unless the handler is marked `@Public()`.
    {
      provide: APP_GUARD,
      useExisting: AuthGuard,
    },
    {
      provide: APP_GUARD,
      useExisting: PermissionsGuard,
    },
  ],
})
export class AppModule {}
