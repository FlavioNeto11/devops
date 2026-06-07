# 02 - Integration

## Objective

Reduzir o risco residual de ausencia de evidencia real CETESB para os fluxos frontend de recebimento de manifesto, geracao de CDF e consulta/download de certificados, priorizando validacao ponta a ponta reutilizavel pelos endpoints internos consumidos pelo frontend e registrando com precisao o que foi comprovado e o que permaneceu bloqueado.

## Environment Actually Used

- workspace local: `c:\GIT\PADILHA\sicat`
- sistema operacional: Windows
- shell de execucao: PowerShell
- API local utilizada: `http://127.0.0.1:8080`
- health da API no momento da fase: `GET /health/system` -> `healthy`
- backend local em modo utilizavel para integracao real com CETESB, com acesso externo a `https://mtrr.cetesb.sp.gov.br`
- usuario SICAT temporario criado nesta fase para smoke real via `POST /v1/sicat/auth/register`
- conta CETESB vinculada e ativada nesta fase a partir de credenciais reais ja presentes em artefatos existentes do workspace, sem republicar credenciais neste checkpoint

## Files Analyzed

- `docs/handoffs/frontend-cetesb-flows-hardening/00-orchestration.md`
- `docs/handoffs/frontend-cetesb-flows-hardening/09-qa-validation.md`
- `docs/handoffs/frontend-cetesb-receive-cdf-flows/10-documentation-final.md`
- `docs/handoffs/cetesb-mtr-real-receive-cdf-flows/10-documentation-final.md`
- `src/routes/api-routes.ts`
- `src/services/manifest-service.ts`
- `src/gateways/cetesb-gateway.js`
- `tests/api/sicat-dual-auth.test.js`
- `tests/manual/test-full-flow-with-login.js`
- `docs/legado/autenticacao-cetesb/MTR-REAL-AUTH-COMPLETE.md`

## Real-Smoke Validations Attempted

### 1. Sanity check da stack local

- `GET /health/system`
- objetivo: confirmar que a API local estava apta para tentativa de smoke real nesta fase

### 2. Reaproveitamento de evidencia real preexistente via auditoria

- `GET /v1/audit/corr_frontend_cetesb_hardening_job_001`
- objetivo: verificar se ja havia rastro tecnico de chamada real CETESB para este workstream antes de repetir novos smokes

### 3. Probe negativo controlado do endpoint consumido pelo frontend

- `GET /v1/cdf/certificates` com `integrationAccountId` e `sessionContextId` placeholders
- objetivo: distinguir erro de contrato/rota de erro por contexto operacional inexistente

### 4. Smoke real pelo caminho SICAT -> conta CETESB -> ativacao -> consulta de certificados

- `POST /v1/sicat/auth/register`
- `POST /v1/sicat/cetesb-accounts`
- `POST /v1/sicat/cetesb-accounts/{accountId}/activate`
- `GET /v1/cdf/certificates?integrationAccountId=...&sessionContextId=...&dateFrom=2026-04-01&dateTo=2026-04-19`
- objetivo: validar o caminho mais proximo do uso real do frontend com autenticacao SICAT e contexto operacional ativo

### 5. Retry do smoke real com `partnerCode` explicito na query

- mesma cadeia do item 4, adicionando `partnerCode=176163` na chamada de certificados
- objetivo: verificar se o bloqueio podia ser contornado sem alterar codigo de produto

### 6. Smoke real com JWT real CETESB no header do endpoint interno

- `POST https://mtrr.cetesb.sp.gov.br/api/mtr/carregaDadosLogin`
- `GET /v1/cdf/certificates?integrationAccountId=...&sessionContextId=...&dateFrom=2026-04-01&dateTo=2026-04-19` com `Authorization: Bearer <jwt CETESB>`
- objetivo: separar limitacao do caminho autenticado via SICAT de uma possivel falha no gateway ou no acesso remoto CETESB propriamente dito

### 7. Tentativa de recuperar auditoria dos novos smokes

- `GET /v1/audit/corr_frontend_cetesb_hardening_certificates_001`
- `GET /v1/audit/corr_frontend_cetesb_hardening_certificates_003`
- objetivo: persistir evidencias tecnicas adicionais dos smokes desta fase por correlation id

## Results

### Stack local

- PASS
- `GET /health/system` retornou `healthy`

### Evidencia preexistente reaproveitada

- PASS
- a auditoria `corr_frontend_cetesb_hardening_job_001` mostrou chamadas reais outbound/inbound do `cetesb-gateway` para `GET /api/mtr/certificadoDestinacao/9/{partnerCode}/0/all/{dataInicial_dd-MM-yyyy}/{dataFinal_dd-MM-yyyy}` em `https://mtrr.cetesb.sp.gov.br`
- as respostas remotas registradas nessa trilha retornaram `HTTP 200` com `objetoResposta: []`
- isso comprova que ja havia evidencia de consulta real CETESB para listagem de certificados neste workstream, ainda que sem documento retornado

### Probe negativo controlado

- PASS como diagnostico
- `GET /v1/cdf/certificates` com contexto ficticio retornou `400`
- detalhe observado: `sessionContextId ctx_test_01 was not found.`
- conclusao: a rota e o contrato estavam ativos; o bloqueio era contexto operacional invalido, nao indisponibilidade da API local

### Smoke real via SICAT auth padrao do frontend

- PARTIAL / FAIL no objetivo de consulta final
- sucesso comprovado em:
  - criacao de usuario SICAT temporario
  - obtencao de `accessToken`/`refreshToken`
  - vinculacao de conta CETESB real via `POST /v1/sicat/cetesb-accounts`
  - ativacao da conta via `POST /v1/sicat/cetesb-accounts/{accountId}/activate`
  - obtencao de `integrationAccountId` e `sessionContextId` reais e ativos
- falha na consulta final:
  - `GET /v1/cdf/certificates` retornou `400 Bad Request`
  - detalhe: `partnerCode é obrigatório para esta operação CETESB.`

### Retry com `partnerCode` explicito na query

- FAIL
- mesmo com `partnerCode=176163` na URL, a resposta permaneceu `400 Bad Request` com o mesmo detalhe
- conclusao: o servico nao consumiu esse parametro como override efetivo nesta rota

### Smoke real com JWT CETESB

- PASS
- foi obtido JWT real CETESB via `POST https://mtrr.cetesb.sp.gov.br/api/mtr/carregaDadosLogin`
- a mesma chamada interna `GET /v1/cdf/certificates` executada com:
  - `integrationAccountId` real
  - `sessionContextId` real
  - `Authorization: Bearer <jwt CETESB>`
  - `X-Correlation-Id: corr_frontend_cetesb_hardening_certificates_003`
  retornou `200 OK`
- resultado funcional observado:
  - consulta interna completou com sucesso pelo gateway real
  - `certificateCount = 0` para a janela `2026-04-01` a `2026-04-19`
- conclusao: a integracao real CETESB para listagem de certificados esta funcional no endpoint interno quando o request fornece um JWT cujo `sub` permite derivar `partnerCode`

### Auditoria dos novos smokes

- FAIL para recuperacao posterior por correlation id
- `GET /v1/audit/corr_frontend_cetesb_hardening_certificates_001` -> `404`
- `GET /v1/audit/corr_frontend_cetesb_hardening_certificates_003` -> `404`
- conclusao: nesta rodada nao foi possivel anexar audit trail persistido dos novos probes, apesar de o resultado HTTP das chamadas ter sido capturado em runtime

## Blockers

1. O caminho autenticado exatamente como o frontend opera hoje com token SICAT nao ficou totalmente comprovado para `GET /v1/cdf/certificates`.
   - evidencia: em `src/services/manifest-service.ts`, `listCdfCertificates()` deriva `partnerCode` a partir do JWT presente no header da requisicao (`resolvePartnerCodeFromJwt(requestJwtToken)`), e o token SICAT nao carrega o `sub` CETESB esperado.
   - efeito observado: mesmo com `sessionContextId` valido e conta CETESB ativa, a consulta retornou `400 partnerCode é obrigatório para esta operação CETESB`.

2. O parametro `partnerCode` enviado na query nao mitigou o bloqueio nesta rota.
   - evidencia: retry com `partnerCode=176163` permaneceu em `400` com a mesma mensagem.

3. Nao houve certificado retornado na janela consultada.
   - efeito: nao foi possivel obter evidencia real de download PDF nesta fase.

4. Nao houve alvo operacional seguro e inequívoco para executar `manifest.receive` e `cdf.generate` reais sem assumir payload ou alterar estado externo por tentativa cega.
   - efeito: permaneceu sem evidência E2E real para recebimento de manifesto e geracao de CDF.

5. A auditoria posterior dos novos smokes nao ficou recuperavel pelo endpoint `/v1/audit/{correlationId}`.
   - efeito: a fase dependeu do resultado HTTP observado em runtime e da trilha preexistente `corr_frontend_cetesb_hardening_job_001` para comprovar chamada real remota.

## Mitigation Status Of The Medium Risk

- **partially mitigated**
- reducao objetiva obtida:
  - agora existe evidencia direta de login real CETESB nesta maquina
  - existe evidencia direta de conta CETESB real vinculada e ativada via fluxo SICAT local
  - existe evidencia direta de sucesso (`200`) no endpoint interno `GET /v1/cdf/certificates` atravessando o gateway real CETESB com contexto operacional ativo
  - existe evidencia reutilizada de auditoria real previa para a mesma familia de endpoint CETESB
- limite remanescente:
  - a prova completa do caminho autenticado exatamente como o frontend usa hoje, com token SICAT ate a consulta de certificados, nao ficou fechada por dependencia de `partnerCode` derivado do JWT de request
  - continuam sem evidencia E2E real nesta fase os fluxos `manifest.receive`, `cdf.generate` e download real de PDF de CDF

## Explicit Next Owner

- Proximo owner explicito: `programador-backend-mtr`
- motivo:
  - a principal lacuna remanescente nao e de frontend nem de operacao manual, e sim de como o backend resolve `partnerCode` para `GET /v1/cdf/certificates` quando a requisicao chega autenticada pelo token SICAT normal do frontend
  - para fechar a mitigacao total do risco, o backend precisa decidir se deve derivar `partnerCode` do `sessionContext`, da conta CETESB ativa ou aceitar override contratual explicito sem depender do JWT CETESB no header

## Handoff Suggested

```text
next_agent_required
Agente: programador-backend-mtr
Work ID: frontend-cetesb-flows-hardening

Ler primeiro:
- docs/handoffs/frontend-cetesb-flows-hardening/00-orchestration.md
- docs/handoffs/frontend-cetesb-flows-hardening/09-qa-validation.md
- docs/handoffs/frontend-cetesb-flows-hardening/02-integration.md
- docs/handoffs/frontend-cetesb-receive-cdf-flows/10-documentation-final.md
- docs/handoffs/cetesb-mtr-real-receive-cdf-flows/10-documentation-final.md
- src/services/manifest-service.ts

Objetivo:
- eliminar o bloqueio de `partnerCode` no caminho `GET /v1/cdf/certificates` quando o frontend usa autenticacao SICAT normal
- preservar a regra de gateway unico CETESB
- permitir evidencia E2E do fluxo real sem depender de JWT CETESB no header da requisicao frontend
```

## Final Delta After Safe Read-only Mitigation Round

### Delta Objective

Executar uma ultima rodada estritamente nao destrutiva para reduzir os residuais ainda abertos: tentar localizar algum certificado real com consultas mais amplas, mas ainda razoaveis e compatíveis com as regras remotas da CETESB; verificar se `manifest.receive`, `cdf.generate` e o stream NDJSON de jobs podiam ser considerados provados a partir de evidencia existente; e classificar o `404` recorrente de `GET /v1/audit/{correlationId}` para `GET /v1/cdf/certificates` como bug ou limitacao documentavel.

### Additional Files Analyzed In This Delta

- `docs/handoffs/frontend-cetesb-flows-hardening/00-orchestration.md`
- `docs/handoffs/frontend-cetesb-flows-hardening/02-integration.md`
- `docs/handoffs/frontend-cetesb-flows-hardening/03-backend-contracts.md`
- `docs/handoffs/frontend-cetesb-flows-hardening/09-qa-validation.md`
- `docs/handoffs/cetesb-mtr-real-receive-cdf-flows/10-documentation-final.md`
- `src/services/manifest-service.ts`
- `src/gateways/cetesb-gateway.js`
- `src/routes/api-routes.ts`
- `src/services/audit-service.ts`
- `src/repositories/audit-repo.ts`
- `src/sql/001_init.sql`

### Additional Safe Validations Attempted In This Delta

#### 15. Probe ampliado de certificados em janelas mensais read-only

- fluxo usado: `POST /v1/sicat/auth/register` -> `POST /v1/sicat/auth/login` -> `POST /v1/sicat/cetesb-accounts` -> `POST /v1/sicat/cetesb-accounts/{accountId}/activate` -> repetidos `GET /v1/cdf/certificates`
- autenticacao da consulta: somente bearer SICAT com `integrationAccountId` e `sessionContextId` reais ativados na rodada
- janelas consultadas, todas com no maximo 31 dias:
  - `2026-04-01` a `2026-04-19`
  - `2026-03-01` a `2026-03-31`
  - `2026-02-01` a `2026-02-28`
  - `2026-01-01` a `2026-01-31`
  - mensalmente de `2025-12-01` ate `2025-01-31`
- objetivo: procurar um certificado real sem gerar ou alterar nada no ambiente CETESB

#### 16. Verificacao do limite remoto para janelas maiores

- probe controlado: tentativa de consulta de certificados com janela acima de 31 dias
- objetivo: confirmar se a ampliacao poderia ser feita com uma unica chamada ou precisaria ser fatiada em blocos seguros

#### 17. Consulta passiva de evidencia historica em banco local

- leitura read-only das tabelas `jobs` e `audit_logs`
- objetivo: verificar se ja existiam jobs reais recentes de `manifest.receive`, `cdf.generate`, `cdf.download` ou trilhas tecnicas suficientes para fechar a prova sem disparar nova operacao remota mutavel

#### 18. Leitura passiva do stream NDJSON de um job real ja existente

- `GET /v1/jobs/job_8ceea041ee53eb246845721094/events` com `Accept: application/x-ndjson`
- objetivo: determinar o quanto do caminho de stream pode ser provado sem enfileirar trabalho novo

#### 19. Inspecao estatica do caminho de auditoria de leitura sincronica

- comparacao entre:
  - `searchManifests(..., includeAudit: true)` no gateway
  - `searchCdfCertificates()` no gateway
  - `persistRemoteSearchAudit()` no service
  - `GET /v1/audit/{correlationId}` no audit service/repository
- objetivo: classificar tecnicamente o `404` de auditoria de certificados

### Final Delta Results

#### Busca ampliada de certificados reais

- PASS como mitigacao de risco, sem encontrar documento
- todas as 16 janelas mensais consultadas retornaram `200 OK`
- todas retornaram `totalItems = 0`
- nenhum `documentId`, `certificateCode` ou hash de certificado foi encontrado entre `2025-01-01` e `2026-04-19`
- conclusao: nesta conta/contexto operacional, nao restou evidencia de certificado real disponivel em um horizonte razoavelmente amplo para validacao de download remoto

#### Limite remoto de janela de datas

- PASS como diagnostico
- uma tentativa com janela acima de 31 dias retornou `502` na API interna, com erro remoto CETESB: `O intervalo entre as datas não pode ser maior que 31 dias.`
- conclusao: a estrategia segura correta para ampliar a procura e fatiar a consulta em janelas mensais; consultas mais largas nao sao suportadas pelo remoto

#### Evidencia historica read-only de jobs reais

- PASS como levantamento de evidencia
- a leitura da tabela `jobs` mostrou apenas um job recente desta familia no ambiente: `cdf.download`, `status = dlq`, `correlationId = corr_frontend_cetesb_hardening_job_001`
- nao apareceram jobs reais recentes de `manifest.receive` nem de `cdf.generate` na base local desta maquina
- a leitura de `audit_logs` mostrou varias entradas reais CETESB associadas a `corr_frontend_cetesb_hardening_job_001` para a busca de certificados, todas com `http_status = 200` ou `null` intercalado entre tentativas do worker
- conclusao: existe evidencia historica real de leitura de certificados e de um job real `cdf.download`, mas nao evidencia suficiente para declarar `manifest.receive` ou `cdf.generate` E2E reais como provados nesta rodada read-only

#### Stream NDJSON de jobs com evidencia real preexistente

- PARTIAL
- `GET /v1/jobs/job_8ceea041ee53eb246845721094/events` retornou `200` com `Content-Type: application/x-ndjson; charset=utf-8`
- o corpo retornado incluiu ao menos um evento `job.snapshot` consistente com o job real terminal `cdf.download`
- como o job ja estava terminal (`dlq`), o endpoint encerrou apos o snapshot, exatamente como o codigo da rota define
- conclusao: o caminho NDJSON do backend fica comprovado para leitura de um job real persistido, mas nao para streaming de transicoes ao vivo de um job real novo sem enfileirar uma operacao potencialmente mutavel

#### Classificacao do `404` de auditoria para `GET /v1/cdf/certificates`

- LIKELY BUG / instrumentation gap, nao simples limitacao inevitavel
- evidencias tecnicas convergentes:
  - `GET /v1/audit/{correlationId}` retorna `404` quando nao existem linhas em `audit_logs`; nao ha filtro adicional no endpoint de auditoria
  - a consulta read-only ao banco mostrou `0` linhas para todos os `correlationId` da rodada final de certificados
  - `persistRemoteSearchAudit()` so grava quando recebe `remoteSearch.audit`
  - `searchManifests(... includeAudit: true)` retorna explicitamente `{ items, audit }`, por isso esse caminho consegue persistir auditoria sincronica
  - `searchCdfCertificates()` retorna apenas `result.exchange`, cujo shape traz `request` e `response`, mas nao popula um campo top-level `audit`
- conclusao: no fluxo sincrono de `GET /v1/cdf/certificates`, a instrumentacao atual nao entrega ao service o shape que `persistRemoteSearchAudit()` espera; o `404` observado e coerente com ausencia de persistencia, nao com limitacao do endpoint de leitura de auditoria em si

### Additional Risk Mitigated By This Round

- foi reduzido o risco de falso negativo por janela curta: a busca por certificados foi ampliada com seguranca para 16 janelas mensais consecutivas e continuou vazia
- foi reduzido o risco de duvida sobre o stream NDJSON: agora ha evidencia concreta de que o endpoint de eventos serve NDJSON para um job real ja persistido, ainda que apenas em estado terminal
- foi reduzido o risco de ambiguidade sobre a auditoria: o `404` de certificados ficou tecnicamente classificado como lacuna de instrumentacao muito mais provavel do que simples comportamento esperado do endpoint

### What Remains Impossible Or Unsafe To Mitigate Here

1. Nao e seguro provar `manifest.receive` E2E real apenas com leitura, porque o fluxo remoto altera estado de manifesto na CETESB.
2. Nao e seguro provar `cdf.generate` E2E real apenas com leitura, porque a geracao de certificado tambem e uma operacao remota mutavel.
3. Nao e possivel provar download remoto real de certificado sem que exista ao menos um certificado retornado pela busca; nesta rodada, nenhuma janela consultada trouxe documento.
4. Nao e possivel provar stream NDJSON ao vivo de um job real novo em modo estritamente read-only, porque isso exigiria enfileirar uma nova operacao real.

### Final Mitigation Status For This Phase

- **additional read-only mitigation achieved, but no new real certificate was found**
- o caminho funcional de leitura autenticada de certificados continua comprovado
- o residual que restava sobre existencia de documento real para download nao pode mais ser reduzido com probes seguros razoaveis nesta conta sem depender de evento operacional externo real

### Explicit Code-Change Owner Still Needed

- owner de codigo **nao** e mais necessario para o bloqueio funcional principal do frontend
- owner de codigo **ainda pode ser necessario** apenas se o time quiser corrigir a rastreabilidade de auditoria de `GET /v1/cdf/certificates`
- owner sugerido para essa pendencia residual: `programador-backend-mtr`

### Handoff Suggested After Final Read-only Delta

```text
next_agent_required
Agente: programador-backend-mtr
Work ID: frontend-cetesb-flows-hardening

Ler primeiro:
- docs/handoffs/frontend-cetesb-flows-hardening/02-integration.md
- docs/handoffs/frontend-cetesb-flows-hardening/03-backend-contracts.md
- docs/handoffs/frontend-cetesb-flows-hardening/09-qa-validation.md
- src/services/manifest-service.ts
- src/gateways/cetesb-gateway.js
- src/services/audit-service.ts

Objetivo:
- decidir se vale corrigir a lacuna de instrumentacao de auditoria em `GET /v1/cdf/certificates`
- alinhar o shape retornado por `searchCdfCertificates()` com o que `persistRemoteSearchAudit()` espera, ou ajustar a persistencia para consumir `exchange.request/response`
- preservar o comportamento funcional ja comprovado do fluxo autenticado por bearer SICAT
```
