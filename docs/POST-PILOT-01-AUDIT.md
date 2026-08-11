# POST-PILOT-01 AUDIT — READ ONLY

**Operação:** `bf1f51fe-d6e5-4fb4-83c2-00c965d25766` · `CITYTO-20260815` · City Tour Brasília Executivo
**Data da auditoria:** 2026-08-11 (UTC)
**Modo:** exclusivamente leitura. Nenhuma migration, nenhum RPC mutável, nenhum dado alterado.

## 1. Estado final da operação (W02)

| Campo | Valor |
| --- | --- |
| status | `completed` |
| completed_at | 2026-08-11 12:18:24.970571Z |
| cancelled_at | — |
| archived_at | — (não arquivado, conforme instrução) |
| planned | 2026-08-15 10:30Z → 17:00Z (baseline preservado) |
| expected | 2026-08-11 06:00Z → 08:00Z (forecast) |

PLANNED != EXPECTED != ACTUAL: o baseline de 15/08 nunca foi reescrito pela
antecipação para 11/08. ✅

## 2. Trilha de auditoria da operação (13 eventos, append-only)

Sequência íntegra: `operation.created` → `planned_time_changed` →
`status_changed` (draft→planning→ready) → 2× `expected_time_changed` →
ready→planning→ready → active → `operation.completed` (05:52, acidental) →
**`operation.completion_revoked`** (DEF-PILOT-005, evidência de runtime = 0 no
momento da conclusão) → active → `operation.completed` final às 12:18 com
`runtime_evidence = {total: 23, journey: 20, presence: 2, transport: 1}`.

A conclusão final foi aceita **com evidência**, e a conclusão acidental ficou
registrada e revogada — nada foi apagado. ✅

## 3. Jornada (W04) — 6 etapas, 22 eventos

| Seq | Etapa | Tipo | Presença | STEP_STARTED | STEP_COMPLETED |
| --- | --- | --- | --- | --- | --- |
| 10 | Encontro e embarque — Torre de TV | boarding | boarded | 1 | 1 |
| 20 | Praça dos Três Poderes e Esplanada | activity | none | 1 | 1 |
| 30 | Catedral Metropolitana | activity | none | 1 | 1 |
| 40 | Memorial JK e Eixo Monumental | activity | none | 1 | 1 |
| 50 | Parada para almoço | meal | none | 1 | 1 |
| 60 | Retorno e encerramento | return | boarded | 1 | 1 |

Todas `plan_origin = planned` (nenhuma etapa ad-hoc). Nenhuma etapa pulada,
nenhuma duplicada, nenhum evento fora de ordem.

Sequências completas de embarque nas duas etapas com `boarded`:
`STEP_STARTED → BOARDING_STARTED → BOARDING_COMPLETED → DEPARTURE_AUTHORIZED →
DEPARTED → STEP_COMPLETED`, em ordem cronológica estrita. ✅
Última etapa concluída 12:05:11Z, operação concluída 12:18:24Z (13 min depois,
ação manual — sem auto-conclusão). ✅

## 4. Presença (W04)

2 fatos, ambos `BOARDED` para PEDRO PAULO DE LIMA SANTOS CARDOSO
(07:29:41Z na etapa 10, 11:52:40Z na etapa 60). Nenhuma retratação, nenhum
`ABSENCE_NOTED`, nenhum `NO_SHOW_CONFIRMED`.
Ambos ocorrem depois de `BOARDING_STARTED` e antes de `BOARDING_COMPLETED`. ✅
Tripulação (crew) corretamente fora da população `participants`. ✅

## 5. Roster (W03)

| Pessoa | Tipo | Status |
| --- | --- | --- |
| PEDRO PAULO DE LIMA SANTOS CARDOSO | participant | confirmed |
| RAFAEL LIMA | crew | expected |
| REGINA APARECIDA TIAGO DE MOURA | crew | expected |

Nenhum papel operacional (`operation_role_assignments`) foi atribuído.

## 6. Mobilidade (W05) — 2 legs, 18 eventos

Eventos: 2× `LEG_CREATED` / `VEHICLE_ASSIGNED` / `DRIVER_ASSIGNED`,
`VEHICLE_REQUESTED`, `SEAT_RELEASED`, `VEHICLE_AT_PICKUP`, 6× `SEAT_ASSIGNED`,
2× `EXPECTED_TIME_CHANGED`.

Assentos ativos: A01 (Pedro) em **ambas** as legs, além de Rafael e Regina em
cada leg. O `SEAT_RELEASED` de 05:14Z (release acidental) permanece registrado
com `released_at` e foi seguido de reatribuição — histórico preservado. ✅

## 7. Comunicação (W08/W10)

- 2 mensagens `published`, ambas `instruction/important`.
- `c2937b62` — publicada 04:34Z, **0 entregas** (anterior ao DEF-PILOT-004,
  quando Pedro ainda não era elegível por não possuir W01 Membership).
- `df5454d6` — publicada 04:55Z, 1 entrega `delivered` a Pedro, com
  `MESSAGE_READ` às 04:57Z.
- Eventos de comunicação: 2 `MESSAGE_PUBLISHED`, 1 `IN_APP_DELIVERY_CREATED`,
  2 `MESSAGE_READ`.
- Acesso W10 de Pedro: `active`, concedido 03:47Z, nunca revogado.

## 8. Checklists (W04 playbooks)

5 itens `required`, todos ativos, todos com `completed` como última execução.
15 execuções registradas (3 reaberturas + reconclusões nas etapas 10 e 60) —
append-only, sem apagamento. ✅

## 9. Domínios não exercitados

`orders` = 0 · `hospitality_stays` = 0 · `events` (W07) = 0. Coerente com o
envelope do PILOT-01 (somente W02/W03/W04/W05/W08/W10).

## 10. Observações (não são defeitos bloqueantes)

| ID | Observação | Severidade |
| --- | --- | --- |
| OBS-PP-001 | 2 assentos ativos por leg com `seat_label` vazio (Rafael, Regina); `assign_seat` aceita rótulo em branco e a UI não confirma. | P2 |
| OBS-PP-002 | Mensagem `c2937b62` permanece publicada com 0 entregas; não há reprocessamento retroativo de elegibilidade após DEF-PILOT-004. | P2 |
| OBS-PP-003 | Tripulação permaneceu `expected` durante toda a execução; nada obriga confirmação de crew. | P3 |
| OBS-PP-004 | `assign_seat` não valida capacidade do veículo (já registrado como achado pós-piloto). | P2 |

Nenhuma inconsistência silenciosa: nenhum evento órfão, nenhuma etapa sem par
start/complete, nenhum fato de presença retratado, nenhum registro apagado.

## 11. Veredito

```
POST_PILOT_01_AUDIT: CLEAN
READ_ONLY: YES
DATA_MUTATED: NO
MIGRATIONS_RUN: NO
APPEND_ONLY_INTEGRITY: PASS
SEQUENCE_INTEGRITY: PASS
PRESENCE_INTEGRITY: PASS
LIFECYCLE_INTEGRITY: PASS
AUDIT_TRAIL_COMPLETE: PASS
SILENT_INCONSISTENCIES: 0
BLOCKING_DEFECTS: 0
OPEN_OBSERVATIONS: 4 (P2/P3)
PILOT_01_CERTIFIED: YES
GOLDEN_PILOT: CITYTO-20260815 — nunca apagar, nunca arquivar sem autorização
```
