# DEF-PILOT-004 — W08 / W10 in-app eligibility amendment

Status: **CLOSED** (2026-08-11) · Option **A** implemented · Gate 7 unblocked

## 1. Root cause

`app_private.w08_in_app_eligible_recipients(tenant_id, person_ids)` required an
**active W01 Membership** for a recipient to be in-app reachable. A legitimate
Pilot-01 traveler holds **W10 Participant Access** and, by constitution, must
never hold a Membership. Publication therefore marked the traveler
`in_app_eligible = false`: no `message_deliveries` row and no
`IN_APP_DELIVERY_CREATED` communication event were produced for the real
pre-trip message.

## 2. Architectural amendment

In-app eligibility is now:

```
linked authenticated Profile
AND ( active W01 Membership
      OR effective W10 Participant Access to the Message's exact Operation )
```

When `messages.operation_id IS NULL`, the Participant Access branch is
**disabled**; Membership eligibility is unchanged.

The operation scope is supplied **internally** by `publish_message` from the
server-loaded canonical `messages` row — never from client input.

## 3. Canonical predicate refactor (no duplication)

- New private helper `app_private.w10_effective_access_for(_operation_id, _profile_id)`
  now holds the canonical nine-condition W10 effective-access derivation
  (grant active · immutable profile binding · live person↔profile link ·
  participation identity assertion · participation in operation ·
  participation status ∈ {expected, confirmed} · operation not cancelled ·
  tenant coherence across grant/person/participation/operation).
- `app_private.w10_effective_access(_operation_id)` is preserved as a thin
  self wrapper: `w10_effective_access_for(_operation_id, auth.uid())`.
  No condition was loosened; W10 self semantics are behaviourally identical.
- `w08_in_app_eligible_recipients(_tenant_id, _operation_id, _person_ids)`
  calls the canonical helper and additionally asserts the returned
  `tenant_id` equals the message tenant.

Security posture of the profile-scoped helper: `app_private` only, `STABLE`,
`SECURITY DEFINER`, fixed `search_path = pg_catalog, public`, ACL
`{postgres=X/postgres}` — **not executable by PUBLIC / anon / authenticated**,
not in any exposed API schema. RPC/API reachability = **NONE**.

Structural delta: private helpers 98 → 99; public functions 229 → 229.

## 4. Historical message preserved

The real Pilot-01 pre-trip message `c2937b62-…` remains **immutable evidence**:
still `recipient_count = 1`, `in_app_reachable_count = 0`, zero deliveries,
zero `IN_APP_DELIVERY_CREATED` facts. No retrospective repair was performed.

## 5. QA evidence (isolated QA tenants, since destroyed)

Two throwaway tenants, ten throwaway auth accounts, four operations.

| #   | Case                                                        | Expected                    | Result                                                                                                                                                 |
| --- | ----------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Active Membership recipient                                 | eligible                    | eligible                                                                                                                                               |
| 2   | Effective Participant Access, same Operation, no Membership | eligible                    | eligible                                                                                                                                               |
| 3   | Auth account, person without profile binding                | ineligible                  | ineligible                                                                                                                                             |
| 4   | Revoked grant                                               | ineligible                  | ineligible                                                                                                                                             |
| 5   | Cancelled participation                                     | ineligible                  | ineligible (also rejected at audience layer)                                                                                                           |
| 6   | Cancelled operation                                         | ineligible                  | `effective = false`, portal access denied                                                                                                              |
| 7   | Grant for a different Operation (same tenant)               | ineligible                  | ineligible                                                                                                                                             |
| 8   | Cross-tenant person/profile/grant                           | ineligible                  | ineligible                                                                                                                                             |
| 9   | Profile/person binding mismatch                             | ineligible                  | unreachable by construction (`guard_w10_grant_binding` keeps the binding immutable); predicate asserts both `grant.profile_id` and `people.profile_id` |
| 10  | Person with no login                                        | recipient only, no delivery | recipient created, `in_app_eligible = false`, no delivery                                                                                              |
| 11  | `operation_id IS NULL` + traveler grant                     | ineligible                  | ineligible                                                                                                                                             |

Publication proof (single traveler with Participant Access, zero Membership,
zero admin role): `MESSAGE_RECIPIENT_COUNT = 1`, `IN_APP_DELIVERY_COUNT = 1`,
`MESSAGE_PUBLISHED` fact = 1, `IN_APP_DELIVERY_CREATED` fact = 1, inbox and
portal visibility correct, traveler able to read only their **own**
`message_recipients` rows.

W10 regression re-run: same-tenant ungranted operation, cross-tenant operation,
revoked grant, cancelled participation, cancelled operation and unbound profile
all return `Access denied` / `effective = false` — unchanged from the frozen
W10 contract.

## 6. Cleanup

QA tenants, rows and auth accounts removed. `QA_RESIDUE = 0`,
`DISABLED_TRIGGERS = 0`, temporary maintenance surface = NONE.
Real BSBTUR Pilot-01 data unchanged (1 operation, 1 grant, 1 message).
