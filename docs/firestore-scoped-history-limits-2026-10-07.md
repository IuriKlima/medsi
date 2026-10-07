# Scoped Firestore history reads — 7 October 2026

Local implementation and in-process SDK-boundary validation only. No provider, credential, production write, deployment, or remote index operation was performed.

## Delivered

- Support detail requests only the latest 100 messages, then restores the SQL chronological/ID order. Protocol bootstrap requests the maximum protocol only. Creation and reply rate checks request the newest 10 and 30 relevant rows, preserving the strict one-hour boundary.
- Support list retains its public offset range 0–10000 and 20-row response, ordered by updated time descending and ID ascending. Administrators fetch their offset window directly. Personal reads stop after collecting the authorized window; assigned support reads each assigned company's necessary window sequentially and merges them. Both paths share an explicit 10000 inspected-ticket budget per request (plus one overflow sentinel), failing with `54000` instead of returning an incomplete window. No platform-wide support-ticket drain was added.
- Dashboard reads use company-filtered physical-document cursor pages, including records whose data has no `id` field. Facts and authorized CRM aggregation retain the explicit 10000-record limit; import coverage now also has a 10000-record safety limit. Overflow fails with `54000`, without returning partial metrics. Actors lacking CRM permission never query opportunities. Dashboard permission lookup filters both company and authenticated member.
- Team/internal full scoped results use physical-document cursor pages rather than failing at 1000. Identity/invitation uniqueness checks fetch at most two matches; last-administrator checks fetch two administrators; assignment existence and phone deduplication fetch one match. Internal confirmed profile requests the newest version directly.

## Bounds and remaining limits

- Full scoped result helpers stop with an explicit error above 10000 matching documents. This applies to team rosters, matching invitation history, grant cleanup, company-assignment lists, active support roster, internal team/meeting history, and matching sessions being revoked. Large requests must be narrowed or given a future paginated API; no partial result is presented as complete.
- Dashboard limits apply separately to facts, imports, and authorized opportunities. Each native scan page has at most 500 documents and uses the physical document ID as its cursor. Custom stores lacking the optional scan API retain their own narrower-query guard.
- Public support offsets remain limited to 10000. Personal and assigned-staff windows fail explicitly if they cannot complete within 10000 inspected tickets, including invisible tickets and all assigned companies combined. Visibility is cached by company within the transaction. An administrator still fetches its 20-row offset window directly. Native offset queries can still incur server work for skipped rows; a public cursor API would reduce that cost.
- Existing administrator `internal_portfolio` exact total and substring search still scan company pages; this earlier behavior was preserved. The scoped support portfolio never scans unrelated companies.
- Provider transaction size/time limits still apply to unusually large atomic invitation/grant/session cleanup operations. This change fixes selection completeness; it does not turn those mutations into background jobs.
- Composite-index declarations must be deployed separately before live ordered-query validation. Emulator/remote provider behavior has not been certified by these local fixtures.

## Evidence

`tests/firestore-scoped-history.test.ts` initially reproduced seven failures at the 1000-document guard. It now executes fifteen cases against both a guarded memory store and the production `firestoreStore` with an in-process Admin SDK fixture (30 passing cases). Coverage includes more than 1000 messages/tickets, equal-time support ID ties and offset 1000, historical rate limits, hashed dashboard facts/imports, tenant isolation, denied CRM reads, targeted finance permission, 10000-overflow errors, full team roster, latest profile plus hashed meeting history, more than 10000 invisible own tickets before a visible ticket, and shared budget overflow across assigned companies. The four added budget regressions first failed against the unbounded loops, then passed after the shared limit was introduced.

Targeted six-file suite: 106 tests passed. ESLint passed for changed implementation and test files. Root integration runs the repository-wide check separately. The existing team roster test now asserts exact membership rather than insertion order: neither its SQL query nor the native API promises insertion ordering.
