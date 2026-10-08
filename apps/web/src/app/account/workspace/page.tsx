import { meSchema, myOrganizationRequestSchema, myOrganizationsSchema } from "@holypearls/contracts";
import { ButtonLink, ErrorState, Notice, StatusChip } from "@holypearls/ui";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountShell } from "../../../components/account/AccountShell";
import { ResendVerification } from "../../../components/account/ResendVerification";
import { day } from "../../../lib/format";
import { serverApi } from "../../../lib/server-api";
import styles from "../account.module.css";
import { WorkspaceRequestForm } from "./WorkspaceRequestForm";

export const metadata: Metadata = { title: "Workspace for your team", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Ask for a Brand Workspace (owner decision 2026-10-08; no Pen frame, built
 * from the account cards of frame 92). A verified email is needed, staff
 * approve or decline, and the requester becomes the workspace's Owner.
 */
export default async function WorkspaceRequestPage() {
  const me = await serverApi("/v1/me", meSchema);
  if (!me.ok) {
    if (me.status === 401) redirect("/sign-in?next=/account/workspace");
    throw new Error(me.error.message);
  }
  const [mine, latest] = await Promise.all([serverApi("/v1/me/organizations", myOrganizationsSchema), serverApi("/v1/me/organization-request", myOrganizationRequestSchema)]);
  if (!mine.ok || !latest.ok) {
    const requestId = !mine.ok ? mine.error.requestId : !latest.ok ? latest.error.requestId : null;
    return (
      <AccountShell current="/account/workspace">
        <h1 className={styles.title}>Workspace for your team</h1>
        <ErrorState title="We couldn't load this page" body="Something went wrong on our side. Try again, or share the request ID with support." requestId={requestId} action={<ButtonLink variant="secondary" href="/account/workspace">Try again</ButtonLink>} />
      </AccountShell>
    );
  }
  const request = latest.data.request;
  const pending = request?.status === "PENDING";
  return (
    <AccountShell current="/account/workspace">
      <div>
        <h1 className={styles.title}>Workspace for your team</h1>
        <p className={styles.subtitle}>A workspace lets your company order together: invite colleagues, give each person a role and locations, and see the team&apos;s orders in one place.</p>
      </div>

      {mine.data.organizations.length ? (
        <Notice tone="success" title={mine.data.organizations.length === 1 ? "You have a workspace" : "You have workspaces"}>
          <p>{mine.data.organizations.map((organization) => organization.name).join(", ")}</p>
          <ButtonLink href="/workspace" variant="secondary">
            Open your workspace
          </ButtonLink>
        </Notice>
      ) : null}

      {pending ? (
        <section className={styles.card} aria-labelledby="request-title">
          <h2 id="request-title" className={styles.cardTitle}>
            Your request is with our team
          </h2>
          <div className={styles.chips}>
            <StatusChip tone="info">WAITING FOR APPROVAL</StatusChip>
          </div>
          <p className={styles.support}>
            {request.companyName} · {request.locations.map((location) => location.name).join(", ")} · sent {day(request.createdAt)}. We&apos;ll email you when it&apos;s approved, or if we need anything.
          </p>
        </section>
      ) : null}

      {request?.status === "DECLINED" ? (
        <Notice tone="warning" title={`We couldn't set up ${request.companyName}`}>
          <p>{request.declineReason}</p>
          <p>You can send a new request below.</p>
        </Notice>
      ) : null}

      {!me.data.emailVerified ? (
        <Notice tone="warning" title="Verify your email first">
          <p>Workspaces are for verified accounts. Verify {me.data.email}, then come back to ask for one.</p>
          <ResendVerification email={me.data.email} />
        </Notice>
      ) : !pending ? (
        <WorkspaceRequestForm />
      ) : null}
    </AccountShell>
  );
}
