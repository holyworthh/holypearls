import { loadAdminEnv } from "@holypearls/config";
import { createServerApi } from "@holypearls/web-kit/server-api";
import { ADMIN_IDENTITY } from "./visitor";

export { SESSION_COOKIE_NAMES, type ServerApiResult } from "@holypearls/web-kit/server-api";

const env = loadAdminEnv();

/** Calls the API from a server-rendered admin page as the signed-in staff member. */
export const { serverApi, hasSessionCookie } = createServerApi({ apiUrl: env.API_URL, identity: ADMIN_IDENTITY });
