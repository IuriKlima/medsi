# Progressive marketing profile and Places review

Native operations are exported by `platform/firestore/marketing-profile.ts` as `marketingProfileOperations` / `marketingProfileRpc`:

- `save_company_marketing_facts`: explicitly confirmed partial marketing facts after mandatory medical intake. Current revision and UUID request are required. New confirmed profile version and impact record are persisted; old snapshots, approved content and the original medical intake answers are preserved.
- `save_company_onboarding`: compatibility for existing `/answers` endpoint. Replies and edits create an unconfirmed draft. AI suggestions retain their provenance; personal confirmation requires essential facts and manual location confirmation. The operation cannot bypass the mandatory medical intake or alter CNPJ/file references.
- `review_onboarding_competitors`: compatibility for existing `/places/review`. Accepts at most ten unique user-confirmed Place IDs and labels, excludes the own establishment and requires confirmed location. Stores selection provenance, never a provider response batch or generated commercial facts. Selection is `selected`; Instagram research requires a separate explicit opt-in.

The new `MarketingProfileController` exposes authenticated GET/POST `/onboarding/companies/:id/marketing-facts`. Register it in the application and expose the path in the authenticated proxy. Register the operation dispatcher in the native Firestore client.

`MarketingFacts` is a reusable progressive UI with `{companyId,stage,write,onChanged(snapshot)}`. Stage 1 collects objective, audience, public channels and brand; stage 2 structure, hours, approved offers and video availability; stage 4 administrative sales/hours; stage 5 optional budget. A budget value never grants spending or creates campaign/channel execution. The guided parent must retain the returned snapshot so version comparisons use the new profile.

Each write verifies tenant and `marketing.write`, validates the shared Zod fact contracts, checks current revision, deduplicates request fingerprints, and invalidates downstream marketing/site approvals while retaining published snapshots. Marketing facts allow unknown/deferred values. Public URLs in channels/references reject HTTP, credentials, query strings and private hostnames. No URLs are fetched by these write operations.

Collection additions: `marketing_profile_requests` (internal deduplication), existing `company_profile_versions`, `company_profile_impacts`, `onboarding_messages`, `audit_logs`. User-confirmed Places selections use deterministic company/Place ID keys in `company_competitor_research`; only explicit digital opt-in transitions them to a leased provider task.

Fixtures cover progressive objective/audience updates, history/invalidation, preserved medical intake, rejection of intake bypass, deferred budget/no spend or connection, idempotency/conflicting reuse/stale edits, tenant isolation, protected CNPJ, unsafe public URLs, unconfirmed AI suggestions, explicit location confirmation, competitor provenance, strict payload fields and own establishment exclusion. Eight domain fixtures passed with no provider access. Targeted lint passed and API/web typecheck output contains no errors in these new modules. Real Firestore/browser/provider and Google Places policy homologation remain pending.
