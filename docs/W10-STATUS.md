# W10 — Participant Access & Traveler Portal · STATUS

**State:** FROZEN · database CLEAN
**Scope:** operation-scoped, revocable participant access + traveler portal (`/my`).

## Gate record

| Gate                                        | Result                         |
| ------------------------------------------- | ------------------------------ |
| W10 Architecture Gate                       | PASS                           |
| W10 Final Architecture Correction           | PASS                           |
| W10-A Build (structure/security foundation) | PASS                           |
| W10-B Access Engine Security Gate           | PASS (62/62 after DEF-W10-001) |
| W10-C Projection Privacy / IDOR Gate        | PASS (142 assertions)          |
| W10-D/E Traveler Portal                     | PASS (delivered)               |
| W10-F Final Adversarial, Browser & UX Gate  | PASS                           |
| **W10 ARCHITECTURE FROZEN**                 | **YES**                        |

## Defects & observations

- **DEF-W10-001 (fixed):** identity-conflict raised the raw unique-constraint text on invitation creation; replaced with a generic message.
- **DEF-W10-002 (fixed):** PostgREST access denials were classified as connectivity errors in `src/lib/w10.ts` (`toPortalError` only read `.message` from `Error` instances). Fixed and re-verified in-browser.
- **DEF-W10-003 (found during freeze, fixed):** both W10 tables still carried Supabase's default table privileges (`anon` and `authenticated` = ALL) instead of the SELECT-only pattern used by every W01–W09 table. No exposure occurred — RLS has SELECT-only policies scoped `TO authenticated`, so writes and anon reads were already denied — but the grants now match the contract: `anon` = zero privileges, `authenticated` = SELECT only, `service_role` = ALL.
- **OBS-W10-001 (accepted):** `list_participant_access_grants` filters the operator check inside its `WHERE` clause, so non-operators receive `[]` rather than an explicit denial. No data disclosure.

## Cleanup (one-shot maintenance transaction)

All four tenants (`W10VER Tenant A/B` ×2 harness runs) and all 34 `w10ver.*@example.com`
accounts were verification fixtures; **no real data existed**, so the entire application
data set was verification residue and was removed in a single privileged transaction
(`TRUNCATE ... CASCADE` over every public table, which bypasses row-level append-only
guards without disabling them, followed by `DELETE FROM auth.users`).

No trigger was disabled at any point; **disabled triggers after cleanup = 0**.
No cleanup RPC, maintenance endpoint, admin backdoor, temporary SECURITY DEFINER helper,
token-inspection function or identity-rebinding shortcut was created or left behind.

### Rows removed

| Area                                                                          | Removed               |
| ----------------------------------------------------------------------------- | --------------------- |
| Tenants                                                                       | 4                     |
| Auth users                                                                    | 34                    |
| Profiles                                                                      | 25                    |
| People                                                                        | 36                    |
| Memberships                                                                   | 8                     |
| Invitations (W01)                                                             | 4                     |
| W02 (experiences/offerings/operations)                                        | 9 (operations)        |
| W03 (participations / role assignments / role types)                          | 26 / 0 / 34           |
| W04 (journey steps / journey events / presence)                               | 4 / 3 / 1             |
| W05 (vehicles / drivers / legs / stops / seats / events)                      | 2 / 1 / 2 / 1 / 3 / 7 |
| W06 (properties / rooms / stays / stay participations / assignments / events) | 1 / 1 / 1 / 2 / 2 / 4 |
| W07 (venues / spaces / events / sessions / staff / runtime events)            | 1 / 1 / 1 / 2 / 1 / 1 |
| W08 (messages / recipients / selectors / comm events)                         | 6 / 5 / 6 / 6         |
| W09 (orders / items / reservations / financial facts)                         | 0 / 0 / 0 / 0         |
| participant_access_grants                                                     | 16                    |
| participant_access_invitations                                                | 15                    |
| audit_events                                                                  | 157                   |
| idempotency_keys                                                              | 108                   |

### Residual counts (verified live)

All 50 public application tables = **0 rows**. `auth.users` = **0**.
Raw invitation tokens persisted anywhere = **0** (only `token_hash` columns exist, both empty).
No token-bearing log, route artifact or storage object exists in product source; no token
inspection/debug function exists.

## Structural freeze (verified live)

| Metric                     | Value |
| -------------------------- | ----- |
| W10_TABLE_COUNT            | 2     |
| W10_ENUM_COUNT             | 2     |
| W10_MUTATING_COMMAND_COUNT | 6     |
| W10_READ_FUNCTION_COUNT    | 9     |
| W10_PUBLIC_FUNCTION_COUNT  | 15    |
| W10_PRIVATE_HELPER_COUNT   | 9     |
| W10_REALTIME_TABLE_COUNT   | 0     |

Mutating: `grant_participant_access`, `revoke_participant_access`,
`reinstate_participant_access`, `invite_participant_access`,
`revoke_participant_access_invitation`, `accept_participant_access_invitation`.
Read: `list_participant_access_grants`, `get_my_participant_access`,
`get_my_operations`, `get_my_operation_overview`, `get_my_journey`,
`get_my_mobility`, `get_my_stay`, `get_my_event_program`, `get_my_messages`.
No public function #16; no W10 realtime publication.

## RLS / ACL freeze

Both tables: RLS **enabled**; `anon` **zero privileges**; `authenticated` **SELECT only**;
`service_role` ALL. Policies (all `TO authenticated`, all SELECT):
operators-read-grants, participant-reads-own-grant, operators-read-invitations.
No INSERT/UPDATE/DELETE policy exists → direct authenticated INSERT/UPDATE/DELETE denied.
Participants see only their own grant row; the invitation table is not readable by travelers
(operator-scoped policy only). Cross-tenant reads blocked by the tenant predicate.
Operator management restricted to owner/admin/operations_agent (W01 membership only).

## Private helper freeze

Nine `app_private.w10_*` helpers, all with `EXECUTE` revoked from `anon` and
`authenticated`: `w10_current_person_id`, `w10_effective_access`,
`w10_assert_effective_access`, `w10_assert_person_profile_link`,
`w10_require_access_operator` (also `EXECUTE` to `service_role`, documented),
`w10_generate_invitation_token`, `w10_hash_invitation_token`,
`w10_tenant_of_operation`, `w10_record_access_audit`.
`authenticated` holds only `USAGE` on the `app_private` schema — the minimum required for
policy predicate evaluation, and documented as such. No helper returns a raw token, a token
hash, another participant's identity, or grant internals beyond intended use.

## Participant Access constitution (frozen)

Participant Access ≠ Membership. Participation alone grants no system access.
Participant Access creates no Membership, grants no tenant-wide read, and grants no operator
authority. W03 operational roles grant zero Participant Access. A Person without a login
remains fully supported in the roster. Portal adoption is optional.

## Effective access formula (frozen)

Access exists only when **all** hold: authenticated Profile · canonical current Person ·
active grant · `grant.profile_id` = authenticated Profile · `grant.person_id` = current Person ·
`grant.participation_id` belongs to that Person · participation status valid ·
participation belongs to the requested Operation · Operation not cancelled.
Any failed condition ⇒ no access. No synchronization job. No client-side authority.

## Profile binding (frozen)

`participant_access_grants.profile_id` is immutable binding evidence. No automatic rebind,
no self-healing, no grant following another identity. Profile/Person mismatch fails closed.

## Invitation token security (frozen)

256-bit CSPRNG token · plaintext returned exactly once · SHA-256 hash persisted · single-use ·
mandatory expiry · revocation supported. Tokens never appear in audit metadata, analytics,
logs, console, localStorage, sessionStorage, or persistent URL/history after portal bootstrap
(verified in-browser). Claim cannot create a Membership. Wrong-account and replay-by-another
account both return the generic rejection.

## Invitation expiry QA note (honest limitation)

**EXPIRED INVITATION LIVE BRANCH: UNVERIFIED.** The approved minimum-TTL rule and the
`expires_at` immutability guard prevented safe backdating for the verification harness.
Code-path review: PASS. Unknown/revoked token generic-denial equivalence: **live tested**.
This branch is not live-tested and token immutability was not weakened to test it.
This limitation does not block the W10 freeze.

## Projection freeze

Exactly nine read functions, all shaped and minimal:
`get_my_operation_overview` exposes no tenant/admin/internal metadata; `get_my_journey` is
traveler-facing only; `get_my_mobility` returns own mobility only; `get_my_stay` returns own
stay/room only; `get_my_event_program` returns the participant-facing program only;
`get_my_messages` returns only published/cancelled messages addressed to the caller.
No other-participant data, other seats, roommates, full rooming, event staff, internal
journey/event facts, draft messages, or other recipient states.

## IDOR freeze

Same-tenant unauthorized operation: DENIED. Cross-tenant operation: DENIED.
Nonexistent operation: identical safe access-denied response. No existence-enumeration signal.

## Access changes (verified in W10-F)

Grant revoked ⇒ access ends immediately (same JWT). Grant reinstated ⇒ access restored under
the canonical rules, no duplicate grant. Participation cancelled ⇒ effective access NONE;
restored ⇒ access may become valid again per W03/W10 rules. Operation cancelled ⇒ access NONE.
Operation completed ⇒ historical read-only portal access remains. Grant history is never deleted.

## Portal frontend freeze

Routes: `/my`, `/my/$operationId`, `/my/$operationId/journey`, `/my/$operationId/mobility`,
`/my/$operationId/stay`, `/my/$operationId/events`, `/my/$operationId/messages`,
`/my/claim/$token`. `PortalShell` stays separate from `AppShell`. The portal contains no
operator rail, tenant switcher, command palette, Commerce, admin settings, People/Fleet/
Hospitality admin, event production controls or audit surface.

## Portal data path

The portal consumes only W10 projections, the approved W10 claim command and W08
`mark_message_read`. No raw W02–W09 table reads. No client-side authorization substitute.

## Cache / session (verified in W10-F)

Revoked access, cancelled participation and cancelled operation all disappear after refetch.
Multi-operation and multi-tenant switching leak no stale data. Logout/account switching clears
participant data. Neither operator nor member privilege expands portal fields.

## Cross-domain writes

W10 writes only its own claim/access lifecycle plus W08 `MESSAGE_READ` via
`mark_message_read`. No W10 write to W02–W07 or W09; no W01 membership mutation.

## Mobile / UX

Participant navigation frozen: Início · Cronograma · Transporte · Hospedagem · **Mais**
(Programação, Avisos). No Commerce, no admin destination. W10-F browser results: 390 px and
1280 px both pass, no wrapping, traveler terminology humanized (pt-BR/en-US/es-ES).

## Quality

Typecheck: PASS (`tsgo --noEmit`, 0 errors). Route tree: regenerated, all 8 portal routes
registered, dev server 200. Security inspection: only the pre-existing, accepted
"signed-in users can execute SECURITY DEFINER function" warnings inherent to the
command-surface architecture (unchanged since W01). No W01–W09 files reformatted.
