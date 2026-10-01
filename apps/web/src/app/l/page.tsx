import type { Metadata } from "next";
import styles from "@holypearls/web-kit/auth.module.css";
import { RedeemLink } from "./RedeemLink";
import { SiteShell } from "../../components/site/SiteShell";

// The secret sits after "#", which browsers never send to servers (TECH-03 §5).
export const metadata: Metadata = { title: "Opening your link", robots: { index: false }, referrer: "no-referrer" };

export default function GuestLinkPage() {
  return (
    <SiteShell>
      <div className={styles.page}>
        <RedeemLink />
      </div>
    </SiteShell>
  );
}
