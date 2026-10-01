import { helpRequestSchema } from "@holypearls/contracts";
import { StatusChip } from "@holypearls/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import styles from "../../../components/auth.module.css";
import { serverApi } from "../../../lib/server-api";
import { SiteShell } from "../../../components/site/SiteShell";

export const metadata: Metadata = { title: "Your question", robots: { index: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

const TONE = { OPEN: "info", ANSWERED: "success", CLOSED: "neutral" } as const;

/** A customer's own help request and HolyPearls' replies. Anyone else gets 404. */
export default async function HelpRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const help = await serverApi(`/v1/help-requests/${encodeURIComponent(id)}`, helpRequestSchema);
  if (!help.ok) {
    if (help.status === 404 || help.status === 400) notFound();
    throw new Error(help.error.message);
  }
  return (
    <SiteShell>
      <div className={styles.page}>
        <section className={`${styles.card} ${styles.enrolCard}`} aria-labelledby="help-title">
          <p className={styles.support}>REQUEST {help.data.reference}</p>
          <h1 id="help-title" className={styles.stateTitle}>
            Your question
          </h1>
          <div>
            <StatusChip tone={TONE[help.data.status]}>{help.data.status}</StatusChip>
          </div>
          <p className={styles.intro}>{help.data.message}</p>
          <p className={styles.support}>Sent from {help.data.context.page.title}. We attached that page, so you won&apos;t need to explain again.</p>
          {help.data.replies.length ? (
            help.data.replies.map((reply) => (
              <div key={reply.id}>
                <p className={styles.support}>HolyPearls replied</p>
                <p className={styles.intro}>{reply.body}</p>
              </div>
            ))
          ) : (
            <p className={styles.support}>We&apos;ll reply by email.</p>
          )}
        </section>
      </div>
    </SiteShell>
  );
}
