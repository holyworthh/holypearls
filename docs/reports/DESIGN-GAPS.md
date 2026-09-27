# DESIGN-GAPS — Stage 4 screen gap coverage

Design-coverage task, not a build ticket. It closes the "Ticket gaps" in `docs/design/SCREEN-MAP.md` with Pen frames on the new root **`C9q8v3` — STAGE 4.4 — DESIGN GAP COVERAGE** in `untitled.pen`. No app code was written. `docs/prd`, `docs/tech` and `docs/plan` were not edited.

## Owner decisions applied (27 Sep 2026)

1. **Problem report types (T08-04):** damaged item; missing items or short quantity; wrong item or size; incorrect printing or customization; quality problem.
2. **Cancellation (T07-04):** allowed only before production starts. After production starts, cancellation is blocked and the customer is told to contact support for options, with no promised outcome.
3. **Cancelled orders:** refund, not store credit.
4. **Staff access:** staff permissions control admin access, and MFA applies to every HolyPearls staff member who signs in. Recommendation settings, non-personal exports and Operations home queue visibility stay marked **"permission to be decided"**.
5. **Alerting (T15-05):** incident switches only; no in-app alert dashboard.
6. **Customer MFA:** left out of the security page. Notifications use the existing statuses from TECH-02 §10 (QUEUED, SENT, DELIVERED, FAILED); no new statuses were added.

## Frames added per ticket

### Batch A — Identity

| Ticket | Frames |
| --- | --- |
| T00-06 | 87 Customer sign-in (PJmAF), 90 Signed-in account · security (KReiI) |
| T00-07 | 93 Staff sign-in and MFA (iFub2), 94 Protected admin shell (s3rfoi) |
| T09-01 | 87, 88 Sign-up and verification (Nv9iJ), 89 Password reset (KSASd), 90, 91 Profile (Wulll) |
| T09-02 | 92 Account history and guest linking (iVk2h) |

## New components and tokens

21 components were added (see DESIGN-SYSTEM.md "Stage 4.4 additions"). No new variables were added, so `tokens.json` is unchanged.

## PRD/TECH conflicts found

- None so far in Batch A.

## Open questions

- None so far in Batch A.

## Deviations and gaps left open

- 89 Password reset is drawn as a state board of desktop-width cards. At 375 the same card sits in the mobile sign-in layout of frame 87 (NN0Ko); no separate 375 frame was drawn for each reset step.
