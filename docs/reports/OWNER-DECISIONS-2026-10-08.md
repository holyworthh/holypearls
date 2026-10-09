# Owner decisions of 8 October 2026: what was built

| Decision | Pull request | What changed |
| :-- | :-- | :-- |
| Organizations are created by request and approval (the "middle path"). No PRD, TECH document or ADR covered it. | [#91](https://github.com/holyworthh/holypearls/pull/91) | A verified customer asks for a workspace from `/account/workspace`. Staff approve or decline it in Admin → Workspace requests, and a decline needs a reason. Approving creates the organization and its locations and makes the requester its ACTIVE Owner. Every decision is audited, and the customer is emailed either way. Documented in PRD-05 B2B-FR-005, PRD-06 OPS-FR-084, TECH-01 §2 and §4, and TECH-03 §8. |
| A new staff permission, `ORGANIZATION_APPROVE`, guards approval instead of `ORGANIZATION_SUPPORT`. | [#91](https://github.com/holyworthh/holypearls/pull/91) | The support view stays read-only (OPS-FR-081). See ATTENTION 36 for granting it in production. |
| No escalation: nobody grants a permission or location they don't hold. | [#91](https://github.com/holyworthh/holypearls/pull/91) | Enforced in `organizations/policies.ts` and written into TECH-03 §7 and PRD-05 B2B-FR-091. As a result, only Owners can make someone an Approver. |
| The request flow stays in T10-01 (no T10-01b). | [#91](https://github.com/holyworthh/holypearls/pull/91) | Built in the same PR. |
