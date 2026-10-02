import { adminProblemSchema } from "@holypearls/contracts";
import { ErrorState, PermissionDenied } from "@holypearls/ui";
import { notFound } from "next/navigation";
import { serverApi } from "@/lib/server-api";
import { requireAdmin } from "../../admin-session";
import { ProblemTriage } from "./ProblemTriage";

/** One problem report (Pen 129 · Nqk5y detail). CUSTOMER_SUPPORT. */
export default async function ProblemPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("CUSTOMER_SUPPORT")) return <PermissionDenied permission="CUSTOMER_SUPPORT" />;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const report = await serverApi(`/v1/admin/problems/${id}`, adminProblemSchema);
  if (!report.ok) {
    if (report.status === 404) notFound();
    return <ErrorState title="We couldn't load this report" body="Something went wrong on our side. Try again, or share the request ID with support." requestId={report.error.requestId} />;
  }
  return <ProblemTriage initial={report.data} />;
}
