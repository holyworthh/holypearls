import styles from "../admin-list.module.css";

/** The three payments screens (Pen 109 header tabs). */
export function PaymentsTabs({ current, openReviews }: { current: "list" | "reviews" | "settings"; openReviews: number | null }) {
  const tabs = [
    { key: "list", href: "/payments", label: "Payments" },
    { key: "reviews", href: "/payments/reviews", label: openReviews === null ? "Review queue" : `Review queue · ${openReviews}` },
    { key: "settings", href: "/payments/settings", label: "Settings" },
  ] as const;
  return (
    <nav className={styles.tabs} aria-label="Payments">
      {tabs.map((tab) => (
        <a key={tab.key} className={styles.tab} href={tab.href} aria-current={tab.key === current ? "page" : undefined}>
          {tab.label}
        </a>
      ))}
    </nav>
  );
}

export const ATTEMPT_TONE = { CREATED: "neutral", PENDING: "info", SUCCEEDED: "success", FAILED: "error", ABANDONED: "neutral", UNKNOWN: "warning" } as const;

export const CUSTOMER_TONE: Record<string, "neutral" | "info" | "success" | "warning" | "error"> = {
  PAID: "success",
  DEPOSIT_PAID: "success",
  PAYMENT_PENDING: "info",
  PAYMENT_DUE: "neutral",
  DEPOSIT_DUE: "neutral",
  BALANCE_DUE: "neutral",
  PARTIALLY_PAID: "info",
  NOT_DUE: "neutral",
  PAYMENT_FAILED: "error",
  PARTIALLY_REFUNDED: "warning",
  REFUNDED: "neutral",
  PAYMENT_RESOLUTION_REQUIRED: "warning",
};

export const REASON_LABEL = {
  UNCLEAR_RESULT: "Unclear after checks",
  AMOUNT_MISMATCH: "Amount or currency mismatch",
  DUPLICATE_PAYMENT: "DUPLICATE_PAYMENT",
  PAID_PARTICIPANT_REMOVED: "Paid participant removed",
} as const;

/** "HPPAY-5e2d…a41": the start and end of a reference, as Pen shows it. */
export const shortReference = (reference: string) => (reference.length > 18 ? `${reference.slice(0, 10)}…${reference.slice(-3)}` : reference);
