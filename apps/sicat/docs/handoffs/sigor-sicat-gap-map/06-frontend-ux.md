# 06 - Frontend UX

## Objetivo da fase

Comparar o mapa auditado do SIGOR MTR com a superficie real atualmente exposta pelo frontend do SICAT, distinguindo cobertura existente, divergencias de produto, extras do SICAT e lacunas ainda nao representadas.

## Base de evidencia usada

### SIGOR auditado

- `docs/handoffs/cetesb-platform-complete-navigation/01-source-validation.md`
- `docs/handoffs/cetesb-platform-complete-navigation/10-documentation-final.md`

### SICAT frontend analisado

- `frontend/src/router.js`
- `frontend/src/App.vue`
- `frontend/src/views/LoginView.vue`
- `frontend/src/views/CetesbAccountSelectionView.vue`
- `frontend/src/views/DashboardView.vue`
- `frontend/src/views/ManifestsView.vue`
- `frontend/src/views/ManifestCreateView.vue`
- `frontend/src/views/ManifestDetailView.vue`
- `frontend/src/views/SessionAccountView.vue`
- `frontend/src/views/JobsView.vue`
- `frontend/src/views/AccessAdminView.vue`
- `frontend/src/components/ManifestCreateForm.vue`
- `frontend/src/components/CetesbOperationalFlowsPanel.vue`
- `frontend/src/components/DestinadorCdfWorkspace.vue`
- `frontend/src/composables/useCetesbOperationalFlows.js`
- `frontend/src/services/api.js`
- `frontend/src/stores/auth.js`

## Decisoes de classificacao

- `Representado`: existe tela/rota/componente no SICAT cobrindo a intencao principal do fluxo auditado.
- `Parcial`: existe cobertura funcional relacionada, mas com escopo menor, UX diferente ou sem todas as variantes observadas no SIGOR.
- `Diferente`: o SICAT atende a mesma necessidade operacional por outra experiencia, consolidando ou deslocando a interacao.
- `Ausente`: nao ha evidencia no frontend atual de tela, rota, componente ou cliente API correspondente.
- `Extra SICAT`: capacidade propria do produto, nao observada como modulo equivalente no SIGOR auditado.

Regra aplicada nesta fase: ausencia foi considerada somente quando nao apareceu evidencia em `frontend/src/views/**`, `frontend/src/components/**`, `frontend/src/composables/**`, `frontend/src/services/api.js` e `frontend/src/router.js`.

## Leitura executiva

O SICAT hoje cobre principalmente a trilha operacional de autenticacao interna, selecao de conta CETESB, criacao/listagem/detalhe de manifestos, recebimento de MTR, geracao/download de CDF, observabilidade de jobs e administracao interna de acessos. Em contrapartida, o mapa auditado do SIGOR mostra uma superficie mais ampla em torno de declaracoes DMR, configuracoes do empreendimento, ajuda publica, relatorios dedicados e variantes especializadas do menu por papel.

Na pratica, o SICAT nao espelha o portal SIGOR tela a tela. Ele substitui parte da navegacao original por um produto operacional proprio, mais orientado a fila, contexto de integracao e automacao assistida. Isso explica porque varias funcoes do SIGOR estao `representadas`, mas em pontos de entrada e agrupamentos diferentes.

## Mapa SIGOR vs SICAT

| Area | SIGOR auditado | Evidencia SICAT | Status | Leitura operacional |
| --- | --- | --- | --- | --- |
| Entrada publica e login | Home publica com `AVISOS`, login, `CNPJ/CPF`, unidade, FAQ, manual, primeiro acesso, recuperacao de senha, reCAPTCHA | `LoginView.vue` + `CetesbAccountSelectionView.vue` implementam fluxo em duas etapas: login SICAT e depois conta CETESB salva/nova | Diferente | SICAT nao replica a home publica do SIGOR; troca o login browser-first por autenticacao interna + selecao de conta integrada |
| Home autenticada | Home interna como hub de menu, sem dashboard rico observado | `DashboardView.vue` expone cards de status de manifestos, health, workers, DLQ, timeline e latencia CETESB | Diferente + Extra SICAT | SICAT transforma a landing em painel operacional/observabilidade |
| Criacao de manifesto gerador | `Novo MTR` com blocos de gerador, transportador, destinador, residuos e observacoes | `ManifestCreateView.vue` + `ManifestCreateForm.vue` cobrem criacao guiada com catalogos, busca de parceiros e submit opcional | Representado | Fluxo coberto com UX mais estruturada e integrada aos catálogos internos |
| Modelo de manifesto | `Cadastrar ou Editar Modelo do MTR` | Nao ha rota/view/componente especifico para modelos em `router.js` e `frontend/src/views/**` | Ausente | Gap funcional direto frente ao SIGOR auditado |
| Listagem de MTRs | `Meus MTRs` com filtros e visoes por papel | `ManifestsView.vue`, `ManifestList.vue` e `ManifestFilters.vue` consolidam listagem, selecao, sync e acoes por manifesto | Representado | SICAT cobre a listagem, mas em UX unica e mais operacional |
| Relatorio dos MTRs | Tela dedicada de relatorio com filtros por periodo/papel/contrapartes | Nao ha view dedicada de relatorio; `ManifestsView.vue` concentra listagem operacional | Parcial | O SICAT privilegia consulta operacional da lista; nao ha evidencia de relatorio dedicado equivalente |
| MTRs provisorios | Tela de cadastro/listagem/impressao de provisórios | Nao ha rota, view ou cliente API especifico para provisórios no frontend | Ausente | Gap de cobertura frente ao menu do gerador auditado |
| Recebimento de MTR pelo destinador | Recebimento dentro de `Meus MTRs`, incluindo codigo de barras e provisório | `ManifestsView.vue` implementa recebimento por selecao/modal; `CetesbOperationalFlowsPanel.vue` e `useCetesbOperationalFlows.js` tambem expõem recebimento a partir do manifesto | Parcial + Diferente | SICAT cobre recebimento por manifesto conhecido, mas nao ha evidencia de entrada por codigo de barras nem fluxo especifico para provisório |
| MTR complementar para armazenamento temporario | Tela dedicada com pesquisa, selecao e formulario complementar | Nao ha view/rota/componente dedicado a manifesto complementar | Ausente | Gap claro para o papel `destino final` |
| Relatorio de MTRs em armazenamento temporario | Tela dedicada no perfil `destino final` | Nao ha evidencia de relatorio especifico no frontend | Ausente | Depende de validacao de contrato se o objetivo for paridade funcional |
| Detalhe do manifesto | No SIGOR a operacao fica espalhada por telas/listagens | `ManifestDetailView.vue` centraliza dados do manifesto e redireciona recebimento/CDF para a listagem | Diferente + Extra SICAT | SICAT cria uma tela de detalhe propria, inexistente como ponto central no mapa auditado |
| DMR - nova declaracao | `Nova DMR - Gerador` e `Nova DMR - Destinador` | Sem rotas/views/componentes/cliente API de DMR no frontend atual | Ausente | Gap funcional relevante frente ao mapa auditado |
| DMR pendente | `Cadastrar DMRs Pendente` | Sem evidencia frontend | Ausente | Mesmo dominio de gap de declaracoes |
| Historico de DMRs | `Minhas DMRs` com exportacao e historico | Sem evidencia frontend | Ausente | Nao representado hoje no SICAT UI |
| CDF - consulta | `Meus CDFs` com filtros por papel e periodo | `DestinadorCdfWorkspace.vue`, `CetesbOperationalFlowsPanel.vue` e `api.js` expõem listagem de certificados, download direto e download via job | Representado | Cobertura existe, mas por workspace operacional e nao por tela dedicada `Meus CDFs` |
| CDF - geracao de MTR emitido pelo SIGOR | Variante dedicada no menu `Certificado` | `DestinadorCdfWorkspace.vue` e `CetesbOperationalFlowsPanel.vue` expõem geracao generica de CDF por janela e/ou manifestos selecionados | Parcial | SICAT cobre a operacao principal, mas nao explicita as variantes do SIGOR como telas separadas |
| CDF - sem MTR / nao emitido pelo sistema | Variante dedicada no menu `Certificado` | Sem componente/rota especifica para essa variante | Parcial | A geracao generica nao prova cobertura do caso sem MTR; exige validacao de contrato |
| CDF - residuos de acidentes sem MTR | Variante dedicada com dados adicionais de acidente | Sem view/componente especifico | Ausente | Gap funcional especializado |
| Configuracoes do empreendimento | `Meus Dados` com cadastro detalhado do empreendimento | `SessionAccountView.vue` mostra contexto de sessao/conta; nao ha editor de cadastro CETESB equivalente | Ausente | SICAT mostra contexto operacional, nao substitui o formulario cadastral do SIGOR |
| Usuarios do empreendimento | `Meus Usuarios` | Nao ha tela equivalente de gestao local CETESB; `AccessAdminView.vue` e global do SICAT | Diferente | SICAT oferece administracao interna global, nao a mesma gestao local do empreendimento do SIGOR |
| Alterar senha CETESB | Tela `Alterar Senha de Acesso` | Sem tela de troca de senha CETESB no frontend | Ausente | Gap de autoatendimento em relacao ao portal |
| Ajuda publica/autenticada | Manual, FAQ, primeiro acesso, recuperacao de senha e menu `Ajuda` | Nao ha view de ajuda/FAQ/manual no frontend | Ausente | SICAT hoje nao expõe uma camada de ajuda equivalente |

## O que o SICAT representa hoje do SIGOR

### Cobertura direta ou proxima

- criacao de manifesto para o papel gerador
- listagem operacional de manifestos
- detalhe consolidado de manifesto
- recebimento de manifesto pelo destinador, quando o manifesto ja esta identificado
- geracao e consulta de CDF em fluxo operacional proprio
- autenticacao e selecao de conta CETESB para operar os fluxos integrados

### Cobertura com mudanca forte de UX

- home autenticada: SIGOR usa home-hub; SICAT usa dashboard com indicadores
- recebimento/CDF: SIGOR espalha por menus do papel; SICAT centraliza na listagem e no detalhe operacional
- consulta de certificados: SIGOR tem tela `Meus CDFs`; SICAT embute em workspace do destinador e painel contextual do manifesto

## O que e diferente no SICAT em relacao ao SIGOR

- o SICAT substitui a home publica do SIGOR por login interno do produto e uma segunda etapa de conta CETESB
- a navegacao do SICAT e curta e transversal: `Dashboard`, `Manifestos`, `Jobs`, `Sessao`, `Acessos`; o SIGOR auditado e mais amplo e mais orientado a menus por papel
- o SICAT concentra operacoes em torno do manifesto espelhado e do contexto de integracao, nao em formularios isolados por submenu do portal
- a administracao do SICAT e interna ao produto, com RBAC, sessoes e usuarios globais, enquanto o SIGOR expõe configuracoes mais locais do empreendimento/autenticacao

## O que o SICAT adiciona sobre o SIGOR

| Extra SICAT | Evidencia | Valor agregado |
| --- | --- | --- |
| Autenticacao propria do SICAT | `LoginView.vue`, `stores/auth.js`, `api.js` (`sicatLogin`, `sicatRegister`) | separa identidade do produto da credencial CETESB |
| Selecao e persistencia de multiplas contas CETESB | `CetesbAccountSelectionView.vue`, `auth.js`, `api.js` (`listSicatCetesbAccounts`, `activateSicatCetesbAccount`) | melhora operacao multi-conta sem repetir login browser-first |
| Dashboard operacional e observabilidade | `DashboardView.vue`, `api.js` (`getDashboardOverview`) | adiciona health, workers, DLQ e metricas, inexistentes no SIGOR auditado |
| Monitor de jobs e DLQ | `JobsView.vue`, `api.js` (`getActiveJobs`, `getDLQJobs`, `requeueDLQJob`, `deleteDLQJob`) | adiciona operacao assíncrona controlada, auditoria e retry |
| Acoes em lote sobre manifestos | `ManifestsView.vue`, `api.js` (`batchSubmitManifests`, `batchCancelManifests`) | acelera operacao em massa, nao observada no portal auditado |
| Fluxo de detalhe operacional do manifesto | `ManifestDetailView.vue` | cria ponto de inspeção/estado do espelho local |
| Workspace operacional de CDF por selecao | `DestinadorCdfWorkspace.vue` | coloca o CDF em fluxo de selecao e contexto, em vez de navegar por tela separada |
| Administracao global de acessos | `AccessAdminView.vue`, `api.js` (`listAdminAccessUsers`, `listAdminAccessRoles`, `listAdminAccessPermissions`, `listAdminAccessSessions`) | capacidade de produto interna, sem equivalente direto no SIGOR auditado |
| Rastreabilidade frontend | `api.js` gera `X-Correlation-Id`; `JobsView.vue` usa trilha de auditoria | reforca observabilidade e diagnostico |

## Lacunas e cobertura parcial do SICAT frente ao mapa SIGOR

### Gaps funcionais claros no frontend atual

- DMR completo: nova declaracao, pendencias e historico nao possuem evidencia de UI nem cliente API.
- Configuracoes do empreendimento CETESB: `Meus Dados`, `Meus Usuarios` e `Alterar Senha` nao estao representados como experiencias equivalentes.
- Ajuda/FAQ/manual/primeiro acesso/recuperacao de senha CETESB nao existem como superficie do frontend.
- Fluxos especializados de manifesto: modelo, provisorio, complementar de armazenamento temporario e relatorio de armazenamento temporario nao aparecem no SICAT.
- Variantes especializadas de CDF: `sem MTR/nao emitido pelo sistema` e `acidentes sem MTR` nao aparecem como UX dedicada.

### Cobertura parcial que exige cuidado de backlog

- relatorios de MTR: a listagem operacional existente nao comprova paridade com a tela dedicada de relatorios do SIGOR
- recebimento do destinador: cobertura existe, mas sem evidencia de leitura por codigo de barras ou provisório
- CDF: a geracao generica cobre parte da intencao, mas nao prova aderencia as tres variantes de negocio observadas no portal

## Dependencias e risco de backend/contrato

### Blockers ou riscos identificados

- `frontend/src/services/api.js` expõe clientes para manifestos, recebimento, CDF, dashboard, jobs, sessao e administracao interna, mas nao mostra superficie equivalente para DMR, configuracoes CETESB, ajuda/FAQ ou fluxos especializados de manifesto.
- como a fase atual e apenas frontend/documentacao, nao foi validado se esses gaps sao apenas ausencia de UI ou ausencia real de contrato backend.
- para relatorios dedicados, variantes especializadas de CDF e fluxos como `MTR complementar` e `MTR provisório`, a falta de evidência no cliente frontend torna provavel uma dependencia de contrato/API ainda nao confirmada.

### Decisao sobre a fase 03

`03-backend-contracts` e **requerida** se o objetivo do trabalho for orientar backlog de paridade funcional com o SIGOR alem do que o SICAT ja cobre hoje.

Motivo:

- os maiores gaps encontrados nao sao apenas de layout; eles dependem de saber se existem ou nao contratos backend para DMR, configuracoes CETESB, relatorios e variantes especializadas de manifesto/CDF
- sem essa verificacao, parte do gap map ficaria ambigua entre `ausencia de UI` e `ausencia de capacidade de plataforma`

Se o objetivo imediato for apenas registrar a superficie atual do produto, a fase 03 pode ser adiada. Se a intencao for planejar implementacao ou priorizacao de backlog contra o mapa auditado do SIGOR, ela nao deve ser pulada.

## Mapa pratico por area, fluxo e status

| Area | Fluxo/tela do SICAT | Componentes principais | Status vs SIGOR | Observacao |
| --- | --- | --- | --- | --- |
| Autenticacao | Login SICAT | `LoginView.vue` | Diferente | camada propria do produto |
| Autenticacao | Selecao de conta CETESB | `CetesbAccountSelectionView.vue` | Diferente | substitui login browser-first do SIGOR |
| Home | Dashboard | `DashboardView.vue` | Diferente/Extra | observabilidade e KPIs |
| Manifestos | Lista operacional | `ManifestsView.vue`, `ManifestList.vue`, `ManifestFilters.vue` | Representado | cobre lista base de MTRs |
| Manifestos | Criacao de manifesto | `ManifestCreateView.vue`, `ManifestCreateForm.vue` | Representado | cobre `Novo MTR` |
| Manifestos | Detalhe de manifesto | `ManifestDetailView.vue` | Extra SICAT | ponto de inspeção proprio |
| Manifestos | Recebimento de MTR | `ManifestsView.vue`, `CetesbOperationalFlowsPanel.vue`, `useCetesbOperationalFlows.js` | Parcial | sem evidencia de barcode/provisorio |
| Certificado | Workspace CDF do destinador | `DestinadorCdfWorkspace.vue` | Parcial | geracao/consulta generica |
| Certificado | Painel CDF no detalhe | `CetesbOperationalFlowsPanel.vue` | Parcial/Extra | CDF contextual por manifesto |
| Sessao | Sessao e conta | `SessionAccountView.vue` | Diferente | contexto operacional, nao cadastro SIGOR |
| Operacao interna | Monitor de jobs | `JobsView.vue` | Extra SICAT | fila, DLQ, auditoria |
| Administracao interna | Perfis e acessos | `AccessAdminView.vue` | Extra SICAT | RBAC e sessoes globais |
| Declaracoes | DMR | sem evidencia | Ausente | requer fase 03 para confirmar contratos |
| Configuracoes CETESB | meus dados/usuarios/senha | sem evidencia equivalente | Ausente | SICAT so mostra sessao/global admin |
| Ajuda | FAQ/manual/primeiro acesso | sem evidencia | Ausente | sem camada publica equivalente |

## Validacoes desta fase

- leitura dos handoffs auditados do SIGOR concluida
- leitura das views, componentes, composables e servicos centrais do frontend SICAT concluida
- confirmada ausencia de erros atuais em `frontend/src/views` e `frontend/src/components`
- classificacao baseada apenas em evidencia documental/auditada para SIGOR e evidencia de arquivos reais para SICAT

## Handoff para proxima fase

Proximo agente recomendado: `programador-backend-mtr` na fase `03-backend-contracts`.

Objetivo do proximo handoff:

- verificar se existem contratos/backend para DMR, relatorios, configuracoes CETESB, manifesto complementar, provisório e variantes especializadas de CDF
- separar definitivamente o que e `gap de frontend` do que e `gap de plataforma`
- produzir `docs/handoffs/sigor-sicat-gap-map/03-backend-contracts.md`

Se o runtime nao permitir a chamada do proximo especialista, entregar `next_agent_required` com esse objetivo e com este checkpoint como fonte imediata.
