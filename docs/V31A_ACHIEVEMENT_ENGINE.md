# COBS Human Experience V3.1-A — Achievement Engine

## Objective

Provide a persistent, tenant-safe and idempotent foundation for XP and achievements before any celebration UI is connected.

## Canonical model

### `achievement_definitions`
Product-level catalog of badges. A definition contains a stable `key`, display copy, scope, rarity, XP reward and icon key.

Scopes:
- `profile`: awarded to a person/profile and may generate XP.
- `operation`: reserved for operation-level awards in V3.1-B and later.

Rarities:
- `common`
- `rare`
- `epic`

### `achievement_awards`
Append-only historical record that an achievement was awarded. Awards are tenant-scoped and carry operation/source context plus a required idempotency key.

### `xp_ledger`
Append-only positive XP ledger. XP is generated from a profile-scoped achievement award, not from frontend state.

## Security rules

- Direct client writes are not allowed for awards or XP.
- RLS permits tenant members to read their tenant data only.
- The actual mutation primitive lives in `app_private.grant_achievement`.
- `anon` and `authenticated` cannot execute the private grant primitive directly.
- The private primitive verifies tenant ownership of operation/profile subjects.
- Award history and XP history are append-only.

## Idempotency

Every grant requires an `idempotency_key`. The database enforces uniqueness on `(tenant_id, idempotency_key)` and returns the existing award when the same event is retried.

Frontend refreshes, network retries and duplicated event delivery must therefore not duplicate XP or badges.

## Initial badge catalog

1. `first_mission` — Primeira Missão — 100 XP — common
2. `explorer` — Explorador — 80 XP — common
3. `time_keeper` — Guardião do Tempo — 120 XP — rare
4. `perfect_route` — Rota Perfeita — 180 XP — rare
5. `milestone_master` — Mestre dos Marcos — 100 XP — common
6. `essentials_100` — Essenciais 100% — 150 XP — rare
7. `flawless_operation` — Operação Impecável — 300 XP — epic
8. `brasilia_expert` — Brasília Expert — 250 XP — epic
9. `five_star_experience` — Experiência 5 Estrelas — 250 XP — epic
10. `legendary_mission` — Missão Lendária — 500 XP — epic

The existence of a definition does not mean its rule is active. Rules are connected only after the corresponding operational fact is proven reliable.

## Read contract

`get_my_achievement_summary(tenant_id)` returns the authenticated profile's total XP and award count for the tenant.

`list_my_achievements(tenant_id)` returns the authenticated profile's historical badge list.

## Next integration step

Create a deterministic evaluator for stage completion. It must consume recorded operational facts and may call the private grant primitive for a narrow first rule set:

- first completed mission;
- all required milestones completed;
- stage completed within its operational time window;
- minimum visit-point rule satisfied.

The evaluator must never trust the frontend to send XP, rarity, achievement key eligibility or a synthetic completion state.

## V3.1-A gates

1. Persistence PASS
2. Idempotency PASS
3. Tenant isolation PASS
4. Visual PASS
5. Audio PASS
6. Haptic PASS
7. Motion PASS
8. Mobile PASS
9. UX FREEZE

V3.1-B Operational Excellence Score remains explicitly out of scope for this package.
