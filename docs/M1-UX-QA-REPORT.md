# COBS OS — M1: CROSS-WORKFLOW AUTHENTICATED UX QA (REPORT)

Status: **CONDITIONAL PASS** · Data QA ainda **NÃO** limpa (aguardando autorização de cleanup)
Escopo: Golden Path autenticado W01→W10 contra o backend real, 3 papéis, 3 larguras.
Nada foi redesenhado; nenhuma funcionalidade nova; W11 permanece fechado.

## 1. Resultado por cenário (API real, sessões autenticadas)

| Cenário                                                       | Cobertura                                                     | Resultado  |
| ------------------------------------------------------------- | ------------------------------------------------------------- | ---------- |
| S1 — Identidade e roster (W01–W03)                            | bootstrap de tenant, convites, papéis, pessoas, participações | PASS 17/17 |
| S2 — Planejamento (W04–W08)                                   | jornada, mobilidade, hospedagem, evento, comunicação          | PASS 40/40 |
| S3 — Comércio (W09)                                           | catálogo, pedido, reserva, pagamento, estorno, conclusão      | PASS 20/20 |
| S5 — Golden Path completo (W02→W10, passe único reproduzível) | operação nova do zero até `completed` + portal do viajante    | PASS 80/80 |

O Golden Path (`/tmp/m1/s5_goldenpath.py`) roda em **uma única passagem reproduzível** sobre uma
operação nova a cada execução — requisito imposto pela natureza append-only do runtime.

## 2. Invariantes reprovadas em tentativa adversarial (todas resistiram)

- Baseline `planned_*` não gravável por DML direta (W04, W05, W06).
- Mensagem publicada imutável por DML direta (W08).
- Fatos financeiros não graváveis por DML direta; nem `service_role` altera comércio fora dos comandos (W09).
- Viajante não escreve fato de runtime; não lê nenhuma tabela de domínio diretamente (W10).
- Viajante vê apenas o próprio assento e o próprio quarto; nenhuma identidade de motorista/veículo vaza.
- Revogação de acesso tem efeito imediato; reinstatement restaura.
- Token de convite: uso único, não reutilizável por outra identidade, replay da mesma identidade é idempotente.
- Evento não conclui com sessões abertas (regra de reconciliação W07).
- Assento não muta em perna terminal (W05).
- Superlotação de quarto recusada (W06).
- `authorize_departure` é decisão humana privilegiada: operations_agent é recusado, owner autoriza.

## 3. Browser QA — dívida W06–W10 encerrada

84 rotas carregadas com sessão real (owner 17, agent 4, traveler 7 × 390/430/desktop).
Sem erro de console, sem página vazia, sem redirecionamento indevido, portal do viajante íntegro.

Capturas: `/tmp/browser/m1/*.png` · Relatório: `/tmp/browser/m1/report.json`

### Defeitos abertos (P2 — cosméticos, só em 390px)

| ID         | Rota                   | Sintoma                                         |
| ---------- | ---------------------- | ----------------------------------------------- |
| DEF-M1-001 | `/operations`          | overflow horizontal de 9px                      |
| DEF-M1-002 | `/operations/:id/live` | overflow horizontal de 21px (também para agent) |
| DEF-M1-003 | `/commerce`            | overflow horizontal de 16px                     |

Nenhum ocorre em 430px nem no desktop.

## 4. Observações de arquitetura (não são defeitos)

- **OBS-M1-001** — `grant_participant_access` exige pessoa já vinculada a um login. Para viajante
  novo o caminho real é `invite_participant_access` → claim. O portal só existe após o claim.
- **OBS-M1-002** — Comércio (confirmar, pagar, concluir) é owner/admin. `operations_agent` cria
  rascunho de pedido mas não movimenta dinheiro. Membro comum não lê o catálogo comercial.
- **OBS-M1-003** — W01–W03 (pessoas, membros, experiências/ofertas) ainda gravam por DML direta sob
  RLS, não por comandos. Divergência com W04–W10; permanece dívida P2 registrada no ALPHA review.
- **OBS-M1-004** — Superação de pagamento é aceita e derivada explicitamente (OBS-W09-001 confirmada
  em execução real); `reverse_payment` zera a superação sem apagar fato.

## 5. Pendências antes do fechamento de M1

1. Corrigir DEF-M1-001/002/003 (overflow 390px).
2. Executar o cleanup das fixtures QA (`ALPHAQA`, 5 identidades de teste, operações Golden) — ainda
   **não** executado, conforme instrução.
