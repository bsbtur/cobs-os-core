# PR #505 — Regra de negócio: fornecedor e evidências vinculadas

**Estado:** decisão candidata de segurança para revisão; NÃO é autorização de ativação.  
**Âmbito:** documentação de fornecedores associada à cotação de uma operação, em ambiente multitenant.

## Regra RD-FORN-01 (fail-closed)
Depois que uma cotação recebe pelo menos um registro em `supplier_documents` com `quote_id` igual ao ID da cotação, a **identidade referencial do fornecedor (`operation_quotes.supplier_id`) fica imutável** enquanto esse vínculo existir.

- O usuário autorizado pode alterar descrição, categoria, valor, validade e termos da cotação somente se não violar outros bloqueios canônicos (cotação contratada ou com parcelas não canceladas).
- A mudança de `supplier_id` deve ser rejeitada pelo PostgreSQL, inclusive via `update_operation_quote`; não migrar, apagar, desvincular nem reatribuir automaticamente os documentos.
- Editar metadados do mesmo fornecedor, sem trocar seu ID, não constitui substituição de fornecedor, respeitadas as regras atuais de cadastro.
- Troca de fornecedor exige **novo procedimento explícito e auditável**, a definir antes de implementar: preferencialmente criar nova cotação/documentos, preservando o histórico da original. Sem esse procedimento, a ação permanece bloqueada.
- O frontend pode mostrar o motivo e desabilitar campos de troca, mas não substitui o gatilho/constraints do banco (proteção também para SQL direto e RPCs).

## Resultado reproduzido (isolado)
GitHub Actions #21: https://github.com/bsbtur/cobs-os-core/actions/runs/39084774210
- `update_operation_quote` sem documento: permite alterações.
- Com documento, o mesmo fornecedor permanece editável (exemplo: descrição/valor).
- Alteração de fornecedor com documento: rejeita com `supplier_document_quote_parent_mismatch`.
- A transação fracassada preservou cotação/documento e não criou fornecedor residual.
- Esse teste carrega as RPCs canônicas versionadas, mas utiliza fixture reduzida; não é homologação completa da produção.

## Efeito na interface — inspeção da branch
- `src/routes/_authenticated/operations.$operationId.procurement.tsx` apresenta criação de cotação via `create_operation_quote` e lista de cotações/documentos; **não foi localizado nessa rota um formulário de edição que invoque `update_operation_quote`**. Não presumir que há campo a desabilitar nessa tela atualmente.
- `src/components/procurement/supplier-document-manager.tsx` permite criar documento por `add_supplier_document` e alterar seu status; as consultas e a seção inteira permanecem bloqueadas por `ENABLE_SUPPLIER_DOCUMENT_MANAGER = false`.
- `src/lib/supplier-document-manager.ts` mantém a flag desligada. Não alterar.
- Quando uma edição de cotação for disponibilizada na interface, mostrar `Fornecedor bloqueado porque esta cotação tem documentos vinculados. Crie uma nova cotação para substituir o fornecedor, preservando os documentos anteriores.` A mensagem não deve incentivar a exclusão de evidências para contornar a regra.
- Tratar `supplier_document_quote_parent_mismatch` em camada de apresentação com mensagem de negócio; não ignorar erro nem fazer retry automático.
- A verificação no frontend deve incluir contagem de documentos ligada à cotação, mas precisa permanecer não autorizativa: a validação definitiva é no banco.

## Pontos de aceitação antes de migration
1. Validar com responsáveis pela operação a política de preservação de evidências, incluindo `ON DELETE CASCADE` que ainda consta na migration de documentos.
2. Testar RPC real com cotação contendo documentos, fornecedor igual e fornecedor diferente, além de outros bloqueios canônicos; executar fixture com constraints e triggers completos.
3. Verificar alteração concorrente, RLS, `SECURITY DEFINER`, status do documento e caminhos de exclusão.
4. Depois de aprovado, criar migration **separada e versionada**, com revisão explícita; nenhuma migration de produção agora.

**Bloqueio:** PR #505 sem merge/deploy, Supabase ativo inalterado, pagamentos congelados, Vercel dispensável, módulo desativado.
