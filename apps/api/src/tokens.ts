/** Injection tokens. Explicit tokens, because tests run without decorator metadata. */
export const LOGGER = Symbol("LOGGER");
export const DATABASE = Symbol("DATABASE");

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

export const IDENTITY = Symbol("IDENTITY");
export const JOBS = Symbol("JOBS");
