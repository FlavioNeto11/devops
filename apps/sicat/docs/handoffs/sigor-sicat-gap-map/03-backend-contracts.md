# 03 - Backend Contracts

## Objetivo da fase

Validar se os gaps levantados na comparacao SIGOR vs SICAT sao apenas ausencia de UI/frontend ou se tambem faltam contratos/backend/orquestracao para suportar a paridade funcional.

## Escopo analisado

Focos desta fase:

- DMR
- Relatorios de MTR
- MTR complementar para armazenamento temporario
- MTR provisorio
- configuracoes CETESB do empreendimento
- ajuda/autoatendimento
- variantes especializadas de CDF

## Arquivos analisados

### Checkpoints de entrada

- `docs/handoffs/sigor-sicat-gap-map/00-orchestration.md`
- `docs/handoffs/sigor-sicat-gap-map/06-frontend-ux.md`
- `docs/handoffs/cetesb-platform-complete-navigation/10-documentation-final.md`

### Contrato e superficie HTTP

- `openapi/mtr_automacao_openapi_interna.yaml`
- `src/generated/operations.ts`
- `src/routes/api-routes.ts`

### Services, worker e gateway

- `src/services/manifest-service.ts`
- `src/lib/validators/manifest-validator.ts`
- `src/workers/operation-handlers.ts`
- `src/gateways/cetesb-gateway.js`

## Leitura executiva

O backend atual do SICAT cobre bem o nucleo operacional de manifesto e CDF, mas nao expõe contratos para DMR, MTR provisório ou fluxo dedicado de manifesto complementar para armazenamento temporario. Para configuracoes CETESB do empreendimento, existe apenas suporte adjacente de onboarding/conta/sessao, nao uma superficie equivalente a `Meus Dados`, `Meus Usuarios` e `Alterar Senha` do SIGOR.

O principal caso de cobertura parcial relevante e `CDF`: existe suporte real de backend para geracao, listagem e download de CDF, mas a orquestracao implementada pressupoe manifestos recebidos e nao comprova as variantes `sem MTR/nao emitido pelo sistema` e `residuos de acidentes sem MTR`. Em `Relatorios de MTR`, ha base contratual suficiente para consulta filtrada de manifestos, mas nao ha contrato dedicado de relatorio/exportacao equivalente ao portal.

## Evidencia estrutural principal

### O que o contrato realmente publica hoje

`src/generated/operations.ts` e `src/routes/api-routes.ts` mostram uma superficie publica centrada em:

- autenticacao e conta SICAT/CETESB
- admin de acessos
- session contexts, catalogos e parceiros
- cadastros
- manifestos
- CDF
- jobs, auditoria e health

Nao ha operacoes nomeadas ou rotas para:

- DMR/declaracao
- relatorio de MTR como recurso dedicado
- manifesto provisorio
- manifesto complementar para armazenamento temporario
- ajuda/FAQ/manual
- configuracoes CETESB autenticadas equivalentes a `Meus Dados`, `Meus Usuarios` e `Alterar Senha`

### Limite declarado pelo proprio OpenAPI

O sumario do OpenAPI descreve o contrato interno como automacao de `cadastro, manifesto, recebimento, CDF, impressao, cancelamento, parceiros, catalogos, jobs e auditoria`, sem mencionar DMR, ajuda ou configuracoes CETESB autenticadas.

## Classificacao por area

| Area foco | Status backend/contrato | Evidencia principal | Decisao de paridade |
| --- | --- | --- | --- |
| DMR | No support | sem rotas em `src/routes/api-routes.ts`; sem operacoes em `src/generated/operations.ts`; OpenAPI nao publica recurso de declaracao/DMR | paridade bloqueada por gap real de backend/contrato |
| Relatorios de MTR | Partial support | `GET /v1/manifestos` em `openapi/mtr_automacao_openapi_interna.yaml` e `src/routes/api-routes.ts` oferece pesquisa filtrada por periodo, numero, transportador e destinador; nao existe recurso dedicado de relatorio/exportacao | paridade nao esta totalmente bloqueada para uma tela de consulta, mas a equivalencia com o relatorio do SIGOR exige extensao de contrato |
| MTR complementar para armazenamento temporario | Partial support | `ManifestCreateRequest` no OpenAPI possui `hasTemporaryStorage`, `temporaryStorage` e `temporaryStorageCarrier`; validator e gateway mapeiam armazenamento temporario; nao existe rota/operacao dedicada para manifesto complementar | paridade do fluxo especifico do SIGOR esta bloqueada por gap de backend/orquestracao; existe apenas suporte generico adjacente em manifesto comum |
| MTR provisorio | No support | ausencia de rota/operacao/worker/gateway com `provisorio`; superficie publicada de manifesto cobre draft, submit, print, cancel, receive e replicate | paridade bloqueada por gap real de backend/contrato |
| Configuracoes CETESB do empreendimento | Partial support | existem `GET /v1/auth/partner-info`, `POST/GET /v1/cadastros`, `GET /v1/sicat/session` e contas CETESB vinculadas; nao existem endpoints equivalentes a editar `Meus Dados`, gerir `Meus Usuarios` locais ou alterar senha CETESB | paridade completa bloqueada por gap de backend/contrato; o que existe hoje cobre onboarding e contexto, nao administracao CETESB do empreendimento |
| Ajuda/autoatendimento | No support | sem rotas/operacoes para FAQ, manual, primeiro acesso ou recuperacao de senha CETESB | gap de contrato existe se a ideia for internalizar essas funcoes, mas a paridade basica de UX nao depende de backend novo para links, texto estatico ou encaminhamento externo |
| Variantes especializadas de CDF | Partial support | existem `/v1/cdf/generate`, `/v1/cdf/download`, `/v1/cdf/certificates` e `/v1/cdf/documents/{documentId}`; o worker `handleCdfGenerate` sempre pesquisa manifestos recebidos e falha se `effectiveManifestList` vier vazio | CDF padrao esta suportado; variantes `sem MTR` e `acidentes sem MTR` seguem bloqueadas por gap real de backend/orquestracao |

## Detalhamento por area

### 1. DMR

Status: `No support`.

Evidencia:

- `src/routes/api-routes.ts` nao publica nenhuma rota de `declaracao`, `dmr` ou recurso equivalente.
- `src/generated/operations.ts` nao lista operacoes de DMR.
- `openapi/mtr_automacao_openapi_interna.yaml` nao descreve schemas nem paths de DMR.
- `src/workers/operation-handlers.ts` nao possui operacoes assíncronas nessa area.

Decisao:

O gap identificado no frontend nao e apenas de UI. Hoje falta capacidade real de plataforma para qualquer cobertura de `Nova DMR`, `DMR pendente` ou `Minhas DMRs`.

### 2. Relatorios de MTR

Status: `Partial support`.

Evidencia:

- `GET /v1/manifestos` em `openapi/mtr_automacao_openapi_interna.yaml` publica pesquisa por `dateFrom`, `dateTo`, `manifestNumber`, `carrierQuery`, `receiverQuery`, `status`, `generatorCode`, `carrierCode` e `receiverCode`.
- `src/services/manifest-service.ts` implementa `listManifests` com filtros operacionais e sincronizacao com a CETESB.
- nao existe endpoint especifico de `relatorio`, nem exportacao agregada dedicada, nem schema com semantica propria de relatorio.

Decisao:

Se a meta for apenas uma tela de consulta filtrada, o frontend pode atingir paridade aproximada usando o contrato existente. Se a meta for equivaler ao modulo `Relatório dos MTRs` do SIGOR como recurso proprio, com comportamento e saidas dedicadas, existe gap de contrato.

### 3. MTR complementar para armazenamento temporario

Status: `Partial support`.

Evidencia:

- `ManifestCreateRequest` no OpenAPI aceita `hasTemporaryStorage`, `temporaryStorage` e `temporaryStorageCarrier`.
- `src/lib/validators/manifest-validator.ts` valida os campos de armazenamento temporario quando `hasTemporaryStorage=true`.
- `src/gateways/cetesb-gateway.js` mapeia `manNomeMotoristaArmazenamentoTemporario`, `manPlacaVeiculoArmazenamentoTemporario`, `manObservacaoArmazenadorTemporario`, `manDataRecebimentoArmazenamentoTemporario` e parceiros de armazenador/transportador temporario.
- apesar disso, `src/routes/api-routes.ts` nao publica nenhum recurso dedicado para `manifesto complementar`, e o worker nao tem operacao especifica para esse fluxo.

Decisao:

Existe suporte generico para dados de armazenamento temporario dentro do manifesto comum, mas nao para o fluxo especializado do SIGOR que parte de pesquisa/selecao de manifesto elegivel e complementaridade operacional. Paridade funcional continua bloqueada por backend/orquestracao.

### 4. MTR provisorio

Status: `No support`.

Evidencia:

- `src/routes/api-routes.ts` nao tem rotas para provisório.
- `src/generated/operations.ts` nao publica operacoes de provisório.
- `openapi/mtr_automacao_openapi_interna.yaml` nao descreve recurso de provisório.
- nao houve evidencia correspondente em `src/services/manifest-service.ts`, `src/workers/operation-handlers.ts` ou `src/gateways/cetesb-gateway.js`.

Decisao:

O gap e real de backend/contrato, nao apenas de frontend.

### 5. Configuracoes CETESB do empreendimento

Status: `Partial support`.

Evidencia:

- `GET /v1/auth/partner-info` resolve informacoes do parceiro por documento.
- `POST /v1/cadastros` e `GET /v1/cadastros/{id}` cobrem onboarding/cadastro.
- `GET /v1/sicat/session` e rotas de `sicat/cetesb-accounts` cobrem conta ativa e contexto operacional.
- `src/routes/api-routes.ts` nao expõe recurso autenticado equivalente a `Meus Dados`, `Meus Usuarios` ou `Alterar Senha` CETESB.
- os endpoints de senha existentes em `src/generated/operations.ts` sao de `Admin Access` do SICAT, nao de autoatendimento CETESB do empreendimento.

Decisao:

Ha base para onboarding e contexto de conta, mas nao para a administracao CETESB do empreendimento observada no SIGOR. Paridade completa depende de backend novo ou de uma decisao explicita de redirecionar essas operacoes para fora do SICAT.

### 6. Ajuda/autoatendimento

Status: `No support`.

Evidencia:

- sem paths, schemas ou operacoes de ajuda, FAQ, manual, primeiro acesso ou recuperacao de senha CETESB no OpenAPI, nas rotas ou no generated.
- o backend atual e transacional/operacional; nao existe dominio exposto para conteudo de ajuda.

Decisao:

Aqui o gap precisa ser separado em duas categorias:

- para `manual`, `FAQ`, links de ajuda e orientacao, a paridade e principalmente de frontend/conteudo e nao depende de backend novo;
- para autoatendimento integrado de senha/primeiro acesso CETESB dentro do produto, existe gap real de contrato/backend.

### 7. Variantes especializadas de CDF

Status: `Partial support`.

Evidencia:

- `src/routes/api-routes.ts`, `src/generated/operations.ts` e `openapi/mtr_automacao_openapi_interna.yaml` publicam geracao, download, listagem e proxy de PDF de CDF.
- `src/gateways/cetesb-gateway.js` possui `listCdfResponsibles`, `searchCdfGeneratorPartner`, `searchReceivedManifestsForCdf`, `generateCdf`, `searchCdfCertificates` e `printCdfCertificate`.
- `src/workers/operation-handlers.ts` implementa `handleCdfGenerate`, mas sempre executa `searchReceivedManifestsForCdf` e exige `effectiveManifestList.length > 0`, falhando com `Nenhum manifesto recebido encontrado para gerar CDF.` quando nao ha manifesto recebido elegivel.
- o exemplo de contrato de `CdfGenerateRequest` trabalha com `tipoCertificadoDestinacao`, `listaManifesto` e `listaParceiroGerador`, sem descrever variantes dedicadas do SIGOR.

Decisao:

O backend suporta o caso padrao de CDF baseado em manifestos recebidos e a consulta/download de certificados. Nao ha evidencia de orquestracao pronta para os casos `sem MTR/nao emitido pelo sistema` e `residuos de acidentes sem MTR`. Portanto a lacuna nao e apenas de frontend.

## Matriz final: frontend-only vs backend gap

| Area foco | Predominantemente frontend/UI | Backend/contrato bloqueia paridade? | Leitura final |
| --- | --- | --- | --- |
| DMR | nao | sim | gap real de plataforma |
| Relatorios de MTR | parcialmente | parcialmente | consulta basica pode nascer com contrato atual; relatorio equivalente ao SIGOR nao |
| MTR complementar para armazenamento temporario | nao | sim | campos genericos existem, fluxo dedicado nao |
| MTR provisorio | nao | sim | gap real de plataforma |
| Configuracoes CETESB do empreendimento | nao | sim | conta/sessao existem, configuracao CETESB equivalente nao |
| Ajuda/autoatendimento | sim, em parte | parcialmente | ajuda estatica pode ser UI; autoatendimento CETESB integrado nao |
| Variantes especializadas de CDF | nao | sim | CDF padrao existe, variantes especializadas nao |

## Validacoes desta fase

- checkpoint de frontend lido e confrontado com contrato real
- rotas Express verificadas contra operations geradas
- OpenAPI inspecionado para confirmar recursos publicados e ausencias materiais
- services, gateway e worker lidos apenas nos fluxos necessarios para validar capacidade real
- nenhuma implementacao de produto foi alterada

## Handoff para proxima fase

Proximo agente recomendado: `documentador-mtr` para consolidar o mapa final em `docs/handoffs/sigor-sicat-gap-map/10-documentation-final.md`.

Objetivo do handoff:

- incorporar esta separacao entre `gap de UI` e `gap real de backend/contrato`
- priorizar backlog por area com base na classificacao `backend support`, `partial support` e `no support`
- deixar explicito onde o SICAT pode buscar paridade com frontend/orquestracao e onde precisa expandir plataforma

Se o runtime nao permitir a chamada do proximo especialista, entregar `next_agent_required` para `documentador-mtr` usando este checkpoint e `06-frontend-ux.md` como fontes imediatas.
