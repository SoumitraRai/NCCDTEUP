# NERD screenshot review and Sampark build plan

**Reviewed:** 11 November 2026  
**Evidence reviewed:** 90 PNG screenshots in the ten user-provided Desktop folders: CGF Fund (4), CMS (7), Funds/Camps (27), Home (6), Leave (4), Manage/admin (12), Movement (13), Policies (2), Ticket (4), Visits/Bills (11). Screens were ordered by capture time within each folder and reviewed as contact sheets. The earlier user-provided Chrome accessibility snapshot of the home page is also considered. This report describes UI evidence, not verified service or policy behavior.

## Scope and interpretation

The source is branded NERD and shows a northeastern directorate and its live units. Sampark is for NCC Directorate Uttar Pradesh. Use the screenshots to learn interaction patterns and required workflow concepts. Do not reuse the NERD name/marks, unit/person names, contact details, signatures, IP address, actual records, uploaded files, counts, rates, journey locations or instructions as Uttar Pradesh data or policy. Screenshot fields such as rate, balance, allowance, leave entitlement, date limits and approval level are examples only. Official meaning and approval rules must come from NCC DTE UP.

Some screenshots visibly contain personal, contact, signature, account, financial and operational data. This report intentionally does not repeat those values. Store screenshots in approved access-controlled project storage if needed; redact before redistribution or adding to an AI context.

## What the screenshots show

### Home and dashboard

The overview has a shared top-level menu and sections for current activity, temporary-duty requests, CHT demands, CATC fund demands, initial/revised camp budgets, camp counts and reports, ticket/message totals and a separate GCI TD summary. It flags units without a CATC, links to workflow queues, and ends with grouped quick links. Separate screenshots show the public-looking “cadets page” link, a dashboard chart entry point, and a ticket/TD status table. Counts are aggregates, not workflow definitions.

### CGF Fund

There is a CGF training-fund demand form with event, cadet count, date range, case-file attachment and repeatable procurement lines. A line includes category/head, item, quantity, amount and justification. The list separates demanded, processed, pending and archived demands, supports search, and has pending/disposed views. A disposed list includes unit/group, event, sanctioned amount, decision/disposal, case file, receipt and noting links. A warning indicates duplicate submissions have caused processing errors; design this workflow with idempotency and duplicate detection.

### CMS / cadet and messaging operations

Screens show uploading and browsing audio message files, sending a broadcast using an audio file or short message, supplying a cadet list file, a usage/credit report, a recorded message list, certificate-printing status, activity menus and an “add/update cadet” form. The cadet form has multiple identity/enrollment/training/activity fields and optional/digital-signature interactions. These are high-risk personal-data areas: Sampark should not reproduce broad roster fields, bulk broadcasts, signatures or account provisioning until exact need, access boundaries, audit and approval are agreed. Certificate queues and activity records look like distinct workflows from a public CMS.

### Funds/Camps

The menu separates camp overview/planning, budget submission, a budget panel and processing, briefing calendar, reports, public funds and fund management. Screens show:

- A group/unit CATC overview with a monthly calendar and current/upcoming camps.
- A camp planning form with training year, camp number/location, planned strength, unit/group strength allocations, dates and details.
- A camp budget central view with initial, pending, allotted, final budget and reconciliation areas.
- A unit-wise pending final budget table, expenditure-pattern summary/chart, completed-camp reconciliation, and a budget-allocation table with multiple expense heads.
- A budget demand panel with initial/revised submissions, workflow counts, search/filter by camp/date/status/group, documents, reconciliation and row actions.
- A separate approval/disposal desk, disposed-demand table, approval history/remarks, pending-desk filter and sanction/return/reject/cancel-type outcomes.
- Public-fund demand, statuses and a multiline demand form with budget head/CFA, item details, quantity, rate, amount, supporting PDFs and decision columns.

Demand, approval, allotment, spending, reconciliation, payment and return must be separate concepts and immutable ledger events. The dashboard totals shown in the captures are not authoritative for Sampark.

### Movement / CHT / GCI

A movement overview groups units under groups and displays queued camp transport (CHT) counts. Screens include a CHT form for unit, event date/time, work/route, duration, destination/camp, vehicle/quantity and requester details; a CHT demand list with unit/group, origin/destination, date, purpose, amount, status, indent, noting and view links; plus pattern charts and year comparisons. The acronym and actual eligibility/category rules need confirmation.

Temporary-duty forms capture route/from-to, date range, purpose and a travel-under-own-arrangement choice. TD requisition tables include requester/appointment, submission time, route, journey dates/duration, purpose, travel arrangement and approval-chain columns. There are pending/disposed/completed filters and current/previous-year stats. GCI has its own requisition list and a separate claim-status view with TD details and claim amount. Treat GCI as a separate subtype/authorization path only after its meaning and fields are confirmed. Routes/itineraries and amounts are private operational data.

### Leave

The leave application is a multi-section form: leave type/date range, prefix/suffix dates and reason, leave balances by type, duty arrangement, remaining days and contact/address during leave. A separate leave plan flow has an application/status/plan screen and a received-requests table with staff identity, appointment, dates, duration, entitlement/balance, duty arrangement, address and sequential office sanction columns. Do not collect sensitive home/contact information unless UP policy requires it; confirm who can see it, retention, leave types and approval chain.

### Manage/admin

Menus expose profile update, password change, members, projects/tasks, onboarding stats and search. Screens show pending/activated/rejected onboarding summaries and member tables by directorate/group/unit with appointment, last login, ticket/message counts and signatures. Project screens have create permission failures, status cards, tasks, assignees, deadlines, priority and status filters. An admin ticket/message search has date range, type and appointment/unit choices. For Sampark, admin should rely on dated role assignments, scoped directory results, session revocation and audit. Login telemetry, email, signatures and sensitive identifiers require minimization and strict access.

### Policies

A searchable, paginated policy library shows branch/category, title, policy date, view/download, view count and viewer list, with admin upload/edit/delete affordances. Sampark should distinguish approved, human-reviewed public policy documents from private financial-rate configuration. The latter must retain effective dates and versions; published source documents need an access/retention policy. View tracking must avoid public leakage and unnecessary personal analytics.

### Tickets

Ticket navigation separates create, active and closed. Create fields include subject, description/content, attention/office, priority and optional document. Active view supports keyword search and shows ticket cards. Closed view has paginated cards with created/closed dates, requester, description, priority, response count/status and details. The screenshot implies response threads and office-directed attention. Sampark should add authorized owner/scope, assignment, thread history, status transitions, timestamps, attachments, notifications and audit; comments should not leak to public content.

### Visits/Bills

Visit navigation includes visit records/map, refreshment bills and honorarium demands. Visit screens show year, missing-visit group/unit alerts, table/card switch, search, unit filter, charts, visit submissions, public institution list/map with vacancies, and per-institution details. Visit records include visit dates, institution/location, purpose, uploader/appointment, unit, subjects/objectives, training periods, cadet presence and photographs. These are internal source records; publication must remain a separate consent/review action. Map coordinates should be coarse/approved and stripped from original media.

The refreshment training/payment screen has year/history controls, add-data form, chart and a unit/group summary of bills submitted vs paid. The upload form includes unit, training dates/times, officer/name/appointment, phone, institution, cadet attendance, subjects, periods and training particulars, and supports bill/receipt plus training-record uploads. The status/report table includes upload date, instructor/appointment, location, attendance, subjects, periods, cadet presence, training particulars, claimed amount, bill and payment status. Honorarium has add demand, date period, rank/name, institution, months, amount, supporting document and payment status, with payment summaries by group/unit. Exact calculations, personal fields, documents and reimbursement/payment rules need approved policy; never infer them from example rates or amounts.

## Proposed Sampark structure from this evidence

1. **Overview:** scoped cards and activity summaries from real authorized data only; group/unit exception list; pending action links; zero/empty states. No synthetic operational counts.
2. **Finance:** distinct CGF procurement demands, camp budgets, public fund demand/allocation, CHT, refreshment and honorarium claim ledgers. Keep demand, sanction, allotment, expenditure, payment and reversal separate. Each has list/detail/create/revise/review/decision/payment/attachments/export views where authorized.
3. **Camps:** calendar/plan, participant/strength plan, initial/revised budget, budget processing/approval, CATC report queue and reconciliation.
4. **Movement:** TD request and journey, status/approval, GCI TD subtype and separate claim route, CHT demand/vehicle route, policy-gated location data.
5. **Personnel:** cadet profile/enrollment and unit roster; leave application and leave plan; scoped member onboarding/assignment management. Redact identifiers and restrict health/home/contact/signature fields.
6. **Communication:** ticket inbox/create/detail/reply/close, scoped broadcast messages only with explicit audience consent/capability, file library and usage reports if communications integration is approved.
7. **Content/policies:** CMS activity/catalog and cadet public stories only through editorial publication/consent; separate official notice/policy library from private rate policy.
8. **Shared interaction rules:** visible status/history, server-side search/filter/page, reviewer comments, document quarantine/access audit, notifications, CSV formula safety, keyboard accessible tables/forms and mobile summaries.

## Ordered build plan (proposed)

1. **Confirm the business contract:** map these reference roles to UP roles, identify required modules, define institution/group hierarchy and isolation, provide approved forms/field dictionary, state transitions, office approval matrix, retention and exact financial source policies. Mark unapproved fields/data out of scope.
2. **Make reusable workspace shell:** grouped navigation, scoped overview, route-aware titles, filters/search/pagination, accessible status badges, action history, responsive tables, English/Hindi copy, empty/forbidden/error states. Use only real scoped fixture records clearly labeled synthetic in development.
3. **Finish existing workflows first:** visits, training/refreshment bill, honorarium, publication separation, file evidence and claim revisions/payment ledger. Align existing schemas/forms to the now-visible field requirements only after approved policy decisions.
4. **Add camp and fund domain:** CATC plan/report, initial/revised camp budgets and review desk, then public fund/CGF demands and distinct sanction/allocation/expenditure/reconciliation entries. Use immutable revisions, optimistic versions, idempotency, audit and concurrency tests.
5. **Add movement:** CHT demand and TD request/approval, then GCI claim route after data-definition approval. Keep itinerary and staff/cadet movement private.
6. **Add leave/personnel:** leave balance source, leave request/plan, approval and carefully restricted contact view; then onboarding/member administration and cadet roster with minimum data.
7. **Add ticketing/CMS/policies:** threaded ticket lifecycle, then audited broadcast capability if explicitly approved, policy document library, CMS-managed public content using the existing publication/consent gate.
8. **Verify each module end-to-end:** role/scope denial tests, workflow/state tests, financial exactness and concurrency, upload scanning/quarantine/download, public projection leak tests, browser flows for all role types, keyboard/manual screenreader checks, backup/restore and staging.

The sequence is a proposal. Modules can be reordered after the first high-priority workflow is selected, but finance, movement, personnel or public content must not ship with guessed policy.

## Questions to settle before implementation

1. **Scope:** Should Sampark implement every distinct module in the screenshots, or only the current approved scope (e.g. visits/bills and camp/fund workflows first)? Which three workflows are the first milestone?
2. **Reference vs UP rules:** Who can supply the UP role/office matrix and approved forms/policies? Are the displayed stages just visual references, or should any exact terminology/transitions be adopted?
3. **Definitions:** What do CHT, CGF, GCI, TD, CFA, FOL and “public fund” mean in the UP context? Which are separate processes vs claim categories?
4. **Financial authority:** What are approved categories, rates, rate dates, caps, attendance sources, bill limits, rounding rules, camp initial/revised approval sequence, allotment vs payment semantics, and reversal authority? Can production submissions remain disabled until issued?
5. **Organizational scope:** Is the hierarchy Directorate → Group → Unit → Institution complete for all features? Which roles can create, review, sanction, allot, record payment and administer users at each level? Is there separation between sanction and payment entry?
6. **Sensitive fields:** Which cadet/staff fields are actually required (phone, home-on-leave address, signatures, rank/service identifiers, account identifiers)? Which roles may see them, for how long, and which require guardian consent? Should home/address and digital signatures be excluded by default?
7. **Communication:** Is there an approved SMS/voice provider and an approved list-upload/broadcast process? What consent, per-recipient audit, spending quota, opt-out, template approval and retention are required? Otherwise should broadcasts be omitted?
8. **Public content:** Which visit/achievement information may become public, who approves names/photos, guardian-consent threshold, official marks and Hindi translations? Public content stays off until these are established.
9. **Existing stack and migration:** Are there current NCC databases, identity provider, storage, mail service or reports to integrate? Are they accessible in a development environment, and who owns a sanitized sample/export?
10. **Screenshot coverage:** These 90 images cover ten folders, but several are menu/overview/repeated states. Are there additional screenshots for the inside of each reviewer action, return/rejection, document viewer, final sanction/payment and role-specific forbidden states?

## Known issues/risks to validate during discovery

- Screenshots belong to another regional directorate; “NERD” labels and units must not leak into Sampark UP.
- Some screenshots contain personal contacts, account identifiers, signatures and operational movement/location details. Minimize fields and access; do not load the screenshots as demo data.
- The screenshots show both request amounts and sanctioned/paid statuses but not source policies or reconciliation semantics.
- Several tables are very wide and vertically dense; Sampark should preserve the information hierarchy while offering mobile summaries and scoped detail views.
- User-provided screenshot evidence does not establish correct or secure behavior of the source application; treat it as UI research only.
