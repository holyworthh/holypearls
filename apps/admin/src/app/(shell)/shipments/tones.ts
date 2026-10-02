import type { StatusTone } from "@holypearls/ui";

/** Shipment chips: the status name is always the text. */
export const SHIPMENT_TONE: Record<string, StatusTone> = {
  PREPARING: "neutral",
  LABEL_CREATED: "neutral",
  IN_TRANSIT: "info",
  OUT_FOR_DELIVERY: "info",
  ATTEMPTED_DELIVERY: "warning",
  EXCEPTION: "error",
  DELIVERED: "success",
  RETURNED: "neutral",
};
