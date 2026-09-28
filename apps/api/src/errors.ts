import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
} from "@nestjs/common";
import { type ApiErrorBody, ERROR_CODES, type ErrorCode } from "@holypearls/contracts";
import type { Request, Response } from "express";
import type { Logger } from "pino";
import { reportError } from "./monitoring.js";
import { LOGGER } from "./tokens.js";

/** Throw this from services and controllers; the filter turns it into the error shape. */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    options: { message?: string; fieldErrors?: Record<string, string>; context?: Record<string, unknown> } = {},
  ) {
    super(options.message ?? ERROR_CODES[code].message);
    this.name = "AppError";
    this.fieldErrors = options.fieldErrors;
    this.context = options.context;
  }

  readonly fieldErrors?: Record<string, string>;
  readonly context?: Record<string, unknown>;
}

const STATUS_TO_CODE: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: "VALIDATION_FAILED",
  [HttpStatus.UNAUTHORIZED]: "NOT_SIGNED_IN",
  [HttpStatus.FORBIDDEN]: "FORBIDDEN",
  [HttpStatus.NOT_FOUND]: "NOT_FOUND",
  [HttpStatus.METHOD_NOT_ALLOWED]: "NOT_FOUND",
  [HttpStatus.CONFLICT]: "CONFLICT",
  [HttpStatus.PAYLOAD_TOO_LARGE]: "VALIDATION_FAILED",
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: "VALIDATION_FAILED",
  [HttpStatus.UNPROCESSABLE_ENTITY]: "RULE_FAILED",
  [HttpStatus.TOO_MANY_REQUESTS]: "RATE_LIMITED",
};

/**
 * Turns every thrown error into the one error shape (TECH-02 §2). Unknown
 * errors become INTERNAL with no details, and are logged with the request ID.
 */
@Catch()
export class ErrorShapeFilter implements ExceptionFilter {
  constructor(@Inject(LOGGER) private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const requestId = request.requestId ?? "unknown";

    let code: ErrorCode = "INTERNAL";
    let body: ApiErrorBody;

    if (exception instanceof AppError) {
      code = exception.code;
      body = {
        code,
        message: exception.message,
        ...(exception.fieldErrors && { fieldErrors: exception.fieldErrors }),
        ...(exception.context && { context: exception.context }),
        requestId,
      };
    } else if (exception instanceof HttpException && STATUS_TO_CODE[exception.getStatus()]) {
      code = STATUS_TO_CODE[exception.getStatus()]!;
      body = { code, message: ERROR_CODES[code].message, requestId };
    } else {
      body = { code, message: ERROR_CODES.INTERNAL.message, requestId };
    }

    const status = ERROR_CODES[code].status;
    if (status >= 500) {
      this.logger.error({ requestId, route: request.originalUrl, err: exception }, "request failed");
      reportError(exception, { requestId, route: request.route?.path ?? request.path });
    }
    response.status(status).json(body);
  }
}
