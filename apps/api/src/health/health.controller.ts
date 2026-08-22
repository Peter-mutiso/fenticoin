import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import type { LivenessResponse, ReadinessResponse } from '@fenticoin/types';

import { Public } from '../authorization/decorators/public.decorator';
import { HealthService } from './health.service';

/** Liveness/readiness probes — must never require authentication, or an orchestrator/load balancer can never confirm the process is up. */
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /** Liveness: process is up. No dependencies checked. */
  @Get()
  @HttpCode(HttpStatus.OK)
  getLiveness(): LivenessResponse {
    return this.healthService.getLiveness();
  }

  /** Readiness: process is up and dependencies are reachable. */
  @Get('ready')
  async getReadiness(): Promise<ReadinessResponse> {
    const result = await this.healthService.getReadiness();

    if (result.status !== 'ok') {
      throw new ServiceUnavailableException(result);
    }

    return result;
  }
}
