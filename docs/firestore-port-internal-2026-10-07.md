# Native Firestore internal operations — 2026-10-07

Status: implemented and locally verified with isolated MemoryStore fixtures through the real Firestore dispatcher. This is not remote Firestore/Firebase Auth homologation. No credentials, rules, IAM, provider calls, deployment, migration, publication, messages or payments were changed or executed.

## Paths and contract

Implementation: `apps/api/src/platform/firestore/internal.ts`; dispatcher registration: `apps/api/src/platform/firestore/client.ts`; tests: `tests/firestore-internal.test.ts`.

| API route | RPC | Behavior |
| --- | --- | --- |
| GET `/operations/companies/:id/assignments` | `company_assignment_roster` | Active platform admins see active support staff names and assignment flags. |
| POST `/operations/companies/:id/assignments` | `set_company_assignment` | Active platform admins assign active support staff; removal ends open sessions for that company/operator in the transaction. |
| GET `/operations/portfolio` | `internal_portfolio` | Active platform admins see all companies; support sees assigned companies, with search and 30-row pagination. |
| POST `/operations/access` | `start_internal_access` | Starts an audited 30-minute session with the real operator and a reason of 8–500 characters. |
| POST `/operations/access/:id/end` | `end_internal_access` | Ends only the caller's own session, idempotently; remains available after staff revocation. |
| GET `/operations/access/:id` | `internal_company_context` | Revalidates session, staff and assignment; returns read-only company context, projected team names/roles and last 30 audit actions. |
| GET `/onboarding/access/:sessionId` | `internal_onboarding_context` | Returns only the session company's onboarding, latest confirmed profile and meetings; archived companies are rejected. |
| POST `/onboarding/access/:sessionId/meetings` | `record_followup_meeting` | Stores a validated, audited meeting under the live authorized internal session; retries return the same meeting. |

Contract sources: `202609210003_product_foundation.sql`, `202609210005_company_journey.sql`, operations/onboarding controllers, and dashboard internal-session authorization in `202609219001_dashboard.sql`.

`requireInternalSession(tx, actor, sessionId, companyId?)` is exported only for explicitly scoped internal consumers. It checks authentication, supported active staff role, operator ownership, non-ended session, strict expiry, existing company, current assignment, and optional target-company match. Dashboard applies its own archived-company and digital/financial scope restrictions. This helper never creates ordinary membership or permissions.

## Collections and transactional effects

Reads: `platform_staff`, `profiles`, `companies`, `workspaces`, `company_members`, `company_subscriptions`, `company_assignments`, `internal_access_sessions`, `audit_logs`, `company_onboarding`, `company_profile_versions`, `company_followup_meetings`.

Writes: `company_assignments/{companyId}_{staffId}`, `internal_access_sessions/{uuid}`, `company_followup_meetings/{operatorId}_{requestId}`, and append-only `platform_audit/{uuid}`. Meeting documents retain their own UUID `id` and original session. Session end/revocation and corresponding audit evidence share one transaction. Replaying a meeting requires fresh session authorization and does not produce a duplicate audit entry. A currently valid replacement session for the same operator/company may replay the identical meeting; the original session remains on the meeting record.

The public team/history projections omit profile emails and audit details. Internal sessions do not make `company_capabilities` or ordinary tenant reads succeed. Company context retains archived-company visibility as in foundation SQL; onboarding/meeting operations reject archived companies.

## Rulings

- Follow-up registration has no paid or weekly-plan gate in the latest SQL/controller contract. The original plan's paid-weekly expectation was corrected by the coordinating agent; `weekly_support` remains informational. No new entitlement policy was invented.
- Same-operator request replay with changed company, date, participants, decisions or next actions returns `22023` without mutation or prior-result disclosure. This intentionally strengthens legacy SQL's silent changed-payload replay; exact retries return the original row.
- Meeting requests remain unique per operator, matching SQL. Another authorized operator can reuse the same UUID for a separate meeting and cannot obtain the first operator's record through replay.

## Verification and limits

The first dispatcher run failed all eight initial cases with `FIRESTORE_OPERATION_PENDING`, confirming the missing paths. After implementation and central registration, all thirteen internal tests pass. Coverage includes staff/admin/tenant authorization, assignment revocation, operator theft, expiry boundary, explicit end, inactivity, changed staff role, profile scope, archived onboarding, ordinary-membership denial, unchanged/changed/cross-company replay, operator request isolation, field/date validation, and anonymous/service-role denial.

Review exposed failures when the shared native adapter encountered more than 1,000 companies or company audit events. Three regressions reproduced the native cap through a bounded query wrapper, failed before the fix, then passed: support portfolio with 1,005 unrelated companies; admin exact filtered totals/offset with 1,005 matching companies; and the latest 30 scoped audit events among 1,005 records. Support now fetches assigned company IDs directly. Admin portfolio scans companies in 500-document ID pages, filters all matches and then applies the existing date ordering and 30-row page. This preserves exact search/total semantics but still costs reads proportional to the full company collection and retains matching rows in transaction memory. Support reads cost one company lookup per distinct assignment and remain subject to the existing 1,000-assignment query bound.

Internal history now performs a company-filtered, descending `created_at` query limited to 30 in the store. The corresponding local composite index declaration is owned by the coordinating agent; it is not published by these tests. Team, profile-version and meeting reads retain their existing scoped query bounds. Session revalidation is unchanged.

Commands: `node node_modules/vitest/vitest.mjs run tests/firestore-internal.test.ts --maxWorkers=1`; `node node_modules/eslint/bin/eslint.js apps/api/src/platform/firestore/internal.ts tests/firestore-internal.test.ts`; `node node_modules/typescript/bin/tsc -p apps/api/tsconfig.json --noEmit`. Coordinating agent owns complete `pnpm check` and integrated branch verification. The installed tool binaries were used because the pnpm wrapper initially attempted dependency setup outside the writable workspace.

Remaining blockers: remote transactional/index behavior, real identity claims and two-account tenant isolation require separate authorized homologation. These local tests do not enable Firestore production or prove external provider access.
