import { participationSchema } from "@holypearls/contracts";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ParticipantFlow } from "../../../../components/groups/ParticipantViews";
import { serverApi } from "../../../../lib/server-api";

export const metadata: Metadata = { title: "Your answers", robots: { index: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

/** A participant's own submission (T12-01b; Pen 31, 76): reached by their guest session or the account they joined with. */
export default async function ParticipantPage({ params }: { params: Promise<{ participantId: string }> }) {
  const { participantId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(participantId)) notFound();
  const participation = await serverApi(`/v1/participants/${participantId}`, participationSchema);
  if (!participation.ok) {
    if (participation.status === 404 || participation.status === 401) notFound();
    throw new Error(participation.error.message);
  }
  return <ParticipantFlow initial={participation.data} />;
}
