import { productionItemSchema } from "@holypearls/contracts";
import { ErrorState, PermissionDenied } from "@holypearls/ui";
import { notFound } from "next/navigation";
import { serverApi } from "@/lib/server-api";
import { requireAdmin } from "../../../admin-session";
import { ItemPanel } from "./ItemPanel";

/** One production item (Pen 113 · Laq7f, 114 · n3E98F / Uv3At; OPS-FR-061–064). PRODUCTION_MANAGE. */
export default async function ProductionItemPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("PRODUCTION_MANAGE")) return <PermissionDenied permission="PRODUCTION_MANAGE" />;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const item = await serverApi(`/v1/admin/production/items/${id}`, productionItemSchema);
  if (!item.ok) {
    if (item.status === 404) notFound();
    return <ErrorState title="We couldn't load this item" body="Something went wrong on our side. Try again, or share the request ID with support." requestId={item.error.requestId} />;
  }
  return <ItemPanel initial={item.data} />;
}
