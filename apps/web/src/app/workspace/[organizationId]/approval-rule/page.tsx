import { approvalPolicySchema, teamSchema } from "@holypearls/contracts";
import { ButtonLink, ErrorState } from "@holypearls/ui";
import type { Metadata } from "next";
import { ApprovalPolicyForm } from "../../../../components/workspace/ApprovalViews";
import { loadWorkspace } from "../../../../components/workspace/load";
import { SettingsTabs, WorkspaceShell } from "../../../../components/workspace/WorkspaceShell";
import styles from "../../../../components/workspace/workspace.module.css";
import { serverApi } from "../../../../lib/server-api";

export const metadata: Metadata = { title: "Approval rule", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** The approval rule (T11-04; PRD-05 B2B-FR-040–041; Pen HP/B2B/ApprovalPolicy · MbiTV). Everyone reads it; the Owner changes it. */
export default async function ApprovalRulePage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const { me, organization } = await loadWorkspace(organizationId, `/workspace/${organizationId}/approval-rule`);
  const policy = await serverApi(`/v1/organizations/${organizationId}/approvals/policy`, approvalPolicySchema);
  const team = policy.ok && policy.data.canManage ? await serverApi(`/v1/organizations/${organizationId}/members`, teamSchema) : null;
  return (
    <WorkspaceShell organization={organization} userName={me.name} section="settings">
      <SettingsTabs organizationId={organizationId} current="approval-rule" me={organization.me} />
      <h1 className={styles.title}>Approval rule</h1>
      {policy.ok ? (
        <ApprovalPolicyForm organizationId={organizationId} initial={policy.data} members={team?.ok ? team.data.members : []} />
      ) : (
        <ErrorState title="We couldn't load the rule" body="Something went wrong on our side. Try again, or share the request ID with support." requestId={policy.error.requestId} action={<ButtonLink variant="secondary" href={`/workspace/${organizationId}/approval-rule`}>Try again</ButtonLink>} />
      )}
    </WorkspaceShell>
  );
}
