# W07 — EVENT PRODUCTION CORE — STATUS

**State: FROZEN** · Last updated: 2026-08-10

| Gate | Result |
| --- | --- |
| W07 Architecture Gate | PASS |
| W07 Final Build Contract | PASS |
| W07 Build | PASS |
| W07 Security Gate | PASS |
| W07 Final Hotfix (OBS-W07-001) | PASS |
| W07 Focused Re-verification | PASS |
| W07 Architecture Frozen | YES |

## 1. Frozen surface

| Contract | Value |
| --- | --- |
| Tables | 7 (`venues`, `venue_spaces`, `events`, `event_sessions`, `event_session_speakers`, `event_staff_assignments`, `event_runtime_events`) |
| Enums | 5 (`event_lifecycle_status`, `event_source_kind`, `event_session_kind`, `event_staff_function`, `event_runtime_event_type`) |
| Runtime event types | 12 |
| Mutating commands | 35 |
| Read functions | 4 (`get_event_program`, `get_event_runtime_state`, `list_event_runtime_events`, `get_venue_space_availability`) |
| Public functions | 39 (no public function #40) |
| Private helpers (`app_private.w07_*`) | 14 |
| Realtime tables | 2 (`event_runtime_events`, `event_sessions`) |

## 2. Domain invariants (proven)

- **Event != Operation.** An Event is produced inside an Operation; it never replaces or re-implements it.
- **Venue != Event.** A Venue is a reusable tenant resource; an Event merely references it.
- **Venue != Space.** Spaces are scoped children of a Venue; sessions bind to Spaces, not Venues.
- **Session != Event.** Sessions are program children with their own derived runtime.
- **Person remains the canonical human identity.** Speakers and staff are `people`, never accounts.
- **Speaker assignment creates no login and grants zero authorization.**
- **Staff assignment creates no login and grants zero authorization.**
- **W01 Membership is the only authorization truth.** No W03/W07 role label ever grants access.

## 3. Lifecycle vs runtime

- Lifecycle: `draft → planning → program_locked → ready → closed_out`.
- Lifecycle is administrative; **runtime truth lives exclusively in `event_runtime_events`**.
- `EVENT_STARTED` is the only actual-start truth; `EVENT_COMPLETED` the only actual-completion truth; `EVENT_CANCELLED` the only terminal cancellation truth.
- There is **no mutable actual start/end cache** on any row.
- `closed_out` can only exist together with a canonical terminal runtime fact, written in the same transaction.

## 4. Internal / external boundary

- Internal Events use production commands; External Events use observed commands.
- Internal Events reject observed commands; External Events reject internal production runtime (including `complete_event`).
- External observations require `observed = true`, `observed_at`, `observer_note`, actor, and server-side `recorded_at`.
- Nothing in the model implies COBS controlled an external producer.

## 5. Program freeze

- Before lock: baseline Sessions may be created, edited and reordered.
- After lock: baseline is immutable.
- Post-lock additions only via `create_ad_hoc_session`: reason required, `is_ad_hoc = true`, append-only sequence, baseline never renumbered.

## 6. Session reconciliation rule (OBS-W07-001, verified)

**An INTERNAL Event cannot complete until every Session derives to `completed` or `cancelled`.**

- `scheduled`, `running` and `paused` each block `complete_event`.
- `complete_event` **never** auto-cancels, never auto-completes, and never fabricates session facts. The operator must resolve each Session explicitly.
- When blocked, a fully derived (never persisted) blocker payload is returned: `total_sessions`, `completed_sessions`, `cancelled_sessions`, `scheduled_sessions`, `running_sessions`, `paused_sessions`, `unresolved_total`.
- When blocked, **no** `EVENT_COMPLETED` fact and **no** `closed_out` mutation occur. No partial close.
- External observed completion is unaffected: it remains observation-based and does not require every external Session to have a terminal fact.

## 7. Session state freeze

- Derived states: `scheduled`, `running`, `paused`, `completed`, `cancelled`.
- Transitions: `scheduled → running`, `running → paused`, `paused → running`, `running → completed`; cancel from `scheduled`/`running`/`paused`.
- `paused` cannot complete directly. `completed` and `cancelled` are terminal.
- No runtime/cancellation cache on the session row.

## 8. Planned / Expected / Actual

- **PLANNED** is a frozen baseline.
- **EXPECTED** changes only through forecast commands and never rewrites Planned.
- **ACTUAL** exists only as runtime facts; there is no mutable Actual cache.

## 9. Journey / mobility / hospitality boundary

- An Event may reference a W04 Journey Step through a typed, tenant-checked reference. A Session has no Journey Step relationship.
- W07 writes **zero** W04 journey/presence facts, **zero** W05 mobility facts, **zero** W06 hospitality facts. Read-only contextual integration only.

## 10. Attendance / incident freeze

W07 contains **no** traveler attendance, speaker attendance, staff attendance, badge scan, QR access, ticket validation, or incident core. `EVENT_NOTE_RECORDED` is the only lightweight operational note mechanism.

## 11. Append-only & security

- `event_runtime_events` is append-only; authenticated direct INSERT/UPDATE/DELETE are all denied.
- All seven tables: RLS enabled, `anon` zero privileges, `authenticated` SELECT only, `service_role` backend privileges.
- `member` role has zero Event Production access (zero rows, zero commands).
- Cross-tenant access blocked at both row and command level.
- All 14 `app_private.w07_*` helpers are unreachable from public/anon/authenticated (RPC probes return 404).
- No cleanup RPC, history-delete RPC, maintenance route, admin backdoor, temporary SECURITY DEFINER function, or password-reset surface remains from verification or cleanup.

## 12. Idempotency & cross-actor singularity

- W01 idempotency remains actor-scoped; W07 transition logic independently prevents duplicate singular facts across actors.
- Verified: single `EVENT_STARTED`, single `EVENT_COMPLETED`, single terminal outcome, single logical `SESSION_STARTED`, single `SESSION_COMPLETED` or `SESSION_CANCELLED`.
- Pause/resume repeat only through a new legal state transition.

## 13. Frontend surface (frozen)

- `/operations/$operationId/events` — Event workspace (lifecycle, program, run, crew, facts).
- `/settings/venues` — Venue and Space management.
- Internal production UX and external observation UX are distinct and mutually exclusive.
- Program lock UX, ad-hoc Session UX (reason required), speaker/staff assignment UX, Event-scoped runtime timeline.
- Read-only `EventLiveCard` on the W04 Live page.
- No new fixed bottom-nav Event item; mobile bottom bar remains 3 primary + "Mais".

## 14. Deferred QA

**Authenticated browser W07 UX: UNVERIFIED — LOVABLE PREVIEW SESSION INJECTION LIMITATION.**
The Event workspace and Venue settings surfaces were verified statically (source, typecheck, route tree) and through the real backend with real authenticated API sessions. Live in-browser authenticated UX checks (A4/A5) could not be executed because preview session injection is unavailable. This is deferred UX QA only — it is not claimed as PASS.

## 15. Verification residue

All W07 verification and hotfix data was removed in a single privileged maintenance transaction (guards suspended only inside it, restored before commit). Residual counts across every W01–W07 application table and auth users are **0**.
