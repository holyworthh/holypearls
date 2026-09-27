import { PublicShell } from "@holypearls/ui";
import { Demo } from "./demo";

const shellLinks = [
  { href: "/design-system/shells/public", label: "Public shell" },
  { href: "/design-system/shells/account", label: "Account shell" },
  { href: "/design-system/shells/workspace", label: "Workspace shell" },
  { href: "/design-system/shells/admin", label: "Admin shell" },
];

export default function DesignSystemPage() {
  return (
    <PublicShell nav={[{ href: "/design-system", label: "Design system", current: true }]}>
      <Demo shellLinks={shellLinks} />
    </PublicShell>
  );
}
