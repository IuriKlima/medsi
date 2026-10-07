# Content and image-description audit — 2026-10-07

Target configuration: `medsi-80f4a`, native root `medsi/v1`. This audit used only
repository inspection and the existing `MemoryStore` simulation. It did not
connect to that project, Gemini/OpenAI, Cloud Storage, or any remote provider.
No credentials, cloud IAM, rules, indexes, data migration or deployment changed.

## Findings and corrections

1. The existing `ImageDescriptions` worker called `claim_image_description_server`
   and `finish_image_description_server`, but neither operation was registered in
   the native dispatcher. The new dispatcher-level tests reproduced
   `FIRESTORE_OPERATION_PENDING`. The native module now implements service-only
   claims/completion with a five-minute lease/backoff and three-attempt ceiling.
2. Native attachment writers did not initialize the image-description fields that
   the SQL schema supplied. Shared defaults now mark images pending and PDFs
   unsupported; both uploads and visual results use those defaults. Existing
   native attachments without queue status require an explicitly authorized,
   bounded metadata backfill before scheduling description work for them. Runtime
   polling leaves them untouched; no backfill or migration was performed.
3. Description claims verify the attachment tenant, uploader's current read
   permission, unarchived company, private storage metadata, MIME, size and path.
   Completion binds the result to the claim token and a fingerprint of the source
   path/MIME/size/digest/uploader. Altered files, revoked access, wrong tenants,
   expired/replaced tokens and duplicate completions cannot attach a description.
   The provider and persistence share the same strict structured-output schema.
   Image descriptions are internal catalog metadata, not profile facts or approvals.
4. Content production previously accepted a result after `company_setup` was
   deleted, invalidated or changed to another profile version. Three regression
   cases first returned `{status:'completed'}`. Claim/completion now revalidate
   the setup alongside the existing access/subscription/profile/approval/brief and
   item-revision guards, marking obsolete work stale without changing the item.
5. An initial compatibility scan queried all image attachments by MIME before
   claiming work. Native queries reject more than 1,000 matches, so completed
   history could permanently block even new pending work. That scan was removed.
   Failed-job queries now include attempt counts 0–2 so terminal three-attempt
   failures also stay outside retry scans. Regression simulations reproducing the
   native query bound first failed with 1,001 ready images and with 1,001 terminal
   failed images; both now claim the pending image and poll idle successfully.

## Operation matrix

All collection names below are under `medsi/v1/`.

| Module / entrypoint | Collection path | Operation and isolation | Test state |
| --- | --- | --- | --- |
| `onboarding/controller.ts`, `POST/GET companies/:id/attachments/:attachmentId` | `onboarding_attachments/{id}`, `storage_objects/{hash}` | Tenant-scoped reads; upload magic/MIME/size validation; `record_onboarding_attachment` verifies ready stored file; downloads authorize tenant | Existing domain tests plus new defaults regression; actual Cloud Storage not exercised |
| `onboarding/image-descriptions.ts` worker | `onboarding_attachments/{id}`, reads `companies`, memberships, grants, `storage_objects` | `claim_image_description_server`, `finish_image_description_server`; service-only; claim/completion source and tenant checks; lease/retry/token/schema validation | New dispatcher + MemoryStore regressions; Gemini and actual worker downloads unvalidated |
| `onboarding/calendar-controller.ts` content editing | `company_calendar_items/{id}`, `company_calendar_history/{item_revision}`, `company_calendar_approvals/{version_assetHash}` | `edit_calendar_item`, `approve_calendar_item`, revision-bound snapshots and access; tenant query mappings require company scope | Existing MemoryStore cases cover cross-tenant writes, stale revisions, immutable approval snapshots |
| Content generation | `company_content_runs/{request}`, `company_creatives/{run}`, `company_final_videos/{upload}` | `start_content_run`, `finish_content_details`, `finish_content_design`, `finish_calendar_video`; profile/strategy/approval/item versions; ready private media required | Existing MemoryStore generation expiry, failure, private-image/video and draft tests |
| Calendar dates | `calendar_date_runs/{request}`, `company_calendar_items`, history and downstream approvals | `start_calendar_dates`, `finish_calendar_dates`, `move_calendar_date`; planning snapshot, date/revision and configurable weekly limits | Existing MemoryStore current-day, weekly limit, preference change and revision cases |
| `ai/visual-jobs.ts` HTTP and worker | `company_visual_jobs/{id}`, `company_visual_attempts/{id}`, `onboarding_attachments/{asset}` | `enqueue_visual_job`, `enqueue_brand_logo`, `claim_visual_job_server`, `finish_visual_job_server`; current access/profile/subscription, setup/plan approval tokens, daily limits and immutable asset upload | Existing MemoryStore concurrent claims, retry exhaustion, stale tokens, automatic logos/campaign images, traffic skip and access/profile/subscription changes; no provider call |
| `onboarding/content-preparation.ts` existing worker | `company_content_production_jobs/{hash}`, `company_setup/{company}`, content collections | `claim_content_production_server`, `finish_content_production_server`; deterministic units, fresh run per retry, cover before remaining carousel frames, current setup guard | Existing flow/restart test plus three new setup-revocation cases; worker-adapter tests are explicitly simulated |

Private bucket object keys use `medsi/company-assets/{company}/onboarding/{asset}.{ext}`,
`medsi/company-assets/{company}/generated/{run}.{ext}`, and
`medsi/company-assets/{company}/final-video/{upload}.mp4`. The Firestore metadata
key is the stable hash of `company-assets/{company}/...`. Domain records store
relative private paths, not public URLs. Worker read mappings for attachments and
creatives require an explicit company filter. The visual worker additionally checks
reference path prefixes, uploads with `upsert:false`, and removes an unaccepted
generated object through the existing storage adapter.

## Validation and limits

- Before changes: 15 new description tests failed (missing RPC dispatch and missing
  attachment defaults); the three production setup cases also failed.
- Dispatcher-integrated focused suites after the queue-scan correction: **61/61 passing** across
  `firestore-image-descriptions` (19), `firestore-content` (22), `firestore.test`
  (16), `content-date-provider` (2), and `firestore-content-worker` (2).
- Related regression suites: **21/21 passing** across `firestore-queue-polling`
  (10), `firestore-complete-journey` (5), and `visual-jobs` (6).
- Focused ESLint for changed content/schema/queue/tests: passed.
- API `tsc --noEmit` after shared dispatcher/storage integration: passed.
- `git diff --check`: passed. Root agent owns the repository-wide `pnpm check`.

Reproduce the focused test run with:

```sh
COREPACK_HOME=/tmp/medsi-corepack XDG_DATA_HOME=/tmp/medsi-data corepack pnpm exec vitest run tests/firestore-image-descriptions.test.ts tests/firestore-content.test.ts tests/firestore-content-worker.test.ts tests/content-date-provider.test.ts tests/firestore.test.ts --maxWorkers=2
COREPACK_HOME=/tmp/medsi-corepack XDG_DATA_HOME=/tmp/medsi-data corepack pnpm exec vitest run tests/firestore-queue-polling.test.ts tests/firestore-complete-journey.test.ts tests/visual-jobs.test.ts --maxWorkers=2
```

The existing `DocumentTransaction.list` rejects queries matching more than 1,000
documents. Plain MemoryStore does not emulate that bound; the new queue-history
regressions explicitly wrap its reads with the same rejection. Ready history and
terminal failures are excluded from runtime candidate queries. More than 1,000
pending/processing documents, or failed documents at a particular retry attempt,
still exceed the existing active-queue bound and require future pagination work.
Legacy attachments with missing status/attempt metadata need an explicitly
authorized bounded backfill before scheduling them; the runtime worker does not
discover or migrate them. No remote scan or migration was run. Native transaction
contention, index availability and read/write limits remain unvalidated.

The five-minute image-description retry behavior and three-attempt ceiling match
the existing SQL contract; paid content/visual retry uses its separate one-minute
backoff. Image descriptions can run during onboarding before subscription/profile
confirmation and therefore do not inherit paid-content eligibility gates. Source
authorization is rechecked at claim/completion; no distributed guarantee can revoke
a provider request already sent by a worker. Provider configuration, actual Gemini
structured output, byte validation in Cloud Storage, signing, IAM/rules and live
Firestore transactions remain unvalidated. These local results do not establish
production readiness or provider homologation.
