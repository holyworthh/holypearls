import { createApiClient } from "@holypearls/contracts";

/** Browser-side API client. Calls go to /api/* on this domain (next.config.mjs forwards them). */
export const api = createApiClient({ baseUrl: "/api" });
