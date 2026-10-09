import { adminOrganizationRequestSchema } from "@holypearls/contracts";
import { ErrorState, PermissionDenied } from "@holypearls/ui";
import { notFound } from "next/navigation";
import { serverApi } from "@/lib/server-api";
import { requireAdmin } from "../../admin-session";
import { RequestDecision } from "./RequestDecision";

/** One workspace request with Approve and Decline (owner decision 2026-10-08). ORGANIZATION_APPROVE. */
export default async function OrganizationRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("ORGANIZATION_APPROVE")) return <PermissionDenied permission="ORGANIZATION_APPROVE" />;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const request = await serverApi(`/v1/admin/organization-requests/${id}`, adminOrganizationRequestSchema);
  if (!request.ok) {
    if (request.status === 404) notFound();
    return <ErrorState title="We couldn't load this request" body="Something went wrong on our side. Try again, or share the request ID with support." requestId={request.error.requestId} />;
  }
  return <RequestDecision initial={request.data} canSeeOrganizations={admin.permissions.includes("ORGANIZATION_SUPPORT")} />;
}
