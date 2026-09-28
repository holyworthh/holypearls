import { adminHubSchema } from "@holypearls/contracts";
import { ButtonLink, ErrorState, PermissionDenied } from "@holypearls/ui";
import { notFound } from "next/navigation";
import { serverApi } from "../../../../../../lib/server-api";
import { requireAdmin } from "../../../admin-session";
import { HubEditor } from "./HubEditor";

/** Category hub section editor (Pen 105). */
export default async function HubPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("CATALOGUE_MANAGE")) return <PermissionDenied permission="CATALOGUE_MANAGE" />;
  const { id } = await params;
  const hub = await serverApi(`/v1/admin/catalogue/categories/${encodeURIComponent(id)}/hub`, adminHubSchema);
  if (!hub.ok) {
    if (hub.status === 404 || hub.status === 400) notFound();
    return (
      <ErrorState
        title="We couldn't load this hub"
        requestId={hub.error.requestId}
        action={
          <ButtonLink variant="secondary" href={`/admin/categories/${id}/hub`}>
            Try again
          </ButtonLink>
        }
      />
    );
  }
  return <HubEditor initial={hub.data} />;
}
