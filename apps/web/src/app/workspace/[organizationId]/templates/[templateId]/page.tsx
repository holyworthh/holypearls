import { brandAssetListSchema, templateSchema } from "@holypearls/contracts";
import { ButtonLink, ErrorState, Notice, StatusChip } from "@holypearls/ui";
import { Lock, PencilLine, Stamp } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { reach, TEMPLATE_STATUS, VERSION_STATUS } from "../../../../../components/workspace/labels";
import { loadWorkspace } from "../../../../../components/workspace/load";
import { TemplateActions } from "../../../../../components/workspace/TemplateViews";
import { WorkspaceShell } from "../../../../../components/workspace/WorkspaceShell";
import styles from "../../../../../components/workspace/workspace.module.css";
import { serverApi } from "../../../../../lib/server-api";

export const metadata: Metadata = { title: "Template", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Template detail (Pen 29 · B7pn1V desktop, 69 · kFYAK mobile, 67 · FTR8w
 * blocked): the approved preview, the locked brand specification with its
 * reasons, and what buyers choose per order (B2B-FR-024, 030–032).
 */
export default async function TemplatePage({ params }: { params: Promise<{ organizationId: string; templateId: string }> }) {
  const { organizationId, templateId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(templateId)) notFound();
  const base = `/v1/organizations/${organizationId}`;
  const { me, organization } = await loadWorkspace(organizationId, `/workspace/${organizationId}/templates/${templateId}`);
  const result = await serverApi(`${base}/templates/${templateId}`, templateSchema);
  if (!result.ok && result.status === 404) notFound();
  const assets = result.ok && result.data.canManage ? await serverApi(`${base}/assets`, brandAssetListSchema) : null;
  return (
    <WorkspaceShell organization={organization} userName={me.name} section="templates">
      <a className={styles.viewAll} href={`/workspace/${organizationId}/templates`}>
        ← Templates
      </a>
      {!result.ok ? (
        <ErrorState title="We couldn't load this template" body="Something went wrong on our side. Try again, or share the request ID with support." requestId={result.error.requestId} action={<ButtonLink variant="secondary" href={`/workspace/${organizationId}/templates/${templateId}`}>Try again</ButtonLink>} />
      ) : (
        (() => {
          const template = result.data;
          const status = TEMPLATE_STATUS[template.status];
          const locked = template.fields.filter((field) => field.control === "LOCKED");
          const editable = template.fields.filter((field) => field.control === "EDITABLE");
          const retired = template.assets.filter((asset) => asset.status !== "PRODUCTION_READY" && asset.status !== "SUPERSEDED");
          return (
            <>
              <div className={styles.head}>
                <div className={styles.templateTitle}>
                  <h1 className={styles.title}>{template.name}</h1>
                  <StatusChip tone={status.tone}>{status.label}</StatusChip>
                </div>
              </div>
              <p className={styles.rowMeta}>
                Organisation template · {template.productName} · {reach(template)} · from {template.sourceLabel}
              </p>
              {template.status === "NEEDS_REVIEW" ? (
                <Notice tone="warning" title="This template can't be ordered until it's updated">
                  <p>
                    It uses {retired.map((asset) => `${asset.assetName} V${asset.number}`).join(", ") || "an asset version"}, which was retired for new use.
                    {template.canManage ? " Update it to the current version and HolyPearls will check the template again." : " Your Owner or Admin needs to update it."}
                  </p>
                </Notice>
              ) : null}
              {template.status === "AWAITING_APPROVAL" ? (
                <Notice tone="info" title="Awaiting HolyPearls' check">
                  <p>We check the configuration and artwork before anyone can order from this template.</p>
                </Notice>
              ) : null}
              {template.status === "DRAFT" && template.reviewNote ? (
                <Notice tone="warning" title="HolyPearls returned this template to draft">
                  <p>{template.reviewNote}</p>
                </Notice>
              ) : null}
              {template.status === "APPROVED" && organization.me.permissions.includes("CREATE_REQUESTS") ? (
                <div className={styles.quickActions}>
                  <ButtonLink href={`/workspace/${organizationId}/templates/${templateId}/order`}>Order from template</ButtonLink>
                </div>
              ) : null}
              {template.canManage && assets?.ok ? <TemplateActions organizationId={organizationId} initial={template} me={organization.me} assets={assets.data.assets} /> : null}
              <div className={styles.assetDetail}>
                <section className={`${styles.panel} ${styles.assetHero}`} aria-label="Approved preview">
                  <span className={styles.eyebrow}>{template.status === "APPROVED" ? "Approved preview · template" : "Preview · template"}</span>
                  <span className={styles.assetThumb}>{template.image ? <img src={template.image.url} alt={template.image.alt} /> : <Stamp aria-hidden className={styles.navIcon} />}</span>
                  {template.assets.length ? (
                    <ul className={styles.detailValue}>
                      {template.assets.map((asset) => (
                        <li key={asset.versionId} className={styles.templateAsset}>
                          <a href={`/workspace/${organizationId}/assets/${asset.assetId}`}>
                            {asset.assetName} V{asset.number}
                          </a>
                          <StatusChip tone={VERSION_STATUS[asset.status].tone}>{VERSION_STATUS[asset.status].label}</StatusChip>
                          {asset.currentNumber ? <span>V{asset.currentNumber} is current</span> : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>
                <div className={styles.templateSpec}>
                  <section className={styles.detail} aria-labelledby="locked-title">
                    <h2 id="locked-title" className={styles.detailTitle}>
                      Approved brand specification
                    </h2>
                    {locked.map((field) => (
                      <div key={field.key} className={styles.detailRow}>
                        <Lock aria-label="Locked" />
                        <div className={styles.detailText}>
                          <span className={styles.detailLabel}>{field.label}</span>
                          <span className={styles.detailValue}>{field.value}</span>
                          {field.reason !== field.value ? <span className={styles.rowMeta}>{field.reason}</span> : null}
                        </div>
                      </div>
                    ))}
                    <p className={styles.dialogText}>Locked by {organization.name}&apos;s brand template. Only brand admins can change these. Any change sends the template back for review.</p>
                  </section>
                  <section className={styles.detail} aria-labelledby="editable-title">
                    <h2 id="editable-title" className={styles.detailTitle}>
                      You choose per order
                    </h2>
                    {editable.map((field) => (
                      <div key={field.key} className={styles.detailRow}>
                        <PencilLine aria-label="Editable" />
                        <div className={styles.detailText}>
                          <span className={styles.detailLabel}>{field.label}</span>
                          <span className={styles.detailValue}>{field.value}</span>
                          {field.reason !== field.value ? <span className={styles.rowMeta}>{field.reason}</span> : null}
                        </div>
                      </div>
                    ))}
                  </section>
                </div>
              </div>
            </>
          );
        })()
      )}
    </WorkspaceShell>
  );
}
