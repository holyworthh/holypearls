export const FAMILY_LABELS: Record<string, string> = {
  GARMENT: "Garments",
  APPAREL_PRINT: "Apparel printing",
  EMBROIDERY: "Embroidery",
  PAPER_PRINT: "Print",
  LARGE_FORMAT: "Large format",
  PACKAGING: "Packaging",
  STICKER_LABEL: "Stickers & labels",
  PROMOTIONAL_ITEM: "Promotional",
  WALL_ART: "Wall art",
  CUSTOM_PROJECT: "Custom project",
};

export const MODE_LABELS: Record<string, string> = {
  SIMPLE_CONFIGURABLE: "Simple configurable",
  CONFIGURABLE_QUOTE: "Configurable quote",
  CONSULTATIVE_PROJECT: "Consultative project",
};

export const STATUS_TONE = { DRAFT: "neutral", PUBLISHED: "success", TEMPORARILY_UNAVAILABLE: "warning", ARCHIVED: "neutral" } as const;
