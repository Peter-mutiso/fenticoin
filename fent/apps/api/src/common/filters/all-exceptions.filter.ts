import type { ArgumentsHost, ExceptionFilter} from '@nestjs/common';
import { Catch, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { PinoLogger } from 'nestjs-pino';
import { InjectPinoLogger } from 'nestjs-pino';

interface ErrorResponseBody {
  error: {
    statusCode: number;
    message: string;
    code: string;
    requestId?: string;
    details?: unknown;
  };
}

/**
 * Catches everything that escapes controllers/services and turns it into a
 * consistent JSON shape. In production, unrecognized (non-HttpException)
 * errors never leak internal messages/stack traces to the client — only a
 * generic message plus the request id needed to find it in the logs.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(@InjectPinoLogger(AllExceptionsFilter.name) private readonly logger: PinoLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string }>();
    const requestId = request.id;

    const isHttpException = exception instanceof HttpException;
    const statusCode = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const body: ErrorResponseBody = isHttpException
      ? {
          error: {
            statusCode,
            message: extractMessage(exception.getResponse()),
            code: exception.constructor.name,
            requestId,
            details: extractDetails(exception.getResponse()),
          },
        }
      : {
          error: {
            statusCode,
            message: 'Internal server error',
            code: 'InternalServerError',
            requestId,
          },
        };

    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error({ err: exception, requestId }, 'Unhandled exception');
    } else {
      this.logger.warn({ err: exception, requestId }, 'Request failed');
    }

    response.status(statusCode).json(body);
  }
}

function extractMessage(res: unknown): string {
  if (typeof res === 'string') return res;
  if (res && typeof res === 'object' && 'message' in res) {
    const { message } = res as { message: unknown };
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.join(', ');
  }
  return 'Request failed';
}

// Nest's default HttpException response shape is `{ statusCode, message, error }`
// (e.g. `{ statusCode: 400, message: 'email is required', error: 'Bad Request' }`).
// Those three are already surfaced as `statusCode`/`message`/`code` on the
// outer body, so they don't count as extra "details" — only genuinely
// custom fields (e.g. a validation-error array under a different key) do.
const STANDARD_HTTP_EXCEPTION_KEYS = new Set(['statusCode', 'message', 'error']);

function extractDetails(res: unknown): unknown {
  if (!res || typeof res !== 'object') return undefined;

  const rest = Object.fromEntries(
    Object.entries(res).filter(([key]) => !STANDARD_HTTP_EXCEPTION_KEYS.has(key)),
  );

  return Object.keys(rest).length > 0 ? rest : undefined;
}
