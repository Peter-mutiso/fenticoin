import { Global, Module, type OnApplicationShutdown } from '@nestjs/common';
// Value import: constructor-injected without an explicit `@Inject()` token.
import { ModuleRef } from '@nestjs/core';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { AppConfigService } from '../config/app-config.service';
import { ConfigModule } from '../config/config.module';
import { DATABASE_POOL, DRIZZLE_CLIENT } from './database.constants';
import * as schema from './schema';

/**
 * Global so every feature module can inject `DRIZZLE_CLIENT` without each
 * one re-importing the connection setup. The `postgres` client connects
 * lazily on first query, so simply constructing it at boot (even with an
 * unreachable database) does not throw — that only happens on first use,
 * surfaced deliberately by the readiness check in the health module.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: DATABASE_POOL,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        postgres(config.databaseUrl, {
          max: 10,
          idle_timeout: 20,
          connect_timeout: 10,
        }),
    },
    {
      provide: DRIZZLE_CLIENT,
      inject: [DATABASE_POOL],
      useFactory: (pool: postgres.Sql) => drizzle(pool, { schema }),
    },
  ],
  exports: [DATABASE_POOL, DRIZZLE_CLIENT],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(private readonly moduleRef: ModuleRef) {}

  async onApplicationShutdown(): Promise<void> {
    const pool = this.moduleRef.get<postgres.Sql>(DATABASE_POOL, { strict: false });
    await pool?.end({ timeout: 5 });
  }
}
