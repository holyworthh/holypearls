import { type AccountDraft, accountHistorySchema, type AccountHistory, type AccountQuote, meSchema } from "@holypearls/contracts";
import { ButtonLink, EmptyState, ErrorState, Notice, StatusChip } from "@holypearls/ui";
import { naira } from "@holypearls/web-kit/money";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AccountShell } from "../../components/account/AccountShell";
import { ResendVerification } from "../../components/account/ResendVerification";
import { ORDER_SUMMARY, PAYMENT_STATUS } from "../../components/orders/status";
import { day } from "../../lib/format";
import { serverApi } from "../../lib/server-api";
import styles from "./account.module.css";

export const metadata: Metadata = { title: "Your account", robots: { index: false } };
export const dynamic = "force-dynamic";

type Tone = "success" | "info" | "neutral" | "warning" | "error" | "action";

const chipLabel = (status: string) => status.replaceAll("_", " ");
const DRAFT_TONE: Record<string, Tone> = { PRICE_READY: "success", ESTIMATE_READY: "info", QUOTE_REQUIRED: "warning", CONSULTATION_REQUIRED: "warning" };
const QUOTE_TONE: Record<string, Tone> = { READY: "action", ACCEPTED: "success", REVISION_REQUESTED: "info", PENDING_REVIEW: "info", SUBMITTED: "info", UNDER_REVIEW: "info", QUOTED: "action", ORDERED: "success", COMPLETED: "success" };

const savedAgo = (iso: string, now: number) => {
  const days = Math.floor((now - Date.parse(iso)) / 86_400_000);
  return days <= 0 ? "SAVED TODAY" : days === 1 ? "SAVED YESTERDAY" : `SAVED ${days} DAYS AGO`;
};
const shortDay = (iso: string) => new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", timeZone: "Africa/Lagos" });

function Row({ refText, title, chips, action }: { refText: string; title: string; chips?: ReactNode; action: { label: string; href: string } }) {
  return (
    <li className={styles.row}>
      <div className={styles.rowText}>
        <span className={styles.ref}>{refText}</span>
        <p className={styles.rowTitle}>{title}</p>
      </div>
      {chips ? <div className={styles.chips}>{chips}</div> : null}
      <a className={styles.action} href={action.href}>
        {action.label}
        <ArrowRight aria-hidden size={16} />
      </a>
    </li>
  );
}

function Section({ id, title, empty, children }: { id: string; title: string; empty: string; children: ReactNode[] }) {
  return (
    <section id={id} className={styles.card} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={styles.cardTitle}>
        {title}
      </h2>
      {children.length ? <ul className={styles.rows}>{children}</ul> : <p className={styles.empty}>{empty}</p>}
    </section>
  );
}

const draftRow = (draft: AccountDraft, now: number) => (
  <Row
    key={draft.id}
    refText={`${draft.kind === "PROJECT" ? "PROJECT DRAFT" : "DRAFT"} · ${savedAgo(draft.savedAt, now)}`}
    title={`${draft.title} · ${draft.detail}`}
    chips={<StatusChip tone={DRAFT_TONE[draft.status] ?? "neutral"}>{chipLabel(draft.status)}</StatusChip>}
    action={{ label: "Resume", href: draft.href }}
  />
);

const quoteRow = (quote: AccountQuote) => {
  const isQuote = quote.kind === "QUOTE";
  const action = !isQuote ? "View" : quote.status === "READY" ? "Review" : quote.status === "EXPIRED" ? "Ask for an update" : "View";
  return (
    <Row
      key={quote.id}
      refText={isQuote ? `QUOTE ${quote.reference}${quote.version ? ` · V${quote.version}` : ""}` : `PROJECT ${quote.reference}`}
      title={quote.validUntil && quote.status === "READY" ? `${quote.title} · valid until ${shortDay(quote.validUntil)}` : quote.title}
      chips={<StatusChip tone={QUOTE_TONE[quote.status] ?? "neutral"}>{chipLabel(quote.status)}</StatusChip>}
      action={{ label: action, href: quote.href }}
    />
  );
};

function Linking({ history, email }: { history: AccountHistory; email: string }) {
  const { linking } = history;
  if (linking.state === "UNVERIFIED") {
    return (
      <Notice tone="warning" title="Verify your email">
        <p>Verify {email} to add orders you placed as a guest. Nothing is linked until you verify.</p>
        <ResendVerification email={email} />
      </Notice>
    );
  }
  if (linking.state === "LINKED" && linking.recent) {
    const parts = [linking.orders ? `${linking.orders} order${linking.orders === 1 ? "" : "s"}` : null, linking.quotes ? `${linking.quotes} quote${linking.quotes === 1 ? "" : "s"}` : null].filter(Boolean);
    return (
      <Notice tone="success" title="Earlier orders added to your account">
        <p>
          We linked {parts.join(" and ")} you placed as a guest with {email}.
        </p>
      </Notice>
    );
  }
  return null;
}

/** The account overview (PRD-00 §5, Pen frame 92 · TPpY8 desktop, c3Xw8 mobile, states xvAva). */
export default async function AccountPage() {
  const me = await serverApi("/v1/me", meSchema);
  if (!me.ok) {
    if (me.status === 401) redirect("/sign-in?next=/account");
    throw new Error(me.error.message);
  }
  const history = await serverApi("/v1/me/history", accountHistorySchema);
  const firstName = me.data.name.split(" ")[0] || me.data.name;
  const now = Date.now();

  if (!history.ok) {
    return (
      <AccountShell current="/account">
        <h1 className={styles.title}>Hello, {firstName}</h1>
        <ErrorState title="We couldn't load your history" body="Something went wrong on our side. Try again, or share the request ID with support." requestId={history.error.requestId} action={<ButtonLink variant="secondary" href="/account">Try again</ButtonLink>} />
      </AccountShell>
    );
  }

  const data = history.data;
  const nothing = !data.drafts.length && !data.orders.length && !data.quotes.length && !data.receipts.length;
  return (
    <AccountShell current="/account">
      <h1 className={styles.title}>Hello, {firstName}</h1>
      <Linking history={data} email={me.data.email} />
      {data.linking.state === "NOTHING_LINKED" && nothing ? <p className={styles.support}>No earlier guest orders use this email.</p> : null}
      {nothing ? (
        <EmptyState title="No orders yet" body="Orders, quotes, projects and drafts appear here." action={<ButtonLink href="/products">Browse products</ButtonLink>} />
      ) : (
        <>
          {data.drafts.length ? (
            <Section id="drafts" title="Pick up where you left off" empty="">
              {data.drafts.map((draft) => draftRow(draft, now))}
            </Section>
          ) : null}
          <Section id="orders" title="Orders" empty="No orders yet.">
            {data.orders.map((order) => {
              const status = ORDER_SUMMARY[order.summaryStatus];
              const payment = order.paymentStatus ? PAYMENT_STATUS[order.paymentStatus] : null;
              return (
                <Row
                  key={order.id}
                  refText={`ORDER ${order.number}`}
                  title={order.title}
                  chips={
                    <>
                      <StatusChip tone={status.tone}>{status.label}</StatusChip>
                      {payment ? <StatusChip tone={payment.tone}>{payment.label}</StatusChip> : null}
                    </>
                  }
                  action={{ label: "View", href: `/orders/${order.id}` }}
                />
              );
            })}
          </Section>
          <Section id="quotes" title="Quotes and projects" empty="No quotes or projects yet.">
            {data.quotes.map(quoteRow)}
          </Section>
          <Section id="receipts" title="Receipts" empty="No receipts yet.">
            {data.receipts.map((receipt) => (
              <Row
                key={receipt.id}
                refText={`RECEIPT ${receipt.number} · ${shortDay(receipt.paidAt)}`}
                title={`${naira(receipt.amountMinor, receipt.currency)} · Paystack ${receipt.paystackReference} · ${day(receipt.paidAt)}`}
                action={{ label: "Download", href: receipt.orderId ? `/orders/${receipt.orderId}/receipts/${receipt.id}` : "/account#receipts" }}
              />
            ))}
          </Section>
        </>
      )}
    </AccountShell>
  );
}
