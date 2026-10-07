# Firestore Legacy Paths Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Tasks below preserve the existing SQL/API product contracts.

**Goal:** Port the 24 remaining literal API RPCs and four scoped reads without external effects or broadening product functionality.

**Architecture:** Add independently testable native domain handlers using DocumentTransaction, existing authorization helpers and exact legacy controller arguments/results. Register handlers centrally and validate the actual dispatcher; unsupported operations must fail explicitly. Keep Firestore production disabled until real homologation.

**Tech Stack:** TypeScript, NestJS, Firebase Admin abstraction, Vitest MemoryStore, legacy SQL/PGlite contract tests.

**Spec:** User continuation after commit3092952; docs/firestore-audit-paths-2026-10-07.md; existing latest SQL migrations and API controllers.

## Global Constraints

- Same branch fix/regional-baseline-2026-10-06; preserve medsi-80f4a target and atendimentomac-88940 source.
- No credentials, IAM/rules changes, real migration, payment, messages, content publication, ads, push or deployment.
- Mock storage tests are not provider homologation. No invented metrics or generic unrestricted query proxy.
- Root owns client.ts, shared access.ts, inventory, integrated reports and final commit/package.

## Review Focus

- A member removed between request and retry must lose access, including delegated grants (team/domain tests).
- An internal staff session must expire/end/revalidate assignment and never confer generic tenant membership (internal/dashboard tests).
- Retry identifiers reused with altered payload/actor/company must not mutate or leak prior work (support/import/team tests).
- A failed multi-record import must leave no partial records or fabricated metrics (dashboard/draft tests).
- Manager-visible invitation/audit reads must not expose token hashes or unrelated staff/tenant data (root query integration tests).

## Task 1: Team and delegation (six RPCs)

Files: new platform/firestore/team.ts, tests/firestore-team.test.ts; existing identity helper only if contract requires a safe adjustment.
Interfaces: teamOperations:string[], teamRpc(tx,actor,name,args); use manager/workspaceOwner/companyAccess.
Operations: company_roster, create/accept/revoke_company_invitation, change_company_member, set_company_permission.
- [x] Reproduce missing dispatcher failures and pin latest SQL roles/manager/owner/token/expiry/last-admin/retry contracts with tests.
- [x] Implement native transactions; never store invitation bearer token in generic public reads.
- [x] Run focused tests/types/lint; document collections, semantics and remaining real-access blockers.

## Task 2: Internal operations (eight RPCs)

Files: new platform/firestore/internal.ts, tests/firestore-internal.test.ts.
Interfaces: internalOperations:string[], internalRpc(tx,actor,name,args); export narrowly scoped internal session authorization for dashboard reuse if needed.
Operations: company_assignment_roster, set_company_assignment, internal_portfolio, start/end_internal_access, internal_company_context, internal_onboarding_context, record_followup_meeting.
- [x] Pin current SQL session expiry, staff/assignment visibility, revoked sessions, actor/company mismatch, session-authorized followup and request replay in failing tests.
- [x] Implement only existing reads/writes with fresh authorization and audit evidence; do not add staff to ordinary clinic members.
- [x] Run focused tests/types/lint and document routes/collections.

## Task 3: Support (five RPCs)

Files: new platform/firestore/support.ts, tests/firestore-support.test.ts.
Interfaces: supportOperations:string[], supportRpc(tx,actor,name,args).
Operations: create_support_ticket, reply_support_ticket, set_support_ticket_status, support_ticket_detail, support_ticket_list.
- [x] Pin requester/team visibility, clinic membership, staff inactivity, rate limits, idempotency and optimistic version checks in failing tests.
- [x] Port bounded local transactions and exact controller return shapes; no email or messages sent externally.
- [x] Run focused tests/types/lint and document limitations.

## Task 4: Dashboard and local drafts (five RPCs)

Files: new platform/firestore/dashboard.ts and drafts.ts, tests/firestore-dashboard.test.ts and firestore-drafts.test.ts.
Interfaces: dashboardOperations/dashboardRpc and draftOperations/draftRpc. Coordinate internal session helper with Task2.
Operations: dashboard_read/import/set_keywords/record_export, import_local_drafts.
- [x] Pin actual import schemas, field redaction and permissions, scoped internal session reads, idempotent source identifiers, atomic invalid payload failure and exports in failing tests.
- [x] Port existing data models; reuse dashboard calculation service; empty data stays empty/unavailable, no generated metrics.
- [x] Run focused tests/types/lint and report exact paths.

## Task 5: Integrate scoped reads and verify whole journey

Files: client.ts; tests/firestore-legacy-paths.test.ts; docs inventory/progress/final report.
- [x] Register each ready handler sequentially for domain dispatcher tests.
- [x] Reproduce failures for company-scoped audit_logs/company_invitations/company_permission_grants/editorial_drafts reads and verify manager versus marketing rules from SQL.
- [x] Implement narrowly scoped projections, plus any proven root web/controller bridge incompatibility; no blanket access.
- [x] Regenerate inventory and exercise real controllers with fictitious actors, cross-tenant IDs and failed/replayed actions.
- [x] Independent review, fix important findings, pnpm check (lint/typecheck/test/build), git diff --check.
- [ ] Commit, retain runnable local services, regenerate sanitized/cloned-verified bundle, replace same Library ID libfile_1c3d276edd2481919eea186beb69caea and deliver accurate path/status matrix.
