import type { Metadata } from "next";
import styles from "@holypearls/web-kit/auth.module.css";
import { StaffSignIn, type StaffStep } from "./StaffSignIn";

export const metadata: Metadata = { title: "Staff sign-in", robots: { index: false } };

const STEPS: readonly StaffStep[] = ["credentials", "code", "expired", "mfa-required"];

export default async function StaffSignInPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const { step } = await searchParams;
  const initialStep = STEPS.includes(step as StaffStep) ? (step as StaffStep) : "credentials";
  return (
    <main id="main-content" className={`${styles.page} ${styles.staffPage}`}>
      <StaffSignIn initialStep={initialStep} />
    </main>
  );
}
