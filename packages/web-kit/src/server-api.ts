import { apiErrorSchema, type ApiErrorBody, REQUEST_ID_HEADER } from "@holypearls/contracts";
import { cookies, headers } from "next/headers";
import type { z } from "zod";
import { type ProxyIdentity, visitorHeaders } from "./visitor";

export type ServerApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: ApiErrorBody };

export const SESSION_COOKIE_NAMES = ["hp.session_token", "__Secure-hp.session_token"];

/**
 * Server-side API calls for one front end. Each call carries the visitor's
 * cookies, a request ID (TECH-03 §3, TECH-07 §10) and the front end's proxy
 * headers (ADR-017).
 */
export function createServerApi(options: { apiUrl: string; identity: ProxyIdentity }) {
  async function hasSessionCookie(): Promise<boolean> {
    const jar = await cookies();
    return SESSION_COOKIE_NAMES.some((name) => jar.has(name));
  }

  async function serverApi<T extends z.ZodType>(path: string, schema: T): Promise<ServerApiResult<z.output<T>>> {
    const jar = await cookies();
    const incoming = await headers();
    const requestId = incoming.get(REQUEST_ID_HEADER) ?? `req_${options.identity.surface}_${crypto.randomUUID().replaceAll("-", "")}`;
    const response = await fetch(`${options.apiUrl}${path}`, {
      headers: { accept: "application/json", cookie: jar.toString(), [REQUEST_ID_HEADER]: requestId, ...visitorHeaders(incoming, options.identity) },
      cache: "no-store",
    });
    const payload: unknown = await response.json().catch(() => undefined);
    if (response.ok) return { ok: true, data: schema.parse(payload) };
    const parsed = apiErrorSchema.safeParse(payload);
    return {
      ok: false,
      status: response.status,
      error: parsed.success ? parsed.data : { code: "INTERNAL", message: "Something went wrong.", requestId },
    };
  }

  return { serverApi, hasSessionCookie };
}
