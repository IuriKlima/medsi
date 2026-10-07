# Firestore path and routing audit — 2026-10-07

Scope: static source audit of baseline `8fd1cde` (`fix/regional-baseline-2026-10-06`) and observation of the concurrent local repair session. No credentials, provider requests, emulator, remote database, deployment, migration, commit or production effects were used for this audit. Baseline findings below are **not** claims that concurrently edited files remain broken; the integration owner must reconcile the noted fixes before reporting the final state.

## Integrated repair reconciliation

The baseline inventory below is retained as evidence. The integrated working branch now registers **161 native operations**; the regenerated `medsi-firestore-operations.json` reports **24 pending literal API RPCs** (167 literal calls). Five gaps closed: image-description claim/finish and management ingestion status/key/ingest. All five route through the actual `client.ts` registry.

Web server queries now expose the current actor's API-authorized `companyMemberships`, and route `company_onboarding` through the authenticated, company-scoped `/onboarding/companies/:id` endpoint. Meta/Google callbacks fail explicitly when this read is unavailable. No generic query proxy or client-side authorization was added.

Additional paths introduced by management ingestion (prefix `medsi/v1/`):

| Path | Operations | Access |
|---|---|---|
| `management_ingestion_keys/<company-id>` | get, put | owner creates/revokes; status omits hash; ingestion reauthorizes creator |
| `management_ingestion_key_hashes/<sha256>` | get, put, remove | private server lookup; binds token hash to clinic |
| `management_ingestion_events/<company>_<key>_<event>` | get, list, put | server replay/order/rate guard |

Image descriptions reuse `onboarding_attachments` and `storage_objects`; no new asset collection. Native collection inventory increases from 103 to 106. Further corrections cover superseded subscription cancellation, production setup invalidation, current-number WhatsApp windows/uncertain deliveries, and site publication proof/material ownership. Domain reports detail tests and residual gaps.

Four generic API table gaps (`audit_logs`, `company_invitations`, `company_permission_grants`, `editorial_drafts`) and the remaining administration/support/dashboard/team RPCs are **still incomplete**. There is no claim that all legacy routes now work. The <=1,000-document query limit, provider homologation, named-database deploy configuration and storage infrastructure review also remain open. Final integrated verification and runtime evidence are in `medsi-firestore-validation-2026-10-07.md`.

## Routing and path model

1. `apps/web/lib/auth/server.ts` / Firebase configuration select the Firebase server shim when `DATABASE_PROVIDER` is `firestore` or `firebase_sql`. Browser components reach API proxy routes; they do not receive an Admin Firestore client.
2. `apps/web/lib/firebase/server.ts` forwards the session cookie as a bearer token to `/identity`; baseline `.from()` exposes only the API-authorized `profiles`, `platform_staff`, `companies` bootstrap views. It forwards only `company_capabilities` and `company_purchase_state` RPCs to explicit API endpoints.
3. `apps/api/src/platform/firebase-auth.ts` verifies a revoked-aware Firebase session cookie or ID token, requires verified email and an enabled Auth user, resolves the Firebase UID through `ensure_firebase_identity_server`, then constructs an `authenticated` client. `platform/service.ts` constructs the trusted `service_role` client independently of request input.
4. `DATABASE_PROVIDER=firestore` selects `platform/firestore/client.ts`; `firebase_sql` selects `database-client.ts` with PostgreSQL roles/RLS; `supabase` uses the original client. A `SupabaseClient` TypeScript cast does **not** make every Supabase operation available in the Firestore implementation.
5. Native operations are dispatched through `handlers` / `firestoreOperations`, then executed in `DocumentStore.run()` through the Firebase Admin SDK. `record_onboarding_attachment` has an explicit dispatcher branch. `move_calendar_date` deliberately resolves to `content.ts`, with the duplicate journey registration filtered out.
6. Every Firestore document is `/databases/<FIRESTORE_DATABASE_ID or (default)>/documents/medsi/v1/<collection>/<id>`. `medsi` is the root collection, `v1` its document, and each domain collection below is a **subcollection of `medsi/v1`**. There is no per-company nested Firestore tree. Company isolation uses `company_id`, membership/owner checks, deterministic keys and record ownership validation. Paths such as `company/<id>/contacts` do not exist in this store.
7. `tx.get` reads an exact document; `tx.list` sends equality predicates only; `tx.put` stages a whole-document replacement; `tx.remove` stages deletion. Writes flush after all reads so a retried transaction contains no external provider effect. Guardrails reject undefined/nonfinite values and serialized documents over 800,000 bytes.

## Module status matrix

“Native” means registered local source implementation, not provider homologation. All modules remain subject to the production gate in `platform/production-config.ts:20`, which rejects production Firestore while migration is incomplete.

| Product module | Native source / operations | Concrete baseline status |
|---|---|---|
| Identity and companies | `identity.ts`, `access.ts`: Firebase mapping, workspaces, company creation/update/export, capabilities | Native core; team roster/invitations/member mutation remain pending. Staff flag does not grant arbitrary clinic access. |
| Medical onboarding / profile | `onboarding.ts`, `marketing-profile.ts`, `providers.ts`, `storage.ts` | Native revisioned intake, confirmation, history, provider reservation and private attachment recording. Image description claim/finish absent at baseline; concurrent content agent is porting them. |
| Journey / strategy | `journey-state.ts`, `journey.ts`, `strategy.ts`, `preparation.ts` | Native profile anchors, stage approvals, planning/traffic preferences, strategy versions and preparation/recommendation leases. |
| Regional research | `regional.ts`, `competitor-invalidation.ts` | Native request/claim/progress/finish, versioned selections and invalidation. IBGE/Places/OSM evidence still requires provider verification. |
| Content / calendar / studio | `content.ts`, `production.ts`, `visuals.ts`, `social-publication.ts` | Native details/design/date runs, media references, versioned approvals, content/visual queues and social execution ledger. Actual AI/media/publication providers unverified in this audit. |
| CRM / attendance | `crm.ts`, `inbox.ts`, `whatsapp-cloud.ts`, `channels.ts` | Native contacts, opportunities, notes, consent, takeover, dispatch reservations, automatic reply jobs and official webhook ingestion. Delivery/Meta/Evolution effects unverified. |
| Relationship campaigns | `campaigns.ts` | Native recipients/import, draft/version/approval, activation and delivery leases. Management ingestion key/status/ingest RPCs absent at baseline; concurrent attendance agent is porting them. |
| Sites / domains | `sites.ts` | Native site revisions, approval/publish, domain/slug reservation and worker queue; public reads resolve explicit published snapshots. Real DNS/hosting/provider behavior unverified. |
| Billing / access | `commerce.ts`, `billing.ts`, `billing-queue.ts` | Native test checkout and sandbox Asaas lifecycle/snapshots/reconciliation; scheduler uses direct transactional helpers. Real provider and infrastructure homologation pending. |
| Advertising | `advertising.ts` | Native OAuth/session credentials, paid proposal, immutable execution review, budget approval, leases/step ledger and reconciliation. No actual ad execution validated. |
| Digital / Instagram research | `digital.ts`, `channels.ts` | Native competitor search/watch lifecycle and selected Instagram identities. Professional account permissions/provider availability unverified. |
| Administration / accompaniment | No native admin RPC module | Portfolio, assignment, internal access sessions/context, permission mutation and meetings fail closed as pending; existing `platform_staff` self-read and company grants used by authorization are not complete administration. |
| Support | No native support RPC module | Ticket list/detail/create/reply/status all pending. No invented Firestore support schema is claimed. |
| Dashboard / reports | `dashboard/overview-controller.ts` uses native table reads; legacy `dashboard/controller.ts` RPCs absent | Overview works only within current source query limits; dashboard import/read/export/keywords pending. Market snapshot cache is process memory, not Firestore persistence. |
| Local draft import | No native import RPC | `import_local_drafts` and generic `editorial_drafts` read pending; does not silently promote local records. |

## Findings and isolation boundaries

| Finding | Evidence | Status / practical effect |
|---|---|---|
| Web shim omits two real server views | `web/lib/firebase/server.ts:35`; company page `app/empresa/[id]/[[...section]]/page.tsx:23`; Google/Meta callback routes line 9 | Baseline `company_members` query fails and hides admin team controls; `company_onboarding` query fails and skips the unconfirmed-onboarding callback destination. Reported to integration owner for repair. |
| Four direct API tables are unreachable | `identity/service.ts:72-73`; `operations/controller.ts:33,37`; `firestore/client.ts:readRows` | `company_invitations`, `audit_logs`, `editorial_drafts`, `company_permission_grants` return `FIRESTORE_OPERATION_PENDING`. Audit/grant documents do exist internally; generic access still requires a narrowly authorized port. |
| Native query cap precedes API pagination/filtering | `firestore/store.ts:38-45`; `client.ts:execute`; `dashboard/overview-controller.ts:23-31` | Native scan over 1,000 documents throws before `.range`, date filtering, `.limit`, exact count or `.head`. A clinic with 1,001 contacts cannot use the advertised 1,000-row dashboard pagination. Error is surfaced, not silently truncated. |
| Queue history can exhaust the same cap | Global `company_setup`, `company_marketing_approvals`, ad executions, social publications; per-status worker lists; billing environment list | A sufficiently large global queue/history or status group can block a worker. Adding composite indexes alone does not fix the current bounded scan. |
| Database deployment/runtime mismatch | `firebase.json` has `(default)`; `firestore/store.ts:firestoreDatabase` honors `FIRESTORE_DATABASE_ID` | Named runtime DB needs matching deployment configuration. Existing file does not demonstrate rules/indexes deployed to the selected runtime database. |
| Storage infrastructure is not declared here | `firebase.json` has no Storage rules stanza; `firebase/storage.rules` absent | Application metadata/path authorization exists, but this repository does not establish cloud bucket IAM/privacy or Storage rules. Must verify in infrastructure; no assertion that bucket is publicly exposed. |
| Native SDK/hosted security not proved by memory tests | `tests/firestore.test.ts` runs real native SDK scenarios only when a local `FIRESTORE_EMULATOR_HOST` exists | Memory tests and fake providers demonstrate application behavior only. This audit ran no cloud/emulator/provider checks. |

No concrete cross-tenant disclosure was demonstrated by this static audit. This is **not** a full security certification. Important verified source boundaries:

- Direct client Firestore rules deny **all** reads and writes, including authenticated browser users. Admin SDK IAM credentials bypass these rules; server authorization is therefore essential. A deny-all rules file cannot compensate for a missing Admin-side company check.
- `companyAccess` rejects anonymous/service-role actors on user paths, missing/archived companies, and insufficient current permissions. Workspace owner receives the defined actions; company roles receive limited actions. Delegated grants are considered only while a membership exists and their expiry has not passed. Workers use separate `server(actor)` gates and domain-specific original-actor/approval/lease checks.
- Generic company data reads require an explicit `company_id` equality and the appropriate current capability. Campaign reads require both `marketing.read` and `crm.read`; channel metadata permits either. Profiles/staff/membership bootstrap reads are restricted to the authenticated actor. Secret collections are not exposed through generic reads.
- Service-role generic reads are restricted to clinic-scoped `onboarding_attachments` and `company_creatives`; individual workers obtain broader state only through registered server operations. Do not add a service-role “read any table” escape hatch.
- Document IDs alone are not authorization. Domain handlers compare the record's `company_id` before using a request-supplied ID; media lookups compare storage metadata ownership. Public site delivery must first verify the published snapshot and that an asset is referenced by that snapshot.
- Private bytes reside at `gs://<FIREBASE_STORAGE_BUCKET>/medsi/company-assets/<company-id>/<relative-object-path>`, with metadata at `medsi/v1/storage_objects/<hash(bucket/path)>`. Upload validates company permission, content type, size, immutable digest and generation precondition. Download validates digest/size and rechecks authorization; signed URLs expire within 600 seconds; removal is server-only. This path is Cloud Storage, not a Firestore subcollection.

## Query and index matrix

`firebase/firestore.indexes.json` currently has no composite indexes. The only disabled single-field indexing covers `company_onboarding.facts`, `company_onboarding.medical_intake`, `company_profile_versions.facts`, `onboarding_messages.body`; these fields are not filtered by native `tx.list` in the audited implementation.

| Current query family | Actual Firestore request | Composite-index status |
|---|---|---|
| Company views / contacts / notes / channels / files / campaign history | `company_id == X`; remaining filters, order and limit in JS | No composite query is currently issued. Single-field equality indexing applies. |
| Membership bootstrap / company list | `user_id == X`, or `workspace_id == X`, plus exact document gets | Equality only; no composite query currently issued. |
| Regional/preparation/content/site/visual/digital workers | Separate `status == pending/running/...` lists, followed by in-memory due-time/lease sorting | Equality only. Current cap/scanning risk remains. |
| Campaign delivery / recipients | `status == active`, `state == reserved/sending`, company-scoped lists | Equality only; no server-side time range/order. |
| Billing queue | `environment == sandbox`, then in-memory state/due sorting | Equality only; current history size can block polling. |
| Ads/social global workers and setup seeders | Unfiltered collection list plus in-memory filtering/sorting | No composite query issued; bounded global scan risk. |
| Quota/usage scopes | `company_id == X` or `actor_id == X`, date tested in JS | Equality only; unbounded historical growth is a functional limit. |
| Future native dashboard date pagination | Would require `company_id == X`, date inequalities, date/id ordering and cursor | Needs a deliberate native query/pagination design and appropriate composite index; **not implemented** by adding `.range` today. |
| Future scalable due-job polling | Would combine status/environment equality, due-time inequality and ordering | Requires specific indexes matching the eventual query. Do not claim these queries already run. |

Every currently emitted native predicate is `==` in `store.ts`; no other native `.where`, `.orderBy`, or `collectionGroup` call was found in application/scripts. Absence of a configured composite index is therefore not by itself proof of a current missing-index failure. Neither repository configuration nor this static reasoning proves deployed indexes; deployed verification is pending.

## Registered operations and all native paths

For the inventory below, `get`/`list` = reads, `put` = staged whole-document write, `remove` = delete. Shared access/journey helpers are listed separately because callers inherit those reads/writes. Dynamic `table` aliases and helper calls were resolved explicitly; the generic `client.ts` facade can read the allowlisted views described above. Collection paths are all exact `medsi/v1/<collection>/<id>` patterns. ID forms include actor/company UUID, company-plus-version, compound membership IDs, request/job UUID and deterministic SHA-256 hashes; none introduce deeper subcollections.

### access.ts

| Collection/document path | Local accesses |
|---|---|
| `medsi/v1/audit_logs/<id>` | put |
| `medsi/v1/companies/<id>` | get |
| `medsi/v1/company_members/<id>` | get |
| `medsi/v1/company_permission_grants/<id>` | list |
| `medsi/v1/company_subscriptions/<id>` | get |
| `medsi/v1/plan_catalog/<id>` | get |
| `medsi/v1/workspace_members/<id>` | get |

### advertising.ts

Registered baseline operations: `begin_google_ads`, `consume_google_ads`, `ad_credentials_server`, `begin_paid_plan`, `finish_paid_plan_server`, `edit_ad_execution`, `approve_ad_execution`, `control_ad_execution`, `claim_ad_execution_server`, `ad_execution_guard_server`, `ad_execution_context_server`, `ad_step_server`, `finish_ad_execution_server`, `reserve_ad_copy_server`, `claim_ad_plan_seed_server`, `finish_ad_plan_seed_server`.

| Collection/document path | Local accesses |
|---|---|
| `medsi/v1/ad_credentials/<id>` | get, put, remove |
| `medsi/v1/ad_execution_steps/<id>` | get, list, put |
| `medsi/v1/channel_secrets/<id>` | get |
| `medsi/v1/companies/<id>` | get |
| `medsi/v1/company_ad_connections/<id>` | get, put |
| `medsi/v1/company_ad_execution_keys/<id>` | get, put |
| `medsi/v1/company_ad_executions/<id>` | get, list, put |
| `medsi/v1/company_ad_plan_seeds/<id>` | get, put |
| `medsi/v1/company_channels/<id>` | list |
| `medsi/v1/company_marketing_approvals/<id>` | list |
| `medsi/v1/company_paid_plans/<id>` | get, list, put |
| `medsi/v1/company_permission_grants/<id>` | list |
| `medsi/v1/company_profile_versions/<id>` | get |
| `medsi/v1/company_sites/<id>` | get |
| `medsi/v1/google_ads_sessions/<id>` | get, put |
| `medsi/v1/onboarding_attachments/<id>` | get |

### billing-queue.ts

| Collection/document path | Local accesses |
|---|---|
| `medsi/v1/billing_reconciliation_jobs/<id>` | get, list, put |

### billing.ts

Registered baseline operations: `begin_asaas_checkout`, `attach_asaas_subscription_server`, `reserve_asaas_reconciliation_server`, `apply_asaas_snapshot_server`, `request_asaas_cancellation`, `confirm_asaas_cancellation_server`.

| Collection/document path | Local accesses |
|---|---|
| `medsi/v1/billing_payment_snapshots/<id>` | put |
| `medsi/v1/billing_provider_events/<id>` | get, list, put |
| `medsi/v1/billing_reconciliation_jobs/<id>` | get, put |
| `medsi/v1/billing_subscription_bindings/<id>` | get, put |
| `medsi/v1/company_billing_checkout_state/<id>` | get, put |
| `medsi/v1/company_billing_checkouts/<id>` | get, put |
| `medsi/v1/company_billing_customers/<id>` | get |
| `medsi/v1/company_onboarding/<id>` | get |
| `medsi/v1/company_subscriptions/<id>` | get, put |

### campaigns.ts

Registered baseline operations: `register_campaign_contacts`, `revoke_campaign_contact`, `import_campaign_students`, `save_message_campaign`, `preview_message_campaign`, `activate_message_campaign`, `claim_message_campaign`, `prepare_message_campaign`, `finish_message_campaign`.

| Collection/document path | Local accesses |
|---|---|
| `medsi/v1/campaign_recipient_keys/<id>` | get, put, remove |
| `medsi/v1/campaign_students/<id>` | get, list, put |
| `medsi/v1/company_channels/<id>` | list |
| `medsi/v1/company_onboarding/<id>` | get |
| `medsi/v1/contacts/<id>` | get, list |
| `medsi/v1/inbox_auto_jobs/<id>` | list |
| `medsi/v1/inbox_dispatches/<id>` | list |
| `medsi/v1/inbox_handoffs/<id>` | get |
| `medsi/v1/message_campaign_approvals/<id>` | put |
| `medsi/v1/message_campaign_deliveries/<id>` | get, list, put |
| `medsi/v1/message_campaign_delivery_keys/<id>` | get, put |
| `medsi/v1/message_campaign_versions/<id>` | put |
| `medsi/v1/message_campaigns/<id>` | get, list, put |
| `medsi/v1/whatsapp_cloud_messages/<id>` | list |

### channels.ts

Registered baseline operations: `read_company_meta_server`, `read_channel_secret`, `begin_meta_session`, `consume_meta_session`, `save_meta_selection`, `read_meta_selection`, `save_company_channel`, `disconnect_company_channel`.

| Collection/document path | Local accesses |
|---|---|
| `medsi/v1/channel_remote_bindings/<id>` | get, put, remove |
| `medsi/v1/channel_secrets/<id>` | get, put, remove |
| `medsi/v1/company_channels/<id>` | list, put |
| `medsi/v1/inbox_auto_jobs/<id>` | list, put |
| `medsi/v1/meta_sessions/<id>` | get, list, put, remove |

### commerce.ts

Registered baseline operations: `begin_test_checkout`, `complete_test_checkout_server`.

| Collection/document path | Local accesses |
|---|---|
| `medsi/v1/company_checkout_state/<id>` | get, put |
| `medsi/v1/company_onboarding/<id>` | get |
| `medsi/v1/company_setup/<id>` | get |
| `medsi/v1/company_subscriptions/<id>` | get |
| `medsi/v1/company_test_access/<id>` | get, put |
| `medsi/v1/company_test_checkouts/<id>` | get, list, put |

### competitor-invalidation.ts

| Collection/document path | Local accesses |
|---|---|
| `medsi/v1/company_competitor_research/<id>` | list, put |
| `medsi/v1/company_regional_research/<id>` | list, put |
| `medsi/v1/company_regional_research_versions/<id>` | get, put |

### content.ts

Registered baseline operations: `start_content_run`, `finish_content_details`, `finish_content_design`, `edit_calendar_item`, `approve_calendar_item`, `finish_calendar_video`, `start_calendar_dates`, `finish_calendar_dates`, `move_calendar_date`.

| Collection/document path | Local accesses |
|---|---|
| `medsi/v1/calendar_date_runs/<id>` | get, list, put |
| `medsi/v1/company_calendar_approvals/<id>` | put |
| `medsi/v1/company_calendar_history/<id>` | put |
| `medsi/v1/company_calendar_items/<id>` | get, put |
| `medsi/v1/company_content_runs/<id>` | get, list, put |
| `medsi/v1/company_creatives/<id>` | list, put |
| `medsi/v1/company_final_videos/<id>` | get, list, put |
| `medsi/v1/onboarding_attachments/<id>` | get |
| `medsi/v1/storage_objects/<id>` | get |

### crm.ts

Registered baseline operations: `save_crm_contact`, `move_crm_opportunity`, `open_company_conversation`, `set_conversation_mode`, `add_conversation_note`, `claim_company_reply`, `sync_whatsapp_crm`.

| Collection/document path | Local accesses |
|---|---|
| `medsi/v1/company_channels/<id>` | list |
| `medsi/v1/company_contact_channels/<id>` | get, list, put |
| `medsi/v1/company_conversation_notes/<id>` | get, put |
| `medsi/v1/company_conversations/<id>` | get, list, put |
| `medsi/v1/company_onboarding/<id>` | get |
| `medsi/v1/company_reply_jobs/<id>` | get, list, put |
| `medsi/v1/company_service_settings/<id>` | get |
| `medsi/v1/contacts/<id>` | get, list, put |
| `medsi/v1/crm_requests/<id>` | get, put |
| `medsi/v1/opportunities/<id>` | get, list, put |
| `medsi/v1/stage_history/<id>` | put |

### digital.ts

Registered baseline operations: `request_competitor_research`, `save_instagram_watch`, `select_competitor_instagram`, `retry_competitor_research`, `claim_instagram_watch_server`, `finish_instagram_watch_server`, `claim_competitor_research_server`, `finish_competitor_research_server`.

| Collection/document path | Local accesses |
|---|---|
| `medsi/v1/company_competitor_research/<id>` | get, list, put |
| `medsi/v1/company_instagram_watches/<id>` | list, put, remove |

### identity.ts

Registered baseline operations: `ensure_firebase_identity_server`, `create_workspace`, `create_company`, `begin_company_onboarding`, `company_capabilities`, `update_company`, `record_company_export`.

| Collection/document path | Local accesses |
|---|---|
| `medsi/v1/companies/<id>` | get, list, put |
| `medsi/v1/company_creation_requests/<id>` | get, put |
| `medsi/v1/company_members/<id>` | list, put |
| `medsi/v1/company_onboarding/<id>` | get, put |
| `medsi/v1/firebase_identities/<id>` | get, put |
| `medsi/v1/onboarding_provider_limits/<id>` | put |
| `medsi/v1/platform_staff/<id>` | get |
| `medsi/v1/profiles/<id>` | get, put |
| `medsi/v1/workspace_members/<id>` | list, put |
| `medsi/v1/workspaces/<id>` | get, put |

### inbox.ts

Registered baseline operations: `read_service_policy`, `save_service_policy`, `save_contact_consent`, `inbox_record_opt_out`, `save_service_settings`, `save_quick_reply`, `take_inbox_conversation`, `release_inbox_conversation`, `reserve_inbox_dispatch`, `reserve_meta_dispatch`, `finish_inbox_dispatch`, `inbox_ai_context`, `inbox_prompt_context`, `inbox_auto_targets`, `inbox_auto_claim`, `inbox_auto_prepare`, `inbox_auto_finish`, `inbox_auto_observe_human`.

| Collection/document path | Local accesses |
|---|---|
| `medsi/v1/companies/<id>` | get |
| `medsi/v1/company_channels/<id>` | list |
| `medsi/v1/company_contact_channels/<id>` | list |
| `medsi/v1/company_onboarding/<id>` | get |
| `medsi/v1/company_profile_versions/<id>` | get |
| `medsi/v1/company_quick_replies/<id>` | get, list, put, remove |
| `medsi/v1/company_service_policies/<id>` | get, put |
| `medsi/v1/company_service_settings/<id>` | get, list, put |
| `medsi/v1/contacts/<id>` | get, list, put |
| `medsi/v1/inbox_auto_jobs/<id>` | get, list, put |
| `medsi/v1/inbox_daily_usage/<id>` | get, put |
| `medsi/v1/inbox_dispatches/<id>` | get, list, put |
| `medsi/v1/inbox_handoffs/<id>` | get, put |
| `medsi/v1/whatsapp_cloud_messages/<id>` | list, put |

### journey-state.ts

| Collection/document path | Local accesses |
|---|---|
| `medsi/v1/company_calendar_items/<id>` | list |
| `medsi/v1/company_competitor_research/<id>` | list |
| `medsi/v1/company_content_preparations/<id>` | get |
| `medsi/v1/company_instagram_watches/<id>` | list |
| `medsi/v1/company_journey_state/<id>` | get, put |
| `medsi/v1/company_launch_jobs/<id>` | get |
| `medsi/v1/company_marketing_approvals/<id>` | list, put |
| `medsi/v1/company_onboarding/<id>` | get |
| `medsi/v1/company_planning_preferences/<id>` | get |
| `medsi/v1/company_profile_versions/<id>` | get |
| `medsi/v1/company_regional_research/<id>` | get |
| `medsi/v1/company_setup/<id>` | get, put |
| `medsi/v1/company_strategy_briefs/<id>` | get |
| `medsi/v1/company_traffic_preferences/<id>` | get |

### journey.ts

Registered baseline operations: `read_marketing_journey`, `approve_marketing_stage`, `finish_company_setup`, `move_calendar_date`, `set_traffic_preference`, `set_planning_preferences`.

| Collection/document path | Local accesses |
|---|---|
| `medsi/v1/company_calendar_items/<id>` | put |
| `medsi/v1/company_marketing_approval_history/<id>` | get, put |
| `medsi/v1/company_marketing_approvals/<id>` | get, put |
| `medsi/v1/company_planning_preferences/<id>` | put |
| `medsi/v1/company_setup/<id>` | get, put |
| `medsi/v1/company_strategy_briefs/<id>` | put |
| `medsi/v1/company_traffic_preferences/<id>` | put |

### marketing-profile.ts

Registered baseline operations: `save_company_marketing_facts`, `save_company_onboarding`, `review_onboarding_competitors`.

| Collection/document path | Local accesses |
|---|---|
| `medsi/v1/companies/<id>` | put |
| `medsi/v1/company_competitor_research/<id>` | list, put |
| `medsi/v1/company_marketing_approvals/<id>` | list, put |
| `medsi/v1/company_onboarding/<id>` | get, put |
| `medsi/v1/company_profile_impacts/<id>` | put |
| `medsi/v1/company_profile_versions/<id>` | put |
| `medsi/v1/company_setup/<id>` | get, put |
| `medsi/v1/company_sites/<id>` | get, put |
| `medsi/v1/marketing_profile_requests/<id>` | get, put |
| `medsi/v1/onboarding_messages/<id>` | put |

### onboarding.ts

Registered baseline operations: `company_onboarding_read`, `company_purchase_state`, `save_medical_intake`.

| Collection/document path | Local accesses |
|---|---|
| `medsi/v1/companies/<id>` | put |
| `medsi/v1/company_marketing_approvals/<id>` | list, put |
| `medsi/v1/company_onboarding/<id>` | get, put |
| `medsi/v1/company_profile_impacts/<id>` | put |
| `medsi/v1/company_profile_versions/<id>` | list, put |
| `medsi/v1/medical_intake_requests/<id>` | get, put |
| `medsi/v1/onboarding_attachments/<id>` | get, list |
| `medsi/v1/onboarding_messages/<id>` | list, put |

### preparation.ts

Registered baseline operations: `enqueue_content_preparation`, `claim_content_preparation_server`, `finish_content_preparation_server`, `enqueue_company_launch`, `claim_company_launch_server`, `finish_company_launch_server`.

| Collection/document path | Local accesses |
|---|---|
| `medsi/v1/company_content_preparations/<id>` | get, list, put |
| `medsi/v1/company_launch_jobs/<id>` | get, list, put |

### production.ts

Registered baseline operations: `claim_content_production_server`, `finish_content_production_server`.

| Collection/document path | Local accesses |
|---|---|
| `medsi/v1/company_content_production_jobs/<id>` | get, list, put |
| `medsi/v1/company_creatives/<id>` | list |
| `medsi/v1/company_setup/<id>` | list |
| `medsi/v1/onboarding_attachments/<id>` | list |

### providers.ts

Registered baseline operations: `reserve_onboarding_provider`, `finish_onboarding_provider`.

| Collection/document path | Local accesses |
|---|---|
| `medsi/v1/onboarding_provider_attempts/<id>` | get, put |
| `medsi/v1/onboarding_provider_limits/<id>` | get |
| `medsi/v1/provider_daily_usage/<id>` | get, put |

### regional.ts

Registered baseline operations: `request_regional_research`, `select_regional_competitors`, `claim_regional_research_server`, `progress_regional_research_server`, `finish_regional_research_server`.

| Collection/document path | Local accesses |
|---|---|
| `medsi/v1/company_regional_research/<id>` | get, list, put |
| `medsi/v1/company_regional_research_versions/<id>` | get, put |

### sites.ts

Registered baseline operations: `reserve_site_generation`, `save_company_site`, `approve_company_site`, `publish_company_site`, `set_site_domain`, `set_site_slug`, `verify_site_domain_server`, `read_published_site_server`, `enqueue_company_site`, `claim_company_site_server`, `finish_company_site_server`.

| Collection/document path | Local accesses |
|---|---|
| `medsi/v1/companies/<id>` | get |
| `medsi/v1/company_onboarding/<id>` | get |
| `medsi/v1/company_profile_versions/<id>` | get |
| `medsi/v1/company_setup/<id>` | get, list |
| `medsi/v1/company_site_auto_seeds/<id>` | get, put |
| `medsi/v1/company_site_domains/<id>` | get, put, remove |
| `medsi/v1/company_site_jobs/<id>` | get, list, put |
| `medsi/v1/company_site_versions/<id>` | put |
| `medsi/v1/company_sites/<id>` | get, put |
| `medsi/v1/onboarding_attachments/<id>` | get |
| `medsi/v1/onboarding_provider_limits/<id>` | get |
| `medsi/v1/provider_daily_usage/<id>` | get, put |
| `medsi/v1/site_address_reservations/<id>` | get, put, remove |
| `medsi/v1/site_generation_runs/<id>` | get, put |

### social-publication.ts

Registered baseline operations: `create_social_publication`, `edit_social_publication`, `approve_social_publication`, `control_social_publication`, `claim_social_publication_server`, `social_publication_context_server`, `social_publication_guard_server`, `social_publication_step_server`, `finish_social_publication_server`, `prepare_social_media_context_server`, `record_social_media_server`, `read_social_media_server`.

| Collection/document path | Local accesses |
|---|---|
| `medsi/v1/channel_secrets/<id>` | get |
| `medsi/v1/companies/<id>` | get |
| `medsi/v1/company_calendar_items/<id>` | get |
| `medsi/v1/company_channels/<id>` | get, list |
| `medsi/v1/company_creatives/<id>` | get, list |
| `medsi/v1/company_final_videos/<id>` | get |
| `medsi/v1/company_onboarding/<id>` | get |
| `medsi/v1/company_social_publications/<id>` | get, list, put |
| `medsi/v1/social_media_assets/<id>` | get, put |
| `medsi/v1/social_publication_keys/<id>` | get, put |
| `medsi/v1/social_publication_steps/<id>` | get, put |
| `medsi/v1/storage_objects/<id>` | get |

### storage.ts

| Collection/document path | Local accesses |
|---|---|
| `medsi/v1/companies/<id>` | get |
| `medsi/v1/onboarding_attachments/<id>` | get, put |
| `medsi/v1/storage_objects/<id>` | get, put, remove |

### strategy.ts

Registered baseline operations: `prepare_company_strategy`, `start_company_strategy`, `finish_company_strategy`, `edit_company_strategy`, `approve_company_strategy`, `strategy_feedback`.

| Collection/document path | Local accesses |
|---|---|
| `medsi/v1/company_calendar_items/<id>` | put |
| `medsi/v1/company_strategy_briefs/<id>` | get, put |
| `medsi/v1/company_strategy_versions/<id>` | put |

### visuals.ts

Registered baseline operations: `enqueue_visual_job`, `enqueue_brand_logo`, `claim_visual_job_server`, `finish_visual_job_server`.

| Collection/document path | Local accesses |
|---|---|
| `medsi/v1/company_paid_plans/<id>` | get, list |
| `medsi/v1/company_setup/<id>` | get, list |
| `medsi/v1/company_visual_attempts/<id>` | list, put |
| `medsi/v1/company_visual_jobs/<id>` | get, list, put |
| `medsi/v1/onboarding_attachments/<id>` | get, list, put |
| `medsi/v1/storage_objects/<id>` | get |

### whatsapp-cloud.ts

Registered baseline operations: `inbox_cloud_messages_server`, `save_whatsapp_cloud_channel_server`, `read_company_whatsapp_server`, `ingest_whatsapp_cloud_server`, `read_whatsapp_cloud_inbox`, `reserve_whatsapp_cloud_dispatch`.

| Collection/document path | Local accesses |
|---|---|
| `medsi/v1/channel_remote_bindings/<id>` | get, put, remove |
| `medsi/v1/channel_secrets/<id>` | get, put |
| `medsi/v1/company_channels/<id>` | get, list, put |
| `medsi/v1/company_contact_channels/<id>` | get, put |
| `medsi/v1/company_service_settings/<id>` | get |
| `medsi/v1/contacts/<id>` | get, list, put |
| `medsi/v1/inbox_auto_jobs/<id>` | list, put |
| `medsi/v1/inbox_dispatches/<id>` | get, list, put |
| `medsi/v1/inbox_handoffs/<id>` | get, put |
| `medsi/v1/opportunities/<id>` | list, put |
| `medsi/v1/whatsapp_cloud_messages/<id>` | get, list, put |

## Baseline pending literal RPCs

These operations are called by API source but absent from the native dispatcher at the audited commit. They fail closed with `FIRESTORE_OPERATION_PENDING`; PostgreSQL migrations do not implement them for Firestore. Newly added domain operations must be registered in `client.ts`, not merely exported from a source file.

| Pending RPC | Caller evidence |
|---|---|
| `accept_company_invitation` | `apps/api/src/identity/service.ts:91` |
| `change_company_member` | `apps/api/src/identity/service.ts:88` |
| `claim_image_description_server` | `apps/api/src/onboarding/image-descriptions.ts:27` |
| `company_assignment_roster` | `apps/api/src/operations/controller.ts:54` |
| `company_roster` | `apps/api/src/identity/service.ts:71` |
| `create_company_invitation` | `apps/api/src/identity/service.ts:79` |
| `create_support_ticket` | `apps/api/src/support/controller.ts:15` |
| `dashboard_import` | `apps/api/src/dashboard/controller.ts:39` |
| `dashboard_read` | `apps/api/src/dashboard/controller.ts:15` |
| `dashboard_record_export` | `apps/api/src/dashboard/controller.ts:48` |
| `dashboard_set_keywords` | `apps/api/src/dashboard/controller.ts:43` |
| `end_internal_access` | `apps/api/src/operations/controller.ts:69` |
| `finish_image_description_server` | `apps/api/src/onboarding/image-descriptions.ts:27` |
| `import_local_drafts` | `apps/api/src/operations/controller.ts:29` |
| `ingest_management_students` | `apps/api/src/campaigns/management.ts:20` |
| `internal_company_context` | `apps/api/src/operations/controller.ts:66` |
| `internal_onboarding_context` | `apps/api/src/onboarding/controller.ts:98` |
| `internal_portfolio` | `apps/api/src/operations/controller.ts:46` |
| `management_ingestion_status` | `apps/api/src/campaigns/management.ts:15` |
| `record_followup_meeting` | `apps/api/src/onboarding/controller.ts:99` |
| `reply_support_ticket` | `apps/api/src/support/controller.ts:16` |
| `revoke_company_invitation` | `apps/api/src/identity/service.ts:83` |
| `set_company_assignment` | `apps/api/src/operations/controller.ts:58` |
| `set_company_permission` | `apps/api/src/operations/controller.ts:41` |
| `set_management_ingestion_key` | `apps/api/src/campaigns/management.ts:16` |
| `set_support_ticket_status` | `apps/api/src/support/controller.ts:17` |
| `start_internal_access` | `apps/api/src/operations/controller.ts:63` |
| `support_ticket_detail` | `apps/api/src/support/controller.ts:14` |
| `support_ticket_list` | `apps/api/src/support/controller.ts:13` |

## Dynamic operations and direct read coverage

- `onboarding/content-preparation.ts` selects `claim_content_production_server` vs `claim_content_preparation_server`, and `finish_content_production_server` vs `finish_content_preparation_server`. All are registered at baseline.
- `onboarding/launch.ts` selects site vs recommendation claim/finish operations. `claim_company_site_server`, `claim_company_launch_server`, `finish_company_site_server`, `finish_company_launch_server` are registered.
- `campaigns/delivery.ts` forwards `claim_message_campaign`, `prepare_message_campaign`, `finish_message_campaign`; all are registered despite some names appearing only behind a private wrapper.
- `inbox/automation.ts` forwards `inbox_auto_targets`, `inbox_auto_claim`, `inbox_auto_prepare`, `inbox_auto_finish`, `inbox_auto_observe_human`, `inbox_record_opt_out`, `inbox_cloud_messages_server`, `read_company_whatsapp_server`; all are registered.
- `social/publication.ts` forwards publication context/guard/step/finish operations through a dependency wrapper; all are registered. `billing/asaas.ts` similarly forwards six native billing operations. Billing scheduler helper functions are direct transactions, not RPC names.
- `dashboard/overview-controller.ts` dynamically reads `contacts`, `opportunities`, `message_campaigns`, `campaign_students`, and `message_campaign_deliveries`; these are allowlisted. Their count/date semantics still hit the native 1,000-document scope cap.
- Storage callsites use only `company-assets` upload/download/signed URL/remove; these have native implementations. There is no generic native insert/update/delete/upsert table builder. Existing direct table callsites are reads; business writes go through explicit RPCs.
- Baseline generic direct reads are allowlisted for the named native company views plus identity/bootstrap tables. The four reachable caller gaps are `company_invitations`, `audit_logs`, `editorial_drafts`, and `company_permission_grants`; confidential internal collections such as `channel_secrets`, `ad_credentials`, `storage_objects`, billing provider events and Firebase UID mappings intentionally have no generic read access.

## Remaining completion gates

1. Reconcile this baseline audit with concurrent content, site, billing, attendance and shared-client fixes; regenerate operation inventory after registry changes.
2. Keep admin/support/dashboard/import work explicitly pending instead of advertising full Firestore product migration. Do not implement broad unscoped table access to make errors disappear.
3. Validate native SDK transactions, deny-all rules, named database selection, required single-field indexes and Cloud Storage IAM using an explicitly configured local emulator or separately authorized environment. No cloud validation is implied here.
4. Resolve production-size scanning/pagination and worker queue query design before removing the production migration gate.
5. Homologate Firebase Auth session revocation, private storage, provider credentials, Asaas sandbox, DNS/public serving, official WhatsApp/Meta and advertising independently. Tests with local memory and mocked provider functions are not evidence of real customer delivery, charging, publishing, advertising or hosted integration.

## Audit verification performed

Static verification found 103 distinct native collection paths in the module inventory. All 22 exported baseline domain-operation arrays occur in the baseline client dispatcher; the union plus attachment recording contains 156 operation names. The API literal inventory has 167 distinct calls, of which 29 lack a baseline implementation. Dynamic wrappers were reviewed separately above. Report formatting/path checks passed. No runtime tests or provider calls were executed by this read-only audit; final integration test evidence belongs to the implementation session.
