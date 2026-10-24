import { searchPhraseListSchema } from "@holypearls/contracts";
import { ButtonLink, ErrorState, PermissionDenied } from "@holypearls/ui";
import { ArrowLeft } from "lucide-react";
import { serverApi } from "@/lib/server-api";
import styles from "../../admin-list.module.css";
import { requireAdmin } from "../../admin-session";
import c from "../content-admin.module.css";
import { PhraseManager } from "./PhraseManager";

/** Search phrases (PUB-FR-007). No Pen frame; built from the admin list pattern. */
export default async function SearchPhrasesPage({ searchParams }: { searchParams: Promise<{ phrase?: string }> }) {
  const { phrase } = await searchParams;
  const admin = await requireAdmin();
  if (!admin.permissions.includes("CONTENT_MANAGE") && !admin.permissions.includes("CATALOGUE_MANAGE")) return <PermissionDenied permission="CONTENT_MANAGE" />;
  const phrases = await serverApi("/v1/admin/search/phrases", searchPhraseListSchema);

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
        <PhraseManager initial={phrases.data.entries} initialPhrase={typeof phrase === "string" ? phrase.slice(0, 60) : ""} />
      )}
    </>
  );
}
