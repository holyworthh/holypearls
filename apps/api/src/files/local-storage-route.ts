import { ERROR_CODES } from "@holypearls/contracts";
import type { LocalDiskStorage } from "@holypearls/storage";
import type { NextFunction, Request, Response } from "express";

const PREFIX = "/v1/local-storage/";

/**
 * Stands in for R2's presigned URLs when files are kept on the local disk
 * (development and tests). Each URL is HMAC-signed for one object and one
 * operation, expires, and a PUT can't exceed the size that was signed.
 */
export function localStorageRoute(storage: LocalDiskStorage) {
  return async (request: Request, response: Response, next: NextFunction) => {
    if (!request.path.startsWith(PREFIX)) return next();
    const requestId = request.requestId ?? "unknown";
    const fail = (status: 403 | 413, code: "FORBIDDEN" | "VALIDATION_FAILED") =>
      response.status(status).json({ code, message: ERROR_CODES[code].message, requestId });
    const grant = storage.verify(request.path.slice(PREFIX.length));
    // Signed for the other store (private or public media), forged or expired: the next route decides.
    if (!grant) return next();

    if (grant.op === "get" && request.method === "GET") {
      const body = await storage.read(grant.key).catch(() => null);
      if (!body) return fail(403, "FORBIDDEN");
      if (grant.fileName) response.setHeader("content-disposition", `attachment; filename="${grant.fileName.replace(/[^\w.-]/g, "_")}"`);
      response.setHeader("cache-control", "private, no-store");
      response.send(body);
      return;
    }
    if (grant.op === "put" && request.method === "PUT") {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of request) {
        size += (chunk as Buffer).length;
        // Like a signed Content-Length: nothing bigger than what was signed is accepted.
        if (size > (grant.maxBytes ?? 0)) return fail(413, "VALIDATION_FAILED");
        chunks.push(chunk as Buffer);
      }
      await storage.write(grant.key, Buffer.concat(chunks), grant.contentType ?? "application/octet-stream");
      response.status(200).end();
      return;
    }
    return fail(403, "FORBIDDEN");
  };
}

/** After every store has looked: a token none of them signed is refused. */
export function localStorageRefused(request: Request, response: Response, next: NextFunction) {
  if (!request.path.startsWith(PREFIX)) return next();
  response.status(403).json({ code: "FORBIDDEN", message: ERROR_CODES.FORBIDDEN.message, requestId: request.requestId ?? "unknown" });
}
