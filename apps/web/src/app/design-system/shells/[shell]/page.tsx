import { AccountShell, AdminShell, Card, PublicShell, StatusChip, WorkspaceShell } from "@holypearls/ui";
import { notFound } from "next/navigation";

const SAMPLE = (
  <Card>
    <p>
      Sample content. Order <span className="hp-mono">HP-2026-0142</span> <StatusChip tone="info">In production</StatusChip>
    </p>
  </Card>
);

export default async function ShellPreview({ params }: { params: Promise<{ shell: string }> }) {
  const { shell } = await params;
  switch (shell) {
    case "public":
      return (
        <PublicShell
          nav={[
            { href: "/design-system/shells/public", label: "Products", current: true },
            { href: "/design-system", label: "Design system" },
          ]}
        >
          {SAMPLE}
        </PublicShell>
      );
    case "account":
      return (
        <AccountShell
          title="Your account"
          nav={[
            { href: "/design-system/shells/account", label: "Orders", current: true },
            { href: "/design-system", label: "Design system" },
          ]}
        >
          {SAMPLE}
        </AccountShell>
      );
    case "workspace":
      return (
        <WorkspaceShell
          context="ACME (TEST DATA)"
          title="Overview"
          nav={[
            { href: "/design-system/shells/workspace", label: "Overview", current: true },
            { href: "/design-system", label: "Design system" },
          ]}
        >
          {SAMPLE}
        </WorkspaceShell>
      );
    case "admin":
      return (
        <AdminShell
          context="Admin"
          title="Operations"
          nav={[
            { href: "/design-system/shells/admin", label: "Operations", current: true },
            { href: "/design-system", label: "Design system" },
          ]}
        >
          {SAMPLE}
        </AdminShell>
      );
    default:
      notFound();
  }
}
