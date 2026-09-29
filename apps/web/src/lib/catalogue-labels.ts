/** Labels for the directory's filter values (Pen 17 rail), shared by the storefront and admin. */
export const ROUTE_LABELS = {
  SOURCE_CUSTOMIZE: "Source & Customize",
  MAKE_FROM_SCRATCH: "Make From Scratch",
  CUSTOMER_SUPPLIED: "Customer Supplied",
} as const;

export const DECORATION_LABELS = {
  EMBROIDERY: "Embroidery",
  SCREEN_PRINT: "Screen print",
  HEAT_TRANSFER: "Heat transfer",
  PAPER_PRINT: "Paper print",
  LARGE_FORMAT_PRINT: "Large-format print",
} as const;

export const PRICE_LABELS = {
  PRICE_READY: "Price ready",
  ESTIMATE_READY: "Estimate ready",
  QUOTE_REQUIRED: "Quote required",
} as const;

export const QUANTITY_LABELS = { "1-9": "1–9", "10-49": "10–49", "50+": "50+" } as const;
