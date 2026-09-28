import { PublicShell } from "@holypearls/ui";
import type { Metadata } from "next";
import styles from "../../components/auth.module.css";
import { RedeemLink } from "./RedeemLink";

// The secret sits after "#", which browsers never send to servers (TECH-03 §5).
export const metadata: Metadata = { title: "Opening your link", robots: { index: false }, referrer: "no-referrer" };

export default function GuestLinkPage() {
  return (
    <PublicShell bleed>
      <div className={styles.page}>
        <RedeemLink />
      </div>
    </PublicShell>
  );
}
