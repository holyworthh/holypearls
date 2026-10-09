import styles from "@holypearls/web-kit/auth.module.css";
import type { Metadata } from "next";
import { SiteShell } from "../../components/site/SiteShell";
import { InvitationAccept } from "./InvitationAccept";

export const metadata: Metadata = { title: "Workspace invitation", robots: { index: false, follow: false } };

/**
 * Accepting a workspace invitation (TECH-03 §11; no Pen frame, built on the
 * frame 87 sign-in card). The secret is after the # in the emailed link, so
 * it never reaches a server log; the page sends it in a header.
 */
export default function InvitationPage() {
  return (
    <SiteShell>
      <div className={styles.page}>
        <InvitationAccept />
      </div>
    </SiteShell>
  );
}
