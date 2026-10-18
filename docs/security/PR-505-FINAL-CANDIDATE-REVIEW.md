# PR #505 — Revisão final pré-migration da proteção candidata

Data: 2026-10-17. Escopo: somente branch isolada e PostgreSQL descartável.

## Evidência comportamental
- Execução de segurança #10: https://github.com/bsbtur/cobs-os-core/actions/runs/39070818678 (PASS).
- Agente operations_agent da organização A consegue consultar seu documento sintético, mas UPDATE e DELETE diretos no mesmo documento afetam 0 linhas.
- A mudança de status via RPC do agente A para documento A é rejeitada com forbidden.
- Proprietário A realiza operações de escrita legítimas. Tentativas de ligação cruzada são rejeitadas na fixture com a proteção candidata.
- A execução confirma que a migration original ainda admite INSERT de documento com operação de outra organização; o workflow exige essa falha na baseline como prova de reprodução.

## Restrições antes de promover
1. O guard candidato impede INSERT/UPDATE de supplier_documents com operação, fornecedor ou cotação incompatíveis. **Não cobre mudanças posteriores nas linhas pai** (por exemplo, UPDATE de operation_quotes.operation_id/tenant_id/supplier_id), que podem invalidar vínculos existentes. Investigar constraints compostas e/ou guards nos pais conforme o esquema canônico.
2. O guard roda como SECURITY DEFINER e faz SELECT FOR KEY SHARE; revisar ownership, search_path, acesso ao esquema e privilégio EXECUTE.
3. Validar semântica de documentos sem quote_id: a migration permite NULL; confirmar se isso é regra de negócio intencional.
4. Certificar que os testes locais replicam as constraints/triggers efetivamente versionadas no repositório e que não há drift com CLEAN BUILD; **não consultar ou modificar produção sem autorização**.
5. Garantir que o PostgreSQL descartável sempre reflita separadamente baseline vulnerável e candidato protegido.

## Decisão
**NÃO PROMOVER AINDA** a migration; **NÃO ativar** ENABLE_SUPPLIER_DOCUMENT_MANAGER; sem merge/deploy e sem alterações de banco ativo.
Próximo alvo: revisar mutação das referências pai e desenhar integridade bidirecional (constraints compostas vs triggers) antes de solicitar aprovação de migration.
