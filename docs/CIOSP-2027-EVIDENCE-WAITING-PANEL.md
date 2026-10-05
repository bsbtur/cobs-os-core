# CIOSP 2027 — Painel de Evidências Aguardadas

> **PAINEL OPERACIONAL / NÃO CONTRATUAL**
>
> Este painel não cria fornecedor, cotação, contrato, pagamento, revisão jurídica ou obrigação comercial.
> Ele existe para controlar respostas externas que ainda precisam virar evidência canônica no COBS.
>
> Regra: **nenhum `operation_quote` deve ser criado antes de existir proposta comercial real e identificável do fornecedor.**

## Operação canônica

- Código: `CIOSP-SP-2027-COMMERCIAL`
- Operation ID: `3d0b3b04-f91e-4305-89de-89af18e3e1fa`
- Evento: 44º CIOSP — Congresso Internacional de Odontologia de São Paulo
- Viagem: 25 a 31/01/2027
- Público comercial: 30 participantes
- Equipe operacional: até 7 pessoas
- Total operacional de referência: 37 pessoas

## Ordem canônica ao receber uma resposta

1. Confirmar que a resposta é comercialmente utilizável e corresponde à operação atual.
2. Identificar o fornecedor real e validar razão social, CNPJ e endereço.
3. Registrar ou atualizar o perfil jurídico do fornecedor no COBS.
4. Criar `operation_quote` somente com valor, escopo e referência reais.
5. Manter como `quoted` enquanto não houver decisão comercial.
6. Selecionar somente quando a BSBTUR decidir usar aquela proposta.
7. Marcar como `contracted` somente após existir contratação real + `contract_reference` + `contracted_at`.
8. Anexar/registrar documentos jurídicos/comerciais reais exigidos.
9. Reexecutar Contract Readiness.
10. Somente depois seguir para geração de contrato/Clicksign quando todos os demais gates também estiverem verdes.

---

## Painel atual

### 1. Hospedagem — B&B HOTEL São Paulo Luz - Centro

**Status:** AGUARDANDO PROPOSTA

**Contato realizado:** sim  
**Período solicitado:** 25 a 31/01/2027  
**Grupo de referência:** até 30 passageiros, com ajuste conforme fechamento

**Identidade pública localizada:**
- Razão social de referência: B&B HOTELS BRASIL HOTELARIA E INVESTIMENTOS LTDA
- CNPJ de referência da unidade: 21.211.330/0006-00
- Endereço: Rua Florêncio de Abreu, 752 — Centro — São Paulo/SP — CEP 01030-001

**Ainda precisa chegar:**
- disponibilidade;
- tipos de quarto;
- quantidade/capacidade;
- tarifa;
- café da manhã;
- impostos/taxas;
- pagamento;
- cancelamento/no-show;
- validade;
- sinal/garantia;
- allotment/bloqueio;
- rooming list;
- faturamento para agência;
- referência/número da proposta.

**Ação quando chegar:** validar proposta → perfil jurídico → criar quote `hospitality` → manter `quoted`.

---

### 2. Aéreo — LATAM

**Status:** EM ANÁLISE PELA LATAM

**Caso ativo:**
- `04621238`

**Caso encerrado por duplicidade:**
- `04621237`

A LATAM informou que o chamado `04621237` foi fechado por duplicidade e que o tratamento deve continuar no `04621238`.

**Escopo solicitado:**
- 30 adultos;
- BSB → São Paulo em 25/01/2027;
- São Paulo → BSB em 31/01/2027;
- comparação CGH/GRU;
- preferência por voos diretos.

**Ainda precisa chegar:**
- voos;
- horários;
- disponibilidade;
- valor por pessoa e grupo;
- taxas;
- bagagem;
- assentos;
- validade;
- bloqueio/sinal/pagamento;
- prazo de nomes;
- substituição;
- redução;
- cancelamento/reembolso/créditos;
- referência comercial.

**Ação quando chegar:** validar proposta → identificar entidade jurídica contratante → criar quote `air` → manter `quoted`.

---

### 3. Aéreo — GOL

**Status:** AGUARDANDO RETORNO NO CANAL ATUAL

**Observação:** a caixa antiga `cotacao.grupos@voegol.com.br` informou que foi desativada.

**Novo contato enviado para:**
- `negociacao@voegol.com.br`
- cc: `comercial@voegol.com.br`

**Escopo solicitado:** equivalente à LATAM.

**Ainda precisa chegar:**
- orientação do Portal de Grupos, se obrigatória;
- proposta comercial real;
- regras e referência comercial.

**Ação quando chegar:** validar canal/proposta → perfil jurídico → quote `air` → manter `quoted`.

---

### 4. Transporte terrestre/local — Pazuti

**Status:** AGUARDANDO NOVA PROPOSTA

**Fornecedor já conhecido:**
- Nome: Pazuti Van
- Razão social: A M DOS SANTOS TRANSPORTE PAZUTI LTDA
- CNPJ: 15.057.586/0001-06
- Endereço jurídico já completo no COBS

**Por que a cotação antiga não serve:**
- 30 passageiros;
- hotel anterior;
- somente aeroporto ↔ hotel;
- não cobre operação atual de 37 pessoas;
- não cobre Hotel ↔ Expo Center Norte por 4 dias.

**Novo escopo solicitado:**
- 25/01: CGH → almoço → B&B São Paulo Luz;
- 27–30/01: 4 idas + 4 retornos B&B ↔ Expo Center Norte;
- 31/01: hotel → programação final → almoço → CGH;
- capacidade legal para 37 pessoas + bagagens.

**Ainda precisa chegar:**
- veículo/capacidade;
- bagageiro;
- valores por trecho/bloco/total;
- inclusões;
- seguro;
- espera/hora excedente;
- pagamento;
- cancelamento;
- validade;
- disponibilidade;
- referência da proposta.

**Ação quando chegar:** criar quote canônica `transport` com a proposta revisada → manter `quoted`.

---

### 5. Evento / inscrição — APCD / 44º CIOSP

**Status:** AGUARDANDO RESPOSTA SOBRE GRUPO/CARAVANA

**Evento já existe no COBS como evento externo.**

**Importante:** existência do evento ≠ fornecedor contratado.

**Identidade pública localizada:**
- Associação Paulista de Cirurgiões Dentistas — APCD
- CNPJ: 47.331.822/0001-19

**Consulta enviada para:** `atendimento.congressista@apcdcentral.com.br`

**Ainda precisa chegar:**
- inscrição individual vs grupo;
- pagamento consolidado pela BSBTUR;
- NF/recibo para agência;
- referência comercial/código de grupo;
- documentação acadêmica;
- substituição de participantes;
- cancelamento/reembolso;
- categoria da equipe operacional;
- procedimento de crachás.

**Ação quando chegar:**
- se houver contratação/pagamento consolidado BSBTUR → perfil jurídico + quote `event_registration`;
- se cada aluno contratar diretamente com APCD → não criar fornecedor contratado fictício no pacote; registrar apenas regra operacional/comercial aplicável.

---

## Resumo executivo

| Bloco | Situação | Pode criar quote agora? | Próxima evidência |
| --- | --- | --- | --- |
| B&B São Paulo Luz | aguardando proposta | não | proposta formal |
| LATAM | caso 04621238 em análise | não | proposta comercial |
| GOL | aguardando canal atual | não | proposta/canal válido |
| Pazuti | aguardando proposta revisada | não | proposta para 37 pessoas + operação completa |
| APCD/CIOSP | aguardando resposta | não | regra comercial de grupo/caravana |

## Regra de integridade

Até que exista evidência comercial real:

- não criar `operation_quote`;
- não marcar `selected`;
- não marcar `contracted`;
- não criar `contract_reference`;
- não criar cronograma de pagamento do fornecedor;
- não registrar documento inexistente;
- não tornar Contract Readiness verde artificialmente.

