# Relationship campaigns on native Firestore

Implemented and verified with isolated fixtures. No actual message, contact,
patient record or credential was used. No provider call was made by these tests.

## Native operations and mapping

`messageCampaignOperations` / `messageCampaignRpc` in
`apps/api/src/platform/firestore/campaigns.ts`:

- `register_campaign_contacts`, `revoke_campaign_contact`, `import_campaign_students`
- `save_message_campaign`, `preview_message_campaign`, `activate_message_campaign`
- server-only `claim_message_campaign`, `prepare_message_campaign`, `finish_message_campaign`

Read `campaign_students`, `message_campaigns`, `message_campaign_deliveries`,
`message_campaign_versions` and `message_campaign_approvals` only with company scope
and BOTH `marketing.read` and `crm.read`. Writes require BOTH marketing/CRM write;
activation additionally requires `content.approve`. Internal
`campaign_recipient_keys` and `message_campaign_delivery_keys` are server only.
No client writes, index deployment, rule or IAM change is supplied by this module.
Native transaction queries are company-scoped; queue sweeps additionally query
`status=active` and `state=reserved|sending` as server only.

## Consent and approval

Imported administrative recipients keep only the existing name/phone/birthday/
last-attendance/status/tag fields; never import clinical notes or medical records.
CSV consent is a user declaration, not independently verified provider consent.
CRM registration requires an explicit evidence string. Opt-out stops pending sends
and an ordinary import cannot silently restore revoked consent. Signed inbound
WhatsApp opt-out is also checked against the linked CRM contact on every send.

Approval captures immutable content revision, recipient IDs and phone numbers,
confirmed profile version, official channel/phone ID, start/end dates, send window
and daily limit. Activation requires an explicit end date. New recipients or
changed phone numbers do not enter an approved audience without another review.
Edits revoke approval and cancel reservations. Pause, profile/access/subscription
change, channel replacement, human takeover or opt-out prevents preparation.

## Single executor and uncertainty

The existing API `CampaignDelivery` executor branches to `runOfficialCampaign`
for Firestore; no second worker is introduced. `MESSAGE_CAMPAIGNS_ENABLED=true`
plus native database and official Cloud API configuration is needed to poll.
Readiness still requires a recent successful queue poll. This does not prove a
verified business account or live messaging permission.

Transactions reserve each campaign/phone/event key once, allow one outgoing
campaign message per company/minute and enforce the approved daily cap. A five
minute lease can recover an unsent reservation with a fresh token up to three
claims per content revision. Preparation atomically moves reserved to sending and
can succeed only once. Missing provider acknowledgment, timeout or a worker
restart while sending becomes `uncertain`; it is never automatically retried.
The sweep also handles paused/draft campaigns. Reconciliation of uncertainty
requires operator review of provider history before any separately authorized
new campaign. No tool here discards uncertainty to force a resend.

## Official provider limitation

Firestore uses the existing official WhatsApp Cloud API adapter and encrypted
per-tenant credentials. Freeform text is allowed only inside a 24-hour window
established by a signed inbound webhook. Active human takeover and another
reserved/uncertain inbox send or active inbox automation block campaign dispatch.
Evolution is not used by the native executor.

Birthday, absence and selected triggers can be saved/previewed/approved, but a
recipient outside that window is not dispatched. Broad proactive campaigns need
approved Meta message templates, language/category/parameter contracts and real
account verification. Those templates are not implemented; no template approval
or unrestricted outbound capability is claimed. Current list/preview responses
explicitly expose `outsideWindowRequiresApprovedTemplate=true` in native mode.

## Verification and operator setup

Run from repository root after installing dependencies:

```sh
COREPACK_HOME=/tmp/medsi-corepack XDG_DATA_HOME=/tmp/medsi-data corepack pnpm test -- tests/firestore-message-campaigns.test.ts tests/message-campaign-worker.test.ts
COREPACK_HOME=/tmp/medsi-corepack XDG_DATA_HOME=/tmp/medsi-data corepack pnpm check
```

Fixtures cover two clinics and cross-tenant audience rejection, dual permissions,
immutable approval, content revision edits, consent/opt-out, official channel
requirement, 24-hour gate, daily quota, schedule, claim races, lease recovery,
uncertain send after restart/pause, no duplicate preparation and provider worker
acknowledgment/timeout using an injected adapter. Executor fixtures reject network
access globally and use synthetic encrypted credentials.

Remaining external gates: deploy private test API and native Firestore mappings;
verify transactions/query indexes/IAM; configure encrypted official Cloud API
credentials and signed webhooks by secure server channels; obtain actual account
permissions and template approvals; homologate with sandbox accounts; review
medical advertising/LGPD requirements and retention. No real send, deployment,
public publication, credential/IAM change or spending is authorized by fixtures.
