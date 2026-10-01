import { searchPhraseListSchema, searchReportSchema } from "@holypearls/contracts";
import { ButtonLink, ErrorState, PermissionDenied } from "@holypearls/ui";
import { ArrowLeft } from "lucide-react";
import { serverApi } from "@/lib/server-api";
import styles from "../../admin-list.module.css";
import { requireAdmin } from "../../admin-session";
import c from "../content-admin.module.css";
import { PhraseManager } from "./PhraseManager";

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Lagos" });

/** Search phrases and what people searched (PUB-FR-007, PRD-01 §11). No Pen frame; built from the admin list pattern. */
export default async function SearchPhrasesPage() {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("CONTENT_MANAGE") && !admin.permissions.includes("CATALOGUE_MANAGE")) return <PermissionDenied permission="CONTENT_MANAGE" />;
  const [phrases, report] = await Promise.all([serverApi("/v1/admin/search/phrases", searchPhraseListSchema), serverApi("/v1/admin/search/report", searchReportSchema)]);

  return (
    <>
      <a className={c.back} href="/content">
        <ArrowLeft size={16} aria-hidden="true" />
        Content
      </a>
      <header className={styles.head}>
        <p className={styles.eyebrow}>CATALOGUE / CONTENT</p>
        <h1 className={styles.title}>Search phrases</h1>
      </header>
      {!phrases.ok ? (
        <ErrorState
          title="We couldn't load this list"
          requestId={phrases.error.requestId}
          action={
            <ButtonLink variant="secondary" href="/content/search-phrases">
              Try again
            </ButtonLink>
          }
        />
      ) : (
        <PhraseManager initial={phrases.data.entries} />
      )}
      {report.ok ? (
        <section className={c.panel} aria-labelledby="search-report-title">
          <h2 id="search-report-title" className={c.panelTitle}>
            What people searched since {dateFormat.format(new Date(report.data.since))}
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
            <div>
              <p className={c.panelTitle}>Found nothing</p>
              {report.data.topNoResults.length ? (
                <ol className={c.ranked}>
                  {report.data.topNoResults.map((row) => (
                    <li key={row.query}>
                      <span>{row.query}</span>
                      <span>{row.count}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className={c.hint}>Every search found something.</p>
              )}
              <p className={c.hint}>A phrase for these usually fixes them.</p>
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
