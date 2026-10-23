import { staffMemberSchema } from "@holypearls/contracts";
import { ErrorState, PermissionDenied } from "@holypearls/ui";
import { notFound } from "next/navigation";
import { serverApi } from "@/lib/server-api";
import { requireAdmin } from "../../admin-session";
import { StaffMemberView } from "./StaffMemberView";

/** One staff member (Pen 122 · pplkz, states vFTNv): permissions, deactivation and MFA reset. */
export default async function StaffMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("STAFF_ADMIN")) return <PermissionDenied permission="STAFF_ADMIN" />;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const result = await serverApi(`/v1/admin/staff/${id}`, staffMemberSchema);
  if (!result.ok) {
    if (result.status === 404 || result.status === 400) notFound();
    return <ErrorState title="We couldn't load this person" body="Something went wrong on our side. Try again, or share the request ID with support." requestId={result.error.requestId} />;
  }
  return <StaffMemberView initial={result.data} isSelf={result.data.staffProfileId === admin.staffProfileId} />;
}
