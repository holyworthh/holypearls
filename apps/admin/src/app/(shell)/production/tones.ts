import type { StatusTone } from "@holypearls/ui";

/** Item and order chips: the status name is always the text (colour is never the only signal). */
export const ITEM_TONE: Record<string, StatusTone> = {
  AWAITING_PREREQUISITE: "neutral",
  QUEUED: "neutral",
  IN_PRODUCTION: "info",
  QUALITY_CHECK: "info",
  READY_AWAITING_RELEASE: "warning",
  READY_TO_DISPATCH: "success",
  DISPATCHED: "success",
  DELIVERED: "success",
  CANCELLED: "neutral",
  ON_HOLD: "error",
  CONFIRMED: "neutral",
  PARTIALLY_READY: "info",
  BALANCE_REQUIRED: "warning",
  PARTIALLY_DISPATCHED: "info",
  PARTIALLY_DELIVERED: "info",
};

export const GROUP_LABEL = {
  WAITING: "Waiting for prerequisite",
  QUEUED: "Queued",
  IN_PRODUCTION: "In production",
  QUALITY_CHECK: "Quality check",
  READY: "Ready",
  ON_HOLD: "On hold",
} as const;
