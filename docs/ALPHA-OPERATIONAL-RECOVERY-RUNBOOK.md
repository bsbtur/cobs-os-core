# COBS OS — ALPHA OPERATIONAL RECOVERY RUNBOOK

**Milestone:** M3 — Alpha Pilot Readiness
**Date:** 2026-08-11 (UTC)
**Scope:** frozen architecture W01–W10, production tenant BSBTUR
**Nature of this milestone:** documentation + read-only verification. No schema, function, policy, grant, trigger or production row was created, altered or removed while producing it.

---

## 1. Purpose

Before real travellers, real money and real vehicles enter COBS OS, the operator must know — **in advance and in writing** — how every foreseeable operational mistake is corrected using the approved command surface only.

This runbook is the single authority for: what can be undone, what can only be compensated, what is permanently terminal, who may act, and what evidence every correction leaves behind.

## 2. Scope

- Covers W01 identity/tenant, W02 experience/offering/operation, W03 roster, W04 journey runtime, W05 mobility, W06 hospitality, W07 event production, W08 communication, W09 commerce & payments, W10 participant access. **11 recovery domains reviewed.**
- Covers 22 incident scenarios (Section 8).
- Does **not** cover infrastructure/DR (backups, restores, provider outage) — that is M4/M5.
- Does **not** authorise any new command. Gaps are reported, never silently implemented.

## 3. Operator principles

1. The system is a **record of what happened**, not a record of what we wish had happened.
2. Every correction is itself an operational act: it has an actor, a time, a reason and an audit row.
3. If the approved surface has no path, the incident is **escalated as a product gap** — it is not solved with SQL.
4. Recovery speed never outranks traveller safety or financial integrity.
5. When in doubt between "hide it" and "explain it", always explain it: add a note/incident fact and inform the traveller.

## 4. Severity taxonomy

| Level | Definition | Examples | Who may act | Escalation | Evidence required | Expected response |
| --- | --- | --- | --- | --- | --- | --- |
| **SEV-1** | Safety, security, financial integrity, or the operation cannot proceed | Passenger boarded on the wrong vehicle at departure; headcount wrong at authorised departure; payment recorded against the wrong order; participant access granted to the wrong person; operation cancelled by mistake | Owner (Admin may stabilise) | Mandatory, immediately, to the Owner; traveller-facing communication decided by the Owner | Incident fact + audit trail + written reason + traveller notice where applicable | Stabilise the physical operation first, record the facts second, correct the record third, notify last |
| **SEV-2** | Material impact on a traveller or on the operation, but the operation continues | Wrong room assigned; wrong seat; passenger cancelled by mistake; message published to the wrong audience | Owner / Admin | Owner informed same day | Approved compensating command + reason + audit row | Correct within the current operational window |
| **SEV-3** | Localised error with a safe documented workaround | Wrong stop label; wrong role assigned; session opened early; draft/planning data typo | Owner / Admin / Operations Agent | None (logged) | Audit row from the correcting command | Correct at the next convenient moment |
| **SEV-4** | Cosmetic, non-operational | Display name, note wording, description typo, sort order | Owner / Admin / Operations Agent (self-service for own display name) | None | Standard audit row | Best effort |

No SLA in clock-time is committed at Alpha. Response expectations are stated **relative to the operational window** because BSBTUR runs a single pilot operation at a time.

## 5. Incident decision tree

```
1. Is anyone unsafe, or is money/access wrong?              → SEV-1, stabilise physically FIRST
2. Is the data mutable planning/configuration?              → correct it with the domain update_* / set_* command
3. Is it an append-only runtime fact?                       → DO NOT try to erase.
                                                              Is there an approved compensating fact/command?
                                                                yes → issue it with an explicit reason
                                                                no  → record note_incident / note_* and ESCALATE
4. Is the target in a terminal state (completed/cancelled)? → no reversal exists. Move forward with a NEW
                                                              record (ad-hoc step / ad-hoc leg / ad-hoc session /
                                                              correction message / new invitation) and escalate
                                                              if the terminal state was itself the mistake.
5. Is it financial?                                         → reverse_payment or record_refund. Never edit an amount.
6. Still no approved path?                                  → STOP. Escalate as a P0/P1 product gap (Section 10).
```

## 6. Data classification model

Every domain object falls into exactly one of these classes; the class determines the recovery style.

| Class | Meaning | Recovery style |
| --- | --- | --- |
| **A — Mutable planning/configuration** | Catalogue, resources, planned windows, drafts | Direct correction through the domain's approved `create_/update_/set_` command |
| **B — Append-only runtime fact** | `journey_events`, `transport_events`, `hospitality_events`, `event_runtime_events`, `communication_events`, `financial_facts`, `participant_presence_events`, `audit_events` | Never deleted. Corrected only by a further approved fact |
| **C — Derived state** | Dispatch state, readiness, check-in state, order balance, runtime status | Never written directly; recomputed from the full fact history |
| **D — Reversible action** | Has an explicit approved inverse | Issue the inverse with a reason |
| **E — Terminal/irreversible** | Completed / cancelled / published / paid | No inverse. Compensate forward, or escalate |

## 7. Domain recovery matrix (11 domains)

| # | Domain | Mutable (A) | Append-only facts (B) | Derived (C) | Reversible (D) | Terminal (E) | Missing recovery path |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | **Identity / membership (W01)** | profile & person display name (`update_my_display_name`, self only) | `audit_events` | effective role | membership role change, suspend/reactivate (`memberships` guard: last owner + self-role protected) | audit rows; tenant bootstrap | **no unlink of person↔profile** (`link_person_to_profile` is one-way) → G-01 |
| 2 | **Invitations (W01)** | — | `audit_events` | invitation status | revoke → reissue with `create_invitation` | accepted invitation | no un-revoke (reissue is the path) → G-06 |
| 3 | **Operations (W02)** | name/windows (`set_operation_planned_window`, `set_operation_expected_window`), archive flag | `audit_events` | operation status gates | draft↔planning↔ready↔active | **completed / cancelled are final** (`set_operation_status` rejects any change out of them) | **no un-cancel / un-complete** → G-02 (P1) |
| 4 | **Participants / roles (W03)** | notes, kind, roles (`assign_operation_role`, `unassign_operation_role`, `set_primary_operation_role`) | `audit_events` incl. `participation.reactivated` | roster counts | `set_participation_status` expected↔confirmed↔cancelled (reactivation supported) | — | none material |
| 5 | **Journey / runtime (W04)** | step definition & windows while not started (`update_journey_step`, `reorder_journey_steps`, `skip_journey_step`), playbook items (`reopen_playbook_item`) | `journey_events`, `participant_presence_events` | step readiness, `w04_operation_runtime_state` | playbook completion (reopen), expected windows | started/completed steps, boarding/departure/arrival facts | **no presence-fact correction** → G-03 (P1); **no step reopen** → G-04 (P2) |
| 6 | **Mobility (W05)** | leg definition, stops, planned/expected windows, vehicle & driver records | `transport_events` | `w05_leg_dispatch_state`, manifest | `assign_/clear_leg_assignment`, `release_seat`, `cancel_transport_leg`, `remove_transport_leg_stop` | departed/arrived facts, cancelled leg | post-departure reassignment is by design a **new ad-hoc leg** (`create_ad_hoc_transport_leg` with `_replaces_leg_id`) — not a gap |
| 7 | **Hospitality (W06)** | property/room/stay definition & windows | `hospitality_events` | rooming, occupancy, check-in state | `change_room`, `release_room`, `unblock_hospitality_room`, `restore_stay_participation`, `remove_stay_participation` | `complete_stay_checkout`, `complete_hospitality_stay`, `cancel_hospitality_stay`, guest checked-in/out facts | no un-check-in (compensate via `note_hospitality_issue`) → G-07 (P2) |
| 8 | **Events (W07)** | event/session definition, spaces, staff, speakers, program lock (`reopen_event_program`) | `event_runtime_events` | `get_event_runtime_state`, program | pause/resume session, reopen program, remove staff/speaker, `change_session_space` | `complete_event`, `complete_session`, `cancel_event`, `cancel_session` | no un-start / un-complete of a session or event → G-05 (P2) |
| 9 | **Communication (W08)** | drafts (`update_draft_message`, `set_message_audience`, `delete_draft_message`, `unschedule_message`) | `communication_events`, deliveries | inbox, read state | schedule↔unschedule; `cancel_message` stops further delivery | **published message is immutable** | correction is by design `create_correction_message` — not a gap |
| 10 | **Commerce / payments (W09)** | draft orders, items, catalogue, prices | `financial_facts` | order balance, `get_order_financial_state`, reservations | `reverse_payment`, `record_refund`, `cancel_order`, `release_commercial_reservation`, `remove_order_item` | recorded payment facts (compensated, never edited) | none material — reversal path complete |
| 11 | **Participant access (W10)** | — | `audit_events`, grant history | effective portal access | `revoke_participant_access` ↔ `reinstate_participant_access`; `revoke_participant_access_invitation` | claimed token (single use) | none material |

## 8. Scenario procedures (22 scenarios)

Format: **INCIDENT → DETECTION → ACTOR → COMMAND → COMPENSATION → AUDIT → DERIVED STATE → CUSTOMER IMPACT → ESCALATION.**
Direct table DML is **never** the procedure in any row below.

### 8.1 Wrong passenger added to an operation — SEV-3
Roster review / traveller says they are not on this trip → Owner, Admin, Operations Agent → `set_participation_status(participation, 'cancelled', reason)` → none needed; the participation stays visible as cancelled → `audit_events` roster mutation with reason → roster counts and audience selectors drop the person; presence can no longer be recorded for them → person may have received messages; send a correction message if so → none unless the person already travelled (then SEV-1).

### 8.2 Passenger cancelled incorrectly — SEV-2
Traveller appears at the meeting point / operator notices → Owner, Admin, Operations Agent → `set_participation_status(participation, 'confirmed'|'expected', reason)` → reactivation is supported and audited (`participation.reactivated`) → audit row with the reason → roster restored; seats, rooms and access must be re-checked because releases are **not** auto-restored → re-issue seat (`assign_seat`), room (`assign_room`/`change_room`) and portal access (`reinstate_participant_access`) → escalate if it happened after boarding started.

### 8.3 Wrong role assigned — SEV-3
Roster review → Owner, Admin, Operations Agent → `unassign_operation_role(participation, role_type)`, then `assign_operation_role(...)`, `set_primary_operation_role(...)` if primary → none → audit rows for both acts → contextual responsibility corrected; **no login/authorization changed** (roles never grant access) → none → none.

### 8.4 Wrong journey step started — SEV-3 (SEV-2 during live movement)
Live board shows an unexpected active step → Owner, Admin, Operations Agent → **no un-start exists** → record `note_incident(operation, note, journey_step)` explaining the mis-start, then proceed: `complete_journey_step` or `skip_journey_step(step, reason)` for the erroneous step; use `create_ad_hoc_journey_step(..., reason)` if the real step must be re-run → `journey_events` `STEP_STARTED` + `INCIDENT_NOTED` + `STEP_SKIPPED/COMPLETED` → runtime state shows the real sequence including the mistake → travellers may have seen a wrong "now" card; send a correction message → gap **G-04** (P2).

### 8.5 Presence / check-in recorded incorrectly — SEV-1 when it affects headcount at departure
Headcount mismatch at boarding, or traveller disputes → Owner or Admin (no-show confirmation is Owner/Admin only) → **there is no approved fact that retracts a presence fact** → `record_presence_fact(..., 'ABSENCE_NOTED', reason)` when the person is in fact absent, plus `note_incident` describing the erroneous fact; **physically recount before authorising departure** → `participant_presence_events` retains both facts; `journey_events` carries the incident → derived headcount still counts the erroneous `BOARDED`; the operator must treat the physical recount as truth until the record is corrected → possible wrong manifest → **MANDATORY escalation to the Owner; gap G-03 (P1)**.

### 8.6 Passenger placed in the wrong vehicle — SEV-1 before departure, SEV-1 after
Manifest vs. physical check → Owner, Admin, Operations Agent → before departure: `release_seat(seat_assignment, reason)` then `assign_seat(correct_leg, participation, reason)`; after departure: `create_ad_hoc_transport_leg(..., _replaces_leg_id, reason)` and `note_transport_incident` → seat release is audit-only and never deletes the seat record → `transport_events` `SEAT_RELEASED`, `SEAT_ASSIGNED`, `TRANSPORT_INCIDENT_NOTED` → manifest and dispatch state reflect the correction → traveller must be told where they are actually going → Owner informed immediately.

### 8.7 Wrong seat assigned — SEV-3
Manifest review → Owner, Admin, Operations Agent → `release_seat(seat_assignment, reason)` + `assign_seat(leg, participation, seat_label, reason)` → none → `transport_events` pair with reason → manifest corrected → traveller sees the new seat in the portal → none.

### 8.8 Wrong pickup / stop information — SEV-2 (SEV-1 if travellers are already en route to it)
Traveller reports the wrong address/time → Owner, Admin, Operations Agent → `update_transport_leg_stop(...)`, `add_transport_leg_stop(...)`, `remove_transport_leg_stop(stop, reason)`, or `set_transport_leg_expected_window(..., reason)` for time only → publish a correction: `create_message(...)` → `publish_message(...)`, or `create_correction_message` if a wrong one was already published → catalogue/audit rows + `transport_events` `EXPECTED_TIME_CHANGED` → traveller mobility card updates → travellers must be actively notified, not silently corrected → escalate if any traveller is already at the wrong point.

### 8.9 Wrong room assigned — SEV-2
Rooming list review or guest complaint → Owner, Admin, Operations Agent → `change_room(stay_participation, room, reason)`, or `release_room(..., reason)` when no replacement yet → none → `hospitality_events` `ROOM_RELEASED` + `ROOM_ASSIGNED` with reason → rooming and occupancy recomputed; capacity respected unless `_allow_overcapacity` is explicitly used with a reason → guest sees the corrected room → escalate if the guest already occupied the wrong room overnight (then also `note_hospitality_issue`).

### 8.10 Wrong stay participant — SEV-3
Stay guest list review → Owner, Admin, Operations Agent → `remove_stay_participation(stay_participation, reason)`; if removed by mistake, `restore_stay_participation(...)` → room is released as part of removal and must be re-assigned on restore → `hospitality_events` with reason → guest list and occupancy corrected → guest may have received stay information; correct by message → none.

### 8.11 Wrong event / session state — SEV-2
Event runtime board shows an impossible state → Owner, Admin, Operations Agent → forward-only commands: `pause_session`, `resume_session`, `set_session_expected_window(..., reason)`, `change_session_space(..., reason)`, `record_event_note` / `record_observed_*` for externally produced events → `record_event_note(event, note)` documenting the erroneous transition → `event_runtime_events` retains the full sequence → program and runtime state reflect reality plus the documented mistake → attendees may have seen a wrong status → escalate if the event is external and the producer's record now conflicts.

### 8.12 Session accidentally opened — SEV-3
Live board → Owner, Admin, Operations Agent → **no un-start** → `pause_session(..., note)` immediately, or `cancel_session(session, reason)` if it should not run at all; `record_event_note` explaining the mis-start → `event_runtime_events` `SESSION_STARTED` + `SESSION_PAUSED/CANCELLED` → program state shows the true sequence → attendees may have been pushed a "started" state → gap **G-05** (P2).

### 8.13 Session accidentally closed — SEV-2
Attendees still in the room → Owner, Admin, Operations Agent → **completion is terminal** → `create_ad_hoc_session(event, title, ad_hoc_reason)` to carry the remaining programme, plus `record_event_note` linking cause and effect → runtime events show completion followed by the ad-hoc continuation → programme continues under a new session; internal event completion still requires every session completed or cancelled → attendees informed by message → gap **G-05** (P2).

### 8.14 Wrong message published — SEV-2 (SEV-1 if it contains wrong safety/meeting information)
Operator or traveller notices → Owner, Admin (publishing authority) → published messages are **immutable by design**: `cancel_message(message, reason)` stops further delivery and `create_correction_message(message, title, body)` issues the linked correction → the correction message is the compensation → `communication_events` `MESSAGE_PUBLISHED` for both, linked → inbox shows original + correction; read state preserved → travellers see an explicit correction rather than a silently altered message → escalate when the wrong message changed a meeting point or time.

### 8.15 Message sent to the wrong audience — SEV-2
Delivery review (`get_message_recipient_state`) → Owner, Admin → audience is fixed at publish; for a draft use `set_message_audience` / `remove_message_audience_selector` / `preview_audience_count` before publishing → for a published message: `cancel_message(..., reason)` + `create_correction_message` targeted correctly → delivery rows are append-only evidence of who actually received it → recipient state shows the real distribution → wrongly-addressed travellers receive the correction → escalate if the content was confidential to another group (then SEV-1, security escalation).

### 8.16 Wrong order / payment recorded — SEV-1 (financial integrity)
Reconciliation against the bank/cash record → Owner, Admin → `reverse_payment(payment_fact, reason, reference)` and then `record_payment(...)` against the correct order → the reversal is the compensating fact; the original is never edited or deleted → `financial_facts` `PAYMENT_RECORDED` + `PAYMENT_REVERSED` with actor, reason and reference → `get_order_financial_state` recomputes the balance from the full history → customer statement must match; inform the payer → Owner sign-off required for every reversal.

### 8.17 Duplicate payment — SEV-1
Balance exceeds the order total, or two identical references → Owner, Admin → `reverse_payment(duplicate_fact, reason)` when the duplicate is a recording error; `record_refund(payment_fact, amount_minor, reason, reference)` when money must actually go back → both are append-only facts in BIGINT minor units → `financial_facts` retains all three rows → order balance corrected; overpayment ruling of W09 applies → customer told which of the two charges is being returned → Owner sign-off.

### 8.18 Payment reversal / refund — SEV-1 by definition
Customer request, cancellation policy, or an error found in 8.16/8.17 → Owner, Admin → `record_refund(...)` for money returned; `reverse_payment(...)` for a mis-recording → never both for the same event → `financial_facts` `REFUND_RECORDED` / `PAYMENT_REVERSED` with reference and reason → balance and order status recomputed; `cancel_order`/`complete_order` applied as appropriate → customer receives the reference → Owner sign-off; the external provider movement is recorded by reference only (COBS is provider-neutral and moves no money).

### 8.19 Operation accidentally cancelled — SEV-1
Operation disappears from the active board; travellers lose portal content → Owner → **`set_operation_status` explicitly refuses any transition out of `cancelled` or `completed`** → **no approved recovery exists.** Do not attempt SQL. Immediate procedure: keep the operation as is, run the pilot on the operational fallback (external checklist), notify travellers, and escalate → the cancellation audit row with its mandatory reason is the record → derived state stays cancelled; roster, mobility, hospitality and portal reads follow → travellers may lose portal access to their trip → **MANDATORY Owner escalation; gap G-02 (P1)**.

### 8.20 Participant access revoked incorrectly — SEV-2
Traveller reports losing the portal → Owner, Admin → `reinstate_participant_access(grant, reason)` → complete and approved round trip; token hygiene preserved → `audit_events` revoke + reinstate with reasons → portal access is restored immediately; access remains operation-scoped and is never a membership → traveller regains `/my` → none.

### 8.21 Invitation revoked incorrectly — SEV-3
Invitee reports a dead link → Owner, Admin → no un-revoke exists; issue a fresh invitation with `create_invitation(tenant, email, role, token, ttl)` — for portal access, `invite_participant_access(operation, person, ttl)` → the new invitation is the compensation; the revoked one stays as history → audit rows for revoke and for the new invitation → the old token remains permanently dead (correct security behaviour) → invitee receives a new link → gap **G-06** (P3, by design).

### 8.22 Account / person linkage mistake — SEV-1 (identity/security)
A person record is bound to the wrong login → Owner, Admin → `link_person_to_profile` **only binds**; it rejects binding a profile that is already linked to another person, and there is **no unlink** → do not attempt SQL. Contain first: suspend the wrongly-linked membership and `revoke_participant_access` for that person, then escalate → audit `person.linked_to_profile` plus the containment rows → the wrong link persists in the record until an authorised remedy exists → the affected human may see another person's operational context through the portal until contained → **MANDATORY immediate Owner + security escalation; gap G-01 (P2 with containment, P1 if it ever occurs in production)**.

## 9. Append-only recovery constitution (validated against W01–W10)

| # | Rule | Validation against the real contracts |
| --- | --- | --- |
| 1 | Never DELETE runtime truth to hide an error | **HOLDS.** `audit_events` is protected by `reject_audit_mutation`; W04–W09 fact tables are protected by `guard_w04_append_only`, `guard_w05_append_only` and siblings; `authenticated` holds SELECT only on all 50 public tables and `anon` holds none. |
| 2 | Never rewrite history to make the present look right | **HOLDS.** Facts carry `occurred_at` validated by domain asserts; corrections are new rows, never updates. |
| 3 | Correct through an approved compensating command | **HOLDS with exceptions**: presence facts (G-03), operation cancellation (G-02), step/session completion (G-04/G-05) have no compensating inverse. |
| 4 | Preserve actor, timestamp, reason, causal reference | **HOLDS.** Reason is mandatory where the contract demands it (cancellation, no-show, absence, overcapacity, ad-hoc creation, assignment change); causal references exist (`_replaces_leg_id`, correction-message link, `record_refund(_payment_fact_id)`). |
| 5 | Derived state reflects the full fact history | **HOLDS.** `w04_operation_runtime_state`, `w05_leg_dispatch_state`, `w06_stay_overview`, `get_event_runtime_state`, `get_order_financial_state` are all computed projections; no derived column is client-writable. |
| 6 | Financial corrections require explicit reversal/compensation | **HOLDS.** `reverse_payment` and `record_refund` are the only paths; amounts are BIGINT minor units and immutable once recorded. |
| 7 | Security/access corrections preserve auditability | **HOLDS.** Revoke/reinstate/invite/claim all audited; tokens stored as SHA-256 hashes; revocation is immediate. |
| 8 | Direct SQL is not an operator workflow | **HOLDS.** Every mutation path in this runbook is a SECURITY DEFINER command; `authenticated` has zero write grants and the `guard_*` triggers reject direct DML even where legacy grants remain. |
| 9 | `service_role` is not an operator identity | **HOLDS as policy.** No product code path uses it for operator actions; it is reserved for platform maintenance and is not available to BSBTUR operators. |
| 10 | Any incident without an approved path is a product/security gap | **HOLDS.** Section 10 is the register; nothing was implemented to paper over a gap in M3. |

**APPEND_ONLY_CONSTITUTION_VALIDATED: YES** (rules 1, 2, 4–10 unconditional; rule 3 conditional on the open gaps).

## 10. Unresolved recovery gaps

No gap was implemented. Each P1 item below requires an explicit, separately authorised architectural amendment before it may be built.

| ID | Sev | Domain | Failure scenario | Why current commands are insufficient | Smallest safe remedy | Security implications | Needs frozen-architecture amendment? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **G-02** | **P1** | W02 operations | Operation cancelled by mistake (§8.19) | `set_operation_status` hard-rejects any transition out of `cancelled`/`completed`; terminal by contract | A single narrow Owner-only command `reinstate_operation(operation_id, reason, idempotency_key)` allowed **only** from `cancelled` → `planning`, mandatory reason, audited as `operation.reinstated`; completion stays terminal | Owner-only; no new table ACL; no generic status escape hatch; preserves the cancellation fact | **YES — W02 amendment required** |
| **G-03** | **P1** | W04 presence | A presence fact (notably `BOARDED`) recorded for the wrong person or in error (§8.5) | `participant_presence_events` is append-only and the `presence_fact` enum has no retraction value; derived headcount keeps counting the erroneous fact, which is a safety-relevant number at departure | Add one enum value + one command: `PRESENCE_RETRACTED` recorded via `retract_presence_fact(presence_event_id, reason)`, append-only, mandatory reason, Owner/Admin only; readiness projections then ignore retracted facts | Does not delete anything; the erroneous fact stays visible; retraction is itself audited | **YES — W04 amendment required** |
| **G-01** | **P2** | W01 identity | Person bound to the wrong login (§8.22) | `link_person_to_profile` is one-way; no unlink | `unlink_person_from_profile(tenant_id, person_id, reason)`, Owner-only, audited | Must not become a person-impersonation tool; containment (suspend + revoke) already limits exposure today | YES if implemented |
| **G-04** | **P2** | W04 journey | Step started/completed by mistake (§8.4) | No step reopen; steps are forward-only | Documented workaround (`skip_journey_step` + `create_ad_hoc_journey_step`) is sufficient for the pilot | none | No |
| **G-05** | **P2** | W07 events | Session/event started or completed by mistake (§8.12/§8.13) | Completion and cancellation are terminal | Documented workaround (`create_ad_hoc_session` + `record_event_note`) is sufficient for the pilot | none | No |
| **G-07** | **P2** | W06 hospitality | Guest checked in/out by mistake | No un-check-in fact | `note_hospitality_issue` documents it; occupancy is corrected by room commands | none | No |
| **G-06** | **P3** | W01 invitations | Invitation revoked by mistake (§8.21) | No un-revoke — deliberate token hygiene | Reissue a new invitation | Reissuing is the secure behaviour; un-revoking a dead token would not be | No |

**P0 = 0 · P1 = 2 (G-02, G-03) · P2 = 4 (G-01, G-04, G-05, G-07) · P3 = 1 (G-06).**

## 11. Escalation rules

- SEV-1 → Owner immediately, before or in parallel with any corrective command. Financial reversals and access corrections require Owner sign-off recorded in the reason text.
- SEV-2 → Owner informed within the same operational window.
- SEV-3 / SEV-4 → no escalation; the audit trail is the record.
- **Any incident that lands on a gap in Section 10 → immediate Owner escalation and a written product-gap entry, regardless of severity.**

## 12. Forbidden actions

1. Direct `INSERT` / `UPDATE` / `DELETE` on any table as a recovery step.
2. Using `service_role`, platform tooling or the agent to act as the Owner.
3. Deleting or editing `audit_events`, presence facts, transport/hospitality/event runtime events, financial facts or delivery records.
4. Disabling a `guard_*` trigger, an RLS policy or an ACL "temporarily".
5. Editing a payment amount instead of reversing/refunding it.
6. Editing a published message instead of issuing a correction message.
7. Creating a duplicate person, participation, tenant or operation to work around a mistake.
8. Adding a generic "admin edit anything" screen or command.
9. Recording an operational fact with a falsified `occurred_at`.
10. Closing an incident without an audit trail.

## 13. Audit and evidence requirements

Every correction must leave: the actor (`auth.uid()`-derived), the timestamp, the domain fact row, the audit row, and a human-readable reason wherever the contract accepts one. Reasons and notes are **generic operational text only** — never health, identity-document, financial-instrument or credential data (`assert_generic_note` is defence in depth, not a classifier). For SEV-1, additionally record: physical action taken, who was informed, and the traveller communication reference.

## 14. Emergency checklist (SEV-1, printable)

1. **Stabilise the physical situation.** People before records.
2. **Recount / re-verify physically.** Do not trust the screen during an incident.
3. **Record the facts** with the approved runtime commands (`note_incident`, `note_transport_incident`, `note_hospitality_issue`, `record_event_note`) — including the mistake itself.
4. **Notify the Owner.**
5. **Correct the record** with the approved compensating command from Section 8.
6. **Notify affected travellers** (`create_message` → `publish_message`, or `create_correction_message`).
7. **Reconcile money** (`reverse_payment` / `record_refund`) if any value moved.
8. **Verify derived state** on the live board and the traveller portal.
9. **If no approved path exists: STOP, contain, escalate.** Never SQL.
10. **Log the incident against Section 10** so the gap register stays truthful.
