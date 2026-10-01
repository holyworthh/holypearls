import { ApiError, createApiClient } from "@holypearls/contracts";

/** Browser-side API client. Calls go to /api/* on this domain (next.config.mjs forwards them). */
export const api = createApiClient({ baseUrl: "/api" });

/** The error code of a failed call, or null for network and other errors. */
export const errorCode = (error: unknown) => (error instanceof ApiError ? error.code : null);
export const errorReason = (error: unknown) =>
  error instanceof ApiError ? ((error.body.context?.reason as string | undefined) ?? null) : null;

/** Only same-site paths are followed after sign-in. */
export function safeNext(next: string | null | undefined, fallback: string): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

/** One key per button press, reused if the same press is retried (TECH-02 §4). */
export const newIdempotencyKey = () => `web_${crypto.randomUUID().replaceAll("-", "")}`;
