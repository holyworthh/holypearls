import type { HelpDeps } from "./platform/help-requests.js";

/** Injection tokens. Explicit tokens, because tests run without decorator metadata. */
export const LOGGER = Symbol("LOGGER");
export const DATABASE = Symbol("DATABASE");

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId?: string;
      /** The visitor's address, as trusted by clientIpFrom (review P1-08). */
      clientIp?: string;
      /** Which front end the request came through: the customer site or the admin (ADR-017). */
      surface?: "web" | "admin";
      /** True when the API serves two front ends (ADMIN_ORIGIN set). */
      frontEndsSeparated?: boolean;
    }
  }
}

export const IDENTITY = Symbol("IDENTITY");
export const JOBS = Symbol("JOBS");

/** Database, jobs, sealing key, web origin and help inbox address, for notification-sending modules. */
export const HELP_DEPS = Symbol("HELP_DEPS");
export type HelpDepsToken = HelpDeps;

/** Database, jobs, the payment provider and the web origin, for payments (T04-03). */
export const PAYMENT_DEPS = Symbol("PAYMENT_DEPS");

/** Database, jobs and the private and public-media storage, for the files module. */
export const FILE_DEPS = Symbol("FILE_DEPS");
