import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { z } from "zod";

const bodySchema = z.object({ tags: z.array(z.string().regex(/^[a-z]+(:[a-z0-9-]+)?$/).max(120)).min(1).max(50) });

const sameSecret = (given: string, expected: string) => {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * The worker's cache.revalidate job calls this when catalogue data changes
 * (TECH-02 §6). Pages cached under these tags are rebuilt on their next visit.
 * Off unless WEB_REVALIDATE_SECRET is set.
 */
export async function POST(request: Request) {
  const secret = process.env.WEB_REVALIDATE_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || !sameSecret(given, secret)) return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: "VALIDATION_FAILED" }, { status: 400 });
  for (const tag of parsed.data.tags) revalidateTag(tag, { expire: 0 });
  return Response.json({ revalidated: parsed.data.tags });
}
