# Firestore queue pagination — isolated local validation

Native claims use durable document-ID cursors in `worker_scan_cursors`, keyed by collection, equality filters and worker mode. Each ordinary scan returns at most 25 documents. A single empty-tail query may wrap to a bounded first page. Empty unchanged cursors do not create writes. Cursor changes commit with the claim transaction, including polls that find only delayed, leased or ineligible candidates. No global collection is fully loaded to find queue work.

Inventory:

| Domain | Bounded queue reads | Relevant retained rules |
| --- | --- | --- |
| Regional research | pending/running pages | Current profile/access, maximum attempts, live token |
| Preparation/launch | pending/running pages | Approval token, generation, existing provider quota |
| Content production | one setup seed; pending/running pages | Current stage-five approval; exact item/revision/frame asset checks |
| Sites | one setup seed; pending/running pages | Current profile and site revision; exact existing-job checks |
| Visuals | one setup and one paid-plan seed; pending/running pages | Versioned approval; exact existing output checks; latest 30 jobs/36 attempts preserve daily caps |
| Digital research/Instagram | pending/running and recurring available/unavailable pages | Current approved competitor and authorized channel; existing provider limits |
| Image descriptions | pending/processing and failed attempts 0–2 pages | Source fingerprint, tenant/storage validation, three attempts; legacy statusless files still require explicit backfill |
| Billing | sandbox pending/running pages | Existing eight-attempt backoff and cancellation; no production-environment claim |
| Advertising | separate pause/cancel/run pages and worker modes; stage-five seed page | Stop priority, approval/reconciliation gates and attempt rules |
| Social publication | approved/processing/reconciling pages | Unknown external outcomes stay reconciliation-only; no unsafe retry |
| Relationship campaigns | expired sending/reserved pages; one active campaign and bounded audience page | Current approval/audience/consent/channel; uncertain delivery deduplication; daily cap and rate limit |
| Inbox automation | generating/dispatching sweep pages and 25 target settings | Current consent, policy, handoff and profile; expired dispatch becomes uncertain |

Recurring billing, ads and Instagram claims checkpoint the physical document actually selected. Their persisted `queue_claimed_at` makes less recently claimed candidates take precedence within a page, preserving stop priority and existing eligibility/lease checks. This prevents an always-due monitor from monopolizing a page.

Time-sensitive Firestore workers may request `p_paginated: true`. `inbox_auto_targets` returns `{targets, hasMore}` and `claim_message_campaign` returns `{job, hasMore}`; legacy calls retain their prior result shape. A full page, including one containing only ineligible candidates, signals continuation. Reaching the final partial page or wrapping the empty tail clears continuation. Consumers use a one-second continuation interval and their ordinary idle interval otherwise. Existing five-minute inbound freshness and one-hour campaign windows remain unchanged; overall provider/worker capacity still limits maximum supported load.

Per-tenant history reads use exact existence queries or ordered bounded recent pages where the result is a cap or an existence check. Full-snapshot contracts use `scopedRows` with explicit tenant predicates and a 10,000-row ceiling; exceeding the ceiling fails explicitly. Automatic image references retain the original eligible newest-material selection, including exclusion of generated campaign outputs. These tenant snapshots are not whole-platform scans. Immediate cancellation cleanup is bounded to 100 reserved/generating records; authoritative campaign/policy/consent/handoff checks prevent later dispatch even before the expiration sweeper updates remaining historical states.

Evidence: billing regression fails against the original implementation at 1,001 delayed jobs, then passes using the new scanner. Local tests cover >1,000 image candidates, >1,000 old campaign deliveries, 76 always-due recurring jobs across multiple pages, tenant/mode isolation, cursor wrap, concurrent fixture claims, obsolete/canceled lease completion, 501/1,001 target settings with a fresh message successfully claimed before five minutes, and 250 ineligible active campaigns before eligible work within the approved hour. SDK-boundary tests separately cover physical IDs on legacy rows, persisted cursor writes and staged overlays. MemoryStore serializes transactions and does not establish real Firestore contention behavior.

No provider, real Firestore database, delivery, billing event, deployment or credentials were used. Composite index declarations need the normal deployment process. Real production throughput and optimistic transaction contention remain unvalidated.
