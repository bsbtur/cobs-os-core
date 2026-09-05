# Dashboard Comercial — Checklist Final de Aceite

Status: **PENDENTE DE EXECUÇÃO**  
Escopo: inspeção final do dashboard comercial publicado, em desktop e celular, com conferência contra o banco e validação do atalho para o Commerce.  
Regra: esta validação não cria pedido, cobrança, Pix ou fato financeiro.

## 1. Identificação da execução

| Campo | Registro |
| --- | --- |
| Ambiente | `________________` |
| URL validada | `________________` |
| Commit/deploy | `________________` |
| Data/hora (Brasília) | `________________` |
| Navegador e versão | `________________` |
| Responsável | `________________` |
| Snapshot/consulta de banco | `________________` |
| Resultado | ☐ PASS ☐ PASS COM RESSALVAS ☐ FAIL |

Evidências devem registrar URL, viewport, data/hora, resultado e referência do snapshot usado. Não anexar tokens, credenciais ou dados pessoais desnecessários.

## 2. Pré-condições

- [ ] O deploy examinado é o mesmo commit identificado acima.
- [ ] A sessão autenticada pertence a um usuário autorizado a visualizar o dashboard comercial.
- [ ] O banco foi consultado em modo somente leitura.
- [ ] O snapshot de referência foi preservado com data/hora e filtros usados.
- [ ] Não existem alterações locais ou dados de teste não documentados misturados à execução.
- [ ] O teste foi separado de qualquer fluxo de checkout/Pix real.

## 3. Validação visual — desktop

Executar, no mínimo, em 1440 px e 1280 px de largura.

- [ ] A página carrega sem tela vazia, erro visível ou redirecionamento indevido.
- [ ] Cabeçalho, contexto da organização/período e título da área estão coerentes.
- [ ] Todos os cards, tabelas e indicadores cabem na viewport sem overflow horizontal inesperado.
- [ ] Nenhum texto, valor, ícone, botão ou coluna fica cortado ou sobreposto.
- [ ] Estados de carregamento, vazio e erro são legíveis e não parecem dados reais.
- [ ] A hierarquia visual permite identificar rapidamente o que exige ação comercial.
- [ ] Formatação de moeda, percentuais, quantidades e datas segue pt-BR.
- [ ] Status usam texto e/ou ícone além de cor; contraste e foco visível estão adequados.
- [ ] Não aparecem textos de QA, placeholders, números inventados, preço legado ou conteúdo de desenvolvimento.
- [ ] Console do navegador não registra erro que comprometa a leitura ou navegação.

## 4. Validação visual — celular

Executar, no mínimo, em 390 px e 430 px de largura, com toque ou emulação equivalente.

- [ ] A página abre sem zoom obrigatório e sem overflow horizontal.
- [ ] Cards e tabelas têm comportamento definido: refluem, empilham ou permitem rolagem interna identificável.
- [ ] Nenhum indicador essencial desaparece ou fica inacessível.
- [ ] Botões, links e o atalho do Commerce têm área de toque adequada e não ficam colados.
- [ ] Menus, cabeçalho e retorno à área anterior funcionam com toque.
- [ ] Textos e números permanecem legíveis sem truncamento que altere o sentido.
- [ ] Estados de carregamento, vazio e erro são compreensíveis em tela estreita.
- [ ] Orientação vertical não quebra o layout; se houver suporte horizontal, ele é intencional e documentado.
- [ ] Não há erro de console ou falha de rede causada pelo breakpoint móvel.

## 5. Coerência dos números exibidos

Para cada indicador, comparar a tela com a consulta/snapshot do banco usando o mesmo tenant, período, filtros e status.

| Indicador | Fonte canônica | UI confere | Evidência |
| --- | --- | --- | --- |
| Total de ofertas/produtos | consulta do catálogo comercial | ☐ | |
| Total de pedidos | consulta de pedidos no mesmo escopo | ☐ | |
| Pedidos por status | consulta agrupada por status | ☐ | |
| Reservas vinculadas | consulta de reservas do comércio | ☐ | |
| Receita/faturamento exibido | fatos financeiros válidos; nunca intenção de pagamento | ☐ | |
| Valores pendentes/em aberto | pedidos/cobranças não liquidados | ☐ | |
| Capacidade/vagas, quando exibida | capacidade publicada e reservas válidas | ☐ | |
| Totais das tabelas e paginação | mesma contagem e filtros da UI | ☐ | |

Critérios obrigatórios:

- [ ] A soma das categorias exibidas reconcilia com o total, considerando explicitamente filtros e arredondamento.
- [ ] Valores monetários usam a unidade correta (centavos convertidos uma única vez), moeda correta e arredondamento consistente.
- [ ] Pagamentos pendentes, aprovados, rejeitados e cancelados não são agrupados como recebidos.
- [ ] Nenhuma métrica financeira é derivada apenas de um status visual ou de uma contagem de pedidos.
- [ ] Atualizar/recarregar a página mantém os mesmos números enquanto a fonte não muda.
- [ ] Aplicar e remover filtros atualiza todos os cards/tabelas dependentes, sem misturar períodos ou tenants.
- [ ] Se não houver dados, a UI exibe estado vazio explícito, não zero enganoso nem fixture.
- [ ] A UI não expõe identificadores, snapshots de provedor, tokens ou dados além da autorização do usuário.

## 6. Atalho para o Commerce

- [ ] O atalho está visível no local esperado no desktop.
- [ ] O atalho está acessível no celular sem depender de hover ou menu impossível de descobrir.
- [ ] O rótulo comunica claramente o destino (Commerce/Comércio).
- [ ] O clique/toque leva à rota correta, sem abrir rota de QA ou rota administrativa indevida.
- [ ] A navegação preserva a sessão e o contexto autorizado.
- [ ] Usuário autorizado chega à área comercial sem novo login inesperado.
- [ ] Usuário sem permissão recebe bloqueio seguro e mensagem compreensível.
- [ ] O retorno do Commerce para o dashboard funciona sem perder filtros essenciais, quando essa preservação fizer parte do comportamento esperado.
- [ ] Não há link quebrado, 404, loop de redirecionamento ou erro de console.
- [ ] O destino não permite criar pedido, cobrança ou alteração financeira apenas por acessar o atalho.

## 7. Acessibilidade e interação

- [ ] Todos os controles podem ser alcançados por teclado no desktop.
- [ ] A ordem de foco acompanha a ordem visual.
- [ ] O foco é visível em cards acionáveis, links, filtros e no atalho do Commerce.
- [ ] Rótulos e nomes acessíveis descrevem cards, tabelas, botões e estados.
- [ ] Status não dependem somente de cor.
- [ ] Contraste e tamanho de texto permitem leitura em desktop e celular.
- [ ] A interface respeita `prefers-reduced-motion`, quando houver animação.
- [ ] Mensagens de erro e sucesso são percebidas sem depender apenas de cor ou posição.

## 8. Classificação de defeitos

- **P0 — bloqueador:** número incorreto, vazamento de dados, rota errada de produção, acesso indevido, ação financeira disparada involuntariamente ou dashboard inutilizável.
- **P1 — alta:** atalho do Commerce quebrado, indicador essencial ausente, layout quebrado em viewport suportada ou erro que impede a operação comercial.
- **P2 — média:** inconsistência visual ou de interação sem perda de dado/ação, desde que exista contorno claro.
- **P3 — baixa:** ajuste cosmético sem impacto na compreensão, acesso ou operação.

Qualquer P0 ou P1 reprova o aceite. P2/P3 só podem seguir com ressalva se tiverem responsável e prazo registrados.

## 9. Registro de evidências e defeitos

| ID | Cenário/viewport | Resultado | Severidade | Evidência | Responsável/prazo |
| --- | --- | --- | --- | --- | --- |
| `QA-COM-001` | | ☐ PASS ☐ FAIL | | | |
| `QA-COM-002` | | ☐ PASS ☐ FAIL | | | |
| `QA-COM-003` | | ☐ PASS ☐ FAIL | | | |

## 10. Critérios de aceite

O dashboard comercial será considerado **ACEITO** somente quando:

1. Todos os itens P0/P1 estiverem PASS ou encerrados.
2. Desktop e celular forem validados nas larguras mínimas definidas.
3. Todos os indicadores tiverem reconciliação com a fonte canônica, com filtros e período registrados.
4. O atalho do Commerce abrir a rota correta, respeitar autorização e não iniciar mutação financeira.
5. Não houver texto de desenvolvimento, QA, preço legado, fixture ou métrica inventada.
6. Não houver erro de console/rede que afete a operação.
7. Evidências e defeitos estiverem registrados neste documento ou vinculados por referência.
8. O responsável pelo produto registrar abaixo a decisão final.

## 11. Decisão final

- [ ] **ACEITO**
- [ ] **ACEITO COM RESSALVAS**
- [ ] **REPROVADO**

Observações:

```
____________________________________________________________________
____________________________________________________________________
____________________________________________________________________
```

Aprovador: `________________`  
Data/hora: `________________`  
Referência da PR/deploy: `________________`

## Escopo fora deste aceite

Este documento não aprova:

- criação de pedido;
- geração ou pagamento de Pix;
- alteração de preço, oferta ou capacidade;
- alteração de schema, RLS ou funções;
- homologação do webhook;
- liberação de venda ampla.

Esses itens exigem seus próprios testes e critérios de aceite.
