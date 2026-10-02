import { PROJECT_TYPE_INFO, projectTypeSchema, recommendationRuleSetSchema } from "@holypearls/contracts";
import { ErrorState, PermissionDenied } from "@holypearls/ui";
import { serverApi } from "@/lib/server-api";
import styles from "../../admin-list.module.css";
import { requireAdmin } from "../../admin-session";
import { RulesEditor } from "./RulesEditor";

/**
 * Recommendation rules per project type (Pen 110 · khFI5; PROJ-FR-003). The
 * owner chose QUOTE_MANAGE for it (2 October 2026). Customers see these as
 * grouped suggestions with a reason (Pen 24).
 */
export default async function RecommendationRulesPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("QUOTE_MANAGE")) return <PermissionDenied permission="QUOTE_MANAGE" />;
  const parsed = projectTypeSchema.safeParse((await searchParams).type);
  const type = parsed.success ? parsed.data : "EVENT";
  const set = await serverApi(`/v1/admin/recommendation-rules/${type}`, recommendationRuleSetSchema);
  return (
    <>
      <header className={styles.head}>
        <p className={styles.eyebrow}>RECOMMENDATION RULES · PROJECT TYPE</p>
        <h1 className={styles.title}>{PROJECT_TYPE_INFO[type].label}</h1>
      </header>
      {set.ok ? (
        <RulesEditor key={`${type}-${set.data.version}`} initial={set.data} />
      ) : (
        <ErrorState title="We couldn't load this list" body="Something went wrong on our side. Try again, or share the request ID with support." requestId={set.error.requestId} />
      )}
    </>
  );
}
