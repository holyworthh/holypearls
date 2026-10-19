import { accountHistorySchema, type AccountHistory, meSchema } from "@holypearls/contracts";
import { ButtonLink, EmptyState, ErrorState, Notice } from "@holypearls/ui";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountShell } from "../../components/account/AccountShell";
import { draftRow, orderRow, quoteRow, receiptRow, Section } from "../../components/account/HistoryRows";
import { ResendVerification } from "../../components/account/ResendVerification";
import { serverApi } from "../../lib/server-api";
import styles from "./account.module.css";

export const metadata: Metadata = { title: "Your account", robots: { index: false } };
export const dynamic = "force-dynamic";

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
            {data.orders.map(orderRow)}
          </Section>
          <Section id="quotes" title="Quotes and projects" empty="No quotes or projects yet.">
            {data.quotes.map(quoteRow)}
          </Section>
          <Section id="receipts" title="Receipts" empty="No receipts yet.">
            {data.receipts.map(receiptRow)}
          </Section>
        </>
      )}
    </AccountShell>
  );
}
