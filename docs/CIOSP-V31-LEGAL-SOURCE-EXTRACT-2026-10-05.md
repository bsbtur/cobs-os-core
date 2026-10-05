# CIOSP 2027 — V3.1 · Extração para revisão jurídica

Data da extração: 2026-10-05  
Escopo: extração e organização do conteúdo atualmente registrado para o template `CIOSP-2027/V3.1`.  
Regra: este documento **não constitui revisão jurídica**, não ativa o template e não autoriza envio à Clicksign.

## 1. Identificação canônica

- Template key: `CIOSP-2027`
- Versão: `V3.1`
- Nome: **Contrato de Intermediação de Serviços Turísticos — CIOSP 2027 — V3.1**
- Locale: `pt-BR`
- Status atual: `review_required`
- Provider previsto: `clicksign`
- Provider template id: ausente
- `legal_reviewed_at`: ausente
- `legal_reviewed_by`: ausente
- Modo documental: `upload`
- Generation mode: `immutable_order_snapshot_v2`
- Guard de ativação: `formal_legal_validation_required`

## 2. Situação da fonte documental

No estado atual do banco:

- `document_source_snapshot`: **ausente**
- `document_source_hash`: **ausente**
- `document_renderer_version`: **ausente**

Portanto, **não existe hoje um corpo contratual integral congelado no COBS para V3.1**. O registro V3.1 contém o esquema de variáveis, metadados e gates técnicos, mas não contém o texto das cláusulas do contrato.

A implementação existente é deliberadamente fail-closed: a fonte documental deve ser o texto real submetido à revisão, registrado via mecanismo próprio, com SHA-256 calculado no servidor, sem marcar revisão jurídica e sem ativar o template.

## 3. Variáveis obrigatórias registradas no ambiente

Após a reconciliação técnica de 2026-10-05, o ambiente foi verificado com `schema_version = 32`, mantendo `status = review_required` e `legal_reviewed_at = null`.

Obrigatórias:

1. `contract_date`
2. `customer_full_name`
3. `customer_document_type`
4. `customer_document_number`
5. `customer_email`
6. `customer_phone`
7. `customer_address_line1`
8. `customer_city`
9. `customer_state_region`
10. `customer_postal_code`
11. `operation_name`
12. `operation_start`
13. `operation_end`
14. `destination_city`
15. `destination_region`
16. `order_id`
17. `currency`
18. `grand_total_formatted`
19. `grand_total_in_words`
20. `payment_plan_display`
21. `order_items`
22. `contracted_suppliers`
23. `privacy_policy_version`
24. `privacy_policy_effective_at`
25. `program_snapshot`
26. `program_hash`

Opcionais:

- `customer_address_line2`
- `customer_district`
- `customer_country_code`
- `operation_code`
- `reservation_id`
- `package_name`

## 4. Evidências exigidas pelo próprio template

Metadados atuais do V3.1 exigem:

- snapshot da oferta;
- snapshot dos fornecedores;
- identidade jurídica dos fornecedores;
- snapshot do cronograma de pagamentos;
- snapshot da programação do viajante;
- hash SHA-256 da programação;
- versão da política de privacidade;
- preflight dos placeholders;
- política de privacidade com key `ciosp-2027-traveler-contract`;
- validação jurídica formal antes da ativação.

## 5. Política de privacidade vinculada

Policy key fixada no template:

`ciosp-2027-traveler-contract`

No momento desta extração, **não existe registro dessa policy key em `privacy_policy_versions`**.

Assim, mesmo que o corpo do contrato fosse registrado, o pipeline jurídico continuaria bloqueado até existir uma política real, versionada e juridicamente revisada conforme os guards do sistema.

## 6. Requisitos do gerador de contratos

O gerador canônico trabalha apenas com:

- pedido de produção contratável;
- comprador e perfil contratual completos;
- operação e reserva válidas;
- template **ativo** e com `legal_reviewed_at`;
- política de privacidade ativa;
- fornecedores contratados com identidade jurídica;
- termos comerciais versionados;
- cronograma de pagamentos consistente com o total do pedido;
- jornada/programação do viajante;
- variáveis obrigatórias completas.

A aprovação do fornecedor de pagamento ou qualquer dado de QA não substitui esses gates jurídicos.

## 7. Reconciliação técnica do schema V3.1

A divergência observada inicialmente — banco em `schema_version = 31` apesar da intenção de exigir `program_snapshot` e `program_hash` — foi reconciliada em 2026-10-05.

Foi criada e aprovada a correção técnica em PR separada, preservando:

- `status = review_required`;
- `legal_reviewed_at = null`;
- fonte documental ainda não registrada;
- nenhuma ativação de template;
- nenhuma chamada à Clicksign;
- nenhuma alteração em pagamentos.

O estado verificado após a reconciliação é:

- `schema_version = 32`;
- `program_snapshot` obrigatório;
- `program_hash` obrigatório;
- `requires_program_snapshot = true`;
- `program_snapshot_source = journey_steps`;
- `program_snapshot_hash = sha256`.

## 8. Materiais-fonte técnicos

Principais fontes do repositório usadas nesta extração:

- `supabase/migrations/20260906210000_register_ciosp_2027_contract_template_v1.sql`
- `supabase/migrations/20260906214500_register_ciosp_2027_contract_v3.sql`
- `supabase/migrations/20260907004000_contract_legal_evidence_v31.sql`
- `supabase/migrations/20260907015000_contract_v31_require_program_snapshot.sql`
- `supabase/migrations/20260907030000_contract_v31_pin_privacy_policy_key.sql`
- `supabase/migrations/20260907054500_contract_document_source_gate_v1.sql`
- `supabase/migrations/20261004113000_privacy_policy_legal_evidence_hardening_v1.sql`
- `supabase/functions/contracts-generate/index.ts`
- `src/routes/_authenticated/settings_.contracts.tsx`

## 9. Conclusão desta etapa

A extração integral do **conteúdo atualmente existente** está concluída e o schema técnico V3.1 foi reconciliado antes do congelamento de qualquer fonte documental.

O próximo artefato é o texto-base jurídico em draft, usando somente placeholders canônicos já definidos, para revisão jurídica formal.

Até lá:

- manter `status = review_required`;
- manter `legal_reviewed_at = null`;
- não ativar template;
- não liberar provider send;
- não gerar ou enviar contrato ao cliente.
