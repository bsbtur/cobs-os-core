# W10 — Participant Access & Traveler Portal · STATUS

**State:** FROZEN (W10-F gate PASS, with one documented UNTESTABLE item)
**Scope:** operation-scoped, revocable participant access + traveler portal (`/my`).

## Frozen surface (verified live)

| Object | Count |
| --- | --- |
| Tables | 2 (`participant_access_grants`, `participant_access_invitations`) |
| Enums | 2 (`participant_access_status`, `participant_access_grant_origin`) |
| Public functions | 15 (6 mutating, 9 read projections) |
| Private helpers (`app_private.w10_*`) | 9 |
| Realtime publications on W10 tables | 0 |

RLS enabled on both tables; **SELECT-only** policies (no INSERT/UPDATE/DELETE
policy exists), no `anon` grants, no write grants to `authenticated`.
All mutations flow through `SECURITY DEFINER` commands.

## W10-F gate results

| Suite | Result |
| --- | --- |
| Claim / replay / wrong-account / revoked invitation (API) | 24 / 25 (1 untestable, see below) |
| Live access changes: revoke, reinstate, participation cancel, operation cancel, historical op | 34 / 34 |
| Cross-tenant, same-tenant, unknown-id IDOR + anonymous + operator-surface RBAC + direct DML | 34 / 34 |
| W01–W09 regression + frozen-surface assertions | 35 / 35 |
| Browser UX (390 px + 1280 px, pt-BR) | 15 / 15 |
| Browser claim flow + token hygiene | 6 / 6 |

Key proven guarantees:

- Revocation and participation/operation cancellation take effect **immediately
  with the same JWT** — no re-login required; the operation also disappears
  from `get_my_operations`.
- Reinstatement restores access without creating a duplicate grant; revocation
  is a status change, never a delete, and never touches the participation row.
- Claim binds the person to the claiming profile, creates **no membership**,
  and consumes the invitation exactly once. Replay by the same account is
  idempotent (`replayed: true`); replay by another account is rejected with the
  same generic message as unknown/revoked tokens.
- Tokens exist as raw values only in the operator's single response; storage is
  SHA-256 hash only. The claim page strips the token from the URL before the
  RPC; it never reaches page text, storage, or history.
- Every denial (no grant, cross-tenant, unknown id, cancelled op/participation,
  revoked grant) returns the byte-identical `Access denied` payload and renders
  one generic portal state.
- Completed operations stay readable and are flagged `historical` + `read_only`.
- Travelers cannot read any W02–W09 domain table directly. The only direct rows
  a traveler sees are W08 `messages`/`message_recipients` addressed to them —
  pre-existing W08 behaviour, published messages only, drafts never.
- Median projection latency: 147–182 ms.

## Defects found and fixed in W10-F

- **DEF-W10-002 (fixed):** `toPortalError` read `.message` only from `Error`
  instances, so a PostgREST denial object fell through to the "connection
  problem" state instead of the generic access-denied state. Fixed in
  `src/lib/w10.ts`; re-verified in the browser. No backend change.

## Observations (non-blocking, no data exposure)

- **OBS-W10-001:** `list_participant_access_grants` enforces the operator role
  inside its `WHERE` clause, so non-operators receive `[]` instead of an
  explicit error. No data leaks; denial semantics are silent rather than loud.

## Untestable item (explicitly NOT claimed as PASS)

- **Expired invitation rejection.** `invite_participant_access` enforces a
  minimum lifetime, and `guard_w10_invitation_validity` makes `expires_at`
  immutable even under the maintenance control flag — so an invitation cannot
  be back-dated to test the expiry branch empirically. The branch
  (`expires_at <= now()` → generic `Invalid or expired invitation`) is
  **code-verified only**. The revoked-invitation branch, which shares the same
  generic response, is empirically verified.

## Data

Verification fixtures were **left in place** (no cleanup was authorized in this
gate). All rows carry the `W10VER` prefix; operations `W10VER Op LIVE` is now
cancelled and `W10VER Op A2` completed as a result of live-change testing.
