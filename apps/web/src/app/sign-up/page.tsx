import type { Metadata } from "next";
import styles from "@holypearls/web-kit/auth.module.css";
import { SiteShell } from "../../components/site/SiteShell";
import { SignUpCard } from "./SignUpCard";

export const metadata: Metadata = { title: "Create an account", robots: { index: false } };

/** Customer sign-up (Pen frame 88 · Nv9iJ). An account is never needed to order (PRD-00 §5). */
export default function SignUpPage() {
  return (
    <SiteShell>
      <div className={styles.page}>
        <SignUpCard />
      </div>
    </SiteShell>
  );
}
