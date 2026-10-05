import { MERCHANDISING_LISTS } from "@holypearls/contracts";
import { type Database, sql } from "@holypearls/db";

/** Orders from this far back count towards "Most ordered". */
const WINDOW_DAYS = 365;

/** Ranked by real orders, then the staff list fills any places left (owner, 2026-10-05). */
export function mergeMostOrdered(counts: { productId: string; orders: number }[], staffList: string[], max: number): string[] {
  const ranked = [...counts].sort((a, b) => b.orders - a.orders).map((count) => count.productId);
  return [...new Set([...ranked, ...staffList])].slice(0, max);
}

/**
 * The homepage "Most ordered" products: how many orders (not cancelled) in
 * the last year included each product, most first. Until there are enough,
 * the staff-managed list fills the rest (PUB-FR-004).
 */
export async function mostOrderedIds(db: Database, staffList: string[]): Promise<string[]> {
  const result = await db.execute<{ product_id: string; orders: number }>(sql`
    select c.product_id, count(distinct o.id)::int as orders
    from order_items i
    join orders o on o.id = i.order_id
    join configurations c on c.id = i.configuration_id
    join products p on p.id = c.product_id
    where o.cancelled_at is null
      and o.placed_at > now() - make_interval(days => ${WINDOW_DAYS})
      and p.status in ('PUBLISHED', 'TEMPORARILY_UNAVAILABLE') and p.listed
    group by c.product_id
    order by orders desc
    limit 50`);
  return mergeMostOrdered(
    result.rows.map((row) => ({ productId: row.product_id, orders: row.orders })),
    staffList,
    MERCHANDISING_LISTS["home.most-ordered"].max,
  );
}
