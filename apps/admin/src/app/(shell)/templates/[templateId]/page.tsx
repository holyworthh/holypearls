import { adminTemplateSchema } from "@holypearls/contracts";
import { ErrorState, PermissionDenied } from "@holypearls/ui";
import { notFound } from "next/navigation";
import { serverApi } from "@/lib/server-api";
import { requireAdmin } from "../../admin-session";
import { TemplateDecision } from "./TemplateDecision";

/** One template: its fields, the production checks, and approve or return to draft (Pen 117 · Tb81V). STAFF_ADMIN. */
export default async function TemplateAdminPage({ params }: { params: Promise<{ templateId: string }> }) {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("STAFF_ADMIN")) return <PermissionDenied permission="STAFF_ADMIN" />;
  const { templateId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(templateId)) notFound();
  const template = await serverApi(`/v1/admin/templates/${templateId}`, adminTemplateSchema);
  if (!template.ok) {
    if (template.status === 404) notFound();
    return <ErrorState title="We couldn't load this template" body="Something went wrong on our side. Try again, or share the request ID with support." requestId={template.error.requestId} />;
  }
  return <TemplateDecision initial={template.data} canSeeOrganization={admin.permissions.includes("ORGANIZATION_SUPPORT")} />;
}
