# Financial rules and development assumptions

No authoritative NCC rates, eligibility rules, partial-month rules or bill caps were supplied. The `DEMO` category is synthetic and visibly labeled. Production calculations exclude synthetic policies; production approval also rejects synthetic submitted snapshots. Do not reclassify fixtures as official policy.

## Exact arithmetic

All stored money uses PostgreSQL bigint paise. JSON serializes money as decimal strings. Authoritative calculation ignores no fields: strict schemas reject injected totals, roles, state and paid amounts. UI currency formatting uses Number only for bounded display; financial arithmetic uses BigInt.

- Refreshment fixture: eligible attendance × rate paise × session count, for a single event date. Attendance 1–1000; sessions 1–100. This is a demonstrator, not an entitlement definition.
- Honorarium fixture: each covered calendar day receives `monthlyRate / daysInThatMonth`, rounded half up **per day**. Full-month totals can differ from the monthly nominal rate by a few paise because of this explicit fixture rule. It must not be adopted in production without approval. No silent month-count convention is used.
- Every date needs exactly one approved effective policy of the selected category/kind. Gaps/overlaps, reversed dates, impossible dates, future dates and excessive periods fail. The engine supports rate changes mid-period. Category/rank changes require separate non-overlapping claims with approved categories.
- The running total is checked against the applicable policy cap. Actual-bill capping, exclusions, attendance verification and official monthly rounding need approved rules before production submission.

## Lifecycle and history

Draft → Submitted → Under Review → Approved → Partially Paid → Paid. Submitted/Under Review can be returned or rejected. Returned claims can be corrected and resubmitted; each submission creates a new immutable line-item snapshot including policy IDs/versions, dates, inputs and daily calculation segments. Draft/Returned/Submitted can be cancelled by the owner. Approved claims cannot be cancelled through the draft action; payment corrections use ledger reversals.

Approvals require another person and a scoped review role. Payment recording is a separate capability and never initiates a transfer. Positive payment entries cannot exceed the remaining balance. A reversal must exactly match one original payment and can occur only once. All transitions compare versions in serializable transactions; conflicts return 409 and require fresh review. Idempotency keys are database-unique. Submitted periods cannot overlap for the same claimant and claim kind.

Tests cover leap February, partial months, year boundary, rate changes, category gaps, rounding, invalid attendance/dates, caps, injected totals, overlap, concurrent submission/approval/payment, partial payments, reversals and overpayment. See `tests/finance.test.ts` and `tests/integration.test.ts`.
