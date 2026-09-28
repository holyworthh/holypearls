import type { z } from "zod";
import { apiErrorSchema, ERROR_CODES, REQUEST_ID_HEADER, type ApiErrorBody } from "./errors.js";

/** Thrown by the API client for every non-2xx response. */
export class ApiError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }

  get code() {
    return this.body.code;
  }
}

export interface ApiRequest<T extends z.ZodType> {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  response: T;
  signal?: AbortSignal;
  /** Extra headers, for example Idempotency-Key (TECH-02 §4). */
  headers?: Record<string, string>;
}

export interface ApiClientOptions {
  /** Same-domain prefix the web app forwards to the API. */
  baseUrl?: string;
  fetch?: typeof fetch;
}

/**
 * Typed client for the web app. Responses are parsed with the contract schema,
 * so the web app never uses an unchecked shape (TECH-02 §2, §12).
 */
export function createApiClient(options: ApiClientOptions = {}) {
  const baseUrl = options.baseUrl ?? "/api";
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);

  return async function request<T extends z.ZodType>(path: string, init: ApiRequest<T>): Promise<z.output<T>> {
    const headers: Record<string, string> = { accept: "application/json", ...init.headers };
    if (init.body !== undefined) headers["content-type"] = "application/json";

    const response = await doFetch(`${baseUrl}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: "same-origin",
      signal: init.signal,
    });
    const payload: unknown = await response.json().catch(() => undefined);

    if (!response.ok) {
      const parsed = apiErrorSchema.safeParse(payload);
      throw new ApiError(
        response.status,
        parsed.success
          ? parsed.data
          : {
              code: "INTERNAL",
              message: ERROR_CODES.INTERNAL.message,
              requestId: response.headers.get(REQUEST_ID_HEADER) ?? "unknown",
            },
      );
    }
    return init.response.parse(payload);
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
