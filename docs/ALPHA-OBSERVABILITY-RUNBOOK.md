# COBS OS — ALPHA PILOT READINESS · M4

## MINIMUM PRODUCTION OBSERVABILITY RUNBOOK

Escopo: observabilidade **mínima** para operar com segurança o primeiro piloto real BSBTUR.
Não é um sistema de APM. Não substitui `public.audit_events` (evidência de negócio imutável).
Este documento responde a cinco perguntas: **detectar, classificar, correlacionar, investigar, escalar.**

Regra constitucional deste layer: **nenhum sinal pode conter PII, segredos, tokens ou corpos de mensagem.**

---

## 1. Inventário real de sinais (verificado, não presumido)

| #   | Sinal                                                         | Onde vive                  | Retenção                   | Contém PII?                                    | Consultável por            |
| --- | ------------------------------------------------------------- | -------------------------- | -------------------------- | ---------------------------------------------- | -------------------------- |
| S1  | `public.audit_events`                                         | Banco (tenant-scoped, RLS) | permanente                 | não (ids + metadata controlada)                | operador (UI/SQL), suporte |
| S2  | Fatos de domínio append-only (`*_events` W04–W09)             | Banco                      | permanente                 | mínimo, tenant-scoped                          | operador                   |
| S3  | `postgres_logs` (SQLSTATE, severidade, `user_name`)           | Analytics do backend       | janela curta da plataforma | mensagens SQL cruas — **tratar como sensível** | suporte                    |
| S4  | `auth_logs` (path, status, error_code)                        | Analytics do backend       | janela curta               | não expõe e-mail no evento de falha            | suporte                    |
| S5  | `edge_logs` (método, path, status HTTP do API gateway)        | Analytics do backend       | janela curta               | não (sem corpo)                                | suporte                    |
| S6  | Logs de worker/SSR (`console.error`, wrapper `src/server.ts`) | Plataforma (≈1h)           | ~1 hora                    | somente o que o app emitir                     | suporte                    |
| S7  | **`[COBS_OBS]` envelope estruturado** (novo em M4)            | S6 + console do navegador  | ~1h / sessão               | **não, por construção**                        | suporte                    |
| S8  | **`GET /api/public/health`** (novo em M4)                     | Endpoint público           | instantâneo                | não                                            | qualquer um                |
| S9  | Toast de erro humanizado (`feedback.error` + `humanizeError`) | UI                         | efêmero                    | não                                            | operador em campo          |

Verificação executada em 2026-08-11 UTC contra o backend real (drills da seção 6).

---

## 2. O que M4 acrescentou (mínimo, aditivo, sem tocar W01–W10)

### 2.1 `src/lib/observability.ts` — envelope sanitizado único

Campos: `timestamp, environment, severity, domain, action, error_code, correlation_id,
tenant_id?, operation_id?, actor_profile_id?, source, recoverable, sanitized_context`.

Redação obrigatória aplicada a **toda** string emitida: senha/token/authorization em pares chave-valor,
JWT, e-mail, hashes hex ≥40, UUID (substituído por `[uuid]`), qualquer token opaco ≥32 chars,
truncado em 300 caracteres. Testado com uma string contendo senha, JWT, e-mail, hash de token,
UUID e chave publishable — **todos redigidos**.

`correlation_id` é aleatório por sessão (`cobs-<uuid>`), não identifica pessoa, e nunca é persistido.

### 2.2 Choke point único de falha de backend

`src/router.tsx` passou a criar o `QueryClient` com `QueryCache.onError` e `MutationCache.onError`.
**Toda** leitura e **todo** comando do W02–W10 atravessa um desses dois caminhos, então nenhuma
falha de RPC escapa sem envelope. `action` é derivado da query/mutation key, nunca do payload.

### 2.3 Boundary raiz instrumentado

`src/routes/__root.tsx` emite `boundary:root` além do reporte existente.

### 2.4 Liveness probe anônimo

`GET /api/public/health` → `{"status":"ok|degraded","checks":{"app","auth","data_api"},"timestamp"}`,
HTTP 200 quando saudável, **503 quando degradado** (permite monitor externo sem parser).
Não expõe schema, contagens, topologia, variáveis de ambiente ou texto de erro interno.

---

## 3. Classificação de severidade (alinhada ao M3)

| SEV   | Significado operacional                           | Exemplo                                                                 | Resposta                 |
| ----- | ------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------ |
| SEV-1 | Operação viva não pode ser conduzida              | `data_api: down`, falha de rede em `/live` ou `/mobility`, health 503   | imediata; runbook M3     |
| SEV-2 | Função crítica degradada / autorização inesperada | `forbidden`/`unauthorized` recorrente, erro não tratado fora do runtime | mesma janela operacional |
| SEV-3 | Falha isolada, recuperável pelo usuário           | `invalid_state`, `not_found`, conflito de idempotência                  | próximo dia útil         |
| SEV-4 | Ruído/cosmético                                   | erro de UI sem perda de função                                          | backlog                  |

Mapeamento é código, não julgamento: `severityOf(error_code, domain)`.

---

## 4. Correlação — o que dá e o que não dá

Existe hoje: `correlation_id` por sessão no envelope `[COBS_OBS]`; `audit_events.correlation_id`
(coluna existe no schema); ids de tenant/operação no envelope quando presentes na rota; `edge_logs`
por path/status; timestamp UTC comum a todos os sinais.

**Investigação padrão (funciona hoje):** achar o horário e a operação no relato do operador →
`[COBS_OBS]` nos logs (`grep COBS_OBS`) para `error_code` + `severity` → `edge_logs`/`auth_logs`
pela mesma janela → `audit_events` filtrado por `tenant_id`/`subject_id` para reconstruir o que
de fato mudou → runbook M3 para o remédio.

**Não existe hoje (registrado como lacuna, não simulado):** o cliente não propaga `correlation_id`
para dentro dos comandos `SECURITY DEFINER`, logo `audit_events.correlation_id` permanece nulo e o
join log↔auditoria é **temporal, não determinístico**. Fechar isso exigiria mudar a assinatura de
229 funções congeladas — fora do escopo M4.

---

## 5. Blind spots conhecidos (declarados, não mascarados)

| ID         | Lacuna                                                                               | Sev | Por que é aceitável no piloto                                                                       | Remédio futuro                                      |
| ---------- | ------------------------------------------------------------------------------------ | --- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| OBS-M4-001 | Erros de cliente não são **persistidos**; vivem em log de plataforma (~1h) e console | P2  | piloto é assistido, escala pequena, o operador reporta em minutos                                   | sink de erro dedicado                               |
| OBS-M4-002 | `audit_events.correlation_id` não é preenchido pelo cliente                          | P2  | correlação temporal é suficiente na escala do piloto                                                | emenda de assinatura pós-piloto                     |
| OBS-M4-003 | Negação por RLS numa leitura filtrada retorna 200 + conjunto vazio: **é silenciosa** | P2  | isolamento continua garantido (verificado em W01–W10); é lacuna de _visibilidade_, não de segurança | contadores de negação server-side                   |
| OBS-M4-004 | Não há canal automático de alerta (e-mail/push/paging)                               | P2  | piloto tem operador humano presente; health é polido manualmente                                    | monitor externo apontando para `/api/public/health` |
| OBS-M4-005 | Logs de worker retêm ~1h; `postgres/auth/edge logs` têm janela curta da plataforma   | P3  | incidentes de piloto são detectados dentro da janela                                                | export periódico                                    |
| OBS-M4-006 | Sem métrica de latência/volume (não é APM)                                           | P3  | não é requisito de piloto                                                                           | fase pós-piloto                                     |
| OBS-M4-007 | `postgres_logs` contém texto SQL cru (potencialmente sensível)                       | P3  | acessível somente a suporte, não ao tenant                                                          | manter restrito                                     |

Nenhuma lacuna **P0** ou **P1** aberta.

---

## 6. Drills executados (falhas reais, backend real, zero escrita)

| #   | Drill                                                            | Resultado                                                           | Sinal produzido                             |
| --- | ---------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------- |
| D1  | RPC de comando privilegiado como anônimo (`reinstate_operation`) | HTTP 401 `42501 permission denied for function`                     | `edge_logs`                                 |
| D2  | Leitura anônima de `operations`                                  | HTTP 401 `42501 permission denied for table`                        | `edge_logs` (401 GET `/rest/v1/operations`) |
| D3  | Bearer inválido                                                  | HTTP 401 `PGRST301 JWT cryptographic operation failed`              | `edge_logs`                                 |
| D4  | Login com credenciais inválidas                                  | HTTP 400 `invalid_credentials`                                      | `auth_logs` (**sem e-mail no evento**)      |
| D5  | Erro de banco (relação inexistente)                              | `42P01`                                                             | `postgres_logs` com SQLSTATE + severidade   |
| D6  | Frontend publicado                                               | HTTP 200                                                            | —                                           |
| D7  | `GET /api/public/health`                                         | `{"status":"ok","checks":{"app":"up","auth":"up","data_api":"up"}}` | S8                                          |
| D8  | Envelope com senha+JWT+e-mail+hash+UUID+chave                    | tudo redigido; `[COBS_OBS]` bem-formado                             | S7                                          |

Nenhum dado real BSBTUR foi lido, escrito ou alterado. Nenhuma tabela, função, política ou enum mudou.

---

## 7. Rotina mínima de operação do piloto

- **Antes de cada operação real:** `curl -s https://cobs-os-core.lovable.app/api/public/health` → exige `"status":"ok"`.
- **Durante a operação:** o operador reporta qualquer toast de erro com hora e tela; suporte busca `COBS_OBS` na janela.
- **Depois da operação:** revisar `audit_events` do tenant no período; qualquer SEV-1/SEV-2 vira entrada no runbook M3.
- **Escalada:** SEV-1 → runbook M3 imediatamente; SEV-2 → mesma janela; SEV-3 → registro; SEV-4 → backlog.

---

## 8. Veredito

- M4_MINIMUM_OBSERVABILITY: **PASS**
- P0_GAPS: **0** · P1_GAPS: **0** · P2_GAPS: **4** · P3_GAPS: **3**
- PII_OR_SECRET_LEAK_IN_ANY_SIGNAL: **NO** (verificado em D8 e por inspeção de D1–D5)
- REAL_BSBTUR_DATA_CHANGED: **NO** · W01_W10_ARCHITECTURE_CHANGED: **NO** (nenhuma migração aplicada)
- ALERTING: **manual/polled** — declarado, não simulado (OBS-M4-004)
- READY_FOR_M5: **YES**
