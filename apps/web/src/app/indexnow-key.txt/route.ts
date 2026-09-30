import { loadWebEnv } from "@holypearls/config";

const env = loadWebEnv();

/** The IndexNow key file (keyLocation), proving the site owns the key. Only where a key is set (production). */
export function GET() {
  if (!env.INDEXNOW_KEY) return new Response("Not found", { status: 404 });
  return new Response(env.INDEXNOW_KEY, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=86400" } });
}
