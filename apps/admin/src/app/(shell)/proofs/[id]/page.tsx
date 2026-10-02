import { adminProofSchema } from "@holypearls/contracts";
import { ErrorState, PermissionDenied } from "@holypearls/ui";
import { notFound } from "next/navigation";
import { serverApi } from "@/lib/server-api";
import { requireAdmin } from "../../admin-session";
import { ProofEditor } from "./ProofEditor";

/** Proof preparation (Pen 112 · dfTCG; OPS-FR-051–052). PROOF_MANAGE. */
export default async function ProofPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("PROOF_MANAGE")) return <PermissionDenied permission="PROOF_MANAGE" />;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const proof = await serverApi(`/v1/admin/proofs/${id}`, adminProofSchema);
  if (!proof.ok) {
    if (proof.status === 404) notFound();
    return <ErrorState title="We couldn't load this proof" body="Something went wrong on our side. Try again, or share the request ID with support." requestId={proof.error.requestId} />;
  }
  return <ProofEditor initial={proof.data} />;
}
