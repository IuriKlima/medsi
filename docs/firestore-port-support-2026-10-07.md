# Native Firestore support port — 2026-10-07

Task 3 of `docs/superpowers/plans/2026-10-07-firestore-legacy-paths.md`. The product contracts remain those in `supabase/migrations/202609280003_support_chat.sql`, the active staff/assignment helpers in `supabase/migrations/202609210003_product_foundation.sql`, `apps/api/src/support/controller.ts`, and `packages/contracts/src/support.ts`.

## Files and routes

- `apps/api/src/platform/firestore/support.ts`: `supportOperations` and `supportRpc`, native document transactions.
- `apps/api/src/platform/firestore/client.ts`: root agent registered the handler with the actual RPC dispatcher.
- `tests/firestore-support.test.ts`: 15 local transactional fixture tests using the actual dispatcher.

| Existing API route | RPC | Result |
| --- | --- | --- |
| `POST /operations/support/tickets` | `create_support_ticket` | `{ticket, messages}` |
| `POST /operations/support/tickets/:id/reply` | `reply_support_ticket` | `{ticket, messages}` |
| `POST /operations/support/tickets/:id/status` | `set_support_ticket_status` | `{ticket, messages}` |
| `GET /operations/support/tickets/:id` | `support_ticket_detail` | `{ticket, messages}` |
| `GET /operations/support/tickets` | `support_ticket_list` | ticket array, 20 per page |

Ticket and message projections contain the existing SQL fields, including nullable `company_name`, protocol `number`, `version`, and ISO timestamps. No new controller or frontend contract is introduced.

## Data and authorization

All paths are beneath `medsi/v1/`:

- `support_tickets/{requestId}`: ticket, requester, optional company, transcript, protocol, state, version, timestamps.
- `support_messages/{requestId}`: ticket, author, customer/staff kind, body, timestamp. The first message shares the creation request ID.
- `support_counters/tickets`: transactional `last_number`. A missing counter is initialized from existing ticket protocols so a preloaded collection does not restart at one. This is a native sequence equivalent, not a customer-visible contract change.
- `platform_audit/{uuid}`: existing `support.ticket_created`, `support.ticket_replied`, and `support.ticket_status` event names, actor/company, null session, details and timestamp.
- Read dependencies: `profiles`, `companies`, `workspace_members`, `company_members`, `company_permission_grants`, `platform_staff`, `company_assignments`.

Requesters see only their own tickets and must retain current company access for company tickets. Account tickets have no company. Company colleagues cannot read one another's tickets merely through clinic membership. Active platform administrators can access all support tickets, including account tickets. Active support staff can access only assigned company tickets. Staff activity and assignments are checked on each operation. An archived clinic hides its tickets from the requester; internal staff assignment/admin semantics remain as in SQL. Internal staff authority alone does not authorize creating a company ticket as a clinic member.

Creation and reply retries recheck authorization and bind the request ID to actor, company/ticket and the original normalized payload. Altered retries return `23505`; revoked access returns `42501`, including after a successful prior request. Reusing a reply ID for a new ticket cannot overwrite that message. Status changes require current staff authority and matching ticket version; stale versions return `40001`.

Creation allows ten tickets per requester in the preceding hour. Replies allow thirty messages per author/ticket in that hour, including the initial message. Exact replays do not consume another slot. The boundary is strictly newer than one hour ago. Creation transactions update the shared sequence, and reply/status transactions update the ticket, providing conflict points for Firestore retries. Customer replies open the ticket, staff replies set `waiting_customer`; a staff member replying to their own ticket remains a customer author.

The transcript retains the strict two-field user/assistant schema, eight-item limit, per-text length and 24,000-byte JSONB-style serialized bound. Detail returns the most recent 100 messages, sorted chronologically by timestamp then ID. Lists sort by descending update time then ascending ticket ID; offsets remain 0–10,000.

## Verification

- RED: `node node_modules/vitest/vitest.mjs run tests/firestore-support.test.ts --maxWorkers=1` failed all 13 initial tests: missing registration / `FIRESTORE_OPERATION_PENDING`.
- GREEN: the same initial suite passed 13/13 through the registered dispatcher.
- Final focused verification: `node node_modules/vitest/vitest.mjs run tests/firestore-support.test.ts tests/support-chat.test.ts tests/support-proxy.test.ts --maxWorkers=2` passed 23/23 tests in 3 files (15 native + 6 existing SQL + 2 proxy).
- `node node_modules/eslint/bin/eslint.js apps/api/src/platform/firestore/support.ts tests/firestore-support.test.ts` passed.
- From `apps/api`, `../../node_modules/.bin/tsc --noEmit` passed.
- `git diff --check` passed.

Fixtures cover exact return shapes, absent profile/authentication, company spoofing, requester/staff isolation, inactive staff, assignment and membership revocation, residual delegated grants, altered retries, rate limits/boundaries, version conflicts, protocol allocation, imported protocol continuity, transcript validation, pagination and the latest-message window. Concurrent fixture calls verify deduplication/CAS with the serialized MemoryStore; they do not constitute live Firestore contention testing.

## Remaining limits

This is local implementation and fixture/SQL contract validation, not production Firestore homologation. No credentials, IAM, security rules, provider configuration, remote migration, deployment, payment, email, WhatsApp message, publication or advertising effect was performed.

The shared DocumentTransaction adapter limits each equality query to 1,000 records and fails explicitly if broader. A requester with more than 1,000 historical tickets, a ticket with more than 1,000 messages, a company team queue beyond that bound, or an administrator listing more than 1,000 tickets requires a future paginated/indexed storage interface. API page sizes and the 100-message detail window do not remove that adapter limit. Counter bootstrap also uses this bounded query; a large imported collection needs an explicitly initialized counter during its separately authorized migration. These limits were not bypassed with unrestricted queries or invented data.

Root owns the integrated `pnpm check`, inventory and shared progress update. Actual Firestore index availability, provider transactions under contention and deployed application behavior remain pending separately authorized homologation.
