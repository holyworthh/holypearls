import type { Metadata } from "next";
import styles from "@holypearls/web-kit/auth.module.css";
import { SignInCard } from "./SignInCard";
import { SiteShell } from "../../components/site/SiteShell";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; link?: string; error?: string }>;
}) {
  const params = await searchParams;
  return (
    <SiteShell>
      <div className={styles.page}>
        <SignInCard next={params.next} linkExpired={params.link === "expired" || Boolean(params.error)} />
      </div>
    </SiteShell>
  );
}
