# PR #505 — Compatibilidade com migrations canônicas (revisão estática)

Data: 2026-10-17. Escopo: GitHub, branch `feat/supplier-documents-staged-20261017`. Nenhum acesso/mutação em Supabase ativo. Nenhuma migration criada.

## Fontes canônicas verificadas
- `20260812150717_w02_experience_offering_operation_core.sql`: `operations` tem PK id; referências compostas a experiências/ofertas; `operations_guard` protege `tenant_id` salvo controle interno `app.op_control`; UPDATE por owner/admin/operations_agent, nenhum DELETE direto.
- `20260828180229_operation_procurement_costing_v1.sql`: `suppliers` tem PK id e UNIQUE(tenant_id,name); `operation_quotes` tem PK id, FK `operation_id` → `operations(id) ON DELETE CASCADE` e FK `supplier_id` → `suppliers(id)` sem CASCADE. Policies de supplier/quote permitem gestão owner/admin por tenant, mas vínculos são chaves estrangeiras *independentes*.
- `20260906050000_consolidate_procurement_v1.sql`: RPC `update_operation_quote` pode alterar `supplier_id` ao atualizar nome do fornecedor, inclusive após a cotação ter documento vinculado, salvo proteção adicional. Candidato guard inverso impediria a alteração, com potencial de incompatibilidade funcional.
- `20260906060000_consolidate_supplier_documents_v1.sql`: `supplier_documents` possui FKs individuais para tenant, operação, quote e fornecedor, com `ON DELETE CASCADE` em todas as quatro referências, e `quote_id` opcional. O candidato inspeciona combinações com trigger no documento e nas entidades pai.

## Conclusões comprovadas e limitações
1. **Compatibilidade de nomes e colunas — favorável**: guard candidato usa tabelas e colunas existentes no histórico versionado (`tenant_id,operation_id,supplier_id,quote_id`), sem exigir campo novo. Isso NÃO confirma compatibilidade da instalação atual.
2. **Guarda de operação já existente**: `operations_guard` normalmente impede mudança de `tenant_id`; teste da fixture simplificada não tinha esse trigger. Assim, alguns casos de operação são redundantes em fluxo normal, mas o trigger candidato pode ser defesa adicional contra operações privilegiadas.
3. **Impacto em RPC de cotação — BLOCKER funcional**: `update_operation_quote` altera supplier_id e pode ser rejeitado pelo trigger pai quando há documento ligado. Definir regra de negócio (impedir troca até remover/reatribuir documento, ou fluxo transacional atômico e auditável) e testar RPC canônica antes da migração.
4. **Exclusões**: DELETE direto em `operations` não tem grant/policy; `operation_quotes` → `operations` é ON DELETE CASCADE; `operation_quotes` → `suppliers` é padrão NO ACTION. Logo, teste sintético anterior de delete de operação barrado pela FK da fixture *não representa fielmente a regra canônica de cascata da quote*. Verificação destrutiva apenas em fixture que recrie FK real. Investigar retenção legal de contratos/comprovantes antes de aceitar cascade.
5. **Concorrência**: Testes com duas conexões no fixture sintético passaram após `FOR SHARE`; não há prova de compatibilidade sob triggers/constraints completas, nem cobertura de todos os interleavings, isolamento SERIALIZABLE ou cargas elevadas. A solução candidata continua QA-only.
6. **SECURITY DEFINER**: revisar owner, `search_path`, execução e grants do trigger em contexto real. Candidate SQL assume regras presentes no fixture; proibir habilitação até auditoria adicional.

## Decisão
**BLOCKED — NÃO promover a migration ainda.** Exigir primeiro (a) fixture fiel do esquema/trigger de operações e FKs canônicas, (b) teste funcional da RPC update_operation_quote com documentos, (c) política explícita de retenção/cascata e (d) checagem de regressão e concorrência. Sem Supabase, merge, deploy, Vercel ou ativação da flag.
