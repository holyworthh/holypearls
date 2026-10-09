import { PROJECT_TYPE_INFO, type WorkspaceProject, type WorkspaceProjectGroup } from "@holypearls/contracts";
import { and, type Database, desc, eq, ilike, inArray, ne, or, schema, sql } from "@holypearls/db";
import { placementNames, type RecordScope, scopeWhere } from "../organizations/scope.js";

/*
 * Organization projects for the Brand Workspace (T10-03; Pen 64 · cNcKd):
 * grouped Draft, Quote pending, Quote ready, Active order and Complete. The
 * sales module reads its own projects and quotes; the organizations module
 * decides the scope (TECH-00 §5).
 */

const shortDay = (date: Date) => date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Lagos" });

function groupOf(status: string, quoteStatus: string | null): WorkspaceProjectGroup {
  if (status === "DRAFT") return "DRAFT";
  if (status === "ORDERED") return "ACTIVE_ORDER";
  if (status === "COMPLETED" || status === "CANCELLED" || status === "EXPIRED") return "COMPLETE";
  return status === "QUOTED" && quoteStatus === "READY" ? "QUOTE_READY" : "QUOTE_PENDING";
}

/** An organization's projects in a scope, most recently active first. Text matches the title or reference. */
export async function organizationProjects(db: Database, scope: RecordScope, viewerUserId: string, options: { query?: string; limit?: number } = {}): Promise<WorkspaceProject[]> {
  const term = options.query?.trim().replace(/[%_\\]/g, "\\$&");
  const rows = await db
    .select({ project: schema.projects, quoteId: schema.quotes.id, quoteStatus: schema.quotes.status, quoteUpdatedAt: schema.quotes.updatedAt })
    .from(schema.projects)
    .leftJoin(schema.quotes, eq(schema.quotes.projectId, schema.projects.id))
    .where(
      and(
        scopeWhere({ organizationId: schema.projects.organizationId, locationId: schema.projects.locationId, ownerUserId: schema.projects.ownerUserId }, scope),
        // Another member's unsent draft is theirs until they send it.
        or(ne(schema.projects.status, "DRAFT"), eq(schema.projects.ownerUserId, viewerUserId)),
        term ? or(ilike(schema.projects.title, `%${term}%`), ilike(schema.projects.reference, `%${term}%`)) : undefined,
      ),
    )
    .orderBy(desc(schema.projects.lastActivityAt))
    .limit(options.limit ?? 100);
  const names = await placementNames(db, rows.map(({ project }) => (project.organizationId && project.locationId ? { organizationId: project.organizationId, locationId: project.locationId } : null)));
  const counts = rows.length
    ? await db
        .select({ projectId: schema.projectItems.projectId, n: sql<number>`count(*)::int` })
        .from(schema.projectItems)
        .where(inArray(schema.projectItems.projectId, rows.map(({ project }) => project.id)))
        .groupBy(schema.projectItems.projectId)
    : [];
  const items = new Map(counts.map((count) => [count.projectId, count.n]));
  return rows.map(({ project, quoteId, quoteStatus, quoteUpdatedAt }) => {
    const group = groupOf(project.status, quoteStatus);
    const mine = project.ownerUserId === viewerUserId;
    const n = items.get(project.id) ?? 0;
    const detail = {
      DRAFT: `${n} product${n === 1 ? "" : "s"} · edited ${shortDay(project.lastActivityAt)}`,
      QUOTE_PENDING: project.submittedAt ? `Sent ${shortDay(project.submittedAt)} · quote in progress` : "Quote in progress",
      QUOTE_READY: `Quote ready${quoteUpdatedAt ? ` · sent ${shortDay(quoteUpdatedAt)}` : ""}`,
      ACTIVE_ORDER: "Quote accepted · in production",
      COMPLETE: project.status === "COMPLETED" ? "Delivered" : project.status === "CANCELLED" ? "Cancelled" : "Expired",
    }[group];
    return {
      id: project.id,
      reference: project.reference,
      title: project.title || PROJECT_TYPE_INFO[project.type].label,
      locationName: names.get(project.locationId!)?.locationName ?? "",
      status: project.status,
      quoteStatus,
      group,
      detail,
      // The builder and the quote stay with the person who placed it until T11-04 (quote authority).
      href: mine ? (group === "QUOTE_READY" && quoteId ? `/quotes/${quoteId}` : `/start/${project.id}`) : null,
      updatedAt: project.lastActivityAt.toISOString(),
    };
  });
}
