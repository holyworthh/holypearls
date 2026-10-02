import { customerProofSchema } from "@holypearls/contracts";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProofView } from "../../../../../components/proofs/ProofView";
import { SiteShell } from "../../../../../components/site/SiteShell";
import { serverApi } from "../../../../../lib/server-api";

export const metadata: Metadata = { title: "Your proof", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

/** A proof on the customer's order (Pen 26, 49, 50). Same access as the order; anyone else gets 404. */
export default async function ProofPage({ params }: { params: Promise<{ id: string; proofId: string }> }) {
  const { id, proofId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f-]{36}$/.test(proofId)) notFound();
  const proof = await serverApi(`/v1/orders/${id}/proofs/${proofId}`, customerProofSchema);
  if (!proof.ok) {
    if (proof.status === 404 || proof.status === 400) notFound();
    throw new Error(proof.error.message);
  }
  return (
    <SiteShell footer={false}>
      <ProofView initial={proof.data} />
    </SiteShell>
  );
}
