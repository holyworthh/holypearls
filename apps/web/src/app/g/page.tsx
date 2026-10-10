import type { Metadata } from "next";
import { JoinCollection } from "../../components/groups/ParticipantViews";

// The secret sits after "#", which browsers never send to servers (TECH-03 §5).
export const metadata: Metadata = { title: "Group collection", robots: { index: false }, referrer: "no-referrer" };

/** A group collection's share link (T12-01b; Pen 31): no account, no navigation. */
export default function CollectionLinkPage() {
  return <JoinCollection />;
}
