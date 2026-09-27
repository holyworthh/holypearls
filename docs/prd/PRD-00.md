# HolyPearls — PRD 00: Master Index, Glossary & Product Rules

**Version:** 2.0 (27 September 2026). Replaces PRD 00 v1. **Status:** Approved. Changes need a written amendment (see section 14).

This document is the starting point for everyone working on HolyPearls. It explains what the product is, defines the words we use, lists the official status names, and sets the rules every other document follows.

---

## 1\. What HolyPearls is

HolyPearls makes, prints, embroiders and sources physical branded products: garments, uniforms, embroidery, apparel printing, paper print, large-format print, packaging, promotional merchandise, and multi-product brand projects.

The website lets individuals, small businesses, organizations and large teams find products, set them up, get a price or quote, approve artwork, pay, track production and delivery, and order again.

The product should make a very broad range of production work easy to understand, without showing customers manufacturing detail they don't need.

## 2\. The three ways customers buy

| Buying mode | Example | What happens |
| :---- | :---- | :---- |
| Simple configurable | Business Cards | Customer picks options and pays a fixed price straight away. |
| Configurable quote | Polo Shirt | Customer picks options and gets an estimate or a request for a final quote, depending on complexity. |
| Consultative project | Conference branding | Customer describes what they're trying to achieve. HolyPearls recommends products and prepares a quote. |

## 3\. The documents

| Document | Covers |
| :---- | :---- |
| PRD 00 | This document: glossary, status names, shared rules |
| PRD 01 | Public website, search and SEO |
| PRD 02 | Product pages, configuration, cart and checkout |
| PRD 03 | Projects, quotes and payments |
| PRD 04 | Proofs, production, delivery and reorder |
| PRD 05 | Organizations, brand workspace, group collection and company store |
| PRD 06 | Staff operations and admin |
| TECH 00–08 | How the system is built (folder B) |
| Engineering Plan, ADR Register, Ticket Tracker, Change Log | Build order, decisions, tickets and what changed (folder C) |

PRDs describe **what the product must do**. TECH documents describe **how it is built**. If a TECH document seems to change product behavior, the PRD wins until the PRD is amended.

## 4\. Glossary

Use these words exactly. Don't swap in synonyms that change the meaning.

**Words about the product**

| Term | Meaning |
| :---- | :---- |
| Catalogue Product | A product HolyPearls sells, as defined by staff (for example "Polo Shirt"). One per product, not one per colour or size. |
| Product Configuration | One customer's choices for one purchase of a Catalogue Product (colour, quantity, sizes, decoration, artwork and so on). |
| Project | A customer's multi-product brief that starts from a goal (for example "conference for 250 people") rather than a product. |
| Quote | HolyPearls' price proposal for a project or complex configuration. A quote has numbered versions (V1, V2, …). |
| Quote Acceptance | The customer agreeing to one specific quote version. |
| Order | The confirmed job HolyPearls will produce, created from a paid checkout or an accepted quote. |
| Order Item | One product line inside an order. Each item has its own production status. |
| Proof | The artwork HolyPearls shows the customer for approval before production. A proof has numbered versions. |
| Shipment | One package or delivery movement containing some or all order items. |
| Exact Reorder | Ordering again with nothing changed from a past order. |
| Reorder With Changes | Starting a new order from a past order, with edits. Goes back through checks and proofing. |
| Workspace Product Template | An organization's saved, approved product setup that members can order from again (for example "ACME Staff Polo"). |
| Template Order | A new order made from a Workspace Product Template. Not the same as an Exact Reorder. |
| Brand Asset | An organization's logo or artwork file. Every replacement creates a new version (V4, V5…); old versions are kept. |
| Group Collection | A temporary form an organizer shares so many people can submit their size, name or delivery details. |
| Participant Submission | One person's answers in a Group Collection. |
| Order Draft | The combined totals produced from a closed Group Collection, before it becomes a request or quote. |
| Order Request | A purchase request raised inside an organization that may need that organization's internal approval. |
| Organization Approval | An organization's own internal sign-off on spend and scope. This is **not** the same as accepting a HolyPearls quote. |
| Company Store | A private mini-shop of approved products for one organization's staff. |

**Words about people**

| Term | Meaning |
| :---- | :---- |
| Guest customer | Someone buying without an account. They use secure links sent by email. |
| Account customer | Someone who has signed up and can see their history and saved drafts. |
| Organization member | A signed-in person who belongs to an organization's workspace. |
| Participant | Someone filling in a Group Collection through a secure link. Not automatically an organization member. |
| Staff | HolyPearls employees using the admin area. |

**Words about how we work**

| Term | Meaning |
| :---- | :---- |
| Approved (design or document) | Signed off. We used to write "frozen". Approved behavior only changes through an amendment. |
| Official record | The one place a fact is stored. We used to write "canonical". |
| Saved copy (snapshot) | A copy of prices, choices or files taken at a key moment, so later catalogue changes can't alter history. |
| Permission | Something a person is allowed to do, such as "accept HolyPearls quotes". We used to write "capability". |
| Guest link | A secure, hard-to-guess link that gives a guest access to one specific quote, proof, order, draft or form. |

## 5\. Who can do what, at a high level

**Guest customers** can browse, configure products, start projects, receive secure links, view and accept quotes, pay, approve proofs, track orders and reorder where allowed. **An account must never be required for ordinary one-off purchases.**

**Account customers** can do everything guests can, plus see their history, resume saved drafts, and manage their profile.

**Organization members** work inside a Brand Workspace with a role and, optionally, specific locations.

**Participants** only ever see their own Group Collection submission.

## 6\. Organization roles and permissions

Default roles: **Owner, Admin, Buyer, Location Manager, Approver, Viewer.**

Roles are presets. The system checks **permissions**, not role names. Two permissions are deliberately separate, and a person may have one, both or neither:

- **Can approve organization requests** (internal spend sign-off)  
- **Can accept HolyPearls quotes** (commits the organization to HolyPearls' price)

Full role-to-permission mapping is in TECH 03\.

## 7\. Price states

**For a product configuration:**

| State | Meaning for the customer |
| :---- | :---- |
| PRICE\_READY | We know the exact price. You can check out. |
| ESTIMATE\_READY | We can show an estimate. A final quote confirms it. |
| QUOTE\_REQUIRED | Your choices need a person to price them. Send them and we'll quote. |
| CONSULTATION\_REQUIRED | This needs a conversation before we can price it. |

**For a project:** GUIDANCE\_ONLY, ESTIMATE\_RANGE, QUOTE\_REQUIRED.

Changing price state **must never throw away the customer's choices**, and must never send them from a filled-in configurator to an empty contact form.

## 8\. Official status names

These are the only status names used across design, PRDs, code and admin. TECH 01 defines exactly which changes between them are allowed and who can make them.

**Quote:** PENDING\_REVIEW, READY, REVISION\_REQUESTED, ACCEPTED, DECLINED, EXPIRED. Each quote *version* is DRAFT (staff only), SENT, SUPERSEDED, ACCEPTED, DECLINED or EXPIRED. When a quote is READY and the current version is V2 or later, the customer sees the label "Revised quote".

**Payment (what the customer sees for an order or accepted quote):** NOT\_DUE, PAYMENT\_DUE, DEPOSIT\_DUE, PAYMENT\_PENDING, DEPOSIT\_PAID, PARTIALLY\_PAID, BALANCE\_DUE, PAID, PAYMENT\_FAILED, PARTIALLY\_REFUNDED, REFUNDED, PAYMENT\_RESOLUTION\_REQUIRED. PAYMENT\_DUE is used when the full amount is due in one payment; DEPOSIT\_DUE when the first of several payments is due.

**Proof:** NOT\_REQUIRED, PREPARING, AWAITING\_APPROVAL, CHANGES\_REQUESTED, REVISION\_IN\_PROGRESS, APPROVED. Never label artwork "approved" while the proof is AWAITING\_APPROVAL. Before approval the viewer is called "Production proof preview".

**Order item (production):** AWAITING\_PREREQUISITE, QUEUED, IN\_PRODUCTION, QUALITY\_CHECK, READY\_AWAITING\_RELEASE, READY\_TO\_DISPATCH, DISPATCHED, DELIVERED, CANCELLED. An item with an open hold shows ON\_HOLD. Production-ready, released for dispatch and dispatched are three different things.

**Order (summary shown at the top of an order):** CONFIRMED, AWAITING\_PREREQUISITE, IN\_PRODUCTION, PARTIALLY\_READY, BALANCE\_REQUIRED, READY\_TO\_DISPATCH, ON\_HOLD, PARTIALLY\_DISPATCHED, DISPATCHED, PARTIALLY\_DELIVERED, DELIVERED, CANCELLED. This is worked out from the items; it is not edited directly.

**Shipment:** PREPARING, LABEL\_CREATED, IN\_TRANSIT, OUT\_FOR\_DELIVERY, DELIVERED, ATTEMPTED\_DELIVERY, EXCEPTION, RETURNED.

**Group Collection:** DRAFT, OPEN, PAUSED, CLOSED, NEEDS\_REVIEW, READY\_TO\_ORDER, ORDER\_DRAFT\_CREATED, CANCELLED. (Renamed from "ORDER\_CREATED" because closing a collection creates an Order Draft, not a production order.)

**Timeline wording:** say "Quote accepted", "Deposit received", "Payment requirement met" or "Paid" as appropriate. Never "Invoice settled" unless the whole invoice is paid, and never "Quote approved".

Statuses for brand assets, templates, participants, invitations and other records are in PRD 05 and TECH 01\.

## 9\. History must never be overwritten

Never edit or delete: an accepted quote version, a proof version, an old brand asset version, the saved specification of an order, a past organization approval decision, a payment record, or a participant's payment.

Changes create a new version or a new record.

## 10\. Nothing gets lost between steps

When a customer moves from one step to another (configuration → quote, project → quote, quote → order, collection → order draft, and so on), everything that applies must come along: customer, organization and location, product, configuration, quantities, size breakdown, personalization, artwork file and version, project details, files, deadline, delivery details, quote version, approved spend, proof version, payment history, collection, participant origin, template, and links to past records.

## 11\. Privacy and security basics

- Public and indexable: marketing pages, catalogue, guides and case studies.  
- Private and never indexed: drafts, quotes, proofs, orders, workspace, assets, templates, collections, participant forms, company stores, approvals.  
- Every permission check happens on the server.  
- Record numbers shown to customers (like HP-Q-2026-0142) are never enough to grant access.  
- Guest links are hard to guess, limited to one purpose, can expire and can be revoked. Accepting a quote or approving a proof needs an extra email code check (TECH 03 sets the details).  
- HolyPearls must meet the Nigeria Data Protection Act 2023 (see TECH 06).  
- Card details are only ever entered on Paystack's checkout, never on HolyPearls pages.

## 12\. SEO, performance and accessibility (shared targets)

**SEO:** strong single pages per real product or topic, not many near-identical pages. Only direct-purchase products may publish price offers in structured data. Private pages are never indexed.

**Performance (75th percentile, real users):** LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1. Large images are resized for the device. Heavy tools (configurator, proof viewer) load in stages. Pages that wait for a status change refresh when the tab regains focus and check at most every 30 seconds, and only while the customer is actively waiting.

**Accessibility:** WCAG 2.2 AA. 16 px minimum body text. 44 px touch targets. Visible focus. Grouped form fields. An error summary plus an error beside each field. Status is never shown by colour alone. Reduced-motion support. Configurators and proof controls work by keyboard.

## 13\. Values staff can change without a developer

Nothing shown in wireframes or seed data is a real business promise. Staff must be able to change these in admin without a code release: prices, minimum order quantities (MOQ), lead times, rush eligibility, product availability, compatible materials and finishes, sample rules, whether artwork can be sent later, deposit and payment schedules, when the balance must be paid, delivery zones and rates, international freight handling, installation rules, whether a proof is required, whether an exact reorder skips the proof, VAT settings, and which payment methods are switched on. Organizations set their own approval limits.

Seed and test values are clearly marked as test data. Production launch needs the business owner to confirm real values.

## 14\. Changing an approved decision

When two documents disagree, follow this order:

1. The latest written amendment or decision record (ADR)  
2. PRD 00  
3. The relevant domain PRD (01–06)  
4. The approved high-fidelity design (Stage 4\)  
5. The approved wireframes and state matrices (Stage 3\)  
6. Older research notes

Never quietly pick one. Record the conflict and the decision, then update the lower-ranked document.

A design change must not silently change a requirement. If building something reveals a real usability problem, write a short amendment: the screen or flow, current behavior, the problem, the smallest fix, and which PRDs, TECH docs and tickets it affects.

## 15\. Priorities

**Must have for launch (P0):** discovery, launch catalogue, product pages and configurators, Start a Project, quotes, payments, proofs, order tracking, admin operations, secure guest flows, customer accounts.

**Also required for launch (P1):** Brand Workspace, templates, Group Collection, organizations and locations, internal approvals, company store (individual and group modes), basic allowances.

**Later (P2):** advanced allowances (credit and vouchers), richer company-store models, side-by-side proof comparison, advanced analytics, complex procurement rules, public merch stores, warehouse and inventory features, a second payment provider.

"Launch" means the whole advertised catalogue and every customer journey above works and is polished. No placeholder pages.

## 16\. What HolyPearls is not

Not an accounting system, HR or payroll tool, warehouse or inventory system, design editor (not a Canva clone), full digital asset manager, marketplace, procurement suite, courier platform, claims management system, or design collaboration suite.

## 17\. Notifications

Email is the default. WhatsApp or SMS may be added later. Notify customers about things they care about: quotes, payments, artwork and proofs, holds, the start of production where meaningful, balance due, dispatch and delivery. Every notification links straight to the action. Don't notify about every internal factory step.

## 18\. Getting help

Every "Need help" or "Ask HolyPearls" button sends staff the customer's current context: who they are, the product or project, their configuration, the step they're on, files, quote version, proof version, order, and organization or location. The customer should never have to explain from scratch.

## 19\. Admin

The admin area is where staff change business rules and run daily operations (details in PRD 06). Changes to prices or rules never alter accepted quotes or existing orders.

## 20\. How each PRD is laid out

Purpose, goals, non-goals, people involved, journeys, requirements (with IDs), statuses, business rules, data, permissions, notifications, SEO where relevant, analytics, accessibility, performance, errors and recovery, admin settings, and acceptance checks.

Requirement IDs look like `DOMAIN-FR-001`: PUB (public), COM (commerce), PROJ (projects), QUOTE, PAY (payments), FUL (fulfilment), B2B, OPS (operations).