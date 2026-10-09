import type { AssetVersionStatus } from "@holypearls/contracts";
import type { StatusTone } from "@holypearls/ui";

/** Status chips on the Team page (frame 70): members and invitations share one column. */
export const MEMBER_STATUS: Record<"ACTIVE" | "DEACTIVATED", { label: string; tone: StatusTone }> = {
  ACTIVE: { label: "ACTIVE", tone: "success" },
  DEACTIVATED: { label: "DEACTIVATED", tone: "neutral" },
};

export const INVITE_STATUS: Record<"PENDING" | "EXPIRED" | "ACCEPTED" | "REVOKED", { label: string; tone: StatusTone }> = {
  PENDING: { label: "INVITE PENDING", tone: "info" },
  EXPIRED: { label: "INVITE EXPIRED", tone: "warning" },
  ACCEPTED: { label: "ACCEPTED", tone: "success" },
  REVOKED: { label: "REVOKED", tone: "neutral" },
};

export const reach = (entry: { allLocations: boolean; locations: readonly { name: string }[] }) =>
  entry.allLocations ? "All locations" : entry.locations.map((location) => location.name).join(", ");

/** Plain words for the API's refusal reasons (TECH-03 §9; B2B-FR-091–093). */
export const REFUSAL: Record<string, string> = {
  LAST_OWNER: "This is the only Owner. Make someone else an Owner first.",
  OWNER_REQUIRED: "Only an Owner can do this.",
  OWNER_REQUIRED_TO_ADJUST: "Only an Owner can change a role's permissions.",
  CANNOT_GRANT_WHAT_YOU_DONT_HOLD: "You can't give someone a permission you don't have yourself.",
  CANNOT_GRANT_ALL_LOCATIONS: "Only someone with All locations can give All locations.",
  OUTSIDE_YOUR_LOCATIONS: "This reaches locations you don't manage.",
  ALL_LOCATIONS_REQUIRED: "Only someone with All locations can add or rename locations.",
  PERMISSION_REQUIRED: "You don't have permission to do this.",
  SELF: "You can't do this to yourself. Ask another Owner or Admin.",
  ALREADY_MEMBER: "This person is already in the team.",
  ALREADY_INVITED: "This person already has an invitation waiting. Revoke it to send a new one.",
  MEMBER_DEACTIVATED: "Reactivate this member first.",
  ALREADY_OWNER: "This member is already an Owner.",
  NOT_PENDING: "This invitation is no longer waiting.",
};

/** Brand asset version chips (frames 65, 66, 116). */
export const VERSION_STATUS: Record<AssetVersionStatus, { label: string; tone: StatusTone }> = {
  PROCESSING: { label: "PROCESSING", tone: "neutral" },
  NEEDS_REVIEW: { label: "NEEDS REVIEW", tone: "warning" },
  PRODUCTION_READY: { label: "PRODUCTION READY", tone: "success" },
  SUPERSEDED: { label: "SUPERSEDED", tone: "neutral" },
  RETIRED: { label: "RETIRED", tone: "error" },
  ARCHIVED: { label: "ARCHIVED", tone: "neutral" },
};

/** Template chips (frames 29, 67, 68, 117). */
export const TEMPLATE_STATUS: Record<"DRAFT" | "AWAITING_APPROVAL" | "APPROVED" | "NEEDS_REVIEW" | "ARCHIVED", { label: string; tone: StatusTone }> = {
  DRAFT: { label: "DRAFT", tone: "neutral" },
  AWAITING_APPROVAL: { label: "AWAITING HOLYPEARLS CHECK", tone: "info" },
  APPROVED: { label: "APPROVED", tone: "success" },
  NEEDS_REVIEW: { label: "BLOCKED · NEEDS REVIEW", tone: "warning" },
  ARCHIVED: { label: "ARCHIVED", tone: "neutral" },
};
