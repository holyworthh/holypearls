import type { Jobs } from "@holypearls/jobs";
import type { ActorContext } from "../identity/actor.js";

/** Public addresses a cache tag stands for, for IndexNow. */
function pathsFor(tags: string[]): string[] {
  return tags.flatMap((tag) => {
    const [kind, ...rest] = tag.split(":");
    const slug = rest.join(":");
    if (kind === "product") return [`/products/${slug}`];
    if (kind === "category") return [`/categories/${slug}`];
    if (kind === "page") return [slug];
    return [];
  });
}

/**
 * After something public changes (publish, archive, unpublish): refresh the
 * web app's cached pages, rebuild the search index, and tell search engines
 * which addresses changed (TECH-02 §6; PUB-SEO-009). Tags are cache tags such
 * as `product:polo-shirt`, `category:apparel`, `page:/resources/x` or `catalogue`.
 */
export async function publicChange(jobs: Jobs, actor: Pick<ActorContext, "requestId">, tags: string[]) {
  await jobs.send("cache.revalidate", { v: 1, requestId: actor.requestId, tags });
  await jobs.send("search.refresh", { v: 1, requestId: actor.requestId });
  const paths = pathsFor(tags);
  if (paths.length) await jobs.send("seo.indexnow", { v: 1, requestId: actor.requestId, paths });
}
