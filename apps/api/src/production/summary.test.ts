import { describe, expect, it } from "vitest";
import { orderSummaryStatus } from "./production.js";

/* T07-01 done when: the order summary status table tests pass (PRD-00 §8). */

type Status = Parameters<typeof orderSummaryStatus>[0][number]["status"];
const items = (...statuses: (Status | `${Status}+HOLD`)[]) => statuses.map((status) => ({ status: status.replace("+HOLD", "") as Status, onHold: status.endsWith("+HOLD") }));

describe("order summary status (PRD-00 §8)", () => {
  it.each([
    [["QUEUED"], "CONFIRMED"],
    [["QUEUED", "AWAITING_PREREQUISITE"], "CONFIRMED"],
    [["AWAITING_PREREQUISITE", "AWAITING_PREREQUISITE"], "AWAITING_PREREQUISITE"],
    [["AWAITING_PREREQUISITE", "IN_PRODUCTION"], "IN_PRODUCTION"],
    [["QUEUED", "QUALITY_CHECK"], "IN_PRODUCTION"],
    [["IN_PRODUCTION", "READY_TO_DISPATCH"], "PARTIALLY_READY"],
    [["READY_TO_DISPATCH", "READY_TO_DISPATCH"], "READY_TO_DISPATCH"],
    [["IN_PRODUCTION", "READY_AWAITING_RELEASE", "READY_AWAITING_RELEASE"], "BALANCE_REQUIRED"],
    [["READY_TO_DISPATCH", "READY_AWAITING_RELEASE"], "BALANCE_REQUIRED"],
    [["IN_PRODUCTION+HOLD", "READY_AWAITING_RELEASE"], "ON_HOLD"],
    [["QUEUED+HOLD"], "ON_HOLD"],
    [["DISPATCHED", "IN_PRODUCTION+HOLD"], "PARTIALLY_DISPATCHED"],
    [["DISPATCHED", "READY_TO_DISPATCH"], "PARTIALLY_DISPATCHED"],
    [["DISPATCHED", "DISPATCHED"], "DISPATCHED"],
    [["DELIVERED", "DISPATCHED"], "PARTIALLY_DELIVERED"],
    [["DELIVERED", "IN_PRODUCTION"], "PARTIALLY_DELIVERED"],
    [["DELIVERED", "DELIVERED"], "DELIVERED"],
    [["DELIVERED", "CANCELLED"], "DELIVERED"],
    [["READY_TO_DISPATCH", "CANCELLED"], "READY_TO_DISPATCH"],
    [["CANCELLED", "CANCELLED"], "CANCELLED"],
  ] as const)("%j → %s", (statuses, expected) => {
    expect(orderSummaryStatus(items(...statuses))).toBe(expected);
  });
});
