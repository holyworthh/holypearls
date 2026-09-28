import { REQUEST_ID_HEADER } from "@holypearls/contracts";
import { newId } from "@holypearls/db";
import type { NextFunction, Request, Response } from "express";
import type { Logger } from "pino";

// Accept an ID from the web server so one ID follows the request end to end (TECH-07 §10).
const INCOMING_ID = /^[A-Za-z0-9_-]{8,64}$/;

export const newRequestId = () => `req_${newId().replaceAll("-", "")}`;

/** Sets the request ID, returns it in a header and writes one JSON log line per request. */
export function requestContext(logger: Logger) {
  return (request: Request, response: Response, next: NextFunction) => {
    const incoming = request.header(REQUEST_ID_HEADER);
    const requestId = incoming && INCOMING_ID.test(incoming) ? incoming : newRequestId();
    request.requestId = requestId;
    response.setHeader(REQUEST_ID_HEADER, requestId);

    const started = process.hrtime.bigint();
    response.on("finish", () => {
      logger.info(
        {
          requestId,
          method: request.method,
          route: request.route?.path ?? request.path,
          status: response.statusCode,
          durationMs: Number((process.hrtime.bigint() - started) / 1_000_000n),
        },
        "request",
      );
    });
    next();
  };
}
