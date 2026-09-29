/**
 * seo.indexnow: tells participating search engines which public addresses
 * changed (Stage 3 §53; PUB-SEO-009). Runs only where a key and the public
 * site address are set, which is production; elsewhere it does nothing.
 */
export async function submitIndexNow(
  paths: string[],
  env: { siteUrl?: string; key?: string },
  send: typeof fetch = fetch,
): Promise<{ submitted: number }> {
  if (!env.siteUrl || !env.key || paths.length === 0) return { submitted: 0 };
  const site = new URL(env.siteUrl);
  const response = await send("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host: site.host,
      key: env.key,
      keyLocation: new URL("/indexnow-key.txt", site).toString(),
      urlList: [...new Set(paths)].map((path) => new URL(path, site).toString()),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  // 200 and 202 both mean accepted; anything else is retried by the job.
  if (response.status !== 200 && response.status !== 202) throw new Error(`IndexNow refused the list (${response.status})`);
  return { submitted: paths.length };
}
