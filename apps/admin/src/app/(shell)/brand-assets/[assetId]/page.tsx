import { adminAssetSchema } from "@holypearls/contracts";
import { ErrorState, PermissionDenied } from "@holypearls/ui";
import { notFound } from "next/navigation";
import { serverApi } from "@/lib/server-api";
import { requireAdmin } from "../../admin-session";
import { AssetReview } from "./AssetReview";

/** One brand asset with its versions: mark ready, keep in review, retire or archive (Pen 116). STAFF_ADMIN. */
export default async function BrandAssetAdminPage({ params }: { params: Promise<{ assetId: string }> }) {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("STAFF_ADMIN")) return <PermissionDenied permission="STAFF_ADMIN" />;
  const { assetId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(assetId)) notFound();
  const asset = await serverApi(`/v1/admin/brand-assets/${assetId}`, adminAssetSchema);
  if (!asset.ok) {
    if (asset.status === 404) notFound();
    return <ErrorState title="We couldn't load this asset" body="Something went wrong on our side. Try again, or share the request ID with support." requestId={asset.error.requestId} />;
  }
  return <AssetReview initial={asset.data} canSeeOrganization={admin.permissions.includes("ORGANIZATION_SUPPORT")} />;
}
