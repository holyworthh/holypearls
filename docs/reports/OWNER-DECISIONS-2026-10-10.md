# Owner decisions of 10 October 2026: what was built

| Decision | Pull request | What changed |
| :-- | :-- | :-- |
| Group collections: the organization pays for every item, and group orders go to the organization (one central location or the participant's approved branch). Participant payment and home delivery are retired. This confirms frame 76's "RETIRED (owner, 27 Sep)" note over PRD-05 B2B-FR-063–065 and frame 132's "Each participant pays" and "To each participant's home" options. | [#99](https://github.com/holyworthh/holypearls/pull/99) | T12-01 has no payment mode, and delivery is CENTRAL or BRANCHES only. T12-01b is built without participant payment. T12-03's paid-participant removal ([was T12-05]) becomes simple removal: excluded from totals and kept in history. |

**Proposed document changes (not made; `docs/prd` and `docs/tech` are edited only when asked):**

- **PRD-05:**
  - B2B-FR-052: drop "payment" from the organizer's field choices.
  - B2B-FR-063: "Participants pick an approved branch, or see nothing if delivery is central. No home address is asked."
  - B2B-FR-064: "Participants never see payment screens; the organization pays."
  - B2B-FR-065: retire it, or reword as "A removed participant is excluded from the totals and kept in history."
- **TECH-03 §5:** remove "starting a participant payment" from the actions that need an email code.
- **TECH-01 §1:** remove "participant payments" from the insert-only list.
- **Pen frame 132:** remove the "Who pays" choices, "To each participant's home", and the Delivery address and Payment field rows.
