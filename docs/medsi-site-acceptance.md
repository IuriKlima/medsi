# Site: native Firestore acceptance evidence

Implemented in `apps/api/src/platform/firestore/sites.ts`, existing site controller and existing site builder. Legacy structured OpenAI generation, brand-aware HTML renderer, attachment access, EasyPanel adapter and public-site proxy are reused.

| Requirement | Implementation and fixture evidence | Remaining validation |
| --- | --- | --- |
| Private editable preview | Scoped authenticated read/save; content and profile version persisted; HTML renderer uses clinic branding/services/contact; private editor fixture exercises controller and native client | Browser visual/E2E and real Firestore emulator |
| Version history | Immutable per-revision content snapshots, optimistic concurrency; editing invalidates current approval and preserves published snapshot | Native Firestore transaction integration |
| Publication approval | `site.approve`, exact revision/profile/content hash, actor/time and audit; approval is required before publish; unpublish revokes approval | No public publish performed; responsible review and authorized staging publication |
| Domain requests | `billing.manage`; transactional address reservations; hostname token rotation; verification restricted to service role and current owner permissions; no unpublished routing | DNS/HTTPS/EasyPanel homologation, explicit authorized mutation |
| Durable generation | Persisted job, paid access/quota, request deduplication, lease, max three attempts, exponential backoff, expiry recovery, stale profile/edit/access prevention | OpenAI model/account validation, real provider generation, production worker topology validation |
| Progress/recovery | Private site read includes generation status/error; UI polls while pending/running and allows reload/resume | Browser E2E |

## Integration operations

Register `siteOperations` and dispatch `siteRpc` in the native compatibility client. `company_sites`, `company_site_domains`, `company_site_versions`, and `company_site_jobs` reads require an explicit company filter and `marketing.read`.

The existing API launch poller owns the native site executor. It calls `claim_company_site_server` after finding no recommendation job, generates structured content with the legacy adapter, then calls `finish_company_site_server`; failure uses the same finish RPC with a null result. No second independent executor is introduced.

Private writes require `marketing.write`; AI jobs require current confirmed profile and paid access. Publishing requires `site.approve`; domain reservation/verification requests require `billing.manage`. No Firestore rules/IAM, deployment, credentials, DNS changes or public/provider calls were made during this work.

## Collections and access

- `company_sites`: one document per company, draft/current approval and published snapshot.
- `company_site_versions`: company plus revision key; preserved private history.
- `company_site_domains`: one requested hostname/token/status per company.
- `site_address_reservations`: exact slug/hostname document keys provide atomic uniqueness.
- `company_site_jobs`: UUID task documents; server claim/finish only.
- `site_generation_runs`, `provider_daily_usage`, `onboarding_provider_limits`: internal idempotency and daily quota accounting.
- `audit_logs`: saved/approved/published/unpublished/address request trail.

Provision indexes for `company_site_jobs.status` and company-scoped reads as required by the existing native Firestore query strategy. The in-memory transactional fixtures establish application behavior; they do not prove IAM/rules, real Firestore execution or provider readiness.

## Verification after root integration

Executed `node node_modules/vitest/vitest.mjs run tests/firestore-sites.test.ts tests/firestore-site-worker.test.ts tests/firestore-queue-polling.test.ts tests/site-hosting.test.ts --maxWorkers=2`: four files, 34 tests passed. This includes actual private controller/client read/save flow, six executor fixtures proving native claim/finish success/failure routing, material scoping, absence of double claims and preserved legacy execution. Auth/provider adapters are mocked in executor fixtures; generation and hosting were not called live.

Targeted ESLint passed. No site/launch errors appeared in API typecheck after integration. The polling tests count executor polling cycles while allowing the explicitly separate native site/content fallback reads.

## Automatic requested site after completed setup

`claim_company_site_server` seeds a private generation only when the confirmed profile explicitly requests `websitePreference=create`, the completed setup still matches all current approval bases, and the setup actor retains `marketing.write` and paid access. It uses the same explicit enqueue/profile/quota validation. A deterministic UUID and internal `company_site_auto_seeds` company/profile marker prevent duplicate automatic generation after restart or repeated polls. Existing websites and drafts already generated for the current profile are preserved. Older published snapshots stay public while the new private draft is prepared.

Automatic jobs capture the final setup approval token; claim and completion recheck it and completed setup validity. Revoked approvals produce a stale task, never a saved obsolete preview. Expired leases recover the same task. Quota exhaustion leaves the request unseeded for a later eligible poll. Publication remains a separate explicit version approval.

Final scoped verification: native sites 15/15 and site executor 6/6 passed, including automatic request/dedup, existing website/invalidated setup/quota exclusions, preserved public snapshot, lease recovery and revoked automatic approval. Targeted ESLint and API TypeScript passed. Worker fixtures declare fictitious configured provider role IDs and do not call providers.
