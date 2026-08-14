import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import type { ApiError } from '@tracegraph/shared';
import { DatabaseError, DatabaseErrorKind, databaseErrorMessage } from '../../database';

/**
 * Centralized exception filter.
 *
 * Guarantees:
 * - Consistent error shape: { statusCode, message, code, timestamp, path }
 * - HttpExceptions keep their intended status/message (e.g. validation errors).
 * - Database errors are translated by kind into safe, generic user-facing
 *   messages — credentials, connection strings, operation names, driver
 *   messages, and stack traces are never exposed to clients. Full details are
 *   logged server-side by the database layer.
 * - Unexpected errors are logged in full server-side and returned as a generic
 *   500 with no internal detail.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<{ method: string; url: string }>();

    const { statusCode, code, message } = this.resolve(exception);

    const body: ApiError = {
      statusCode,
      code,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(statusCode).json(body);
  }

  private resolve(exception: unknown): {
    statusCode: number;
    code: string;
    message: string | string[];
  } {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const response = exception.getResponse();
      const message =
        typeof response === 'string'
          ? response
          : ((response as { message?: string | string[] }).message ?? exception.message);
      // An HttpException body may carry an explicit code (e.g. AI_DISABLED)
      // for domain-specific failure classes; otherwise derive it from status.
      const body = typeof response === 'object' ? (response as { code?: unknown }) : null;
      const code =
        body && typeof body.code === 'string' && body.code.length > 0
          ? body.code
          : statusCodeToCode(statusCode);
      return { statusCode, code, message };
    }

    if (exception instanceof DatabaseError) {
      return resolveDatabaseError(exception);
    }

    // Unexpected error: log everything server-side, return nothing sensitive.
    this.logger.error(
      exception instanceof Error ? (exception.stack ?? exception.message) : String(exception),
    );
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
    };
  }
}

/** Maps the internal error taxonomy to HTTP semantics + safe messages. */
function resolveDatabaseError(exception: DatabaseError): {
  statusCode: number;
  code: string;
  message: string;
} {
  switch (exception.kind) {
    case DatabaseErrorKind.CONNECTION:
      return {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        code: 'DATABASE_UNAVAILABLE',
        message: databaseErrorMessage(DatabaseErrorKind.CONNECTION),
      };
    case DatabaseErrorKind.TIMEOUT:
      return {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        code: 'DATABASE_TIMEOUT',
        message: databaseErrorMessage(DatabaseErrorKind.TIMEOUT),
      };
    case DatabaseErrorKind.CONFIGURATION:
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        code: 'DATABASE_CONFIGURATION',
        message: databaseErrorMessage(DatabaseErrorKind.CONFIGURATION),
      };
    case DatabaseErrorKind.QUERY:
    case DatabaseErrorKind.TRANSACTION:
    default:
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        code: 'QUERY_FAILED',
        message: databaseErrorMessage(exception.kind),
      };
  }
}

function statusCodeToCode(statusCode: number): string {
  switch (statusCode) {
    case HttpStatus.BAD_REQUEST:
      return 'VALIDATION_ERROR';
    case HttpStatus.UNAUTHORIZED:
      return 'UNAUTHORIZED';
    case HttpStatus.FORBIDDEN:
      return 'FORBIDDEN';
    case HttpStatus.NOT_FOUND:
      return 'NOT_FOUND';
    case HttpStatus.CONFLICT:
      return 'CONFLICT';
    case HttpStatus.SERVICE_UNAVAILABLE:
      return 'SERVICE_UNAVAILABLE';
    case HttpStatus.BAD_GATEWAY:
      return 'BAD_GATEWAY';
    default:
      return 'HTTP_ERROR';
  }
}
