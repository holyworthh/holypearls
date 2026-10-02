import { adminQuoteListSchema, quoteStatusSchema } from "@holypearls/contracts";
import { EmptyState, ErrorState, PermissionDenied, StatusChip } from "@holypearls/ui";
import { serverApi } from "@/lib/server-api";
import styles from "../admin-list.module.css";
import { requireAdmin } from "../admin-session";
import { formatTime, money } from "../format";
import { QUOTE_TONE } from "./tones";


/** Every quote with its latest version (OPS-FR-033). QUOTE_MANAGE. */
export default async function QuotesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("QUOTE_MANAGE")) return <PermissionDenied permission="QUOTE_MANAGE" />;
  const parsed = quoteStatusSchema.safeParse((await searchParams).status);
  const status = parsed.success ? parsed.data : null;
  const list = await serverApi(`/v1/admin/quotes${status ? `?status=${status}` : ""}`, adminQuoteListSchema);
  return (
    <>
      <header className={styles.head}>
        <p className={styles.eyebrow}>ADMIN / REQUESTS / QUOTES</p>
        <h1 className={styles.title}>Quotes</h1>
      </header>
      <nav className={styles.tabs} aria-label="Quote status">
        <a className={styles.tab} href="/quotes" aria-current={!status ? "page" : undefined}>
          All
        </a>
        {quoteStatusSchema.options.map((option) => (
          <a key={option} className={styles.tab} href={`/quotes?status=${option}`} aria-current={status === option ? "page" : undefined}>
            {option.replace("_", " ").toLowerCase().replace(/^./, (letter) => letter.toUpperCase())}
          </a>
        ))}
        <a className={styles.tab} href="/quotes/settings">
          Settings
        </a>
      </nav>
      {!list.ok ? (
        <ErrorState title="We couldn't load this list" body="Something went wrong on our side. Try again, or share the request ID with support." requestId={list.error.requestId} />
      ) : list.data.items.length === 0 ? (
        <EmptyState title="No quotes here" body="Quotes start when a customer submits a project or asks for a final quote." />
      ) : (
        <table className={styles.table}>
          <caption className="hp-visually-hidden">Quotes, most recently changed first</caption>
          <thead>
            <tr>
              <th scope="col">QUOTE</th>
              <th scope="col">FOR</th>
              <th scope="col">CUSTOMER</th>
              <th scope="col">STATUS</th>
              <th scope="col">LATEST</th>
              <th scope="col">CHANGED</th>
            </tr>
          </thead>
          <tbody>
            {list.data.items.map((quote) => (
              <tr key={quote.id}>
                <td>
                  <a className={styles.action} href={`/quotes/${quote.id}`}>
                    {quote.reference}
                  </a>
                </td>
                <td>{quote.title}</td>
                <td>{quote.customer}</td>
                <td>
                  <StatusChip tone={QUOTE_TONE[quote.status] ?? "neutral"}>{quote.status}</StatusChip>
                </td>
                <td className={styles.mono}>{quote.latestVersion ? `V${quote.latestVersion} · ${money(quote.totalMinor!, quote.currency!)}` : "No version yet"}</td>
                <td className={styles.mono}>{formatTime(quote.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
