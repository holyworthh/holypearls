import { loadWebEnv } from "@holypearls/config";
import { createServerApi } from "@holypearls/web-kit/server-api";
import { WEB_IDENTITY } from "./visitor";

export { SESSION_COOKIE_NAMES, type ServerApiResult } from "@holypearls/web-kit/server-api";

const env = loadWebEnv();

/** Calls the API from a server-rendered customer page as the signed-in visitor. */
export const { serverApi, hasSessionCookie } = createServerApi({ apiUrl: env.API_URL, identity: WEB_IDENTITY });
