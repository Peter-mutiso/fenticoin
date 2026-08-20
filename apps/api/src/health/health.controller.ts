import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import type { LivenessResponse, ReadinessResponse } from '@fenticoin/types';

import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /** Liveness: process is up. No dependencies checked — must always be fast and cheap. */
  @Get()
  @HttpCode(HttpStatus.OK)
  getLiveness(): LivenessResponse {
    return this.healthService.getLiveness();
  }

  /** Readiness: process is up AND its dependencies (e.g. the database) are reachable. */
  @Get('ready')
  async getReadiness(): Promise<ReadinessResponse> {
    const result = await this.healthService.getReadiness();
    if (result.status !== 'ok') {
      throw new ServiceUnavailableException(result);
    }
    return result;
  }
}
