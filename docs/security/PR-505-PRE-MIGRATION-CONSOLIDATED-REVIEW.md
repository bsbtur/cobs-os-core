# PR #505 — Consolidação técnica pré-migration (RD-FORN-01 + RD-DOC-01)

**Estado: REVISÃO CANDIDATA — NÃO AUTORIZADA PARA MIGRATION/ATIVAÇÃO.**
Escopo exclusivamente do branch `feat/supplier-documents-staged-20261017`, por leitura do código versionado e evidências do PostgreSQL descartável. Sem alterações no Supabase.

## Arquivos revisados

- `tests/security/patches/supplier-document-context-guard.candidate.sql`
- `tests/security/patches/supplier-document-retention.candidate.sql`
- `supabase/migrations/20260906050000_consolidate_procurement_v1.sql`
- `supabase/migrations/20260906060000_consolidate_supplier_documents_v1.sql`
- Políticas `RD-FORN-01` e `RD-DOC-01` documentadas na PR.

## Mapa dos gatilhos

| Evento | Alvo | Efeito |
|---|---|---|
| BEFORE INSERT ou UPDATE de chaves | supplier_documents | Valida tenant/operação/fornecedor/cotação, com FOR SHARE |
| BEFORE UPDATE de chaves | operation_quotes | Rejeita mudança de contexto quando documento ligado |
| BEFORE UPDATE tenant | operations | Rejeita troca de tenant inconsistente com documentos |
| BEFORE UPDATE tenant | suppliers | Rejeita troca de tenant inconsistente com documentos |
| BEFORE DELETE | supplier_documents | Rejeita qualquer exclusão; inclui DELETE por ON DELETE CASCADE |

**Conflitos diretos de evento:** nenhum identificado entre o gatilho de DELETE e o gatilho INSERT/UPDATE no mesmo documento; atuam em eventos distintos. Isso não prova ausência de conflitos com triggers canônicos ou concorrência de exclusão. As funções de guarda são SECURITY DEFINER e exigem revisão de ownership/search_path/grants.

## Interação com RPCs canônicas

- `add_supplier_document`: INSERT continua sujeito à validação do contexto. Teste isolado aprovado.
- `set_supplier_document_status`: UPDATE de status, isoladamente, não chama trigger de integridade (configurado apenas para alteração de chaves); retenção não altera UPDATE. Regras de auth/RLS continuam necessárias.
- `update_operation_quote`: quando os documentos estão ligados, alterações mantendo `supplier_id` passam no teste; substituição de fornecedor é rejeitada como `supplier_document_quote_parent_mismatch`. Transação rejeitada preserva documento e cotação. Esse é o comportamento candidato RD-FORN-01; precisa UX para erro de negócio.
- `create_operation_quote`: cria cotação sem documentos; não há conflito direto conhecido com os gatilhos.
- `contract_operation_quote`, `select_operation_quote`, `mark_quote_payment_paid`: nenhuma dessas funções promove DELETE documental por si nos trechos canônicos revisados; não considerar regressão completa validada sem testes dedicados.
- DELETE SQL direto ou indireto de documentos: novo gatilho fail-closed bloqueia também cascatas nos 5 cenários exercitados. Funções SECURITY DEFINER ou outras rotas privilegiadas precisam revisão adicional.

## Evidências já executadas

- Segurança e RLS em fixture simplificada (execuções anteriores #6, #9, #10, #12).
- Duas sessões de concorrência: #17 e #18; não cobre todos interleavings.
- RPC original com cotação vinculada: #21 PASS.
- Exclusão direta e em cascata, baseline vs proteção e rollback: #24 PASS (https://github.com/bsbtur/cobs-os-core/actions/runs/39085549259).

As fixtures são reduzidas e não reproduzem todas as constraints/triggers do banco real. Não extrapolar para homologação de produção.

## Política para descarte autorizado — requisitos (não implementados)

1. Decisão formal sobre períodos e bases legais de retenção por classe documental, incluindo LGPD e obrigações fiscais/contratuais; não fixar prazo genérico nesta revisão.
2. Autorização específica, de escopo limitado a tenant/documentos, preferencialmente administrada por procedimento controlado de backend, não uma flag de sessão controlável pelo usuário nem um `SET` acessível a usuários comuns.
3. Fluxo de aprovação e justificativa, com identidade do solicitante/aprovador, documentos, motivos, momento, precedência de bloqueios fiscais/jurídicos, e revogação de permissões temporárias.
4. Registro de auditoria durável **fora do ciclo de cascata**, detalhando o que foi apagado ou anonimizado, e onde está a evidência do descarte autorizado.
5. Tratar storage físico (objetos/URLs/backups), dados pessoais, referências e direitos de titulares; excluir somente linhas do banco não significa eliminação dos arquivos.
6. Definir comportamento se o comando inicia por deleção de cotação, operação, fornecedor ou tenant; impedir que uma autorização de documento se transforme em autorização de cascata transitive.
7. Testar concorrência, rollback, idempotência, RLS, service_role, invocação SQL direta, revogação e bypass antes de qualquer ativação.

## Riscos e bloqueios para a migration

- `ON DELETE CASCADE` nas quatro FKs de supplier_documents continua canônico. O trigger de retenção impede perda nas fixtures, porém qualquer DELETE de pai pode ser rejeitado integralmente; avaliar efeitos operacionais antes do rollout.
- A proteção reversa de operações é redundante em parte com `operations_guard`, mas pode ser defesa adicional.
- `UPDATE OF` de chaves do documento não protege mudanças de contexto por caminhos indiretos adicionais não inventariados.
- `quote_id` pode ser NULL, e documentos sem cotação também precisam retenção e coerência da operação/fornecedor.
- Gatilho de DELETE sempre rejeita inclusive operações de manutenção legítimas e exigências legais; ainda não existe mecanismo seguro para descarte auditável.
- `SECURITY DEFINER` e `public`: exigir função em esquema seguro, privilégios mínimos e testes de invocabilidade antes de produção.
- Teste combinado, com ambas proteções aplicadas simultaneamente e RPCs reais no mesmo banco, não consta nas execuções anteriores: **pendente**.
- Conferir schema efetivamente instalado apenas mediante autorização futura; nenhuma conexão de produção nesta etapa.

## Veredito e próximo gate

**BLOQUEADO PARA MIGRATION** até teste combinado na mesma fixture e aprovação explícita das regras de preservação/descarte. Manter PR #505 sem merge, nenhuma migration criada/aplicada, sem deploy/Vercel, `ENABLE_SUPPLIER_DOCUMENT_MANAGER = false`.
