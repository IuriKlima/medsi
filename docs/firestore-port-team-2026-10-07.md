# Firestore team and delegation port — 2026-10-07

Implemented locally, using native Firestore document transactions and the existing dispatcher. Real Firebase/Firestore access is not homologated by this work. No email, provider call, credential change, deployment, migration, billing or publishing operation runs here.

## Source contracts and entry points

- `supabase/migrations/202609210001_identity.sql`: roster projection, invitation acceptance and revocation, token hashing, verified email, seven-day expiry, issuer revalidation and single-use acceptance.
- `supabase/migrations/202609210003_product_foundation.sql`: latest invitation/member role overrides (including `marketing`), last-admin protection, owner-only permission delegation and grant-table constraints/cascade.
- `apps/api/src/identity/controller.ts` and `service.ts`, `apps/api/src/operations/controller.ts`, and `packages/contracts/src/identity.ts`: unchanged RPC parameters and public response shapes.
- `apps/api/src/platform/firebase-auth.ts`, `firestore/identity.ts` and `firebase/sql/identity.sql`: verified Firebase identity bridge. Acceptance resolves the authenticated user's current email from server-only `firebase_identities`, never from request arguments. The bridge verifies both token and current Firebase user email verification before refreshing this mapping. There is no new client-writable verification flag.

`apps/api/src/platform/firestore/team.ts` exports `teamOperations` and `teamRpc`; central registration is in `client.ts`.

| RPC | Authorization and result |
| --- | --- |
| `company_roster` | Workspace owner or company admin; only `user_id`, `role`, `display_name` for that company. |
| `create_company_invitation` | Manager; returns `{id, token, expires_at}`. Roles are admin, marketing, approver, attendant, reader, support. Email normalized to lowercase. |
| `accept_company_invitation` | Authenticated verified identity matching invitation email; returns company UUID. Requires current issuer admin/owner authority. |
| `revoke_company_invitation` | Manager, matching company/invitation, not accepted; returns null. |
| `change_company_member` | Manager, existing member; nullable role removes member; returns null. Cannot demote/remove the last admin. |
| `set_company_permission` | Workspace owner, existing company member; returns null. Delegable actions are crm.read, crm.write, content.approve, strategy.approve, site.approve, ads.approve. |

## Storage and atomic behavior

All collections are under `medsi/v1`:

| Collection | Document identifier | Use |
| --- | --- | --- |
| `companies` | company UUID | Tenant existence/archive check and shared read/write serialization boundary for team mutations. No company fields are changed by that serialization write. |
| `company_members` | `companyId_userId` | Role lookup, insertion, update, removal, last-admin check. |
| `workspace_members` | `workspaceId_userId` | Owner authorization; acceptance inserts ordinary membership only when absent, preserving an existing owner role. |
| `profiles` | user UUID | Existing profile lookup and roster display name projection only. |
| `firebase_identities` | Existing identity bridge key, SHA256 of JSON-encoded Firebase UID | Read by `user_id` for current verified identity email. Not modified by team operations. |
| `company_invitations` | invitation UUID | Normalized email, role, issuer, seven-day expiry, acceptance/revocation timestamps and raw-token SHA256 hash. |
| `company_permission_grants` | `companyId_userId_action` | Owner's delegation, nullable expiry, nullable budget and grantor. Removing a member deletes that member's grants. |
| `audit_logs` | random UUID | Actor/company/workspace and invitation, membership or permission event metadata; never bearer tokens or token hashes. |

Invitation tokens contain 32 cryptographically random bytes encoded as 64 lowercase hex characters. SHA256 is computed over raw UTF-8 token bytes, matching PostgreSQL; the general Firestore `hash` helper serializes JSON and is intentionally not used for invitation hashes. Only creation returns the bearer token. Stored invitation records do not contain the token. Public invitation query redaction is enforced separately by the central scoped-read dispatcher.

Every mutation runs within one DocumentTransaction, including audit writes. Concurrent changes read/write the same company document. Last-admin checks, membership insertion, invitation consumption, revocation, grant cascade, and auditing commit together. A failed staged write leaves prior invitations, memberships and grants unchanged. Firestore callbacks contain no external side effects.

These six SQL/controller contracts have **no request ID or expected-version/CAS parameter**. No new retry API was invented: creation reissues and supersedes prior unused tokens for the same email/company; acceptance is single-use and rejects replay (also after removal); revocation of an already revoked pending invitation remains a successful update; role changes recheck authorization/member presence; permission enabling upserts one canonical grant, and disabling deletes it. Each successful legacy mutation can append an audit event, including repeated permission updates. Grant IDs above are the native canonical format; any future importer must preserve that convention. Arbitrarily keyed imported grant records are not part of the current native storage contract.

Delegations enforce a future expiry when supplied; budgets must be nonnegative safe integers, only `ads.approve` accepts a budget, and enabling ads approval requires one. Company access rechecks live membership and grant expiry on every request. Removal cannot leave grants that revive on rejoin. Platform staff status alone does not confer customer team authority.

## Explicit compatibility ruling

Archived companies fail closed for all six team operations, including manager roster/revoke/change and owner delegation. Older SQL manager/owner helpers allowed some of those administrative operations while archived; the port deliberately retains the existing native Firestore active-company authorization boundary. This ruling was coordinated with the integrating parent. Archived-company administrative recovery remains outside this port.

## Validation and remaining blockers

- Initial dispatcher regression: 17 of 24 tests failed with `FIRESTORE_OPERATION_PENDING` before registration/implementation; seven negative cases merely observed an error and were subsequently tightened to require the correct validation error code.
- `tests/firestore-team.test.ts`: 29 tests covering six dispatcher paths, tenant and actor isolation, token hashing/expiry/reissue/replay, issuer removal/demotion, same-user concurrent acceptance, email binding, existing owner preservation, last-admin concurrency, member/grant cascade, owner-only delegation, grant expiry/budgets, archive restriction, and injected write failures after invitation or membership writes.
- Focused validation also runs existing `identity-rls`, `product-foundation` and `firestore-single-account` contracts, plus API TypeScript and ESLint on changed TypeScript files. Final combined result: **4 files, 64 tests passed** (29 team + 14 identity RLS + 16 product foundation + 5 single-account), 0 failures. API TypeScript and focused ESLint exited 0; `git diff --check` exited 0.
- These are MemoryStore and PGlite tests; MemoryStore serializes transactions and demonstrates logical atomicity, not real Firestore contention/index behavior. Firebase authentication/provider access, production IAM/rules/indexes and real data migration remain unverified and untouched. Central integration owns the broader `pnpm check`, read-query tests, progress log and deployment gate.

Validation commands: `node node_modules/vitest/vitest.mjs run tests/firestore-team.test.ts tests/identity-rls.test.ts tests/product-foundation.test.ts tests/firestore-single-account.test.ts --maxWorkers=2`; `node node_modules/eslint/bin/eslint.js apps/api/src/platform/firestore/team.ts tests/firestore-team.test.ts`; `node node_modules/typescript/bin/tsc --noEmit -p apps/api/tsconfig.json`; `git diff --check`. Installed binaries were used because bare `pnpm exec` attempted an automatic install and hit an unwritable default home cache. No dependency files changed.
