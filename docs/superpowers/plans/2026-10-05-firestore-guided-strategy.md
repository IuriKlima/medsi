# Firestore Guided Strategy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Execute the authorized repair in this workspace, retaining the existing uncommitted migration. Use checkbox steps to record progress.

**Goal:** Fix the post-checkout strategy error and persist the guided review from regional research through five versioned approvals in Firestore.
**Architecture:** Keep the existing Nest controllers, provider adapters and React journey. Add native transaction handlers behind the Firestore RPC dispatcher; reuse existing worker contracts for regional research, strategy proposals and launch recommendations. No fabricated evidence or approvals. Content production, publishing and advertising remain separate gated modules.
**Tech Stack:** TypeScript, Nest, Next/React, Firebase Admin Firestore transactions, Zod, Vitest, local Firestore emulator.
**Spec:** User's medical onboarding and Firestore directions in this task; docs/askadia-requisitos.md, docs/medsi-onboarding-medico-2026-09-29.md, existing SQL guided-approval contracts.

## Global Constraints
- Nunca apresente dados simulados como reais.
- Verifique empresa e permissões no servidor e no banco.
- Aprovações vinculadas a versões. Mudanças invalidam aprovação.
- Não publique conteúdo, envie mensagens reais ou ative anúncios em testes.
- Secrets remain in environment; tests use isolated fixtures/emulator only.
- Keep production guard and preserve preexisting changes. No production deployment or commits containing unrelated work.

## Review Focus
- Profile/permission/access changed during collection or generation: reject stale completion and retain history.
- Duplicate clicks or concurrent workers: single durable claim, bounded lease, no repeated provider call on an existing request.
- Incomplete sources: show unavailable explicitly, require acknowledgement, never invent zero metrics.
- Strategy/calendar edits: invalidate affected approvals and setup, preserve reviewed versions.
- Clock/date boundaries: enforce seven days for content review and preserve lease/payment expiration.

### Task 1 — Load the real guided journey
Files: create apps/api/src/platform/firestore/journey.ts; modify firestore/client.ts, onboarding/launch.ts; tests/firestore-journey.test.ts.
Interfaces: journeySnapshot(tx,actor,companyId) returns MarketingJourney and the same strategy revision used by stage 2; journeyRpc dispatches read_marketing_journey and approve_marketing_stage. Export context/basis helpers for subsequent tasks.
- [x] Reproduce read_marketing_journey failure and LaunchController journey failure with the native adapter.
- [x] Implement company-authorized stage data, hashes, version validity, provider metadata reads and honest empty states. Deny unscoped and cross-company reads.
- [x] Verify current profile, readers, revoked membership, missing/partial evidence, concurrent edits and sequential approval invariants.

### Task 2 — Persist regional collection and approval
Files: create firestore/regional.ts and tests/firestore-regional.test.ts; reuse onboarding/regional-research.ts and regional-providers.ts.
Interfaces: request_regional_research, claim_regional_research_server, finish_regional_research_server retain existing named arguments and worker payloads.
- [x] Write failing tests for request, claim, durable result, limits, stale/expired lease, access revocation and missing evidence acknowledgement.
- [x] Implement single versioned job, at most three attempts, three-minute lease, five-minute refresh cooldown, validation of source scope/status and payload. External HTTP remains outside transactions.
- [x] Approve only a displayed ready evidence revision with explicit limitations when sources are missing.
- [x] Verify with memory and SDK emulator; never create remote test documents.

### Task 3 — Generate and review strategy proposals
Files: create firestore/strategy.ts and firestore/preparation.ts, tests/firestore-strategy.test.ts; extend journey.ts and client.ts; reuse existing provider workers/controllers.
Interfaces: prepare/start/finish/edit/approve_company_strategy, strategy_feedback, enqueue/claim/finish_content_preparation and enqueue/claim/finish_company_launch match existing RPC callers. Native preparation covers strategy outlines and commercial recommendations; later content/image/site execution stays explicitly unavailable until separately migrated.
- [x] Write red tests for approved evidence gate, AI access/quotas, request replay, five-minute generation lock, stale completions, invalid outputs and edit conflicts.
- [x] Persist generation metadata and evidence token; create calendar outlines from valid provider output with review dates at least seven days ahead.
- [x] Persist recommendations through the existing worker contract; require stage 2 approval and matching generation/token at claim and completion.
- [x] Implement ordered five-stage approvals and finish_company_setup without auto-approval or publication. Clear setup validity on changed profile or downstream basis.
- [x] Verify all happy/negative paths and controller payloads with isolated providers.

### Task 4 — User-visible recovery and complete verification
Files: guided-strategy.tsx, purchase-journey.tsx and relevant calendar/status endpoints only as necessary; docs/progress.md, docs/medsi-firestore-operations.json.
- [x] Read installed Next docs before web edits. Remove endless loading after a failed request, offer retry, and describe unavailable providers accurately.
- [x] Ensure following the guided flow uses migrated operations, including regional and logo status reads, and does not call unsupported content generation automatically.
- [x] Run focused tests, SDK emulator and pnpm check. Obtain a fresh code review while final verification runs; resolve actionable defects.
- [x] Restart owned local services with checkout test mode. Enable only implemented research/proposal preparation; keep messaging, ads, publishing, visual generation and other automations disabled.
- [x] Verify HTTP health/login and document implementation, validation, external limitations and next module. No real user approval or provider generation during tests.

## Execution ledger
- Diagnosis: checkout is already active. GET launch/journey calls missing read_marketing_journey, followed by three unsupported table reads; UI retains a loading message after the error.
- Ruling: repair proceeds inline under existing user authorization; no extra confirmation for reversible code changes. Keep the current workspace because it contains the MedSI/Firestore implementation required by this repair.
- Ruling: the deliverable is strategy review through setup. Publication, paid ads, messaging, logo/site production and dashboard migration remain distinct modules; do not fake completion of those operations.
- Verification: 17 native journey scenarios passed using the official Firestore SDK/local emulator. Two review findings (partial Meta evidence and immutable approval/evidence history) were corrected with targeted regressions; reviewer confirmed both resolved. Full pnpm check and final local restart pending.
- Availability: Firestore claim_content_preparation_server generates strategy proposals only; claim_company_launch_server generates recommendations only. Native finish returns the saved preparation view, avoiding the still-pending overview module.

- Final verification: original full check passed lint/types and 390/391 tests; updated the obsolete pending-RPC assertion to the still-pending start_content_run, retained invalid approval denial, then passed lint of that test and all 48 Firestore tests. Full build passed separately; no claim that the original check exited successfully.
- Final runtime: login/health 200; protected journey read/approval 401 without credentials. Local trial services running. Real-account approval and external-provider homologation were not performed.
- Test layout ruling: regional, strategy and journey regressions are consolidated in tests/firestore-journey.test.ts to exercise the same isolated fixture and complete workflow.
