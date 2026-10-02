/** Chip tones for quote statuses (Pen 111, 124B). */
export const QUOTE_TONE: Record<string, "info" | "warning" | "success" | "neutral" | "error"> = {
  PENDING_REVIEW: "info",
  REVISION_REQUESTED: "warning",
  READY: "success",
  ACCEPTED: "success",
  DECLINED: "neutral",
  EXPIRED: "warning",
};
