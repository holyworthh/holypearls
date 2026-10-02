import { orderShippingSchema } from "@holypearls/contracts";
import { ErrorState, PermissionDenied } from "@holypearls/ui";
import { notFound } from "next/navigation";
import { serverApi } from "@/lib/server-api";
import { requireAdmin } from "../../../admin-session";
import { OrderShipments } from "./OrderShipments";

/** One order's shipments (Pen 115 · luIrF create, j5hl6h status + history). FULFILMENT_MANAGE. */
export default async function OrderShipmentsPage({ params }: { params: Promise<{ orderId: string }> }) {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("FULFILMENT_MANAGE")) return <PermissionDenied permission="FULFILMENT_MANAGE" />;
  const { orderId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(orderId)) notFound();
  const data = await serverApi(`/v1/admin/shipments/orders/${orderId}`, orderShippingSchema);
  if (!data.ok) {
    if (data.status === 404) notFound();
    return <ErrorState title="We couldn't load this order" body="Something went wrong on our side. Try again, or share the request ID with support." requestId={data.error.requestId} />;
  }
  return <OrderShipments initial={data.data} />;
}
