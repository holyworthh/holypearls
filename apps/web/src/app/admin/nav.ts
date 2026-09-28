import type { StaffPermission } from "@holypearls/contracts";

export interface AdminSection {
  slug: string;
  label: string;
  /** Any one of these permissions shows the section (TECH-03 §8). */
  anyOf: readonly StaffPermission[];
  /** The ticket that builds it. */
  ticket: string;
}

/** Sidebar groups from Pen HP/Admin/Sidebar (frame 94). */
export const ADMIN_GROUPS: readonly { label?: string; sections: readonly AdminSection[] }[] = [
  {
    label: "REQUESTS",
    sections: [
      { slug: "projects", label: "Projects", anyOf: ["QUOTE_MANAGE", "CUSTOMER_SUPPORT"], ticket: "T05-03" },
      { slug: "quotes", label: "Quotes", anyOf: ["QUOTE_MANAGE"], ticket: "T05-03" },
      { slug: "help", label: "Help inbox", anyOf: ["CUSTOMER_SUPPORT"], ticket: "T01-02" },
      { slug: "problems", label: "Problem reports", anyOf: ["CUSTOMER_SUPPORT"], ticket: "T08-01" },
    ],
  },
  {
    label: "ORDERS",
    sections: [
      { slug: "proofs", label: "Proofs & artwork", anyOf: ["PROOF_MANAGE"], ticket: "T06-01" },
      { slug: "production", label: "Production", anyOf: ["PRODUCTION_MANAGE"], ticket: "T07-01" },
      { slug: "shipments", label: "Shipments", anyOf: ["FULFILMENT_MANAGE"], ticket: "T08-01" },
    ],
  },
  {
    label: "MONEY",
    sections: [
      { slug: "payments", label: "Payments", anyOf: ["PAYMENT_VIEW", "PAYMENT_MANAGE"], ticket: "T04-05" },
      { slug: "refunds", label: "Refunds", anyOf: ["REFUND_ISSUE"], ticket: "T13-05" },
    ],
  },
  {
    label: "CATALOGUE",
    sections: [
      { slug: "products", label: "Products", anyOf: ["CATALOGUE_MANAGE"], ticket: "T02-01" },
      { slug: "rules", label: "Rules & prices", anyOf: ["PRICING_MANAGE"], ticket: "T03-01" },
      { slug: "content", label: "Content", anyOf: ["CONTENT_MANAGE"], ticket: "T02-06" },
      { slug: "delivery", label: "Delivery & installation", anyOf: ["PRICING_MANAGE"], ticket: "T13-01" },
    ],
  },
  {
    label: "SYSTEM",
    sections: [
      { slug: "staff", label: "Staff", anyOf: ["STAFF_ADMIN"], ticket: "T13-05" },
      { slug: "audit", label: "Audit log", anyOf: ["AUDIT_VIEW"], ticket: "T01-01" },
      { slug: "notifications", label: "Notifications", anyOf: ["CUSTOMER_SUPPORT"], ticket: "T01-02" },
      { slug: "exports", label: "Exports", anyOf: ["EXPORT_PERSONAL_DATA"], ticket: "T13-03" },
      { slug: "privacy", label: "Privacy requests", anyOf: ["EXPORT_PERSONAL_DATA"], ticket: "T15-03" },
      { slug: "incidents", label: "Incident switches", anyOf: ["SECURITY_ADMIN"], ticket: "T15-05" },
    ],
  },
];

export const findSection = (slug: string) =>
  ADMIN_GROUPS.flatMap((group) => group.sections).find((section) => section.slug === slug);

export const canSee = (section: AdminSection, permissions: readonly StaffPermission[]) =>
  section.anyOf.some((permission) => permissions.includes(permission));

const ROLE_NAMES: Partial<Record<StaffPermission, string>> = {
  STAFF_ADMIN: "Staff admin",
  SECURITY_ADMIN: "Security",
  PAYMENT_MANAGE: "Finance",
  REFUND_ISSUE: "Finance",
  QUOTE_MANAGE: "Sales",
  PROOF_MANAGE: "Artwork",
  PRODUCTION_MANAGE: "Production",
  FULFILMENT_MANAGE: "Fulfilment",
  CATALOGUE_MANAGE: "Catalogue",
  CONTENT_MANAGE: "Content",
  CUSTOMER_SUPPORT: "Support",
};

/** A short role line such as "Staff admin · Security" (PRD-06 §2 roles). */
export function roleLine(permissions: readonly StaffPermission[]): string {
  const roles = [...new Set(permissions.flatMap((permission) => ROLE_NAMES[permission] ?? []))];
  return roles.slice(0, 2).join(" · ") || "Staff";
}

export function mfaLabel(verifiedAt: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(verifiedAt)) / 60_000));
  if (minutes < 1) return "MFA verified · just now";
  if (minutes < 60) return `MFA verified · ${minutes} min ago`;
  return `MFA verified · ${Math.round(minutes / 60)} h ago`;
}
