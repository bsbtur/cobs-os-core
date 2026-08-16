# W08 — COMMUNICATION & NOTIFICATION CORE — STATUS

**State: FROZEN** (2026-08-10)

| Gate                         | Result              |
| ---------------------------- | ------------------- |
| W08 ARCHITECTURE GATE        | PASS                |
| W08 FINAL BUILD CONTRACT     | PASS                |
| W08 BUILD                    | PASS                |
| W08 SECURITY GATE            | PASS                |
| W08 ADVERSARIAL VERIFICATION | PASS AFTER HOTFIXES |
| W08 ARCHITECTURE FROZEN      | YES                 |

---

## 1. Structural contract (verified live after cleanup)

| Metric                     | Value                      |
| -------------------------- | -------------------------- |
| W08_TABLE_COUNT            | 5                          |
| W08_ENUM_COUNT             | 7                          |
| W08_FACT_TYPE_COUNT        | 3                          |
| W08_MUTATING_COMMAND_COUNT | 12                         |
| W08_READ_FUNCTION_COUNT    | 4                          |
| W08_PUBLIC_FUNCTION_COUNT  | 16                         |
| W08_PRIVATE_HELPER_COUNT   | 14                         |
| W08_REALTIME_TABLE_COUNT   | 1 (`communication_events`) |

Tables: `messages`, `message_audience_selectors`, `message_recipients`,
`message_deliveries`, `communication_events`.

Enums: `message_kind`, `message_priority`, `message_status`,
`audience_selector_kind`, `communication_channel` (**in_app only**),
`delivery_status` (**delivered only**), `communication_event_type`
(**MESSAGE_PUBLISHED, IN_APP_DELIVERY_CREATED, MESSAGE_READ**).

Mutating commands (12): `create_message`, `update_draft_message`,
`delete_draft_message`, `set_message_audience`, `add_message_audience_people`,
`remove_message_audience_selector`, `schedule_message`, `unschedule_message`,
`publish_message`, `cancel_message`, `create_correction_message`,
`mark_message_read`.

Read functions (4): `preview_audience_count`, `get_operation_communication_feed`,
`get_my_message_inbox`, `get_message_recipient_state`.

No public function #17.

## 2. ACL / RLS freeze

All 5 tables: RLS enabled. `anon` holds **zero** privileges. `authenticated`
holds **SELECT only** (`authenticated=r`); direct INSERT/UPDATE/DELETE denied.
`service_role` retains backend privileges. Operator reads require
owner/admin/operations_agent membership; `member` has no Communication
Operations access. Recipient-self reads are limited to the recipient's own
addressed **published** message surface. Cross-tenant access is blocked.

## 3. Helper freeze

**Policy predicates** (minimum EXECUTE for signed-in RLS evaluation, W01
pattern — `authenticated`, `service_role`):
`app_private.w08_is_comms_operator`, `app_private.w08_current_person_id`.
This is the minimal privilege required for policy evaluation and is **not**
general client exposure; `app_private` is not a PostgREST-exposed schema.

**Private command helpers** (EXECUTE `postgres` only, unreachable as client
RPC): `w08_resolve_audience`, `w08_in_app_eligible_recipients`,
`w08_create_in_app_deliveries`, `w08_record_communication_event`,
`w08_assert_source_operation_scope`, `w08_assert_draft`, `w08_assert_published`,
`w08_assert_content_policy`, `w08_assert_explicit_people_in_operation`,
`w08_require_comms_operator`, `w08_tenant_of_operation`,
`w08_message_delivery_summary`. Total helpers: 14.

## 4. Domain freeze

- **Message != Delivery. Message != Channel. Recipient != Login.**
- A Person without a login may be a recipient (snapshot yes, delivery none).
- No fake delivery, no fake read. Deliveries exist only for in-app-eligible
  recipients.
- Audience selectors are pre-publication intent only. Publication resolves an
  immutable recipient snapshot; later W03 roster changes never rewrite
  `message_recipients`. Overlapping selectors resolve to one row per Person.
  Explicit Person selectors are typed rows, never JSON/array storage.
- `publish_message` is atomic: lock → validate → resolve → snapshot → eligible
  deliveries → facts → lifecycle → audit. No published-without-snapshot and no
  snapshot-without-published. Concurrent actors yield exactly one
  MESSAGE_PUBLISHED.
- Published messages are immutable (kind, priority, title, body, locale, source
  context, audience) and cannot be hard-deleted; corrections are new drafts via
  `supersedes_message_id` lineage.
- Cancellation changes lifecycle/governance only: recipient snapshots,
  deliveries, read facts and delivered status are untouched; no
  delivery-cancelled fact; cancelled published messages remain readable history.
- MESSAGE_READ is recipient-self only, with the current Person derived from
  `auth.uid()`; no arbitrary `person_id` authority. Operators cannot mark
  another Person's message read. First read appends one fact; repeats are
  no-ops.
- At most one typed source context per message. Cross-operation and
  same-tenant/different-operation source links are blocked. W08 performs zero
  writes to W04, W05, W06 and W07.
- No provider surface of any kind (WhatsApp, email, SMS, push, webhook,
  provider delivery RPC) and no pending/queued/processing/sent/failed states.
  No `requires_acknowledgement`, `MESSAGE_ACKNOWLEDGED` or `acknowledge_message`.
  Participant Access remains deferred.
- `communication_events` is append-only; no cleanup backdoor, maintenance RPC,
  route or temporary SECURITY DEFINER helper was left behind.

## 5. Temporal freeze (hotfixed behaviour)

- `schedule_message` rejects a past `scheduled_for`.
- `expires_at` cannot be set in the past.
- Expired messages do not appear in the active inbox / current feed.
- An expired draft cannot be published.
- Expiry never deletes historical message/recipient/delivery/fact rows.
- **No scheduler exists.** Scheduled UI remains
  "Agendada — aguardando publicação."

## 6. Defects found and fixed

| ID          | Defect                                                                                 | Fix                                                  |
| ----------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| DEF-W08-001 | RLS policy helpers lacked EXECUTE for `authenticated`, breaking every W08 read (42501) | Granted minimal EXECUTE on the two policy predicates |
| DEF-W08-002 | `schedule_message` accepted past timestamps                                            | Future `scheduled_for` required                      |
| DEF-W08-003 | Past `expires_at` accepted                                                             | Future expiry required                               |
| DEF-W08-004 | Expired messages remained in active inbox/read model                                   | Filtered out of active reads                         |
| DEF-W08-005 | Expired drafts could be published                                                      | Publication rejected                                 |

Note: a message body may legitimately contain operational PII. It is **never**
copied into audit metadata; the content guard is defense in depth only.

## 7. Frontend surface (frozen)

`/operations/$operationId/communication` (workspace, composer, audience review,
message detail, cancelled historical state), `/inbox` (recipient-self),
`CommunicationLiveCard` on the live operation view. No acknowledgement UI, no
provider UI, no fixed Communication mobile-nav item.

## 8. Data state

All W08VER verification residue and its supporting W01–W07 data were removed in
a single privileged maintenance transaction (guards suspended only inside the
transaction and restored before commit; zero triggers remain disabled). The
database contains **0 rows across every application table and 0 auth users**.

## 9. Deferred QA

- **Authenticated browser W08 UX: UNVERIFIED — LOVABLE PREVIEW SESSION
  INJECTION LIMITATION.** Deferred frontend UX QA only; not an RLS, security,
  domain or backend failure.
- **REALTIME LIVE SOCKET: UNVERIFIED.** Publication membership was inspected
  configurationally; no websocket round-trip was executed.
