# HolyPearls — Cross-Flow Integration and Low-Fidelity Freeze Audit

Status: Final architecture audit of frozen Stages 3.1A–F. This is a static trace of the low-fidelity boards and source documents. It is not an implementation test.

## Audit basis and result

The audit uses the Stage 3.1A homepage, 3.1B discovery, 3.1C configurator, 3.1D Project Builder, 3.1E transaction and fulfilment, and 3.1F Workspace boards. It also uses their research, execution briefs, and state matrices. The shared Pencil board is `C:\Users\ASUS\Desktop\design\holypeals-design\untitled.pen`.

All 16 required journeys pass after the corrections in the issue register. No blocker or major cross-system contradiction remains in the low-fidelity model. These results establish architecture consistency; implementation must still enforce the stated permissions and record contracts.

## Journey traces

### J01 — Public product to custom Polo, quote, production, exact reorder — PASS after correction

- **Start / systems:** Public homepage or discovery → Staff Polo PDP/configurator (A–C) → quote, payment, proof, order and shipment (E) → Exact Reorder (E).
- **Records / states:** Catalogue Product → Product Configuration with estimate or quote required → Quote Request → immutable Quote version → accepted Quote → payment/deposit → Proof V1 approval → item production → Quality Check → commercial release → shipment → delivered Order → new Exact Reorder. A changed artwork starts Reorder With Changes.
- **Permission / data:** Customer or secure guest may act on their own records. Carry product and source mode, navy colour, quantity 50, size matrix, left-chest embroidery, artwork version, needed-by date, destination and files into the quote line item. The order keeps the accepted quote and proof references.
- **End / issue:** Delivered order and an unchanged historical reorder source. The explicit configuration snapshot contract was added to E; no manual reconstruction is needed.

### J02 — Business Cards direct purchase, proof, delivery, exact reorder — PASS

- **Start / systems:** Discovery → Business Cards PDP/configurator (B–C) → direct payment, proof, order and shipment (E).
- **Records / states:** Product Configuration with paper, sides, finish, quantity, artwork and destination → `PRICE_READY` → checkout/payment → Proof approval where required → production → Quality Check → dispatch → delivered Order → Exact Reorder.
- **Permission / data:** Customer or secure guest sees only their own quote/order/proof. Price-ready data and artwork stay attached to the order; the reorder cites the historical specification.
- **End / issue:** Simple paid order remains a simple path. No quote-only Project or Workspace step is imposed. No issue.

### J03 — Event Project to Quote V2 and partial delivery — PASS after correction

- **Start / systems:** Homepage → Event Project Builder (D) → Quote V1/V2, deposit, item proofs, balance, order and multiple shipments (E).
- **Records / states:** Project `HP-P-2026-0142` holds 250 attendees, 30 crew, Lagos, six-week need, logo/guidelines and selected items. Quote V1 stays in history; Quote V2 is accepted. Polo and Backdrop proofs are approved; Badge V1 has changes requested and Badge V2 awaits approval. Backdrop stays `READY — AWAITING RELEASE` until the balance clears. Item production, Quality Check and partial shipments have separate states.
- **Permission / data:** Authorized customer accepts the quote and proof; payment and release follow the configured schedule. The custom sponsor welcome kit, 250 units, remains on the Project as an item outside Quote V2. It is not included in the ₦850,000 four-group order. Adding it requires scope review and the existing quote/change path.
- **End / issue:** Partial fulfilment and multiple shipments lead to delivery without hiding Badge attention or balance. The kit exclusion was made explicit in E so Project context does not disappear silently.

### J04 — Staff Uniform Project to Group Collection and Order Draft — PASS after correction

- **Start / systems:** Homepage → Staff Uniform Project (D) → authorized organizer Group Collection, participant links and CSV import (F) → Order Draft (F) → existing approval and HolyPearls flow.
- **Records / states:** Saved Project → selected/current Staff Polo configuration → Group Collection open → 45 secure-link submissions plus 15 CSV-imported contractors; two CSV issues are resolved → closed collection → reviewed Order Draft. The primary fixture is 60 people and two locations. The 120-person scale and 120-row CSV fixtures are independent.
- **Permission / data:** Organizer needs member/organization access. Participants can edit only their own response while policy and collection state allow it. Draft retains Project, Collection, Template and submission references, files, size matrix, names and Lekki/VI delivery groups. Kitchen Wear, Aprons and Logo Embroidery remain linked to the Project outside this Polo draft.
- **End / issue:** Reviewed Order Draft, not a production order. D/F now state the optional saved-Project handoff, selected-item scope and organizer access boundary.

### J05 — Approved Order Draft and quote within authority — PASS

- **Start / systems:** F Order Draft → Organization Approval → E HolyPearls Quote.
- **Records / states:** Customer request estimated at ₦450,000 → internal approval up to ₦450,000 → final Quote at ₦440,000 → `ORGANIZATION APPROVAL VALID` → authorized acceptance → E payment/order flow.
- **Permission / data:** The organization approver sets the spend/scope authority. Only a member with `CAN ACCEPT HOLYPEARLS QUOTE` accepts the commercial quote. The approval record and quote remain distinct.
- **End / issue:** Quote can proceed without redundant internal approval. No issue.

### J06 — Quote above approved authority — PASS

- **Start / systems:** F Order Draft and internal approval → E final Quote → F reapproval → E acceptance.
- **Records / states:** ₦450,000 approved → ₦485,000 quoted → `ORGANIZATION_REAPPROVAL_REQUIRED` → approval of changed amount/scope → authorized quote acceptance. Original approval, final Quote and reapproval remain in history.
- **Permission / data:** Quote stays visible but acceptance is blocked for a member without authority. Approver and quote acceptor may be different people. A material scope change can also trigger reapproval under organization policy.
- **End / issue:** Commercial terms are accepted only within valid authority. No duplicate Project, Draft or Quote is created. No issue.

### J07 — Logo V4/V5 and Template impact — PASS

- **Start / systems:** F Brand Assets → Product Template → Template Order or related historical Order.
- **Records / states:** Logo V4 is Production Ready; V5 is Needs Review. If V4 remains valid, the Template is `AVAILABLE USING LOGO V4`; V5 approval leads to production-sensitive Template review/migration. If V4 is retired for new use, the Template is `BLOCKED — ASSET REVIEW REQUIRED` until V5 or another approved asset is selected.
- **Permission / data:** Authorized asset/template managers change current use. Historical orders retain their exact V4 reference and audit history. New orders never silently use retired V4.
- **End / issue:** Template orderability follows the asset decision. No issue.

### J08 — Location Template Order — PASS

- **Start / systems:** F Workspace and approved Staff Polo Template → Order Request/approval if needed → E HolyPearls commercial flow.
- **Records / states:** Location Manager chooses allowed quantity, size mix, needed-by date and Lekki delivery. Locked product, brand and placement stay fixed. New Template Order is distinct from historical Exact Reorder.
- **Permission / data:** Location Manager sees Lekki records only. Organization-wide approved asset is referenced by version. Approval applies if the policy threshold is crossed.
- **End / issue:** New scoped order for Lekki. Template Detail now links to related historical orders without conflating the two order types.

### J09 — Company Store, individual mode — PASS

- **Start / systems:** Private ACME Store (F) → individual Order Request → organization policy → E quote/order/payment.
- **Records / states:** Employee selects approved Polo, size, allowed name and branch → `INDIVIDUAL COMPANY ORDER REQUEST`. Allowance, approval and payment apply as configured; it does not join a Collection.
- **Permission / data:** Employee sees their own submission and allowed products; admin sets routing mode. Store carries identity, branch and selected fields into the request.
- **End / issue:** One independent request enters HolyPearls flow. Employee-facing copy states the submission outcome without technical routing language. No issue.

### J10 — Company Store, collection mode — PASS

- **Start / systems:** Private ACME Store (F) → connected Group Collection → organizer review → Order Draft → approval/E flow.
- **Records / states:** Employee chooses size, name and branch → `PARTICIPANT SUBMISSION` in the connected Collection. Organizer closes and reviews the Collection before it creates an Order Draft. Submission alone creates no Order.
- **Permission / data:** Employee sees only their response. Organizer sees authorized aggregate and issues. Store configuration, not employee choice, sets the mode.
- **End / issue:** Reviewed Order Draft proceeds through approval and the existing HolyPearls systems. No issue.

### J11 — Collection reopening boundaries — PASS

- **Start / systems:** F Collection lifecycle → Draft/approval/E quote or production depending on downstream state.
- **Records / states:** Closed without Draft may reopen. Reopen with Draft warns and marks it `STALE — COLLECTION CHANGED`; reclose requires regenerate/reconcile. After internal approval, use controlled Change Request. After Quote, use Project/Order Change and quote/reapproval as needed. After production starts, participant data is read-only and changes use Production Change Request.
- **Permission / data:** Authorized organizer controls the Collection. Participant secure edit works only while open and allowed by policy. Historical Draft, approval, Quote and production records are preserved.
- **End / issue:** Each mutation has a visible downstream effect. No silent mutation. No issue.

### J12 — Paid participant removal — PASS

- **Start / systems:** F participant-paid Collection → organizer removal → E payment/refund model.
- **Records / states:** Paid submission → `PAID_PARTICIPANT_REMOVED`; submission leaves the production aggregate while the original payment stays recorded → `PAYMENT_RESOLUTION_REQUIRED` → refund or credit review using E financial states.
- **Permission / data:** Only authorized organizer removes a participant. Participant and payment references remain linked for audit; financial resolution needs appropriate authority.
- **End / issue:** Production count changes while money stays accountable. The same rule applies to cancellation of a participant-paid Collection. No issue.

### J13 — Group Collection to multi-location delivery — PASS

- **Start / systems:** F Workspace/Collection → location-grouped Draft → E Order and shipment cards.
- **Records / states:** Lekki and VI participant submissions aggregate by location, size and allowed personalization → Draft with branch delivery groups → one or more shipments per destination.
- **Permission / data:** Participant chooses an allowed branch and sees no peer data; no home address is requested in this branch-delivery fixture. Managers see only authorized locations. Location reference survives into fulfilment.
- **End / issue:** Shipment tracking shows destination and partial status without flattening locations. No issue.

### J14 — Guest commerce without Workspace — PASS after correction

- **Start / systems:** Public product or Project (A–D) → secure quote, payment, proof and tracking (E).
- **Records / states:** Guest Product Configuration or Project → Quote/direct Order → payment → Proof → Order → delivery. Secure links reopen the same record; account creation remains optional.
- **Permission / data:** Guest token grants only the linked record and action. Organizer-managed Group Collection requires organization access, but ordinary guest commerce does not require a Workspace or Organization record.
- **End / issue:** Guest tracks delivered order. D/F handoff copy now makes the optional Workspace boundary explicit.

### J15 — Human handoff with context — PASS after correction

- **Start / systems:** Need Help, Project support, Quote question, Proof question or Order support (C–E).
- **Records / states:** Support request references the current Product Configuration/Project/Quote version/Proof version/Order as applicable; the source record is not replaced.
- **Permission / data:** Only the customer or authorized guest/member may attach the record context. Carry current step, selected files, relevant asset/version, organization and location scope. Support access follows the same record permission.
- **End / issue:** Customer receives a contextual support handoff. E shared primitives now state the full handoff contract.

### J16 — Failure and recovery chain — PASS

- **Start / systems:** D Polo Project autosave → E payment, proof and shipment exception.
- **Records / states:** Autosave fails then retries on the same Project; payment fails then retries on the same quote/order; artwork issue leads to replacement Proof version and review; production resumes after valid approval; shipment exception resolves before delivery.
- **Permission / data:** The same authorized customer/guest returns to each record. IDs, selected files, payment attempts, proof versions, hold reason and shipment events remain in history. The interface states what saved and what needs action.
- **End / issue:** Delivered Order with complete recovery history and no duplicate commercial record. No issue.

## Issue register and correction reruns

| ID | Severity | Finding | Smallest correction | Affected journeys and recheck |
| --- | --- | --- | --- | --- |
| I-01 | Minor | Primary 60-person Group Setup line said 120 employees. | Stage F Group Setup now says 60 people: 45 secure-link, 15 CSV, two initial CSV issues and two locations. Independent 120-person and 120-row fixtures stay separate. | J04: fixture, import and location totals now agree. PASS. |
| I-02 | Major | Event Project included a 250-unit custom welcome kit, but Quote V2 and the four-group Order did not state its disposition. | Stage E Quote and Event Order now keep it on the Project, outside Quote V2 and the ₦850,000 order, pending separate scope review. | J03: Project item is still referenced; accepted quote/order scope remains explicit. PASS. |
| I-03 | Major | Direct configurator-to-Quote handoff did not explicitly list the full configuration snapshot. | Stage E Quote line item contract now carries product/source, quantity, sizes, decoration, placement, artwork/version, deadline, destination and files across Quote versions. | J01 and J02: accepted terms and reorder source have traceable inputs. PASS. |
| I-04 | Major | Saved Staff Uniform Project to Collection did not state selected-item scope, Draft provenance or organizer authority. | Stage D/F now link the saved Project and selected Staff Polo configuration to the Collection and Draft. Other selected Project items stay on the Project. Organizer needs member/organization access. | J04, J13 and J14: data and access boundaries are coherent. PASS. |
| I-05 | Minor | Some return links across Order, Quote, Proof, Template and Group were implicit. | Stage E Order Tracking links to accepted Quote and approved Proofs. Stage F Template links historical orders; completed Group links its created Order. | J01, J03, J07 and J10: users can return to source and result records. PASS. |
| I-06 | Minor | Transactional support handoff did not name all carried context. | Stage E shared handoff contract now includes record, version, files, step, customer/guest and organization/location context. | J15 and J16: support and recovery retain context. PASS. |

These are board and document corrections. The reruns above are renewed architecture traces of the affected screens and states, not automated application tests.

## Canonical terminology and state handoffs

| Term | Fixed meaning and handoff |
| --- | --- |
| Catalogue Product | HolyPearls sellable product definition. PDP starts here. |
| Product Configuration | One buyer's purchase selections. It becomes a quote request or direct order input. |
| Project | Outcome-led customer brief with one or more selected products. It can request a quote or start a scoped Collection. |
| Workspace Product Template | Reusable approved organization production specification with asset versions and locked/editable fields. |
| Exact Reorder | New order from an unchanged historical Order and approved specification. Any changed artwork uses Reorder With Changes. |
| Template Order | New purchase from a current approved Template. It is not an Exact Reorder. |
| Group Collection | Temporary participant-data collection. It closes and is reviewed before Draft creation. |
| Participant Submission | One private response within a Collection. It is not an Order. |
| Order Request | Customer-side purchasing request. It may require Organization Approval. |
| Order Draft | Reviewed, aggregated pre-commercial data. Reopening its Collection can make it stale. |
| Organization Approval | Customer's internal amount/scope authority. It does not accept HolyPearls commercial terms. |
| HolyPearls Quote | Versioned commercial proposal. V1/V2/V3 remain immutable; acceptance names one active version. |
| HolyPearls Quote Acceptance | Authorized customer acceptance of quoted commercial terms. It is separate from Organization Approval and payment. |
| Payment | Deposit, balance or full payment with attempts and refund history. Acceptance, payment and release are separate states. |
| Proof | Versioned production artwork for customer review. A waiting proof is never labelled approved. |
| HolyPearls Order | Commercial/production record after direct purchase or accepted-quote conditions. It contains item-level work and shipment links. |
| Production release | Production-ready item can wait for commercial release; `READY — AWAITING RELEASE`, `READY TO DISPATCH` and `DISPATCHED` are distinct. |
| Company Store submission | Routes to either an Individual Company Order Request or a Participant Submission according to admin mode. |

The core handoff chain is **Catalogue Product → Product Configuration or Project → Quote Request or direct Order**. The organization branch is **Template/Project → Collection → reviewed Order Draft → Organization Approval when required → HolyPearls Quote → Quote Acceptance → payment/order**. Fulfilment is **proof approval → production → Quality Check → commercial release → shipment → delivery → issue or reorder**. Each arrow carries source references; no arrow turns one record type into a synonym for another.

## Entity and identifier handoff map

| Entity | Customer reference | Required links and history |
| --- | --- | --- |
| Project | `HP-P-…` | Customer/guest, selected Catalogue Products and Configurations, files, need, destination, quote requests and optional Collections. |
| Product Configuration | Shown within product/project context | Catalogue Product ID, source mode, field selections, quantity/size matrix, artwork asset/version and source files. |
| Group Collection | `HP-G-…` | Organization, location scope, source Project/Template/Configuration, campaign policy, participant submissions and Draft versions. |
| Order Request / Draft | Customer-side reference / `HP-DRAFT-…` | Requester, organization/location, Collection and submission references, amount/scope approval, selected configuration and stale state. |
| Quote | `HP-Q-…` plus V1/V2/V3 | Source Project/Configuration/Draft, immutable line-item snapshots, commercial terms, expiry, revision and acceptance history. |
| Order | `HP-…` | Accepted Quote or direct purchase, payments, proof versions, item production, release gates, shipments, issues and reorder source. |
| Asset / Template | Named version and template reference | Approved/retired asset versions, linked Templates and historical Orders. Historical references never change. |
| Shipment | Customer-visible shipment reference | Order, item quantities, destination/location and immutable tracking events. |

References help people navigate and support the order. Server-side authorization uses identity, record ownership, organization, location and token scope; it never trusts the displayed ID format. Customer screens do not expose database IDs.

## Authorization and privacy check

- A Buyer cannot administer members by default. An Approver can approve the organization request but does not gain HolyPearls Quote Acceptance by that role alone. A quote acceptor needs its own capability and valid amount/scope authority.
- A Location Manager acts only in allowed locations. A Viewer cannot mutate. Deactivation removes future access but retains the member's past audit actions.
- A participant link reaches one participant's submission. It cannot reveal peers. Secure guest quote, proof and tracking links reach only their linked record and action. Reverification applies to sensitive actions under the existing secure-access rules.
- Member and guest actions carry actor, organization/location if present, record/version and time into audit history. Historical asset, quote, proof and payment records remain immutable or append-only under their approved models.

## Navigation, mobile and indexing check

The public path reaches PDP and Project Builder. A customer can move from Order Tracking to the accepted Quote and approved Proofs; a Template reaches related historical Orders; an Asset reaches linked Templates; a completed Collection reaches its created Order; Workspace attention reaches active Orders. These links preserve the current secure access context and do not open another customer's record.

The frozen mobile compositions cover Polo configuration, Project Builder, Quote, Proof, Order Tracking, participant response, Company Store and Workspace attention. The participant path has no Workspace navigation or peer data. Critical actions use their existing responsive layouts; this audit adds no high-fidelity design.

Homepage, Product Directory, Category Hubs, Product pages, public Project/solution landing pages and resources are indexable with stable canonical URLs. Configurator drafts where defined, Project drafts, Quotes, Proofs, Orders, Workspace, Assets, Templates, Collections, participant pages, Company Store and internal approval are private and `NOINDEX`. Transactional data does not enter public metadata.

## Freeze decision

- All 16 required journeys have been traced. Six findings were corrected in place and affected journeys were retraced.
- No Blocker or Major contradiction remains in the low-fidelity architecture. Guest commerce works without Workspace. Internal approval, quote acceptance, payment and release remain separate.
- Stages 3.1A–F remain frozen as system inputs. No new feature domain, Stage 3.1G work, high-fidelity styling, PRD or HolyPearls internal admin system was added.

**HOLYPEARLS LOW-FIDELITY ARCHITECTURE — FROZEN**  
**READY FOR HIGH-FIDELITY DESIGN + IMPLEMENTATION PRDs**
