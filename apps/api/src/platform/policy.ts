import { AppError } from "../errors.js";

/**
 * A policy's answer (TECH-03 §12). `hide` becomes 404 when the person must
 * not learn the record exists (another customer's or organization's record);
 * `deny` becomes 403 when they can see it but not do this.
 */
export type Decision =
  | { outcome: "allow" }
  | { outcome: "deny"; reason: string; context?: Record<string, unknown> }
  | { outcome: "hide" };

export const allow = (): Decision => ({ outcome: "allow" });
export const deny = (reason: string, context?: Record<string, unknown>): Decision => ({ outcome: "deny", reason, context });
export const hide = (): Decision => ({ outcome: "hide" });

/** Turns a policy decision into the right error. Controllers call this; they never write permission ifs. */
export function enforce(decision: Decision): void {
  if (decision.outcome === "allow") return;
  if (decision.outcome === "hide") throw new AppError("NOT_FOUND");
  throw new AppError("FORBIDDEN", { context: { reason: decision.reason, ...decision.context } });
}

/** Loads a record for the actor or hides it: missing and not-yours look the same (404). */
export async function findOrHide<T>(load: () => Promise<T | null | undefined>): Promise<T> {
  const record = await load();
  if (!record) throw new AppError("NOT_FOUND");
  return record;
}
