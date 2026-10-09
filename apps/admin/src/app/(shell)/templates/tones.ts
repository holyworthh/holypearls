import type { TemplateStatus } from "@holypearls/contracts";
import type { StatusTone } from "@holypearls/ui";

export const TEMPLATE_TONE: Record<TemplateStatus, StatusTone> = { DRAFT: "neutral", AWAITING_APPROVAL: "info", APPROVED: "success", NEEDS_REVIEW: "warning", ARCHIVED: "neutral" };
