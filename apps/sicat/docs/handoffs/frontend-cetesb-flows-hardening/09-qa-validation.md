# 09 - QA Validation

## Objective

Executar a validacao mais completa viavel no ambiente atual para os fluxos frontend CETESB de recebimento de manifesto, geracao de CDF, consulta de certificados e download de PDF, indo alem da cobertura anterior baseada apenas em mocks Playwright e registrando findings acionaveis.

## Environment Actually Used

- workspace local: `c:\GIT\PADILHA\sicat`
- sistema operacional: Windows
- shell de execucao: PowerShell
- frontend validado a partir de `frontend/` com `vite build` e `playwright`
- backend local ja ativo em `http://127.0.0.1:8080`
- endpoint de health confirmado durante esta fase: `GET /health/system` -> `healthy`
- validacao autenticada de download PDF executada contra a API local com login SICAT real do ambiente e documento persistido localmente no Postgres/storage

## Files Analyzed

- `docs/handoffs/frontend-cetesb-flows-hardening/00-orchestration.md`
- `docs/handoffs/frontend-cetesb-receive-cdf-flows/09-qa-validation.md`
- `docs/handoffs/frontend-cetesb-receive-cdf-flows/10-documentation-final.md`
- `docs/handoffs/frontend-cetesb-receive-cdf-flows/11-release-readiness.md`
- `docs/handoffs/cetesb-mtr-real-receive-cdf-flows/10-documentation-final.md`
- `frontend/src/services/api.js`
- `frontend/src/composables/useCetesbOperationalFlows.js`
- `frontend/src/components/CetesbOperationalFlowsPanel.vue`
- `frontend/src/views/ManifestDetailView.vue`
- `frontend/tests/ui/cetesb-operational-flows.spec.js`
- `tests/api/sicat-dual-auth.test.js`

## Validations Attempted

### 1. Revisao estatica focada

- leitura dirigida dos handoffs anteriores para identificar riscos residuais abertos e cobertura ja existente;
- leitura dos arquivos frontend envolvidos no painel operacional CETESB e da suite Playwright focada;
- verificacao de erros editoriais nos arquivos frontend relevantes.

### 2. Build do frontend

- comando: `frontend: npm run build`
- objetivo: garantir que o painel CETESB continua compilando no estado atual do workspace.

### 3. Regressao UI automatizada focada

- comando: `frontend: npx playwright test tests/ui/cetesb-operational-flows.spec.js`
- objetivo: revalidar estados principais do painel CETESB, payloads enviados e interacoes de UI.

### 4. Disponibilidade real do backend local

- comando: `Invoke-RestMethod http://127.0.0.1:8080/health/system`
- objetivo: confirmar que a stack local estava utilizavel para smoke real, nao apenas para testes mockados.

### 5. Smoke autenticado do endpoint real de download PDF

- login real na API local via `POST /v1/sicat/auth/login` com usuario de QA presente no ambiente;
- seed controlado em banco e storage local de uma entidade/documento `cdf_pdf`;
- requisicao autenticada para `GET /v1/cdf/documents/{documentId}?integrationAccountId=...&sessionContextId=...` com `Accept: application/pdf`.
- objetivo: validar em runtime o caminho autenticado de entrega do PDF pelo backend interno consumido pelo frontend.

## Results

### Build do frontend

- PASS
- `vite build` concluiu com sucesso no workspace atual.

### Suite Playwright focada

- PASS
- `1 passed`
- cobertura reexecutada confirmou:
  - renderizacao do painel operacional;
  - loading inicial e refresh da consulta de certificados;
  - estado vazio e estado de erro da listagem;
  - envio de payload esperado em `manifest.receive`;
  - envio de payload esperado em `cdf.generate`;
  - download direto de PDF no frontend;
  - enfileiramento de `cdf.download` com acompanhamento de job mockado.

### Backend local

- PASS
- `GET /health/system` retornou `healthy`.

### Download PDF autenticado em runtime local

- PASS
- `GET /v1/cdf/documents/{documentId}` retornou:
  - status `200`
  - `Content-Type: application/pdf`
  - `Content-Disposition: inline; filename="cdf-qa-<timestamp>.pdf"`
  - corpo com prefixo `%PDF-qa-runtime%`
- conclusao: o backend local serviu corretamente um documento CDF persistido via caminho autenticado que o frontend consome para `Baixar PDF`.

## Findings Ordered By Severity

1. Medium - Ainda nao houve E2E comprovado contra CETESB real para `manifest.receive`, `cdf.generate`, consulta remota de certificados e streaming real de jobs.
   - Evidencia: nesta rodada foi possivel comprovar build, regressao UI mockada, health do backend e entrega real de PDF persistido localmente, mas nao a execucao remota ponta a ponta dependente de sessao CETESB valida.
   - Impacto: permanecem riscos de timing, sessao, headers remotos, NDJSON em runtime real e comportamento do gateway fora do ambiente controlado.
   - Owner recomendado se for priorizado reduzir este risco: `integrador-cetesb-mtr` para smoke real de integracao; `frontend-vue-ux-mtr` apenas se a validacao real revelar problema de UX ou consumo do stream.

2. Low - Existe aviso editorial no frontend composable ligado a padrao de string replacement.
   - Evidencia: `frontend/src/composables/useCetesbOperationalFlows.js` reporta preferencia por `replaceAll()` no lugar de `replace()` para sanitizacao de documento do gerador.
   - Impacto: nao bloqueia build nem fluxo funcional validado nesta fase, mas pode virar ruido em gates mais estritos de lint/editor.
   - Owner recomendado se houver saneamento de qualidade: `frontend-vue-ux-mtr`.

## Residual Risks After This QA Round

- os caminhos reais dependentes de CETESB externo continuam sem evidencia ponta a ponta nesta maquina;
- o stream NDJSON de jobs segue validado principalmente por simulacao, nao por observacao completa de reconexao/timing com backend+gateway reais;
- o smoke real executado para PDF cobre o caminho de entrega de documento persistido localmente, nao o fallback remoto de impressao CETESB;
- nao foi executado smoke responsivo/manual em multiplos breakpoints especificamente para este painel nesta rodada.

## Explicit Next Handoff Owner

Proximo owner explicito: `documentador-mtr`.

Motivo:

- esta fase de QA foi concluida com checkpoint persistido e evidencia adicional real registrada;
- nao foi identificado bloqueio funcional que obrigue correcao imediata de codigo antes da documentacao final;
- os riscos remanescentes precisam ser consolidados no handoff final com destaque para a ausencia de E2E CETESB real.

Prompt sugerido:

```text
next_agent_required
Agente: documentador-mtr
Work ID: frontend-cetesb-flows-hardening

Ler primeiro:
- docs/handoffs/frontend-cetesb-flows-hardening/00-orchestration.md
- docs/handoffs/frontend-cetesb-flows-hardening/09-qa-validation.md
- docs/handoffs/frontend-cetesb-receive-cdf-flows/10-documentation-final.md
- docs/handoffs/frontend-cetesb-receive-cdf-flows/11-release-readiness.md
- docs/handoffs/cetesb-mtr-real-receive-cdf-flows/10-documentation-final.md

Objetivo:
- produzir docs/handoffs/frontend-cetesb-flows-hardening/10-documentation-final.md
- consolidar a rodada de hardening com a nova evidencia de QA
- destacar findings, riscos residuais e o limite atual de ausencia de E2E CETESB real
```

## Revalidation Delta After Backend Fix For partnerCode Resolution

### Delta Objective

Revalidar especificamente o blocker registrado na fase 02 depois da correção em `src/services/manifest-service.ts`, priorizando comprovar que o fluxo autenticado normal do frontend para `GET /v1/cdf/certificates` funciona com bearer SICAT e contexto operacional real, sem depender de JWT CETESB no header da requisição.

### Additional Files Analyzed In This Delta

- `docs/handoffs/frontend-cetesb-flows-hardening/02-integration.md`
- `docs/handoffs/frontend-cetesb-flows-hardening/03-backend-contracts.md`
- `docs/handoffs/frontend-cetesb-flows-hardening/09-qa-validation.md`
- `docs/handoffs/frontend-cetesb-receive-cdf-flows/10-documentation-final.md`
- `tests/api/sicat-dual-auth.test.js`
- `src/routes/api-routes.ts`
- `src/services/manifest-service.ts`
- `package.json`
- `src/server.ts`

### Additional Validations Attempted In This Delta

#### 6. Health check da API local padrão

- comando: `Invoke-RestMethod http://127.0.0.1:8080/health/system`
- objetivo: confirmar se a stack padrão disponível na máquina estava apta a receber o reteste.

#### 7. Regressão automatizada focada do backend

- comando: `npx tsx --test tests/api/sicat-dual-auth.test.js --test-name-pattern "GET /v1/cdf/certificates deve preservar o fallback de partnerCode do sessionContext no fluxo SICAT"`
- objetivo: comprovar no runner correto do projeto que o service não volta a enviar `partnerCode: null` quando a operação está ancorada em `sessionContextId`.

#### 8. Smoke real repetido contra a API local já ativa em `:8080`

- fluxo executado:
  - `POST /v1/sicat/auth/register`
  - `POST /v1/sicat/auth/login`
  - `POST /v1/sicat/cetesb-accounts`
  - `POST /v1/sicat/cetesb-accounts/{accountId}/activate`
  - `GET /v1/sicat/session`
  - `GET /v1/cdf/certificates?integrationAccountId=...&sessionContextId=...&dateFrom=2026-04-01&dateTo=2026-04-19`
  - `GET /v1/manifestos?...&forceSync=true`
- autenticação usada na consulta: somente `Authorization: Bearer <token SICAT>`
- objetivo: verificar se a instância local padrão já refletia a correção de backend.

#### 9. Smoke real repetido contra uma instância isolada do código atual em `:8081`

- bootstrap isolado: `PORT=8081 CETESB_GATEWAY_MODE=real npm run start`
- fluxo repetido: mesmo fluxo do item 8, com novo usuário SICAT temporário e nova vinculação/ativação de conta CETESB real.
- autenticação usada na consulta: somente `Authorization: Bearer <token SICAT>`
- objetivo: separar problema de código do workspace de problema de processo/stack desatualizada em execução.

#### 10. Recuperação de trilha de auditoria das novas consultas

- `GET /v1/audit/{correlationId}` para as chamadas de certificados e manifestos da rodada.
- objetivo: verificar se a revalidação ficava apoiada também em audit trail persistido, não apenas em status HTTP observado em runtime.

### Delta Results

#### Health da stack padrão

- PASS
- `GET /health/system` em `:8080` retornou `healthy`.

#### Regressão automatizada focada do backend

- PASS
- o runner `tsx --test` concluiu sem falhas (`13 passed` no arquivo, incluindo o cenário focal de `GET /v1/cdf/certificates`).
- evidência funcional do teste focal:
  - a resposta HTTP permaneceu `200`;
  - `capturedOptions.jwtToken === null`;
  - `capturedOptions.partnerCode === undefined`;
  - o fluxo preservou o fallback de `partnerCode` do `sessionContext` em vez de forçar override nulo vindo do JWT da requisição.

#### Smoke real contra `:8080`

- MIXED
- sucesso comprovado em:
  - criação de usuário SICAT temporário;
  - login SICAT;
  - vinculação de conta CETESB real;
  - ativação da conta com `integrationAccountId` e `sessionContextId` reais;
  - `GET /v1/sicat/session` retornando a conta ativa;
  - `GET /v1/manifestos?...&forceSync=true` retornando `200` com leitura remota segura.
- bloqueio ainda observado apenas nessa instância:
  - `GET /v1/cdf/certificates` retornou `400 Bad Request` com `detail: "partnerCode é obrigatório para esta operação CETESB."`
- conclusão operacional:
  - a API padrão em `:8080` estava saudável, porém aparentemente não refletia a correção já registrada no workspace;
  - o sintoma é compatível com processo local desatualizado, não com regressão confirmada do código atual.

#### Smoke real contra instância isolada `:8081` com o código atual do workspace

- PASS
- o mesmo fluxo autenticado pelo token SICAT normal do frontend retornou:
  - `GET /v1/cdf/certificates` -> `200 OK`
  - `certificateCount = 0`
  - `integrationAccountId` de resposta igual ao contexto ativado
  - `sessionContextId` de resposta igual ao contexto ativado
- não foi enviado JWT CETESB no header da requisição interna usada no smoke; apenas bearer SICAT.
- conclusão: a correção de backend fecha o blocker funcional do caminho normal do frontend quando executada na instância atual do código do workspace.

#### Validação adicional segura de regressão em leitura remota de manifestos

- PASS
- `GET /v1/manifestos?...&forceSync=true` retornou `200` tanto na instância padrão `:8080` quanto na instância isolada `:8081`, com `items = []` e `totalItems = 0` na janela consultada.
- conclusão: outro trecho de leitura tocado pelo mesmo padrão de resolução de autenticação por contexto operacional permaneceu funcional nesta rodada.

#### Auditoria das novas consultas

- PARTIAL
- `GET /v1/audit/{correlationId}` da consulta de manifestos retornou `200` com `entryCount = 1`.
- `GET /v1/audit/{correlationId}` da consulta de certificados retornou `404` tanto na rodada com `:8080` quanto na rodada com `:8081`.
- conclusão: a evidência principal do endpoint de certificados nesta revalidação continua baseada no HTTP observado em runtime e não em audit trail recuperável posterior.

### Updated Findings Ordered By Severity

1. Medium - A stack local padrão em `:8080` estava operacionalmente saudável, porém continuava servindo o comportamento pré-fix para `GET /v1/cdf/certificates`.
   - Evidência: na mesma máquina, com bearer SICAT, `sessionContextId` real e `integrationAccountId` real, `:8080` retornou `400 partnerCode é obrigatório...`, enquanto a instância isolada do código atual em `:8081` retornou `200` para o mesmo fluxo.
   - Impacto: existe risco de falso negativo em QA se a validação for feita contra processo local não reiniciado após a correção.
   - Status: não é blocker do código atual; é limite de ambiente/processo em execução.

2. Low - A trilha de auditoria da consulta de certificados segue não recuperável por `correlationId` mesmo quando a chamada retorna `200`.
   - Evidência: `GET /v1/audit/{correlationId}` da leitura de certificados continuou retornando `404`, enquanto a leitura de manifestos da mesma rodada persistiu auditoria normalmente.
   - Impacto: reduz rastreabilidade posterior da evidência de smoke para esse endpoint específico.

### Updated Mitigation Status

- **target blocker functionally mitigated in current code**
- o bloqueio específico que impedia provar o fluxo frontend-authenticated de `GET /v1/cdf/certificates` sem JWT CETESB foi fechado na instância isolada do código atual.
- o que ainda impede declarar mitigação operacional completa da máquina inteira nesta rodada é o descompasso entre o código do workspace e a stack já em execução em `:8080`.

### What Is Now Explicitly Proven By This Delta

- o caminho SICAT -> vinculação/ativação de conta CETESB -> `sessionContext` real -> `GET /v1/cdf/certificates` funciona no código atual do workspace sem JWT CETESB no header;
- a resposta do endpoint no cenário validado é `200 OK` e preserva `integrationAccountId`/`sessionContextId` do contexto operacional ativo;
- a janela consultada nesta rodada retornou `0` certificados, portanto o sucesso provado é do caminho autenticado e da resolução de `partnerCode`, não da existência de documento para download;
- a regressão automatizada do backend protege o comportamento causal mínimo do fix;
- um caminho adicional seguro de leitura remota (`GET /v1/manifestos?...&forceSync=true`) permaneceu funcional após o ajuste.

### What Remains Unmitigated After This Delta

- a stack local padrão em `:8080` precisa ser reiniciada para que a validação operacional do ambiente padrão reflita o backend corrigido;
- não houve certificado real retornado no período consultado, então continua sem evidência nova de download real de PDF nesta rodada;
- os fluxos `manifest.receive`, `cdf.generate` e streaming NDJSON de jobs continuam sem nova evidência E2E real nesta fase de revalidação específica;
- a ausência de audit trail recuperável para a consulta de certificados continua aberta.

### Explicit Next Handoff Owner After Delta

Proximo owner explicito: `documentador-mtr`.

Motivo:

- a fase de QA foi atualizada com o delta de revalidação apos a correção de backend;
- o blocker funcional alvo foi comprovadamente fechado no código atual;
- os limites remanescentes agora são de ambiente em execução e de cobertura residual, devendo ser consolidados no handoff final.

## Final Delta After Refresh Of The Standard Local Stack On :8080

### Standard Stack Refresh Delta Objective

Fechar a lacuna final de prova operacional causada pela stack local padrão em `:8080` ainda estar executando código anterior ao fix, repetindo o smoke real de `GET /v1/cdf/certificates` exatamente na porta padrão após refresh seguro do ambiente.

### Additional Files Analyzed In This Final Delta

- `docs/handoffs/frontend-cetesb-flows-hardening/02-integration.md`
- `docs/handoffs/frontend-cetesb-flows-hardening/03-backend-contracts.md`
- `docs/handoffs/frontend-cetesb-flows-hardening/09-qa-validation.md`
- `.vscode/tasks.json`
- `scripts/restart-stack-vscode.ps1`
- `tests/api/sicat-dual-auth.test.js`

### Additional Validations Attempted In This Final Delta

#### 11. Refresh seguro da stack local padrão

- comando: `pwsh -ExecutionPolicy Bypass -File .\scripts\restart-stack-vscode.ps1`
- comando: `npm run migrate`
- comando: `$env:CETESB_GATEWAY_MODE='real'; npm run start`
- objetivo: garantir que a API padrão em `:8080` passasse a executar o código atual do workspace antes do reteste real.

#### 12. Health check pós-refresh em `:8080`

- comando: `Invoke-RestMethod http://127.0.0.1:8080/health/system`
- objetivo: confirmar que a instância padrão reiniciada estava saudável antes do smoke autenticado.

#### 13. Smoke real focal de certificados contra a porta padrão

- fluxo executado:
  - `POST /v1/sicat/auth/register`
  - `POST /v1/sicat/auth/login`
  - `POST /v1/sicat/cetesb-accounts`
  - `POST /v1/sicat/cetesb-accounts/{accountId}/activate`
  - `GET /v1/sicat/session`
  - `GET /v1/cdf/certificates?integrationAccountId=...&sessionContextId=...&dateFrom=2026-04-01&dateTo=2026-04-19`
- autenticação usada na consulta: somente `Authorization: Bearer <token SICAT>`
- contexto operacional usado na consulta:
  - `integrationAccountId` real gerado no runtime da rodada
  - `sessionContextId` real gerado no runtime da rodada
- objetivo: confirmar que o ambiente padrão em `:8080` agora reproduz o mesmo sucesso já observado na instância isolada do código atual.

#### 14. Recuperação opcional de auditoria da consulta final

- `GET /v1/audit/{correlationId}` da consulta de certificados reexecutada em `:8080`
- objetivo: verificar se a evidência final também ficava disponível por trilha de auditoria persistida.

### Final Delta Results

#### Refresh da stack padrão

- PASS
- a rotina oficial de stop limpou a porta `8080`, garantiu Postgres ativo e a API padrão foi reiniciada em modo real após `npm run migrate`.

#### Health pós-refresh

- PASS
- `GET /health/system` em `:8080` retornou `healthy` após a reinicialização.

#### Smoke real focal em `:8080`

- PASS
- o fluxo autenticado somente com bearer SICAT retornou:
  - `GET /v1/cdf/certificates` -> `200 OK`
  - `certificateCount = 0`
  - `integrationAccountId` de resposta igual ao contexto ativado na rodada
  - `sessionContextId` de resposta igual ao contexto ativado na rodada
- conclusão operacional:
  - a instância padrão em `:8080` passou a refletir o fix de backend após o refresh;
  - o caminho normal do frontend para `GET /v1/cdf/certificates` ficou comprovado no ambiente padrão, sem JWT CETESB no header da requisição.

#### Auditoria da consulta final

- PARTIAL
- `GET /v1/audit/{correlationId}` da consulta final de certificados permaneceu em `404`.
- conclusão: a prova final do endpoint continua baseada no HTTP observado em runtime para certificados, embora o blocker funcional da porta padrão tenha sido fechado.

### Final Findings Ordered By Severity

1. Low - O gap de prova causado por código stale na stack padrão foi fechado, mas a trilha de auditoria de `GET /v1/cdf/certificates` continua não recuperável por `correlationId`.
   - Evidência: após refresh da stack em `:8080`, a consulta autenticada por bearer SICAT passou a retornar `200`, porém `GET /v1/audit/{correlationId}` da mesma chamada seguiu em `404`.
   - Impacto: não bloqueia o fluxo funcional, mas reduz rastreabilidade posterior da evidência para esse endpoint específico.

### Final Proof-Gap Status

- **closed for the standard local stack on :8080**
- o gap residual descrito no delta anterior era estritamente de ambiente em execução desatualizado.
- após reiniciar a stack padrão e repetir o smoke real focal, a mesma porta `:8080` confirmou o comportamento esperado com bearer SICAT e contexto operacional real.

### Residual Risks After This Final Delta

- a janela consultada continuou retornando `0` certificados, então esta rodada prova o caminho autenticado e a resolução de contexto, não a existência de documento real para download;
- os fluxos `manifest.receive`, `cdf.generate` e streaming NDJSON de jobs continuam fora do escopo desta revalidação final focal;
- a ausência de audit trail recuperável para a consulta de certificados permanece aberta.

### Explicit Next Handoff Owner After Final Delta

Proximo owner explicito: `documentador-mtr`.

Motivo:

- a prova pendente da stack padrão em `:8080` foi fechada nesta fase de QA;
- o checkpoint agora registra o delta final que elimina a dúvida sobre código stale no ambiente local padrão;
- resta consolidar no handoff final o que foi comprovado, o que segue fora do escopo e a pendência residual de auditoria do endpoint de certificados.

Prompt sugerido:

```text
next_agent_required
Agente: documentador-mtr
Work ID: frontend-cetesb-flows-hardening

Ler primeiro:
- docs/handoffs/frontend-cetesb-flows-hardening/00-orchestration.md
- docs/handoffs/frontend-cetesb-flows-hardening/02-integration.md
- docs/handoffs/frontend-cetesb-flows-hardening/03-backend-contracts.md
- docs/handoffs/frontend-cetesb-flows-hardening/09-qa-validation.md

Objetivo:
- produzir docs/handoffs/frontend-cetesb-flows-hardening/10-documentation-final.md
- consolidar que o gap final da stack padrão em :8080 foi fechado após refresh e reteste real
- destacar a pendência residual de audit trail de GET /v1/cdf/certificates
```

## Final Delta - Audit Instrumentation Fix Revalidation On Standard Stack

### Audit Fix Delta Objective

Revalidar especificamente o fix de instrumentação de auditoria para `GET /v1/cdf/certificates` na stack padrão em `:8080`, exigindo evidência dupla na mesma rodada: sucesso do endpoint consumido pelo frontend com bearer SICAT e recuperação posterior via `GET /v1/audit/{correlationId}` para a mesma chamada.

### Additional Files Analyzed In This Audit Fix Delta

- `docs/handoffs/frontend-cetesb-flows-hardening/02-integration.md`
- `docs/handoffs/frontend-cetesb-flows-hardening/03-backend-contracts.md`
- `docs/handoffs/frontend-cetesb-flows-hardening/09-qa-validation.md`
- `tests/api/sicat-dual-auth.test.js`
- `scripts/run-real-tests.ps1`
- `docs/cetesb/mtr.cetesb.sp.gov.br_login.har`

### Additional Validations Attempted In This Audit Fix Delta

#### 15. Health check pré-smoke da stack padrão

- comando: `Invoke-RestMethod http://127.0.0.1:8080/v1/health/system`
- objetivo: confirmar que a API padrão em `:8080` estava saudável antes do reteste focal.

#### 16. Smoke real focal com bearer SICAT + conta CETESB real

- fluxo executado:
  - `POST /v1/sicat/auth/register`
  - `POST /v1/sicat/auth/login`
  - `POST /v1/sicat/cetesb-accounts`
  - `POST /v1/sicat/cetesb-accounts/{accountId}/activate`
  - `GET /v1/cdf/certificates?integrationAccountId=...&sessionContextId=...&dateFrom=2026-04-01&dateTo=2026-04-19`
- autenticação usada na consulta: somente `Authorization: Bearer <token SICAT>`
- contexto operacional usado na consulta:
  - `integrationAccountId = acc_acc_78da04a02f56e473ec8fe8171b`
  - `sessionContextId = scx_5464694e4a86ea53a06429732c`
  - `correlationId = corr_frontend_cetesb_hardening_auditfix_1776559213369`
- objetivo: comprovar em runtime que a rota de certificados em `:8080` funciona no caminho normal do frontend e agora deixa trilha recuperável para a mesma correlação.

#### 17. Recuperação imediata da auditoria da mesma chamada

- chamada executada: `GET /v1/audit/corr_frontend_cetesb_hardening_auditfix_1776559213369`
- objetivo: verificar se o fix de auditoria materializou um registro recuperável para a leitura síncrona de certificados.

#### 18. Regressão automatizada focada do backend para auditoria

- comando: `npx tsx --test tests/api/sicat-dual-auth.test.js --test-name-pattern "GET /v1/cdf/certificates deve persistir auditoria recuperável quando o gateway retorna exchange síncrono"`
- objetivo: confirmar cobertura automatizada do comportamento causal mínimo do fix.

### Audit Fix Delta Results

#### Health da stack padrão em `:8080`

- PASS
- `GET /v1/health/system` retornou `healthy`.

#### Runtime result - `GET /v1/cdf/certificates` em `:8080`

- PASS
- chamada executada com bearer SICAT e contexto operacional real ativado na mesma rodada retornou:
  - `HTTP 200 OK`
  - `certificateCount = 0`
  - `integrationAccountId = acc_acc_78da04a02f56e473ec8fe8171b`
  - `sessionContextId = scx_5464694e4a86ea53a06429732c`
- conclusão operacional:
  - a stack padrão em `:8080` confirmou o caminho autenticado normal do frontend para consulta de certificados;
  - o resultado continua provando o fluxo e a resolução de contexto, não a existência de certificado real na janela consultada.

#### Runtime result - `GET /v1/audit/{correlationId}` da mesma chamada

- PASS
- `GET /v1/audit/corr_frontend_cetesb_hardening_auditfix_1776559213369` retornou:
  - `HTTP 200 OK`
  - `entryCount = 1`
  - `entityType = cdf.certificate.search`
  - `component = cetesb-gateway`
  - `httpMethod = GET`
  - `httpStatus = 200`
  - `endpoint = https://mtrr.cetesb.sp.gov.br/api/mtr/certificadoDestinacao/9/%7BpartnerCode%7D/0/all/%7BdataInicial_dd-MM-yyyy%7D/%7BdataFinal_dd-MM-yyyy%7D`
  - `sanitizedBody.response.objetoResposta = []`
- conclusão operacional:
  - a trilha de auditoria para a busca síncrona de certificados ficou recuperável na mesma stack padrão em `:8080`;
  - a lacuna registrada nas rodadas anteriores para `/v1/audit/{correlationId}` foi fechada para o endpoint alvo desta fase.

#### Regressão automatizada focada do backend para auditoria recuperável

- PASS
- `npx tsx --test tests/api/sicat-dual-auth.test.js --test-name-pattern "GET /v1/cdf/certificates deve persistir auditoria recuperável quando o gateway retorna exchange síncrono"` concluiu com `14 passed` no arquivo e incluiu o cenário focal com `GET /v1/audit/{correlationId} -> 200`.

### Findings Ordered By Severity In This Audit Fix Delta

1. Low - O fix de instrumentação de auditoria está comprovado em runtime e por regressão automatizada, mas a janela consultada continuou sem certificados reais.
   - Evidência: `GET /v1/cdf/certificates` em `:8080` retornou `200` com `certificateCount = 0`, enquanto `GET /v1/audit/{correlationId}` da mesma chamada retornou `200` com `entryCount = 1`.
   - Impacto: o objetivo desta delta foi fechado para rastreabilidade e prova operacional do endpoint; o que permanece fora de prova é apenas a existência de um documento real disponível para download nessa janela.

### What Is Now Explicitly Proven By This Audit Fix Delta

- a stack padrão em `:8080` executa corretamente `GET /v1/cdf/certificates` com bearer SICAT e `integrationAccountId`/`sessionContextId` reais;
- o mesmo `correlationId` da chamada de certificados agora é recuperável em `GET /v1/audit/{correlationId}` na porta padrão do ambiente;
- a entrada de auditoria persistida identifica corretamente a operação como `cdf.certificate.search`, origem `cetesb-gateway`, método `GET` e resposta remota `200`;
- a regressão automatizada focal protege o comportamento do fix contra retorno no shape de exchange síncrono do gateway.

### What Remains Impossible Or Non-code In This Delta

- não foi possível provar download de PDF real de certificado nesta rodada porque a CETESB retornou lista vazia na janela consultada;
- esta delta não cobre `manifest.receive`, `cdf.generate` nem streaming NDJSON de jobs, pois o escopo pedido foi a revalidação do fix de instrumentação de auditoria em certificados;
- qualquer ampliação para localizar um certificado real continua dependente de disponibilidade operacional de dados externos da CETESB, não de mudança de código nesta fase.

### Explicit Next Handoff Owner After This Delta

Proximo owner explicito: `documentador-mtr`.

Motivo:

- o checkpoint de QA agora contém uma delta final visível e verificável para o fix de instrumentação de auditoria;
- a prova obrigatória em runtime foi fechada na stack padrão em `:8080`;
- resta apenas consolidar a evidência e os limites não-código no handoff final.
