import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { LivenessResponse, ReadinessCheck, ReadinessResponse } from '@fenticoin/types';

import { DRIZZLE_CLIENT } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.types';

@Injectable()
export class HealthService {
  private readonly startedAt = Date.now();

  constructor(@Inject(DRIZZLE_CLIENT) private readonly db: DrizzleDb) {}

  getLiveness(): LivenessResponse {
    return {
      status: 'ok',
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      timestamp: new Date().toISOString(),
    };
  }

  async getReadiness(): Promise<ReadinessResponse> {
    const checks: ReadinessCheck[] = [await this.checkDatabase()];
    const status = checks.every((check) => check.status === 'ok') ? 'ok' : 'error';

    return {
      status,
      checks,
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDatabase(): Promise<ReadinessCheck> {
    try {
      await this.db.execute(sql`select 1`);
      return { name: 'database', status: 'ok' };
    } catch (error) {
      return {
        name: 'database',
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown database error',
      };
    }
  }
}
