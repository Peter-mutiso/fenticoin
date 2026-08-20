import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  let service: jest.Mocked<HealthService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthService,
          useValue: {
            getLiveness: jest.fn(),
            getReadiness: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(HealthController);
    service = module.get(HealthService);
  });

  it('returns liveness status from the service', () => {
    service.getLiveness.mockReturnValue({
      status: 'ok',
      uptimeSeconds: 42,
      timestamp: '2026-01-01T00:00:00.000Z',
    });

    expect(controller.getLiveness()).toEqual({
      status: 'ok',
      uptimeSeconds: 42,
      timestamp: '2026-01-01T00:00:00.000Z',
    });
  });

  it('returns readiness when all checks pass', async () => {
    service.getReadiness.mockResolvedValue({
      status: 'ok',
      checks: [{ name: 'database', status: 'ok' }],
      timestamp: '2026-01-01T00:00:00.000Z',
    });

    await expect(controller.getReadiness()).resolves.toEqual({
      status: 'ok',
      checks: [{ name: 'database', status: 'ok' }],
      timestamp: '2026-01-01T00:00:00.000Z',
    });
  });

  it('throws 503 when a readiness check fails', async () => {
    service.getReadiness.mockResolvedValue({
      status: 'error',
      checks: [{ name: 'database', status: 'error', message: 'connection refused' }],
      timestamp: '2026-01-01T00:00:00.000Z',
    });

    await expect(controller.getReadiness()).rejects.toThrow(ServiceUnavailableException);
  });
});
