# MedSI — Firestore integration review, 07/10/2026

Branch: `fix/regional-baseline-2026-10-06`. Base: `8fd1cded5f5d3044de91209040b2720f0f161fa3`. Existing work preserved. This report accompanies the next local commit; no push, deployment, merge or remote data writes.

## Findings and changes

| Failure reproduced | Cause | Correction / files |
|---|---|---|
| Membership view unavailable; OAuth callback skips unconfirmed profile | Firebase web shim lacked `company_members` and `company_onboarding`; callback ignored read error | `apps/web/lib/firebase/server.ts`, both `app/api/connections/{google,meta}/callback/route.ts`; scoped API reads and fail-closed return routing |
| Image descriptions never enter/finish queue | Missing native claim/finish and attachment metadata defaults | New `platform/firestore/image-descriptions.ts`, `onboarding/image-description-schema.ts`; shared `client.ts`, `storage.ts`, `visuals.ts`, schema consumer |
| Production accepts output after setup invalidation | Claim/finish validates approvals but not current setup | `platform/firestore/production.ts` |
| Old Asaas cancellation overwrites replacement subscription | Cancellation omitted current binding comparison | `platform/firestore/billing.ts` |
| Administrative contact ingestion unavailable | Three existing API operations absent from native dispatcher | `platform/firestore/campaigns.ts`; three private collections |
| Previous WhatsApp number authorizes new number; uncertain automatic send permits duplicates | Service window lacks phone binding; manual/campaign reservations omit automatic job check | `platform/firestore/whatsapp-cloud.ts`, `inbox.ts`, `campaigns.ts` |
| Public site accepts unproven snapshot; private edit prevents approved publication routing; foreign storage path accepted | Published proof conflated with draft approval and metadata ownership insufficient | `platform/firestore/sites.ts`, `sites/controller.ts` |

Tests use synthetic clinics, MemoryStore, existing HTTP fixtures and local PGlite. No real provider integration is claimed. Detailed per-domain route/collection/authorization evidence: `firestore-audit-paths-2026-10-07.md` and `firestore-audit-{content,attendance,billing,sites}-2026-10-07.md`.

## Current configuration and real connection

Read-only inspection confirms web/API project `medsi-80f4a`, Firestore `(default)`, namespace `medsi/v1`, bucket `medsi-80f4a.firebasestorage.app`. Public Firebase configuration is only in ignored local `.env`. `GOOGLE_APPLICATION_CREDENTIALS` is not configured in this Linux environment; no new credentials were installed. `GOOGLE_PLACES_SERVER_KEY` and `SERPAPI_API_KEY` are absent here. Values pasted in chat were not reused.

For live verification, an operator must configure ADC or `GOOGLE_APPLICATION_CREDENTIALS` through a protected local path/environment secret, outside Git. The Windows path previously supplied is not available in Linux. Do not paste the JSON/key into chat. Provider configuration likewise belongs in protected environment settings. Infrastructure must confirm the target database, bucket and necessary permissions. No new SerpApi account is required.

Migration source remains `atendimentomac-88940`. Remote source inventory is blocked by unavailable authorized access; existence/content of old documents is unknown. **Zero documents copied, created or deleted remotely.** Auth users/UID mapping, encrypted integration credentials, bucket objects and queued effects must be reconciled before migration. Production Firestore guard remains enabled.

## Resource checklist

All paths below are relative to `medsi/v1/` unless explicitly Storage. “Validated only with simulation” covers the tested local contracts, not every possible flow or hosted Firestore behavior.

| Resource | Main paths / operations | Status | Remaining requirement |
|---|---|---|---|
| Login and entry | identity mappings, profiles, companies, memberships | validado somente com simulação | Real Auth/Admin access; public entry inspected in Chromium |
| Medical onboarding / resume | company_onboarding, profile versions, medical_intake_requests | validado somente com simulação | Authenticated browser and hosted persistence |
| Signature / billing | subscriptions, checkouts, billing bindings/events/jobs | validado somente com simulação | Asaas sandbox + Firestore homologation; no real charging |
| Regional / competitors / Trends | regional research, competitor research, selections | validado somente com simulação | Places/SerpApi settings, provider responses and visual real maps |
| Diagnosis / plan | strategy briefs, marketing approvals, content preparations | validado somente com simulação | Real model configuration and provider checks |
| Calendar / text | calendar items/history, content runs/date runs | validado somente com simulação | Model integration + hosted transactions |
| Art / logo / image descriptions | creatives, visual jobs, attachments, storage_objects; private bucket | validado somente com simulação | AI/media and Storage roundtrip |
| Attendance / CRM | contacts, conversations, service policies, dispatches, Cloud messages | validado somente com simulação | Meta/Evolution webhook and delivery homologation; Cloud media remains absent |
| Relationship campaigns / ingestion | message campaigns/deliveries, management ingestion collections | validado somente com simulação | External integration; scale/pagination; templates outside 24h absent |
| Optional ads | ad connections/plans/executions/steps | validado somente com simulação | OAuth, provider sandbox/approval checks; no spend |
| Site | sites/versions/domains/jobs/address reservations | validado somente com simulação | Hosting/routing reconciliation; lead forms and dedicated rollback absent |
| Team / internal administration / support / dashboard legacy | 24 pending RPCs + four direct table gaps | falhou | Additional native ports with explicit authorization/regressions |
| Old database migration | source -> target inventory and verified copy | bloqueado | Authorized administrative access and migration reconciliation |
| Live mobile cloud preview | existing web/API/worker | bloqueado | No official forwarded preview capability exposed; no tunnel created |
| Windows screenshot JS500 | /comecar JavaScript resources | bloqueado | Actual failed response and terminal stack from Windows |

No resource is classified as validated with real integration in this round.

## Runtime and screenshot investigation

The user showed `/comecar?empresa=...` at Windows loopback with two hashed `.js` resources returning HTTP 500. The spinner is the server-rendered initial purchase view; failure to load client bundles can leave it unchanged. The image does not identify the underlying compilation/runtime exception. No speculative Firebase fix or cache deletion was applied to Windows, which is inaccessible from this workspace.

In the cloud workspace, that route without a session redirects to `/login`; 18 script resources return 200 and the login form renders at 397px. Evidence: `/workspace/medsi-evidence/cloud-chunks-current.json`, `/workspace/medsi-evidence/flow-audit/cloud-login-current.png`. This does **not** reproduce or resolve the authenticated Windows error. Requested the failed Network Response and corresponding server error without secrets.

Two API watchers were found competing for port 4000. They were stopped and replaced by a single foreground `tsx src/main.ts`; its health returned 200. The worker responds `idle`, `processing:false` (legacy queue handlers not implemented); API-native pollers are guarded by disabled integration flags. Web remains on 3000. Loopback addresses are internal, not mobile-accessible preview links. No new demonstration or tunnel was created.

## Integrated verification

Initial integrated `pnpm check` completed with exit 0: lint, types, 778 tests across 90 files and all builds. A subsequent review reproduced an image queue scan defect (completed MIME history could exceed the native bound and block pending work); the scan was removed, terminal failures excluded from retry queries, and two >1,000-history regressions added. Legacy attachments lacking metadata now require explicit bounded backfill; no automatic remote migration was added. Final revalidation is pending below. Logs are stored outside Git in `/workspace/medsi-evidence`.


Final integrated `pnpm check`: **exit 0**, lint/types and every package/API/worker/web build passed; **781 tests in 90 files passed, zero failures**. Evidence: `/workspace/medsi-evidence/firestore-paths-check-final.txt`. Independent reviewer rechecked the queue correction and reran all 19 description tests; no remaining introduced blocker found in the reviewed scope. `git diff --check` passed. The earlier red runs remain evidence of reproduced defects, not final failures.

GitHub read-only check still reports only `main` at `4f011f7c0a3b57dd4cf5e3ca18ca0d63d7926c34`. This correction is a local commit on the existing isolated branch; **no push or PR**. It has not reached `C:\Users\laris\Desktop\MEDSI` automatically. Full diff is available through `git show --stat HEAD` and `git show HEAD` after the accompanying commit.
