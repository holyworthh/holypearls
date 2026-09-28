import { loadWebEnv } from "@holypearls/config";
import { apiErrorSchema, type ApiErrorBody, REQUEST_ID_HEADER } from "@holypearls/contracts";
import { cookies, headers } from "next/headers";
import type { z } from "zod";

const env = loadWebEnv();

export type ServerApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: ApiErrorBody };

export const SESSION_COOKIE_NAMES = ["hp.session_token", "__Secure-hp.session_token"];

export async function hasSessionCookie(): Promise<boolean> {
  const jar = await cookies();
  return SESSION_COOKIE_NAMES.some((name) => jar.has(name));
}

/**
 * Calls the API from a server-rendered page as the signed-in visitor: the
 * visitor's cookies and a request ID go with it (TECH-03 §3, TECH-07 §10).
 */
export async function serverApi<T extends z.ZodType>(path: string, schema: T): Promise<ServerApiResult<z.output<T>>> {
  const jar = await cookies();
  const incoming = await headers();
  const requestId = incoming.get(REQUEST_ID_HEADER) ?? `req_web_${crypto.randomUUID().replaceAll("-", "")}`;
  const response = await fetch(`${env.API_URL}${path}`, {
    headers: { accept: "application/json", cookie: jar.toString(), [REQUEST_ID_HEADER]: requestId },
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
