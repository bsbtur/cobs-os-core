# PR #505 — Política candidata de preservação e exclusão documental

**Estado:** proposta para aprovação, não implementada em migration.  
**Ambiente examinado:** código versionado na branch isolada. Sem consultas ou alterações ao Supabase de produção.

## Evidência canônica

Arquivo `supabase/migrations/20260906060000_consolidate_supplier_documents_v1.sql`:

`supplier_documents` define `ON DELETE CASCADE` nas FKs:
- `tenant_id → tenants(id)`
- `operation_id → operations(id)`
- `quote_id → operation_quotes(id)` (opcional)
- `supplier_id → suppliers(id)`

Tipos admitidos: quote, contract, invoice, receipt, insurance, license e other. A mesma migration concede DELETE a `authenticated` e permite gestão a `owner/admin` via RLS.

Arquivo `20260828180229_operation_procurement_costing_v1.sql`:
- `operation_quotes.operation_id → operations(id) ON DELETE CASCADE`
- `operation_quotes.supplier_id → suppliers(id)` sem ação CASCADE explicitada (padrão NO ACTION).
- `quote_payment_schedule.quote_id → operation_quotes(id) ON DELETE CASCADE`.
- As FKs independentes não asseguram integralmente tenant/operation/supplier congruentes.

Em `20260812150717_w02_experience_offering_operation_core.sql`, DELETE direto de `operations` não recebe grant/policy a `authenticated`. Isso não elimina a possibilidade de comandos privilegiados ou cascatas de outros pais.

**Limite:** esta auditoria avalia definições no repositório, não o esquema efetivamente instalado nem dependências adicionadas fora dos arquivos revisados. Uma FK CASCADE não assegura que uma operação de DELETE vá completar; outras FKs ou triggers podem bloqueá-la.

## Política RD-DOC-01 — candidata; fail closed

1. **Preservar evidências**: documentos já registrados em `supplier_documents` não devem desaparecer por remoção de operação, fornecedor, cotação ou organização sem processo explicitamente autorizado.
2. **Não confundir status com descarte**: `rejected` e `expired` indicam situação documental; não autorizam deleção. Documento sem URL também representa um registro cujo histórico deve ser mantido.
3. **Sem reatribuição automática**: proibido apagar, reanexar ou migrar automaticamente documentos a outro fornecedor/cotação para contornar a regra RD-FORN-01.
4. **Bloqueio transacional no banco**: proteção deve cobrir DELETE direto e indireto (inclusive por CASCADE e usuários privilegiados, dentro dos limites efetivamente aplicáveis), com rollback completo de operações incompatíveis. Uma mensagem de interface não constitui proteção.
5. **Substituição controlada**: quando fornecedor/cotação precisar mudar, preferir criar nova cotação mantendo a original e suas evidências, sujeito às regras de negócio e de auditoria.
6. **Política de retenção**: prazo, fundamento legal, finalidade, acesso, descarte definitivo e exceções devem ser aprovados antes de implementar. Não inferir prazo universal nem prometer retenção perpétua; observar requisitos fiscais/contratuais e LGPD conforme o tipo de documento.
7. **Auditoria**: qualquer descarte futuro deverá registrar autorização, ator, tenant, documento, motivo, data e consequência, com mecanismo de retenção de trilha independente da linha excluída.

## Matriz de decisão proposta

| Operação | Conduta antes de aprovação do fluxo de descarte |
|---|---|
| DELETE de cotação com documento | Bloquear |
| DELETE de fornecedor com documento | Bloquear |
| DELETE de operação com documento | Bloquear |
| DELETE de tenant com documento | Bloquear e encaminhar ao processo de governança de dados |
| DELETE direto de documento | Bloquear |
| Atualizar status, valor e descrição permitidos | Permitir conforme política/RPC canônica, sem exclusão |
| Documento rejeitado ou expirado | Preservar, sem tratar status como permissão para apagar |
| Descarte legalmente devido | Exigir fluxo específico, ainda não desenhado nem autorizado |

## Pontos de implementação futura (NÃO executados)
- Avaliar alteração versionada das FKs para `ON DELETE RESTRICT/NO ACTION` com constraints apropriadas ou um guard no caminho de exclusão, inclusive efeitos transitivos de cascatas. Determinar a ordem correta de migração e impacto em dependências.
- Verificar se `ON DELETE RESTRICT` nas FKs de documentos bloqueia exclusões pretendidas no mesmo transaction graph e se há necessidades de anonimização, arquivamento ou exportação.
- Testar PostgreSQL descartável: DELETE direto, cascata via quote/op/supplier/tenant, múltiplos níveis de cascata, permissões RLS/SECURITY DEFINER, concorrência e rollback.
- Revisar como o módulo de fornecedores e a RPC `update_operation_quote` apresentam erros compreensíveis ao usuário.
- Fazer avaliação de retenção com responsáveis legal/compliance antes de fixar prazos ou impedir tratamentos legais necessários.

## Critério de liberação
**Não criar/aplicar migration nem ativar funcionalidade enquanto a preservação documental não for testada e aprovada.** PR #505 continua sem merge; `ENABLE_SUPPLIER_DOCUMENT_MANAGER = false`; Supabase principal e STAGING intocados; nenhuma dependência da Vercel.
