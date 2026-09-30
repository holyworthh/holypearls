import { adminContentPageSchema } from "@holypearls/contracts";
import { ButtonLink, ErrorState, PermissionDenied } from "@holypearls/ui";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { serverApi } from "../../../../../lib/server-api";
import { requireAdmin } from "../../admin-session";
import c from "../content-admin.module.css";
import { ContentEditor } from "../ContentEditor";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TAB = { GUIDE: "Guides", PROJECT: "Project pages", CASE_STUDY: "Case studies", ABOUT: "About" } as const;

/** One content page in the editor (Pen 106 · X3mMi). */
export default async function ContentEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("CONTENT_MANAGE")) return <PermissionDenied permission="CONTENT_MANAGE" />;
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const result = await serverApi(`/v1/admin/content/${id}`, adminContentPageSchema);
  if (!result.ok && result.status === 404) notFound();
  if (!result.ok) {
    return (
      <ErrorState
        title="We couldn't load this page"
        requestId={result.error.requestId}
        action={
          <ButtonLink variant="secondary" href={`/admin/content/${id}`}>
            Try again
          </ButtonLink>
        }
      />
    );
  }
  const page = result.data;
  return (
    <>
      <a className={c.back} href={`/admin/content?type=${page.type}`}>
        <ArrowLeft size={16} aria-hidden="true" />
        {TAB[page.type]}
      </a>
      <ContentEditor page={page} updatedByName={page.updatedBy} />
    </>
  );
}
