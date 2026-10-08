import { teamSchema } from "@holypearls/contracts";
import { ButtonLink, ErrorState, PageState } from "@holypearls/ui";
import type { Metadata } from "next";
import { loadWorkspace } from "../../../../components/workspace/load";
import { TeamView } from "../../../../components/workspace/TeamView";
import { SettingsTabs, WorkspaceShell } from "../../../../components/workspace/WorkspaceShell";
import { serverApi } from "../../../../lib/server-api";

export const metadata: Metadata = { title: "Team", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Team (Pen 70 · HLbMo). Needs "Manage team and roles"; everyone else sees why not (TECH-03 §12: 403, not 404). */
export default async function TeamPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const { me, organization } = await loadWorkspace(organizationId, `/workspace/${organizationId}/team`);
  const canManageTeam = organization.me.permissions.includes("MANAGE_TEAM");
  const team = canManageTeam ? await serverApi(`/v1/organizations/${organizationId}/members`, teamSchema) : null;
  return (
    <WorkspaceShell organization={organization} userName={me.name}>
      <SettingsTabs organizationId={organizationId} current="team" showTeam />
      {!team || (!team.ok && team.status === 403) ? (
        <PageState
          eyebrow="403 · PERMISSION REQUIRED"
          title="Only team managers can see the team"
          body="Your role doesn't include managing the team and roles. Ask your workspace Owner if you need it."
          actions={<ButtonLink href={`/workspace/${organizationId}/locations`} variant="secondary">See your locations</ButtonLink>}
        />
      ) : !team.ok ? (
        <ErrorState title="We couldn't load the team" body="Something went wrong on our side. Try again, or share the request ID with support." requestId={team.error.requestId} action={<ButtonLink variant="secondary" href={`/workspace/${organizationId}/team`}>Try again</ButtonLink>} />
      ) : (
        <TeamView organization={organization} initial={team.data} />
      )}
    </WorkspaceShell>
  );
}
