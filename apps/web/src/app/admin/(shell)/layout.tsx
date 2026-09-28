import { StaffAdminShell } from "@holypearls/ui";
import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { ADMIN_GROUPS, canSee, mfaLabel, roleLine } from "../nav";
import { requireAdmin } from "./admin-session";

// Metadata waits for the access check, so non-staff never see an "Admin" title (TECH-03 §12).
export async function generateMetadata(): Promise<Metadata> {
  await requireAdmin();
  return { title: "Admin", robots: { index: false, follow: false } };
}
export const dynamic = "force-dynamic";

/** Protected /admin shell (Pen frame 94 · s3rfoi). */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin();
  const path = (await headers()).get("x-hp-pathname") ?? "/admin";
  const current = path.split("/")[2] ?? "";

  const groups = [
    { items: [{ href: "/admin", label: "Operations home", current: current === "" }] },
    ...ADMIN_GROUPS.map((group) => ({
      label: group.label,
      items: group.sections
        .filter((section) => canSee(section, admin.permissions))
        .map((section) => ({ href: `/admin/${section.slug}`, label: section.label, current: section.slug === current })),
    })).filter((group) => group.items.length > 0),
  ];
  const currentLabel =
    ADMIN_GROUPS.flatMap((group) => group.sections).find((section) => section.slug === current)?.label ??
    "Operations home";

  return (
    <StaffAdminShell
      groups={groups}
      breadcrumb={`ADMIN / ${currentLabel.toUpperCase()}`}
      staffName={admin.displayName}
      staffRoles={roleLine(admin.permissions)}
      mfaLabel={mfaLabel(admin.mfaVerifiedAt)}
    >
      {children}
    </StaffAdminShell>
  );
}
