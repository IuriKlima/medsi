# Native content and visual persistence

Implemented and tested with isolated fixtures only. No live model, image, storage,
Firestore IAM/rules or billing calls were made by these checks.

## Collections and transaction contracts

Under `medsi/v1`: `company_calendar_items`, `company_calendar_history`,
`company_calendar_approvals`, `company_content_runs`, `company_creatives`,
`company_final_videos`, `calendar_date_runs`, `company_visual_jobs`,
`company_visual_attempts`, `company_content_production_jobs`. Tenant read mappings
must require `company_id` and `marketing.read`; attempts and production jobs are
server only. All writes go through server transactions with current tenant access.
Media also requires a ready `storage_objects` record of matching tenant, MIME and
size, backed by the existing private Cloud Storage adapter. No public URLs are
persisted or required.

Synchronous RPCs: `start_content_run`, `finish_content_details`,
`finish_content_design`, `edit_calendar_item`, `approve_calendar_item`,
`finish_calendar_video`, `start_calendar_dates`, `finish_calendar_dates`,
`move_calendar_date`. Revision conflicts reject writes; changes clear approval,
snapshot history and invalidate dependent journey approvals. Approval snapshots
retain approved text/media. Generation captures profile/strategy/stage5 token,
item revision and a five minute expiry; expired/changed results become stale.
Dates accept the current clinic day forward and use the current profile’s configurable
`maxPostsPerWeek`, counting other existing dates. Date planning captures preferences;
changing them while generation runs makes the result stale. Date changes increment
the item revision and revoke content approval.

Visual RPCs: `enqueue_visual_job`, `enqueue_brand_logo`,
`claim_visual_job_server`, `finish_visual_job_server`. Explicit logo generation
requires `logoPreference=create` on the confirmed profile. The visual worker also
seeds requested logos from valid approved setup, once per profile, without a
separate launch executor. Setup approval revocation, profile/access changes or
subscription expiry reject automatic logo results. Image editing preserves
the original attachment. Ready campaign plans create deduplicated image jobs when
the visual worker claims; traffic skip prevents enqueue/acceptance. Plan content
hash and approval token bind jobs to the proposal version.

Continuous RPCs: `claim_content_production_server`,
`finish_content_production_server`. The existing API `ContentPreparation` worker
first claims strategy work and then native content production. Do not add a second
worker owner. Completed, current `company_setup` plus current approvals seeds text
and image units. Video scripts are text; final MP4 comes from the client. Carousel
cover is completed before subsequent frames so the existing style-reference
adapter can reuse it. All generated content remains draft until reviewed.

## Reproducible checks

From repository root with dependencies installed:

```sh
COREPACK_HOME=/tmp/medsi-corepack XDG_DATA_HOME=/tmp/medsi-data corepack pnpm test -- tests/firestore-content.test.ts tests/firestore-content-worker.test.ts tests/content-date-provider.test.ts
COREPACK_HOME=/tmp/medsi-corepack XDG_DATA_HOME=/tmp/medsi-data corepack pnpm check
```

Focused fixtures cover isolation, stale revisions, approval revocation, immutable
approved snapshots, missing media, duplicate requests/claims, expiry/restart,
provider failure/backoff/three attempt limit, setup→text→image, campaign image seed,
traffic skip, automatic logo deduplication/approval/access/profile guards, configurable
weekly limits, current day planning, and worker adapter execution with provider functions replaced by
fixtures. They do not prove live provider availability or cloud permissions.

## Configuration and external gates

Use `DATABASE_PROVIDER=firestore`, server-only Firebase project configuration and
server-only `OPENAI_API_KEY`. Existing role/model configuration remains in
`ai/models.ts`; validate configured IDs in the actual account. Enable
`CONTENT_AUTOPREP_ENABLED` and `VISUAL_JOBS_ENABLED` only in the controlled test
API. No credential belongs in git, chat, the client or the fixture suite.

Leases last five minutes, failed queue units retry after one minute and stop after
three attempts. Production retry always creates a new content-run ID and immutable
media object. Daily company/user content limits are inherited from SQL; visual
limits are 30 enqueued requests / 36 attempts per company per rolling day. Quota
exhaustion remains visible as failure, and manual calendar retry is available.
Failed/stale objects can remain private and unlinked; retention cleanup must be
validated before enabling a destructive storage cleanup policy.

Before sale: operator must deploy the private test environment, verify native
Firestore transactions/query indexes/IAM, private storage and signing, configure
approved models and cost ceilings, execute sandbox provider checks and confirm
medical review/approval behavior. Calendar capability response distinguishes
`persistenceValidation=fixtures` and `providerValidation=pending`; configured
availability does not establish live provider homologation. No deployment,
publication, campaign activation or real spend is authorized by fixture checks.
