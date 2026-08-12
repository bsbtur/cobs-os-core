# PILOT-02 — STATUS FINAL

> Documentos relacionados: `docs/PILOT-02-P0-BLUEPRINT.md`, `docs/PILOT-02-P1-VALIDATION.md`,
> `docs/PILOT-02-P2-PROVISIONING.md`, `docs/PILOT-02-DEF-PILOT-023.md`.
> Este documento consolida o encerramento formal do PILOT-02 (LIVE_TEST_03).

---

## 1. Identificação da operação

| Campo | Valor |
| --- | --- |
| operation_id | `2d581923-534a-4fd6-8442-55ac425152ec` |
| operation_code | `CITYES-20260811` |
| Nome | City Tour Brasilia Essencial — Pilot-02 |
| Status final | `completed` |
| completed_at | 2026-08-12 03:45:52.953Z |
| Auditoria `operation.completed` | `e0130886-61fd-482b-9a0b-ae334b428ae0` |
| Resultado | **COMPLETED_WITH_HISTORICAL_DEFECTS** |

## 2. Resultado executivo

O PILOT-02 percorreu o ciclo completo de uma operação real de City Tour, das 8 etapas de jornada
até a conclusão por `complete_operation`. Todas as etapas foram concluídas, a integridade
append-only foi preservada e nenhuma escrita ocorreu após a conclusão da operação.

Dois defeitos históricos permanecem gravados nos dados (seqs 30 e 70 concluídas sem `ARRIVED`),
originados por DEF-PILOT-023 antes da correção de backend. Esses dados são preservados como
histórico imutável. O código atual está corrigido e a invariante foi validada em runtime na seq 80.

## 3. Censo final

| Métrica | Valor |
| --- | --- |
| Etapas concluídas | 8 / 8 |
| journey_events | 26 |
| Fatos de presença | 28 |
| Participantes confirmados | 5 |
| Crew confirmado | 2 |
| Desembarcados na seq 80 | 5 / 5 |
| Escritas após `operation.completed` | 0 |

## 4. Censo das oito etapas

| Seq | Etapa | Resultado |
| --- | --- | --- |
| 10 | Encontro / concentração | COMPLETO |
| 20 | Embarque de ida | COMPLETO |
| 30 | Deslocamento de ida | COMPLETO_COM_DEFEITO_HISTÓRICO |
| 40 | Chegada | COMPLETO |
| 50 | Atividade / visita | COMPLETO |
| 60 | Embarque de retorno | COMPLETO |
| 70 | Deslocamento de retorno | COMPLETO_COM_DEFEITO_HISTÓRICO |
| 80 | Desembarque / encerramento | COMPLETO |

## 5. Sequência real de eventos por etapa

- **Seq 10 — Encontro / concentração:** `STEP_STARTED → STEP_COMPLETED`; 8 fatos; readiness final 5/5.
- **Seq 20 — Embarque de ida:** `STEP_STARTED → BOARDING_STARTED → BOARDING_COMPLETED → DEPARTURE_AUTHORIZED → DEPARTED → STEP_COMPLETED`; 5 `BOARDED`.
- **Seq 30 — Deslocamento de ida:** `STEP_STARTED → STEP_COMPLETED`; nenhum `ARRIVED`.
- **Seq 40 — Chegada:** `STEP_STARTED → ARRIVED → STEP_COMPLETED`.
- **Seq 50 — Atividade / visita:** `STEP_STARTED → STEP_COMPLETED`; 5 `PRESENT_AT_MEETING_POINT`.
- **Seq 60 — Embarque de retorno:** `STEP_STARTED → BOARDING_STARTED → BOARDING_COMPLETED → STEP_COMPLETED`; 5 `BOARDED`.
- **Seq 70 — Deslocamento de retorno:** `EXPECTED_TIME_CHANGED → STEP_STARTED → STEP_COMPLETED`; nenhum `ARRIVED`.
- **Seq 80 — Desembarque / encerramento:** `STEP_STARTED → ARRIVED → DISEMBARKATION_COMPLETED → STEP_COMPLETED`; 5 `DISEMBARKED`; readiness final 5/5.

## 6. Distribuição dos 28 fatos de presença

| Seq | Tipo | Quantidade |
| --- | --- | --- |
| 10 | Confirmação / presença no ponto de encontro (inclui 1 retração legítima) | 8 |
| 20 | `BOARDED` | 5 |
| 50 | `PRESENT_AT_MEETING_POINT` | 5 |
| 60 | `BOARDED` | 5 |
| 80 | `DISEMBARKED` | 5 |
| **Total** | | **28** |

Crew (2 integrantes) permanece corretamente fora da avaliação de readiness de passageiros.

## 7. Integridade append-only

- Nenhum fato de presença editado ou excluído.
- 1 retração legítima na seq 10, registrada como novo fato (append-only).
- 0 duplicatas por participação/etapa.
- 0 escritas após `operation.completed`.
- Auditoria de conclusão única: `e0130886-61fd-482b-9a0b-ae334b428ae0`.

## 8. Defeitos encontrados

### DEF-PILOT-021 — Feedback genérico de toast em ações de ausência
- Impacto: UX / observabilidade.
- Integridade de dados não afetada.
- **Status: FECHADO.**

### DEF-PILOT-023 — `STEP_COMPLETED` permitido sem `ARRIVED`
- Ocorrências históricas: seq 30 e seq 70.
- Backend corrigido em `public.complete_journey_step`; UI passou a espelhar a invariante.
- Correção validada em runtime na seq 80.
- **Código atual: CORRIGIDO. Dados históricos: DEFEITO PERMANENTE ACEITO.**
- Não inserir `ARRIVED` retroativamente.

### DEF-PILOT-024 — Seq 80 provisionada com `presence_requirement=none`
- Reparada via `public.update_journey_step` para `accounted` / `participants`.
- Readiness restaurado para 5 participantes.
- Default do domínio para `disembarkation` já é `accounted`.
- **Status: FECHADO NA INSTÂNCIA.** Pendência: impedir overrides explícitos incoerentes em templates.

### DEF-PILOT-025 — UI não oferecia `ARRIVED` em etapas de desembarque
- `record_arrival` disponibilizado; bloqueios de desembarque/conclusão implementados.
- Validado com `ARRIVED` real e cinco `DISEMBARKED`.
- **Status: FECHADO.**

## 9. Correções implementadas

1. Invariante `ARRIVED` obrigatória em `public.complete_journey_step` para etapas de movimento, retorno e desembarque.
2. UI de runtime ao vivo espelhando a invariante (bloqueio de conclusão e de registro de desembarque sem `ARRIVED`).
3. `record_arrival` habilitado em etapas de desembarque.
4. Feedback de toast específico nas ações de ausência.
5. Reparo pontual da seq 80 para `presence_requirement=accounted`.

## 10. Defeitos históricos aceitos

- Seq 30 e seq 70 concluídas sem `ARRIVED`. Preservadas como histórico imutável.
- Nenhuma correção retroativa autorizada nesses dados.

## 11. Pendências pós-piloto

1. Preservar seqs 30 e 70 sem `ARRIVED` como histórico imutável.
2. Revisar templates que enviam `presence_requirement` explícito.
3. Validar visualmente o portal `/my` com sessão real de viajante.
4. Decidir se etapas `movement`/`return` no City Tour devem usar `none` ou `boarded`.
5. Manter o teste do portal `/my` como pendência explícita — não declarar aprovado visualmente.

## 12. Portal /my

- Validação **estrutural** concluída (`get_my_journey`, `get_my_operation_overview`).
- Operação concluída permanece acessível em modo histórico / read-only.
- Somente conteúdo `traveler_facing` e `traveler_visible` é projetado.
- Fatos individuais `DISEMBARKED` não são exibidos repetidamente.
- Nenhum roster de crew ou de outros participantes é projetado.
- **Validação visual com sessão real permanece PENDENTE.**

## 13. Golden Pilot como controle

`CITYTO-20260815` permaneceu, durante todo o PILOT-02:

- status `completed`;
- 22 journey_events;
- 2 fatos de presença;
- sem alteração ou contaminação cruzada.

## 14. Decisão formal de fechamento

- **LIVE_TEST_03: ENCERRADO.**
- **PILOT-02: CONCLUÍDO** — resultado `COMPLETED_WITH_HISTORICAL_DEFECTS`.
- Nenhum novo piloto, wave ou gate iniciado.
- O próximo trabalho só pode começar após definição explícita do próximo gate.
