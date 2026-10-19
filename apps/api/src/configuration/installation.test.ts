import { describe, expect, it } from "vitest";
import { installationAdjustments, type InstallationAreaRule } from "./installation.js";

const lagos: InstallationAreaRule = { name: "Lagos", states: ["Lagos"], productIds: ["banner", "wall"], pricing: "FIXED", rateMinor: 1_500_000n, travelMinor: null };
const abuja: InstallationAreaRule = { name: "Abuja FCT", states: ["FCT"], productIds: ["banner"], pricing: "FIXED_PLUS_TRAVEL", rateMinor: 2_000_000n, travelMinor: 5_000_000n };
const rules = { surveyAboveSqM: 6, noticeWorkingDays: 5 };
// Monday 19 October 2026, 10:00 Lagos.
const now = new Date("2026-10-19T09:00:00Z");
const ask = (extra: Partial<Parameters<typeof installationAdjustments>[2]>) =>
  installationAdjustments([lagos, abuja], rules, { productId: "banner", productName: "Roll-Up Banner", quantity: 2, state: "Lagos", areaSqM: null, date: "2026-10-30", now, ...extra });

describe("installation rules (OPS-FR-102)", () => {
  it("prices an installation the area covers: a fee a piece, plus travel where set", () => {
    expect(ask({})).toEqual([{ state: "PRICE_READY", code: "INSTALLATION", message: "Installation in Lagos: ₦15,000 a piece.", charge: { label: "Installation (Lagos)", amountMinor: 3_000_000n } }]);
    expect(ask({ state: "FCT" })[0]).toMatchObject({ state: "PRICE_READY", charge: { label: "Installation (Abuja FCT)", amountMinor: 9_000_000n } });
  });

  it("quotes what no area covers, an area's quote pricing, and graphics over the survey size", () => {
    expect(ask({ state: "Kano" })[0]).toMatchObject({ state: "QUOTE_REQUIRED", message: expect.stringContaining("in Kano at a set price yet") });
    expect(ask({ productId: "wall", state: "FCT" })[0]!.state).toBe("QUOTE_REQUIRED");
    expect(installationAdjustments([{ ...lagos, pricing: "QUOTE", rateMinor: null }], rules, { productId: "banner", productName: "Roll-Up Banner", quantity: 1, state: "Lagos", areaSqM: null, now })[0]!.state).toBe("QUOTE_REQUIRED");
    expect(ask({ areaSqM: 6.5 })[0]).toMatchObject({ state: "QUOTE_REQUIRED", message: "Over 6 m², we survey the site first and then send a quote." });
    expect(ask({ areaSqM: 6 })[0]!.state).toBe("PRICE_READY");
    expect(ask({ state: undefined })[0]!.state).toBe("QUOTE_REQUIRED");
  });

  it("refuses a date inside the notice period, and the rules can be turned off", () => {
    // Five working days after Monday 19 October is Monday 26 October.
    const soon = ask({ date: "2026-10-23" });
    expect(soon[0]).toMatchObject({ blocking: true, message: "We need 5 working days' notice to install. Choose 2026-10-26 or later." });
    expect(ask({ date: "2026-10-26" })).toHaveLength(1);
    const off = installationAdjustments([lagos], { surveyAboveSqM: null, noticeWorkingDays: null }, { productId: "banner", productName: "Roll-Up Banner", quantity: 1, state: "Lagos", areaSqM: 40, date: "2026-10-20", now });
    expect(off).toEqual([expect.objectContaining({ state: "PRICE_READY" })]);
  });
});
