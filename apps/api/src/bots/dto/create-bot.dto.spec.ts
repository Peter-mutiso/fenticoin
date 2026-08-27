import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import { ALLOWED_EXECUTION_INTERVAL_SECONDS } from '../execution-interval';
import { CreateBotDto } from './create-bot.dto';

/**
 * `CreateBotDto` is the server-side boundary that must reject any interval
 * outside the canonical list — the frontend dropdown is only a UX
 * convenience, never trusted (matching this codebase's `PlaceBetDto`
 * convention). This exercises `class-validator` for real, the same
 * pipeline `ValidationPipe` runs in production.
 */
describe('CreateBotDto — executionIntervalSeconds', () => {
  function dtoWith(executionIntervalSeconds: unknown) {
    return plainToInstance(CreateBotDto, {
      name: 'My bot',
      strategyKey: 'dca_recurring',
      config: {},
      executionIntervalSeconds,
    });
  }

  it.each(ALLOWED_EXECUTION_INTERVAL_SECONDS)('accepts the supported interval %s seconds', async (seconds) => {
    const errors = await validate(dtoWith(seconds));
    expect(errors).toHaveLength(0);
  });

  it.each([0, 1, 3, 20, 90, 3601, -5, 7200])('rejects the unsupported interval %s seconds', async (seconds) => {
    const errors = await validate(dtoWith(seconds));
    expect(errors.some((error) => error.property === 'executionIntervalSeconds')).toBe(true);
  });

  it('rejects a missing interval', async () => {
    const errors = await validate(dtoWith(undefined));
    expect(errors.some((error) => error.property === 'executionIntervalSeconds')).toBe(true);
  });
});
