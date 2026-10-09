import { templateOrderFormSchema } from "@holypearls/contracts";
import { ButtonLink, ErrorState } from "@holypearls/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadWorkspace } from "../../../../../../components/workspace/load";
import { TemplateOrderForm } from "../../../../../../components/workspace/TemplateViews";
import { WorkspaceShell } from "../../../../../../components/workspace/WorkspaceShell";
import styles from "../../../../../../components/workspace/workspace.module.css";
import { serverApi } from "../../../../../../lib/server-api";

export const metadata: Metadata = { title: "Order from template", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Order from a template (Pen 131 · ARNyh; Bw1SD PRICE_READY, laExA QUOTE_REQUIRED mobile, giRIE states). */
export default async function TemplateOrderPage({ params }: { params: Promise<{ organizationId: string; templateId: string }> }) {
  const { organizationId, templateId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(templateId)) notFound();
  const path = `/workspace/${organizationId}/templates/${templateId}`;
  const { me, organization } = await loadWorkspace(organizationId, `${path}/order`);
  const form = await serverApi(`/v1/organizations/${organizationId}/templates/${templateId}/order`, templateOrderFormSchema);
  if (!form.ok && form.status === 404) notFound();
  return (
    <WorkspaceShell organization={organization} userName={me.name} section="templates">
      <a className={styles.viewAll} href={path}>
        ← {form.ok ? form.data.template.name : "Template"}
      </a>
      {form.ok ? (
        <>
          <p className={styles.eyebrow}>
            Template · {form.data.template.name}
            {form.data.template.assets.map((asset) => ` · ${asset.assetName} V${asset.number}`).join("")}
          </p>
          <h1 className={styles.title}>Order {form.data.template.name}</h1>
          <TemplateOrderForm organizationId={organizationId} form={form.data} />
        </>
      ) : (
        <ErrorState title="We couldn't load this template" body="Something went wrong on our side. Try again, or share the request ID with support." requestId={form.error.requestId} action={<ButtonLink variant="secondary" href={`${path}/order`}>Try again</ButtonLink>} />
      )}
    </WorkspaceShell>
  );
}
