# Existing journey workers and Firestore pagination — implementation plan

> **For agentic workers:** execute isolated tasks with TDD and review; preserve the current branch and prior commits.

**Goal:** Run the existing durable MedSI journey processors from the worker without duplicating their business rules, and remove accidental 1,000-document barriers from relevant queries.

**Architecture:** The API already contains 13 timer-driven processors with durable claims, leases and provider guards. A shared registry/runner will select API or worker ownership; no second BullMQ job model will be introduced. Firestore gains bounded native pages with real document IDs, rotating queue cursors and permission-scoped history queries.

**Tech Stack:** Existing TypeScript/Nest services, firebase-admin, Vitest fixtures; no new external provider.

**Spec:** Delegated user request of 2026-10-07; existing contracts and `docs/askadia-requisitos.md`, superseded by current MedSI/Firestore instructions.

## Global constraints

- Base `92613cd4674f844e9c88cd14572514d078381600`, branch `fix/regional-baseline-2026-10-06`.
- No live providers, database migration, credentials, published IAM/rules, push or deployment.
- Keep production guards. Default local worker does not consume real jobs.
- Preserve authorizations, approvals, version checks, idempotency and uncertainty handling.
- No invented metrics, clinical data or new commercial rules.

## Review focus

- Two processes must not start the same scheduler accidentally; tests cover ownership and shutdown.
- A thousand completed records must not starve a pending job; test bounded rotating pages.
- Cursor must use physical document ID, not a payload ID or tenant ID; test hashed keys.
- Pagination must authorize before reading and preserve count/order semantics; test two clinics and revoked access.
- Cancellation/lease expiry cannot authorize duplicate external effects; reuse and extend fixture regressions.

## Task 1 — inventory and reusable worker runtime

Files: `apps/api/src/background*`, `apps/api/src/app.ts`, `apps/worker/src/*`, package linkage, runtime tests.

- [x] Record the existing 13 processors, claims and availability gates.
- [x] Add failing ownership/dry-run/lifecycle tests.
- [x] Implement a shared runner, worker opt-in, safe disabled/dry-run health and graceful stop using existing handlers.
- [x] Verify no real DB/provider access in disabled/dry-run and no second queue architecture.

## Task 2 — scoped query adapter

Files: Firestore `store.ts`, `client.ts`, memory helper and adapter regressions.

- [x] Reproduce range/limit failures above 1,000 records with native SDK fixture.
- [x] Add bounded scan pages returning physical IDs and cursor; retain fail-closed guard for unbounded legacy reads.
- [x] Push safe filters/orders/limits into SDK; bound residual compatibility scans and fail explicitly rather than truncate.
- [x] Verify isolation, missing/null fields, staged writes, offsets and exact counts.

## Task 3 — durable queues

Files: Firestore queue domain modules and bounded cursor helper/tests.

- [x] Reproduce eligible jobs behind >1,000 terminal records.
- [x] Rotate bounded transaction-scoped pages, preserving each handler's leases/retries/cancellation rules.
- [x] Narrow nested existence reads and cap per-poll work; test restart, concurrent claims, fairness and tenant binding.

## Task 4 — scoped history/aggregation

Files: Firestore support/dashboard/team/internal/drafts modules and tests.

- [x] Reproduce large history and dashboard failures.
- [x] Page authorized history, apply top-N/rate-limit queries in SDK and explicitly bound existing dashboard aggregation.
- [x] Avoid CRM reads without permission and full global scans for protocol counters.
- [x] Document remaining intentional limits and genuine business decisions, if any.

## Task 5 — integration and delivery

- [x] Review changes, run targeted regressions then full `pnpm check`, fix demonstrated failures.
- [x] Update `docs/progress.md` and a resource matrix distinguishing fixture validation from real homologation.
- [ ] Commit locally, validate a clean bundle/clone and replace the same Library artifact identity (completion recorded in external handoff).

## Execution notes

Technical choices are reversible and within existing authorization. Independent domains are delegated under the dispatching-parallel-agents skill. No plan approval pause is needed: user explicitly requested continued execution. Shared scan API is coordinated before dependent domain edits.
