# COBS OS — W01–W10 ALPHA MILESTONE REVIEW & PILOT READINESS GATE

Milestone: **COBS OS ALPHA CORE v0.1**
Data: 2026-08-10
Escopo: revisão transversal W01–W10. Nenhum novo domínio de negócio. W11 NÃO aberto.

---

## 1. Inventário verificado (estado vivo do backend)

| Métrica | Valor |
| --- | --- |
| Tabelas públicas | 50 |
| Tabelas sem RLS | 0 |
| Políticas RLS | 72 |
| Funções públicas | 226 (202 SECURITY DEFINER) |
| Helpers privados (`app_private`) | 98 |
| Enums de domínio | 48 |
| Tabelas em Realtime | 12 |
| SECURITY DEFINER sem `search_path` fixo | 0 |
| Grants para `anon` em `public` | 0 |
| Grants de escrita para `authenticated` | 0 (SELECT-only) |
| Triggers desabilitados | 0 |
| Tenants / usuários auth | 0 / 0 (base limpa) |

Realtime seletivo (12): journey_steps, journey_events, participant_presence_events, playbook_executions, transport_legs, transport_events, hospitality_rooms, hospitality_events, event_sessions, event_runtime_events, communication_events, financial_facts.

Superfície frontend: 37 rotas (`/operations/*`, `/experiences`, `/people`, `/team`, `/inbox`, `/commerce/*`, `/settings/*`, portal `/my/*`, `/auth`, `/onboarding`, `/invite/$token`).

## 2. Camadas congeladas

```
PLATFORM      W01 Identity · Authorization · Tenancy
OPERATIONS    W02 Experience · W03 People · W04 Journey · W05 Mobility
              W06 Hospitality · W07 Events · W08 Communication
COMMERCE      W09 Catalog · Pricing · Orders · Capacity · Financial Facts
PARTICIPANT   W10 Participant Access · Traveler Portal
```

Invariantes transversais confirmadas: mutação exclusivamente via SECURITY DEFINER; RLS tenant-isolada em todas as tabelas; fatos append-only; modelo temporal PLANNED (congelado) / EXPECTED (previsão) / ACTUAL (fato); autorização apenas por membership W01; acesso de participante operation-scoped e revogável.

## 3. Correção de registro (DEF-W10-003)

Os gates W01–W09 afirmaram "least-privilege ACL" com base apenas em RLS. Verificação do freeze W10 mostrou que os grants default do PostgREST ainda concediam ALL a `anon`/`authenticated` nas tabelas novas. Corrigido em W10 e agora auditado em **todo** o schema público: `anon` = 0 grants, `authenticated` = SELECT-only, 0 grants de escrita. A afirmação anterior fica retificada: o bloqueio era efetivo por RLS, mas a camada ACL não estava no padrão.

## 4. Lacunas reais para o primeiro piloto BSBTUR

Bloqueantes (precisam existir antes de operação real):

- **B1 — QA autenticado cross-workflow.** As dívidas A4/A5 (W06/W07) e a UX transversal owner → operations_agent → participant nunca foram validadas em sessão real de ponta a ponta. É a maior lacuna.
- **B2 — Bootstrap de tenant real.** Base está vazia; não existe caminho testado de criação do tenant BSBTUR com owner real, sem fixture.
- **B3 — Procedimento de recuperação operacional.** Não há runbook para: grant revogado por engano, participação cancelada indevidamente, pagamento registrado errado, leg cancelada por engano. Vários fatos são append-only por design — a correção precisa de procedimento documentado, não de DELETE.
- **B4 — Observabilidade mínima.** Hoje não há visibilidade de erro de RPC, tentativa de autorização negada ou falha de claim. Sem isso, o piloto não gera evidência.
- **B5 — Backup / restore verificado.** Ponto de restauração e teste de restore antes de dados reais.

Não bloqueantes (podem ficar para pós-piloto):

- Ramo de convite expirado do W10 (untestable sem backdating) — revisão de código PASS.
- `list_participant_access_grants` retorna vazio em vez de "denied" para não-operador (OBS-W10-002) — privacidade preservada.
- Incidentes de mobilidade sem taxonomia (W05).
- i18n: cobertura pt-BR completa; en-US/es-ES precisam de varredura de strings novas.

## 5. Métricas propostas (sem dados sensíveis)

RPC error rate · p95 de latência das projeções · tentativas de autorização negadas · falhas de claim de participante · usuários ativos no portal · mensagens publicadas/lidas · reservas de capacidade · pedidos e saldo em aberto · falhas de comando de runtime. Agregados por tenant e operação, sem PII.

## 6. Recomendação

Caminho **C → B**: uma rodada transversal curta de release engineering, depois operação real.

```
M0  Alpha Milestone Review              ← este documento
M1  Cross-Workflow Authenticated UX QA  (B1)
M2  Real Tenant Bootstrap — BSBTUR      (B2)
M3  Pilot Operation (experiência pequena)
M4  Operational Dry Run (T-30 → pós-operação)
M5  Controlled Pilot
M6  Post-Pilot Architecture Review → decide W11 com evidência
```

Stack inalterada: React/TanStack Start, PostgreSQL, RLS, SECURITY DEFINER, Realtime seletivo, append-only, TypeScript, mesmo tenant model. Nenhuma expansão de infraestrutura antes de tráfego real.

## 7. Veredito do Gate

- ALPHA CORE ARCHITECTURE FROZEN: **YES**
- SECURITY / ACL BASELINE: **PASS** (0 grants anon, authenticated SELECT-only, 0 tabelas sem RLS)
- DATABASE CLEAN: **YES**
- READY FOR REAL PILOT DATA: **NO** — bloqueado por B1–B5
- READY FOR W11: **NO** — por decisão, não por impedimento técnico

Próximo comando recomendado: **COBS OS — ALPHA PILOT READINESS (M1: CROSS-WORKFLOW AUTHENTICATED UX QA)**.

---

## 8. M3 — Operational Recovery Runbook (2026-08-11 UTC)

Entrega: **`docs/ALPHA-OPERATIONAL-RECOVERY-RUNBOOK.md`** — propósito, escopo, princípios do operador, taxonomia de severidade (SEV-1..SEV-4), árvore de decisão de incidente, matriz de recuperação por domínio (11 domínios), 22 procedimentos de cenário, regras de escalonamento, ações proibidas, requisitos de auditoria/evidência, checklist de emergência e registro de lacunas.

Milestone somente de documentação e verificação read-only: nenhum schema, função, policy, grant, trigger ou linha de produção foi criado, alterado ou removido. O tenant real BSBTUR, o Profile, a Person e a Membership do Owner permanecem intactos. Nenhuma Experiência, Offering ou Operation foi criada.

**Lacunas de recuperação:** P0 = 0 · P1 = 2 · P2 = 4 · P3 = 1.

- **G-02 (P1, W02)** — Operação cancelada por engano é irreversível: `set_operation_status` recusa qualquer transição a partir de `cancelled`/`completed`. Remédio mínimo: comando `reinstate_operation` restrito ao Owner, apenas `cancelled → planning`, com motivo obrigatório e auditoria. **Exige emenda autorizada do W02.**
- **G-03 (P1, W04)** — Fato de presença registrado errado não pode ser retratado; o headcount derivado continua contando um `BOARDED` incorreto, número relevante para segurança na autorização de partida. Remédio mínimo: valor de enum `PRESENCE_RETRACTED` + comando `retract_presence_fact`, append-only, motivo obrigatório, Owner/Admin. **Exige emenda autorizada do W04.**

Ambas foram **reportadas, não implementadas**, conforme o modo estrito. B3 do Alpha Milestone Review passa de "ausente" para **documentado, com duas lacunas P1 registradas**.

- M3_OPERATIONAL_RECOVERY_RUNBOOK: **CONDITIONAL PASS** (PASS bloqueado apenas por G-02 e G-03)
- REAL_BSBTUR_DATA_CHANGED: **NO** · W01_W10_ARCHITECTURE_CHANGED: **NO**
- READY_FOR_M4_OBSERVABILITY: **YES** (M4 pode correr em paralelo; a primeira Operation real do piloto não deve começar antes da decisão sobre G-02/G-03)

## 9. M3.1 — Emendas P1 de recuperação (2026-08-11 UTC)

Entrega: **`docs/M3-P1-RECOVERY-AMENDMENTS.md`**. Duas emendas cirúrgicas autorizadas e implementadas:

- **G-02 — CLOSED**: `reinstate_operation(_operation_id, _reason, _idempotency_key)` — Owner-only,
  `cancelled → planning` apenas, motivo obrigatório, idempotente, auditado com a evidência original
  de cancelamento. `completed` permanece terminal.
- **G-03 — CLOSED**: `retract_presence_fact(_presence_fact_id, _reason, _idempotency_key)` — Owner/Admin,
  retração **append-only** que referencia o fato original (que permanece imutável), com re-registro do
  fato correto suportado. `w04_step_readiness` e `authorize_departure` passam a usar o headcount efetivo.

Gate adversarial: **65/65 PASS** (G-02 27/27, G-03 38/38), em tenants QA isolados, com resíduo zero após limpeza.
Drift estrutural: tabelas 50 → 50, funções públicas 227 → **229**, helpers 98 → 98, enums 48 → 48
(+1 valor `PRESENCE_RETRACTED`), políticas RLS 72 → 72, triggers 103 → 103, tabelas sem RLS **0**.
Duas colunas novas em `participant_presence_events`: `retracts_presence_event_id`, `supersedes_presence_event_id`.

- M3_1_P1_RECOVERY_AMENDMENTS: **PASS** · M3_OPERATIONAL_RECOVERY_RUNBOOK: **PASS** (elevado)
- P1_RECOVERY_GAPS: **0** · REAL_BSBTUR_DATA_CHANGED: **NO** · QA_RESIDUE: **0**
- READY_FOR_M4_OBSERVABILITY: **YES** · W11 e a primeira Operation real do piloto **não** foram iniciados

