import { z } from "zod";

/**
 * Every API error code, its HTTP status and the copy the web app shows
 * (TECH-02 §2). Adding a code means adding its screen copy here.
 */
export const ERROR_CODES = {
  VALIDATION_FAILED: { status: 400, message: "Check the highlighted fields and try again." },
  NOT_SIGNED_IN: { status: 401, message: "Sign in to continue." },
  FORBIDDEN: { status: 403, message: "You don't have permission to do this." },
  NOT_FOUND: { status: 404, message: "We couldn't find what you were looking for." },
  CONFLICT: { status: 409, message: "This changed while you were working. Refresh and try again." },
  RULE_FAILED: { status: 422, message: "This can't be done right now." },
  RATE_LIMITED: { status: 429, message: "Too many attempts. Wait a moment and try again." },
  INTERNAL: { status: 500, message: "Something went wrong on our side. Try again shortly." },
} as const satisfies Record<string, { status: number; message: string }>;

export type ErrorCode = keyof typeof ERROR_CODES;

export const errorCodeSchema = z.enum(Object.keys(ERROR_CODES) as [ErrorCode, ...ErrorCode[]]);

/** The one error shape every endpoint returns. */
export const apiErrorSchema = z.object({
  code: errorCodeSchema,
  message: z.string(),
  fieldErrors: z.record(z.string(), z.string()).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  requestId: z.string(),
});

export type ApiErrorBody = z.infer<typeof apiErrorSchema>;

export const REQUEST_ID_HEADER = "x-request-id";

/** Flattens Zod issues into `{ "a.b": "message" }`, keeping the first message per field. */
export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "_";
    fieldErrors[key] ??= issue.message;
  }
  return fieldErrors;
}
