import type { ArgumentsHost} from '@nestjs/common';
import { BadRequestException, HttpStatus } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';

import { AllExceptionsFilter } from './all-exceptions.filter';

function createHost(request: object) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const response = { status };

  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;

  return { host, status, json };
}

describe('AllExceptionsFilter', () => {
  const logger = { error: jest.fn(), warn: jest.fn() } as unknown as PinoLogger;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('formats a known HttpException with its status and message', () => {
    const filter = new AllExceptionsFilter(logger);
    const { host, status, json } = createHost({ id: 'req-1' });

    filter.catch(new BadRequestException('email is required'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith({
      error: {
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'email is required',
        code: 'BadRequestException',
        requestId: 'req-1',
        details: undefined,
      },
    });
  });

  it('hides internal details for unrecognized errors and logs them', () => {
    const filter = new AllExceptionsFilter(logger);
    const { host, status, json } = createHost({ id: 'req-2' });

    filter.catch(new Error('database connection string is postgres://secret'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith({
      error: {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
        code: 'InternalServerError',
        requestId: 'req-2',
      },
    });
    expect(logger.error).toHaveBeenCalled();
  });
});
