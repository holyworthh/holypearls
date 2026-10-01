import { adminMeSchema, meSchema } from "@holypearls/contracts";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { hasSessionCookie, serverApi } from "@/lib/server-api";

/**
 * Loads the signed-in staff member for an /admin page, or leaves the page:
 * signed out → staff sign-in (or "session ended" after 12 hours); not staff →
 * 404 (TECH-03 §12); staff without MFA in this session → MFA step.
 */
export const requireAdmin = cache(async () => {
  const me = await serverApi("/v1/me", meSchema);
  if (!me.ok) {
    if (me.status === 401) redirect((await hasSessionCookie()) ? "/sign-in?step=expired" : "/sign-in");
    throw new Error(me.error.message);
  }
  const admin = await serverApi("/v1/admin/me", adminMeSchema);
  if (admin.ok) return admin.data;
  if (admin.error.code === "NOT_FOUND") notFound();
  if (admin.error.code === "MFA_REQUIRED") {
    redirect(me.data.mfa.enabled ? "/sign-in?step=code" : "/sign-in?step=mfa-required");
  }
  throw new Error(admin.error.message);
});
