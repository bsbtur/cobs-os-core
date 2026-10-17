# Fila comercial de Leads

## Implementação
- Adicionar `/operations/$operationId/leads` e item Leads na navegação desktop e no menu Mais do celular, somente para owner/admin.
- Exibir contadores, Kanban desktop, lista por etapa no celular, busca, filtros, responsáveis e detalhes em painel lateral.
- Alterar etapa e responsável exclusivamente pela função `update_commercial_lead_pipeline`, atualizando a lista após sucesso.
- Preservar Pessoas, aprovações, Hospedagem, checkout e pagamentos; não publicar nem alterar backend.

## Bloqueio identificado
A consulta somente leitura não encontrou as três funções no backend conectado. A tela terá estado de erro honesto; funcionamento com dados reais depende dessas funções nesse ambiente. Não serão criados dados fictícios nem feitas migrations.

## Detalhes técnicos
- Criar os três arquivos solicitados e testes unitários; ampliar somente os contratos locais em `compat-client.ts`.
- Cache por tenant, usuário e operação; verificar operação no tenant selecionado antes de consultar leads.
- Nova rota com metadados próprios; árvore de rotas regenerada automaticamente, nunca editada manualmente.
- Testar labels, filtros e chamadas mockadas sem efeitos fora do funil; conferir desktop/celular e compilação automática.