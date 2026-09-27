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

### Batch B — Admin system

The admin shell is `HP/Admin/Sidebar` + `HP/Admin/TopBar` (frame 94). Archetype frames 96–101 are drawn with real content, so each one also delivers part of a Batch C ticket.

| Ticket / archetype | Frames |
| --- | --- |
| T13-03 Operations home | 95 (NSHTn) |
| List archetype | 96 (pTVal): products list, also T02-02 |
| Record detail + history archetype | 97 (zbIzN): payment intent detail, also T04-06 |
| Edit form draft/publish archetype | 98 (j4exc): product editor, also T02-02 |
| Review queue archetype | 99 (cfVRu): payment review queue, also T04-06 |
| Settings archetype | 100 (f2p7r): payment settings and Paystack checklist, also T04-06 |
| Audit/history archetype · T01-01 | 101 (weTNu) |

### Batch C — Admin screens

Each section has its main desktop frame(s) and a states frame with loading, empty, error, 403 and success, plus ticket-specific states. Frames with a 375 decision layout: 99, 103, 112, 113, 116, 121.

| Ticket | Frames |
| --- | --- |
| T01-02 | 102 (pfJJO) |
| T01-07 | 103 (JAuft) |
| T02-02 | 96, 98, 104 (Ku9S1) |
| T02-05 | 105 (sauft) |
| T02-06 | 106 (X3mMi) |
| T03-01 | 107 (GUSNm) |
| T04-02 | 108 (MCTSk) |
| T04-06 | 97, 99, 100, 109 (iPVvj) |
| T05-02 | 110 (khFI5) |
| T05-04 | 111 (p8eBI) |
| T06-01 | 112 (ebdTq) |
| T07-01 | 113 (VdIhv) |
| T07-02 | 114 (HpQ9q) |
| T08-01 | 115 (ItlTv) |
| T11-01 | 116 (XLhMz) |
| T11-02 | 117 (cpQIJ) |
| T13-01 | 118 (rWF0Z) |
| T13-02 | 119 (UOy8G) |
| T13-04 | 120 (Qtzod) |
| T13-05 | 121 (fG7S6) |
| T13-06 | 122 (M4aCyb) |
| T15-05 | 123 (S1fH7) |

## New components and tokens

21 components were added (see DESIGN-SYSTEM.md "Stage 4.4 additions"). No new variables were added, so `tokens.json` is unchanged.

## PRD/TECH conflicts found

- **Payment review reason names.** TECH-05 names only `DUPLICATE_PAYMENT` and `PAID_PARTICIPANT_REMOVED` as review reasons. The other two cases (unclear after all checks, amount/currency mismatch) have no code names, so frame 99 labels them in plain words. Proposed TECH-05 addition: name all review reasons.

- **Refund or credit (T12-05, T13-05).** TECH-05 §12 says Finance "decides refund or credit". PRD-00 §15 and B2B-FR-084 put credit balances in P2, and owner decision 3 says refund. The refund frames offer refund only. Proposed TECH-05 §12 amendment: "refund" (credit when P2 lands).
- **Content page statuses (T02-06).** PRD-00 §8 and TECH-01 §4 define no content-page statuses. Frame 106 reuses the product names DRAFT and PUBLISHED. Proposed TECH-01 addition.
- **Export states (T13-04).** TECH-07 §16 defines no export status names. Frame 120 uses plain words (Generating, Ready, Expired, Failed), not codes.

## Open questions

- **Queue and permission mapping (T13-03):** frame 95 shows an illustrative permission-filtered view. Which permission shows each queue is still to be decided (owner decision 4).
- **Permissions not named in TECH-03 §8.** Owner decision 4 keeps these marked "permission to be decided" in the frames: recommendation rules (110), non-personal exports (120) and Operations home queues (95). These were also left unassigned: brand asset review (116) and template approval (117), which fall under OPS-FR-082/083. The frames use these proposed permissions, labelled as such where they are not settled: CUSTOMER_SUPPORT for the notification log (102) and help inbox (103), and PRICING_MANAGE for delivery zones (108) and installation/freight (119). Please confirm.
- **Hold reason categories and "who needs to act" (T07-02).** OPS-FR-062 names these fields but not their options. Frame 114 shows example values marked "to be decided".
- **Asset version not ready (T11-01).** TECH-01 has no rejected status for brand asset versions. Frame 116 keeps the version NEEDS_REVIEW with a note to the organization. Confirm this is the intended outcome.

## Deviations and gaps left open

- Admin decision screens without a 375 frame: 117 template approval and 115 shipments. They use the same stacked pattern as 99/112/116 (list and detail as separate pages, full-width buttons).
- The admin sidebar has no "Customers & organizations" entry (OPS-FR-080/081). Frames 116–117 open organization records from the breadcrumb. Suggested follow-up: add the entry to `HP/Admin/Sidebar` when that ticket is designed.

- 89 Password reset is drawn as a state board of desktop-width cards. At 375 the same card sits in the mobile sign-in layout of frame 87 (NN0Ko); no separate 375 frame was drawn for each reset step.
