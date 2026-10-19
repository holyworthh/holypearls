import { ACCOUNT_LISTS, type AccountListName, accountListSchema } from "@holypearls/contracts";
import { ButtonLink, ErrorState } from "@holypearls/ui";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AccountShell } from "../../../components/account/AccountShell";
import { draftRow, orderRow, quoteRow, receiptRow, Section } from "../../../components/account/HistoryRows";
import { serverApi } from "../../../lib/server-api";
import styles from "../account.module.css";

export const metadata: Metadata = { title: "Your account", robots: { index: false } };
export const dynamic = "force-dynamic";

const TITLES: Record<AccountListName, { title: string; empty: string }> = {
  orders: { title: "Orders", empty: "No orders yet." },
  quotes: { title: "Quotes", empty: "No quotes yet." },
  projects: { title: "Projects", empty: "No projects yet." },
  drafts: { title: "Drafts", empty: "No saved drafts." },
  receipts: { title: "Receipts", empty: "No receipts yet." },
};

/** One history list in full (T09-01b; Pen frame 91's account navigation): the overview shows only the newest few. */
export default async function AccountListPage({ params }: { params: Promise<{ list: string }> }) {
  const { list } = await params;
  if (!(ACCOUNT_LISTS as readonly string[]).includes(list)) notFound();
  const name = list as AccountListName;
  const result = await serverApi(`/v1/me/history/${name}`, accountListSchema);
  if (!result.ok && result.status === 401) redirect(`/sign-in?next=/account/${name}`);
  const { title, empty } = TITLES[name];
  const now = Date.now();
  return (
    <AccountShell current={`/account/${name}`}>
      <h1 className={styles.title}>{title}</h1>
      {!result.ok ? (
        <ErrorState title="We couldn't load this list" body="Something went wrong on our side. Try again, or share the request ID with support." requestId={result.error.requestId} action={<ButtonLink variant="secondary" href={`/account/${name}`}>Try again</ButtonLink>} />
      ) : (
        <Section id={name} title={`All ${title.toLowerCase()}`} empty={empty}>
          {[...result.data.drafts.map((draft) => draftRow(draft, now)), ...result.data.orders.map(orderRow), ...result.data.quotes.map(quoteRow), ...result.data.receipts.map(receiptRow)]}
        </Section>
      )}
    </AccountShell>
  );
}
