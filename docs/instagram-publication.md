# Instagram organic publication

## Inspected baseline

OAuth already requested the official publishing permission and persisted `publishingReady` with the linked professional Instagram account. A repository search found no organic `media`, container-status, or `media_publish` executor. Paid ads and site publishing were separate workflows.

## Implemented native workflow

`firestore/social-publication.ts` stores a publication draft independently of calendar content approval. Explicit publication approval binds the tenant, Instagram account and Page, content revision, private creative SHA-256, caption and UTC schedule. Approval also explicitly authorizes providing Meta a temporary read URL for this one asset. This approval does not approve advertisements or spending.

The API queue uses the existing encrypted channel bridge and private storage. It obtains a read URL valid for 600 seconds immediately before a guarded container creation; the URL is not persisted or logged. It creates the official Instagram container, observes processing, checks approval again, and publishes only a finished container. A signed URL can remain readable until its expiry after revocation. The bucket remains private.

Supported formats are JPEG feed images, image carousels with 2–10 frames, and uploaded MP4 Reels. Generated PNG/WebP and uploaded JPEG creatives are re-encoded on the server as immutable private JPEG derivatives before the publication draft is created. Sharp 0.35.4 is an exact direct API dependency already present in the lockfile dependency graph. The derivative key binds source SHA-256 and conversion version; approval binds the resulting JPEG SHA-256. The converter strips metadata, flattens alpha onto white, checks input size/pixel limits, bounds dimensions and rejects unsupported image proportions. The review panel previews the prepared JPEGs through an authenticated route. File dimensions, codec/duration and actual Meta fetch behavior require provider validation; MP4 extension alone does not establish Reel compatibility. The current provider may reject media that fails these requirements.

Firestore collections:

| Collection | Access |
| --- | --- |
| `company_social_publications` | Tenant-scoped `marketing.read`; authenticated mutation through validated RPCs |
| `social_publication_keys` | Service transactions only; deduplicates account/content revision |
| `social_media_assets` | Service-only immutable private derivative references; authenticated preview through checked service RPC |
| `social_publication_steps` | Service transactions only; durable mutation intent and remote result |

## API and executor

Register `SocialPublicationController` and `SocialPublicationWorker` from `social/publication.ts`. Route prefix: `/onboarding/companies/:id/social-publications`.

- `GET`: reviewed records and actual executor availability.
- `POST`: `{id,itemId,creativeId,caption,scheduledAt}` creates a draft from current approved calendar content.
- `POST /:publication/edit`: `{revision,caption,scheduledAt}` revises an unstarted draft/queued item, increments its version and invalidates publication approval. Started provider mutations cannot be rewritten.
- `GET /media/:media`: tenant-authorized private derivative preview.
- `POST /:publication/approve`: `{revision,allowTemporaryProviderAssetAccess:true}` explicitly approves the account, content, schedule and temporary asset transfer.
- `POST /:publication/control`: `{revision,action:'pause'|'cancel'|'revoke'}` stops future mutations. A published post cannot be retracted through this endpoint.

`INSTAGRAM_PUBLICATION_ENABLED` must be exactly `true` for the worker and approval route to execute. It defaults to disabled. Existing Firestore configuration, encryption key, configured Graph API version, official OAuth access and an eligible linked account are also required. Configure secrets in the approved server secret store; do not put them in chat or repository files. Do not enable the executor as part of a local test.

The API worker is the sole publication executor. It polls every 15 seconds and claims a five-minute atomic lease. Do not register a duplicate worker in another process. Each child container, parent container and publish mutation is reserved durably before the network call. Carousels require each approved JPEG child to be ready before the parent is created. Eight automatic attempts bound processing/observation; exhausted work remains visible with an error.

## Recovery and pause

- A crash before a durably reserved mutation can be recovered by a new lease.
- An unknown container creation result is not retried. The account owner must review the account/provider evidence. No second container or post is created automatically.
- An unknown publish result is reconciled by reading the known container status. `PUBLISHED` confirms completion without a second publish request. A durably saved media ID confirms completion even if the subsequent save was interrupted.
- An unknown response with `FINISHED` still remains uncertain; do not resend `media_publish` based on this observation.
- Revocation during an in-flight publish cannot undo a provider acceptance. The queue preserves reconciliation and records an observed published result truthfully.
- After the automatic limit, inspect the professional account, known container/media IDs and audit entries. No automatic “retry” route erases uncertain mutation history. A genuinely new attempt requires a newly reviewed content revision after the old outcome is established.

## Evidence and external gates

Local tests use two fictitious identities, an in-memory transactional store, mocked signed URLs and mocked Meta calls. They verify approval separation, tenant rejection, revision/account deduplication, atomic claims, durable steps, revocation, uncertain create/publish/child outcomes, versioned edits, content changes, expired leases, private derivative provenance and official request shapes. Real local sharp tests verify deterministic conversion, alpha/metadata removal, output dimensions and malformed/proportion rejection. They do not validate Firestore IAM, real signing permissions, provider access or Instagram publication.

Before enabling in a user-deployed test environment, validate private bucket signing permissions and expiry, server-only Firestore access, official Meta app review/advanced access, professional account permissions, media compatibility, and provider fetch within the expiry. Any actual publication needs a separate authorized test post and the specific publication approval. No real post was created during implementation.

Official references inspected: [media creation](https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/media), [container status](https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-container), [media publication](https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/media_publish). Full guide retrieval was rate limited; endpoint/status excerpts were available. Do not treat local fixtures as provider certification.

The calendar integration component is `SocialPublications` in `apps/web/components/social-publications.tsx`. It shows separate draft preparation and explicit publication approval, exact derivative previews, account/schedule/caption, visible errors and pause/cancel/revocation controls. It calls the existing authenticated onboarding proxy.
