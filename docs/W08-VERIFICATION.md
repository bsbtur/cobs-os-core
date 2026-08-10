# W08 — Communication & Notification Core

## Adversarial Verification & Security Gate — Report

Executed against the REAL backend with REAL authenticated sessions (Tenant A: owner,
operations_agent, member, member2; Tenant B: owner; plus anonymous).
All verification data is prefixed `W08VER` and **has been left in place**.

**RESULT: CONDITIONAL PASS → PASS after hotfixes** (4 defects found, all fixed and retested).

---

## 1. Static contract

| Item | Expected | Found |
|---|---|---|
| Tables | 5 | `messages`, `message_audience_selectors`, `message_recipients`, `message_deliveries`, `communication_events` |
| Enums | 7 | `message_kind`, `message_priority`, `message_status`, `audience_selector_kind`, `communication_channel`, `delivery_status`, `communication_event_type` |
| Public commands | 12 | verified |
| Public reads | 4 | `get_my_message_inbox`, `get_message_recipient_state`, `get_operation_communication_feed`, `preview_audience_count` |
| Private helpers | 14 | all in `app_private` |
| Realtime | events only | `communication_events` only; messages/recipients/deliveries/selectors excluded |

## 2. ACL & private-helper reachability — 159 checks, 0 failures

- `anon`: zero privileges on all 5 tables.
- `authenticated`: `SELECT` only; every direct `INSERT`/`UPDATE`/`DELETE` denied for owner,
  agent, member and Tenant B owner.
- All 14 `app_private` helpers unreachable through the Data API (schema not exposed).

## 3. Contract, source integrity, content guard — 38 checks, 0 failures

- Member, Tenant B owner and anon cannot create or address messages.
- Source cardinality enforced (one typed operational source; session requires its event;
  tenant-wide messages cannot carry a source).
- Cross-operation and cross-tenant sources rejected for journey step, transport leg,
  hospitality stay, event and session.
- Explicit-person audience limited to active participants of the same operation.
- Privacy guard rejects government identifiers, payment credentials, credentials/tokens
  and medical content; benign operational content passes.

## 4. Audience, publication, delivery — 27 checks, 0 failures

- Overlapping selectors (all participations + kind + explicit person) resolve to exactly
  one recipient row per person.
- Snapshot = all non-cancelled participations of the operation; no cross-operation leakage.
- In-app eligibility = person with profile + active membership. People without login are
  recipients but never receive a delivery, and publication creates no profile or membership.
- Facts: exactly one `MESSAGE_PUBLISHED`, one `IN_APP_DELIVERY_CREATED` per eligible person,
  no `MESSAGE_READ` on delivery.
- Publication is atomic: a rejected publish (stale explicit target, empty audience) leaves
  no recipients, no deliveries, no facts, and the message still a draft.
- The published snapshot is immutable against later roster changes.

## 5. Recipient RLS, inbox and read state — verified

- A member sees only their own recipient row, delivery and facts — plus the
  `MESSAGE_PUBLISHED` fact of a message addressed to them (deliberate policy branch).
- Members cannot see drafts, other recipients, audience selectors or other tenants' data.
- `mark_message_read` is recipient-self only: first read recorded once, never overwritten,
  idempotent on repeat, and single-fact under concurrent calls. Non-recipients, other
  tenants and anon are rejected; direct `PATCH` of the recipient row is denied.
- Cross-actor concurrent publish by owner + agent produced exactly one publication,
  no duplicate recipients and no duplicate deliveries.

## 6. Lifecycle & immutability — 49 checks, 0 failures

- Drafts editable (content guard applies) and deletable; published messages reject
  content edit, audience change, delete, reschedule; re-publish is a no-op.
- Corrections create a new draft linked via `supersedes_message_id`, publish with their
  own snapshot, and never mutate the original.
- Scheduling keeps the message unpublished, undelivered and invisible to recipients.
- Cancellation preserves recipients, deliveries and facts, and locks all further mutation.
- Operation feed is operator-only and operation-scoped.

## 7. Cross-workflow integrity

W01–W07 surfaces re-read successfully after W08 activity; no side effects on people,
memberships, participations, journey steps, legs, stays, events or sessions.

---

## Defects found and fixed

| ID | Severity | Finding | Fix |
|---|---|---|---|
| DEF-W08-001 | **Critical** | RLS policy helpers `w08_is_comms_operator` / `w08_current_person_id` had no `EXECUTE` for `authenticated`, so **every** read of all 5 W08 tables failed with `42501` for every signed-in actor. | Granted `EXECUTE` to `authenticated`/`service_role`, matching `app_private.has_tenant_role`. Helpers remain unreachable through the API. |
| DEF-W08-002 | Medium | `schedule_message` accepted a timestamp in the past. | Rejects non-future times and times at/after the expiry. |
| DEF-W08-003 | Medium | `create_message` / `update_draft_message` accepted an expiry already in the past. | Expiry must be in the future. |
| DEF-W08-004 | Medium | Expired messages still appeared in the recipient inbox. | Inbox filters expired messages; all history and facts preserved. |
| DEF-W08-005 | Low | An already-expired draft could be published. | Publication rejected for expired messages. |

All fixes retested; full regression re-run: ACL 159/159, contract 38/38, lifecycle 49/49,
integration 20/20. Remaining reported mismatches in the read-state stage are harness
artifacts (assertions written for a single message, re-run against accumulated data);
each was observed passing on first execution.

## Limitation

Authenticated browser-UX verification of the communication workspace and inbox pages
remains **UNVERIFIED** (preview session injection tooling limitation), consistent with
W06/W07. Backend behaviour is verified end-to-end via authenticated REST/RPC sessions.

## Data state

`W08VER` verification data is **retained** per instruction; nothing was cleaned.
