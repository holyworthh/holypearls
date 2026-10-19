import type { OpsHome, StaffPermission } from "@holypearls/contracts";
import type { Database } from "@holypearls/db";
import { listReviews } from "../payments/admin.js";
import { productionBoard } from "../production/production.js";
import { proofQueue } from "../proofs/proofs.js";
import { listQuotes, listRequests } from "../quotes/quotes.js";
import { problemQueue } from "../shipments/problems.js";
import { shippingQueue } from "../shipments/shipments.js";
import { listHelpInbox } from "./help-requests.js";

/*
 * Operations home (T13-03; PRD-06 §17; Pen 95): the ten work queues, not
 * charts. Each queue is shown with the permission its own list needs (the
 * same as its sidebar section), opens that list filtered, and is counted only
 * for people who may see it: hidden queues are never counted or sent.
 */

type Queue = OpsHome["queues"][number];
type Board = Awaited<ReturnType<typeof productionBoard>>;
const DAY_MS = 86_400_000;

const age = (iso: string, now: Date) => {
  const hours = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 3_600_000));
  return hours < 24 ? `${hours} h` : `${Math.round(hours / 24)} days`;
};
const inGroups = (board: Board, groups: readonly string[]) => board.groups.filter((group) => groups.includes(group.group)).flatMap((group) => group.items);

export async function opsHome(db: Database, permissions: ReadonlySet<StaffPermission>, now: Date): Promise<OpsHome> {
  const can = (...any: StaffPermission[]) => any.some((permission) => permissions.has(permission));
  // The production board feeds three queues; load it once, and only for people who see them.
  const board = can("PRODUCTION_MANAGE") ? await productionBoard(db) : null;
  const queues: (Queue | null)[] = await Promise.all([
    can("QUOTE_MANAGE")
      ? listRequests(db, {}).then(({ items }) => {
          const late = items.filter((item) => now.getTime() - Date.parse(item.submittedAt) > DAY_MS).length;
          return { key: "NEW_REQUESTS", label: "New Requests", count: items.length, detail: late ? `${late} waiting over 24 h` : "All under 24 h", href: "/projects" } as const;
        })
      : null,
    can("QUOTE_MANAGE")
      ? listQuotes(db, { status: "PENDING_REVIEW" }).then(({ items }) => {
          const oldest = items.at(-1);
          return { key: "QUOTES_TO_PREPARE", label: "Quotes to Prepare", count: items.length, detail: oldest ? `Oldest: ${age(oldest.updatedAt, now)}` : "Nothing waiting", href: "/quotes?status=PENDING_REVIEW" } as const;
        })
      : null,
    can("PROOF_MANAGE")
      ? proofQueue(db, undefined).then(({ proofs }) => ({ key: "PROOFS", label: "Proofs and Artwork", count: proofs.length, detail: `${proofs.length} to prepare or check`, href: "/proofs" }) as const)
      : null,
    board
      ? (() => {
          const waiting = inGroups(board, ["WAITING"]).length;
          const held = inGroups(board, ["ON_HOLD"]).length;
          return { key: "BLOCKED_ORDERS", label: "Blocked Orders", count: waiting + held, detail: `${waiting} missing deposit or proof · ${held} on hold`, href: "/production?view=list&group=WAITING,ON_HOLD" } as const;
        })()
      : null,
    board
      ? (() => {
          const queued = inGroups(board, ["QUEUED"]).length;
          const running = inGroups(board, ["IN_PRODUCTION"]).length;
          return { key: "PRODUCTION", label: "Production", count: queued + running, detail: `${running} in production · ${queued} queued`, href: "/production?view=list&group=QUEUED,IN_PRODUCTION" } as const;
        })()
      : null,
    board
      ? (() => {
          const items = inGroups(board, ["QUALITY_CHECK"]);
          const oldest = items.map((item) => item.updatedAt).sort()[0];
          return { key: "QUALITY_CHECK", label: "Quality Check", count: items.length, detail: oldest ? `Oldest: ${age(oldest, now)}` : "Nothing waiting", href: "/production?view=list&group=QUALITY_CHECK" } as const;
        })()
      : null,
    can("FULFILMENT_MANAGE")
      ? shippingQueue(db).then(({ ready }) => {
          const awaiting = board ? inGroups(board, ["READY"]).filter((item) => item.status === "READY_AWAITING_RELEASE").length : 0;
          return { key: "READY_TO_DISPATCH", label: "Ready to Dispatch", count: ready.length, detail: awaiting ? `${awaiting} awaiting balance` : `${ready.length} order${ready.length === 1 ? "" : "s"} to ship`, href: "/shipments" } as const;
        })
      : null,
    can("PAYMENT_VIEW", "PAYMENT_MANAGE")
      ? listReviews(db, "OPEN").then(({ items }) => {
          const duplicates = items.filter((item) => item.reason === "DUPLICATE_PAYMENT").length;
          return { key: "PAYMENTS", label: "Payments Needing Attention", count: items.length, detail: duplicates ? `${duplicates} DUPLICATE_PAYMENT` : `${items.length} to review`, href: "/payments/reviews" } as const;
        })
      : null,
    can("CUSTOMER_SUPPORT")
      ? listHelpInbox(db, { status: "OPEN", limit: 1 }).then(({ counts }) => ({ key: "HELP", label: "Help Requests", count: counts.OPEN, detail: `${counts.OPEN} OPEN`, href: "/help?status=OPEN" }) as const)
      : null,
    can("CUSTOMER_SUPPORT")
      ? problemQueue(db, undefined).then(({ items }) => {
          const fresh = items.filter((item) => item.status === "NEW").length;
          return { key: "PROBLEMS", label: "Problem Reports", count: items.length, detail: `${fresh} NEW`, href: "/problems" } as const;
        })
      : null,
  ]);
  return { queues: queues.filter((queue): queue is Queue => queue !== null) };
}
