import { searchReportSchema, type SiteEvent } from "@holypearls/contracts";
import { ButtonLink, ErrorState, PermissionDenied } from "@holypearls/ui";
import { ArrowLeft } from "lucide-react";
import { serverApi } from "@/lib/server-api";
import { siteUrl } from "@/lib/site";
import styles from "../../admin-list.module.css";
import { requireAdmin } from "../../admin-session";
import c from "../content-admin.module.css";

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Lagos" });
const ENTRY_LABEL: Record<SiteEvent["kind"], string> = {
  PRODUCT: "Product pages",
  CATEGORY: "Category pages",
  PROJECT: "Project pages",
  START_PROJECT: "Start a Project",
  CONFIGURE: "Configure",
  CONTACT: "Contact",
};

/** What people searched, what found nothing, phrase coverage and where people went (PUB-FR-007, PRD-01 §11). No Pen frame; built from the admin list archetype (Pen 96). */
export default async function SearchReportPage() {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("CONTENT_MANAGE") && !admin.permissions.includes("CATALOGUE_MANAGE")) return <PermissionDenied permission="CONTENT_MANAGE" />;
  const report = await serverApi("/v1/admin/search/report", searchReportSchema);

  return (
    <>
      <a className={c.back} href="/content">
        <ArrowLeft size={16} aria-hidden="true" />
        Content
      </a>
      <header className={styles.head}>
        <p className={styles.eyebrow}>CATALOGUE / CONTENT</p>
        <h1 className={styles.title}>Search report</h1>
      </header>
      {!report.ok ? (
        <ErrorState
          title="We couldn't load the search report"
          requestId={report.error.requestId}
          action={
            <ButtonLink variant="secondary" href="/content/search-report">
              Try again
            </ButtonLink>
          }
        />
      ) : (
        <>
          <p className={c.hint}>Last 30 days, since {dateFormat.format(new Date(report.data.since))}</p>
          <section className={c.panel} aria-labelledby="searches-title">
            <h2 id="searches-title" className={c.panelTitle}>
              Searches
            </h2>
            <div className={c.report}>
              <div>
                <p className={c.stat}>{report.data.searches}</p>
                <p className={c.hint}>searches</p>
              </div>
              <div>
                <p className={c.stat}>{report.data.noResults}</p>
                <p className={c.hint}>found nothing</p>
              </div>
              <div>
                <p className={c.stat}>{report.data.resultClicks}</p>
                <p className={c.hint}>result clicks</p>
              </div>
              <div>
                <p className={c.panelTitle}>Top searches</p>
                {report.data.top.length ? (
                  <ol className={c.ranked}>
                    {report.data.top.map((row) => (
                      <li key={row.query}>
                        <span>{row.query}</span>
                        <span>{row.count}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className={c.hint}>No searches yet.</p>
                )}
              </div>
            </div>
          </section>
          <section className={c.panel} aria-labelledby="nothing-title">
            <h2 id="nothing-title" className={c.panelTitle}>
              Searches that found nothing
            </h2>
            {report.data.zeroResults.length ? (
              <table className={styles.table} aria-labelledby="nothing-title">
                <thead>
                  <tr>
                    <th scope="col">QUERY</th>
                    <th scope="col">TIMES</th>
                    <th scope="col">LAST SEARCHED</th>
                    <th scope="col">
                      <span className="hp-visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.data.zeroResults.map((row) => (
                    <tr key={row.query}>
                      <td className={styles.mono}>{row.query}</td>
                      <td>{row.count}</td>
                      <td>{dateFormat.format(new Date(row.lastSearchedAt))}</td>
                      <td>
                        <a className={styles.action} href={`/content/search-phrases?phrase=${encodeURIComponent(row.query)}`} aria-label={`Add a phrase for “${row.query}”`}>
                          Add a phrase
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className={c.hint}>Every search found something in the last 30 days.</p>
            )}
          </section>
          <section className={c.panel} aria-labelledby="coverage-title">
            <h2 id="coverage-title" className={c.panelTitle}>
              Phrase coverage
            </h2>
            <p className={c.hint}>
              {report.data.phrases.leading} of {report.data.phrases.total} phrases show their page first.
            </p>
            {report.data.phrases.misses.length ? (
              <table className={styles.table} aria-labelledby="coverage-title">
                <thead>
                  <tr>
                    <th scope="col">PHRASE</th>
                    <th scope="col">SHOULD LEAD TO</th>
                    <th scope="col">SHOWS FIRST</th>
                  </tr>
                </thead>
                <tbody>
                  {report.data.phrases.misses.map((row) => (
                    <tr key={`${row.phrase}:${row.expected.href}`}>
                      <td className={styles.mono}>{row.phrase}</td>
                      <td>
                        <a className={styles.action} href={siteUrl(row.expected.href)} target="_blank" rel="noopener">
                          {row.expected.label}
                        </a>
                      </td>
                      <td>
                        {row.shown ? (
                          <a className={styles.action} href={siteUrl(row.shown.href)} target="_blank" rel="noopener">
                            {row.shown.label}
                          </a>
                        ) : (
                          "Nothing"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className={c.hint}>Every phrase shows its page first.</p>
            )}
          </section>
          <section className={c.panel} aria-labelledby="entries-title">
            <h2 id="entries-title" className={c.panelTitle}>
              Where people went
            </h2>
            <table className={styles.table} aria-labelledby="entries-title">
              <thead>
                <tr>
                  <th scope="col">ENTRY</th>
                  <th scope="col">TOTAL</th>
                  <th scope="col">FROM GUIDES</th>
                </tr>
              </thead>
              <tbody>
                {report.data.entries.map((row) => (
                  <tr key={row.kind}>
                    <td className={styles.strong}>{ENTRY_LABEL[row.kind]}</td>
                    <td>{row.total}</td>
                    <td>{row.fromGuides}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </>
  );
}
