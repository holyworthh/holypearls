import { PublicShell } from "@holypearls/ui";
import type { Metadata } from "next";
import styles from "../../components/auth.module.css";
import { SignInCard } from "./SignInCard";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; link?: string; error?: string }>;
}) {
  const params = await searchParams;
  return (
    <PublicShell bleed>
      <div className={styles.page}>
        <SignInCard next={params.next} linkExpired={params.link === "expired" || Boolean(params.error)} />
      </div>
    </PublicShell>
  );
}
