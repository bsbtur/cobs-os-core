# COBS OS — M3.1 P1 RECOVERY AMENDMENTS (G-02 · G-03)

**Data:** 2026-08-11 UTC · **Escopo:** duas emendas cirúrgicas à arquitetura congelada W01–W10
**Autorização:** M3.1 (apenas G-02 e G-03). Nenhuma outra lacuna de recuperação foi implementada.
**Resultado:** `M3_1_P1_RECOVERY_AMENDMENTS: PASS`

---

## 1. Emenda A — G-02 · Reinstatement de Operation (W02)

**Problema:** uma Operation cancelada por engano era permanentemente terminal; `set_operation_status`
recusa qualquer transição a partir de `cancelled`/`completed`.

**Comando entregue:** `public.reinstate_operation(_operation_id uuid, _reason text, _idempotency_key uuid) → jsonb`

| Propriedade | Implementação |
| --- | --- |
| Transição | **exclusivamente** `cancelled → planning` |
| Autor | **Owner apenas**, identidade derivada de `auth.uid()` |
| Motivo | obrigatório, validado (`assert_generic_note`, sem segredos/PII) |
| Idempotência | `idempotency_keys` com escopo de ação; replay devolve o mesmo payload |
| Auditoria | `operation.reinstated` com `from_status`, `to_status`, `reason`, `original_cancelled_at`, `original_cancellation_reason` |
| DML direto | continua negado (RLS SELECT-only + guards W02) |
| Segurança | `SECURITY DEFINER`, `search_path` fixo, `EXECUTE` revogado de `PUBLIC`/`anon`, concedido a `authenticated` |

**Nota de conformidade:** a constraint congelada `operations_cancelled_consistency` exige
`cancelled_at IS NULL` fora de `cancelled`. O comando limpa `cancelled_at`/`cancellation_reason`
na linha mutável **e preserva integralmente a evidência original no `audit_events`**, respeitando
a Constituição append-only (nenhum fato histórico foi reescrito ou apagado).
`set_operation_status` permanece intocado: `completed` continua terminal e `cancelled → active`
continua impossível.

---

## 2. Emenda B — G-03 · Retração append-only de fato de presença (W04)

**Problema:** um `BOARDED` registrado para a pessoa errada não podia ser retratado, e o headcount
derivado — número relevante para segurança na autorização de partida — continuava contando o fato errado.

**Entregue:**
1. Valor de enum `presence_fact.PRESENCE_RETRACTED`.
2. Coluna `participant_presence_events.retracts_presence_event_id` (+ constraint de forma e índice
   único parcial `presence_one_effective_retraction`).
3. Coluna `participant_presence_events.supersedes_presence_event_id`, que permite **re-registrar o
   fato correto** após uma retração sem violar a regra "um fato vivo por pessoa/etapa/tipo".
4. Comando `public.retract_presence_fact(_presence_fact_id uuid, _reason text, _idempotency_key uuid) → jsonb`.
5. `w04_step_readiness` (e a autorização de partida que dela deriva) passa a ignorar fatos retratados.

| Propriedade | Implementação |
| --- | --- |
| Autor | **Owner/Admin apenas**, identidade de `auth.uid()` |
| Motivo | obrigatório e validado |
| Modelo | **append-only**: a retração é um novo fato que referencia o original |
| Imutabilidade | o fato original permanece intacto e visível no histórico |
| Retração de retração | proibida |
| Dupla retração | o mesmo fato não pode ser retratado duas vezes |
| Mint indevido | `record_presence_fact` recusa `PRESENCE_RETRACTED` |
| Derivação | headcount efetivo = fatos não retratados; partida bloqueia/libera de acordo |
| Correção | após retratar, o fato correto pode ser re-registrado (`supersedes_*`), com dedupe preservado |
| Auditoria | `presence.retracted` com `retraction_event_id`, `retracted_presence_fact`, `reason` |

---

## 3. Gate adversarial

Ambiente: dois tenants QA isolados (`qam31-alpha`, `qam31-bravo`), 5 identidades QA
(owner/admin/agent/traveler + owner cross-tenant). Nenhum dado real BSBTUR foi tocado.

| Suite | Resultado |
| --- | --- |
| G-02 | **27 / 27 PASS** |
| G-03 | **38 / 38 PASS** (32 do ciclo principal + 6 do segundo ciclo de correção) |
| **Total** | **65 / 65 PASS** |

Cobertura: anônimo, traveler sem membership, operations_agent, admin (negado em G-02),
owner cross-tenant (negado genericamente, sem vazar existência), id inexistente, motivo em branco,
motivo com conteúdo sensível, chave de idempotência ausente, replay com a mesma chave,
reuso cross-command da mesma chave, estados inválidos de origem, DML direto (INSERT/UPDATE/DELETE),
leitura cross-tenant, evidência de auditoria sem segredos/PII, e — em G-03 — a derivação do
headcount efetivo e o bloqueio/liberação real de `authorize_departure`.

### Defeitos encontrados e corrigidos durante o gate
- **DEF-M31-001** — `reinstate_operation` colidia com `operations_cancelled_consistency`. Corrigido
  (limpeza da linha mutável + preservação da evidência em auditoria).
- **DEF-M31-002** — o índice `presence_fact_once` impedia re-registrar o fato correto após a
  retração. Corrigido com `supersedes_presence_event_id`.
- **DEF-M31-003** — o mesmo índice impedia um segundo ciclo de retração. Corrigido tornando o
  índice parcial (exclui `PRESENCE_RETRACTED`, cuja unicidade já é garantida pelo índice dedicado).

---

## 4. Relatório de drift estrutural

| Métrica | Antes (M3) | Depois (M3.1) | Δ |
| --- | --- | --- | --- |
| Tabelas públicas | 50 | 50 | 0 |
| Funções públicas | 227 | **229** | +2 (`reinstate_operation`, `retract_presence_fact`) |
| Helpers `app_private` | 98 | 98 | 0 |
| Enums públicos | 48 | 48 | 0 (+1 valor em `presence_fact`) |
| Políticas RLS | 72 | 72 | 0 |
| Triggers | 103 | 103 | 0 |
| Tabelas sem RLS | 0 | **0** | 0 |
| Colunas novas | — | `retracts_presence_event_id`, `supersedes_presence_event_id` | +2 |

Ambos os comandos: `SECURITY DEFINER`, `search_path` fixo, `anon` sem EXECUTE, `authenticated` com EXECUTE.

---

## 5. Segurança dos dados reais

- Verificação executada exclusivamente em tenants QA.
- Após o gate: tenants QA e as 5 contas QA removidos; **0 linhas residuais**.
- Estado final de produção: **1 tenant (BSBTUR)**, 1 profile, 1 person, 1 membership owner,
  nomes "RAFAEL LIMA" preservados, 0 linhas em todos os domínios W02–W10.
- Nenhum backdoor de manutenção permanece; nenhum trigger ficou desabilitado.

---

## 6. Resultado

- `G_02_OPERATION_REINSTATEMENT`: **PASS**
- `G_03_PRESENCE_RETRACTION`: **PASS**
- `APPEND_ONLY_CONSTITUTION_PRESERVED`: **YES**
- `REAL_TENANT_UNTOUCHED`: **YES**
- `QA_RESIDUE`: **0**
- `M3_OPERATIONAL_RECOVERY_RUNBOOK`: **PASS** (elevado de CONDITIONAL PASS)
- `READY_FOR_M4_OBSERVABILITY`: **YES**

Lacunas remanescentes (não autorizadas nesta emenda): G-01, G-04, G-05, G-06, G-07 — todas P2/P3.
