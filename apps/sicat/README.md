# MTR CETESB - backend Node com Postgres, fila e gateway real

[![CI Contract + Queue Retry/DLQ](https://github.com/FlavioNeto11/sicat/actions/workflows/ci-contract-queue.yml/badge.svg)](https://github.com/FlavioNeto11/sicat/actions/workflows/ci-contract-queue.yml)

Evolução do stub anterior para uma base operacional com:

Este repositório `sicat` contém, neste momento, o backend de automação MTR CETESB como um dos núcleos principais do produto.

- persistência real em Postgres
- migrations SQL versionadas
- fila transacional baseada em tabela `jobs`
- worker dedicado para `manifest.submit`, `manifest.print`, `manifest.cancel`, `catalog.sync` e `cadastro.submit`
- auditoria técnica por `correlationId`
- persistência de documentos gerados em disco local
- OpenAPI original preservada em `/docs`, `/openapi.yaml` e `/openapi.json`
- gateway CETESB em modo `real` (obrigatório)

## O que muda nesta versão

O modo `real` agora está implementado para os endpoints observados nos HARs:

- `POST /api/mtr/carregaDadosLogin`
- `PUT /api/mtr/manifesto`
- `GET /api/mtr/imprimir/imprimeManifesto/{hash}`
- `POST /api/mtr/manifesto/cancelaManifesto`
- `GET /api/mtr/pesquisaManifesto/...`
- `GET /api/mtr/pesquisaParceiro/...`
- `GET /api/mtr/pesquisaParceiroByCodigo/...`
- `GET /api/mtr/consultaParceiro/J/{documento}`
- catálogos como `estados`, `cidades`, `classes`, `unidades`, `tratamentos`, `abnt` e afins
- `POST /api/cadastro/salvarAcesso`

## Reaproveitamento controlado de sessão/token

A API interna continua expondo `POST /v1/session-contexts`, mas o comportamento agora é:

- se `jwtToken` vier no request, ele é persistido e reutilizado até perto do vencimento
- se `authMode` for `bootstrap` e o `metadata` contiver credenciais + `recaptchaToken`, a API já executa o login real na CETESB e salva o JWT retornado
- quando um job autenticado for executado, o worker reutiliza o JWT salvo
- se o JWT estiver expirando e o `sessionContext` tiver material suficiente para novo login, o worker renova a sessão automaticamente
- se faltar material para renovar, o job falha de forma explícita

## Validação de Payload ✅ NOVO (2026-03-08)

Payloads de manifesto são **validados antes** de enviar para CETESB:

- **Campos obrigatórios**: responsibleName, manifestType, expeditionDate, parceiros (generator, carrier, receiver), resíduos, recaptcha
- **Normalização de data**: previne duplicação de timestamp em `manDataExpedicao`
- **Fail fast**: erro 400 com lista completa de problemas antes de chamar API externa
- **Cobertura**: 26 testes unitários (100% aprovados)
- **Baseado no HAR real**: `docs/cetesb/mtr.cetesb.sp.gov.br_gerar_mtr.har`
- **Documentação completa**: `docs/copilot/validadores/cetesb/validacao-sequencia-mtr.md`

**Beneficios**:

- Reduz chamadas inválidas à CETESB
- Mensagens de erro claras e acionáveis
- Alinhado 100% com padrão HAR real

### Observação importante sobre recaptcha

O login real da CETESB observado nos HARs exige `recaptcha`. Esta entrega **não automatiza o recaptcha**.

**Nota sobre recaptchaToken**: Campo **opcional**. O frontend pode gerar token reCAPTCHA, mas a CETESB **não valida** esse campo via API backend. Pode ser enviado vazio (`""`) ou omitido completamente.

Para operação real, existem dois caminhos práticos:

1. criar o `sessionContext` com um `jwtToken` já obtido
2. criar o `sessionContext` com `metadata.credentials` + `metadata.recaptchaToken` (opcional) e deixar a própria API fazer o bootstrap

Exemplo de `metadata` aceito:

```json
{
  "stateCode": 26,
  "credentials": {
    "login": "31913781000139",
    "email": "usuario@empresa.com",
    "password": "senha"
  },
  "recaptchaToken": "",
  "manifestSearch": {
    "statusFilter": 8,
    "daysBack": 30
  },
  "packagingTypeTieCodigo": 4,
  "residueSearchTerms": ["Classe A"]
}
```

**Observação**: O exemplo acima mostra `recaptchaToken: ""` (vazio), que é aceito pela CETESB via API backend. O campo também pode ser omitido.

### Fluxo operacional recomendado para obter token CETESB

Para padronizar o login real e criação do `sessionContext`, use o script:

```powershell
pwsh -File .\scripts\bootstrap-session-context.ps1 `
  -IntegrationAccountId "acc_nova_it_prod" `
  -PartnerDocument "31913781000139" `
  -PartnerType "J" `
  -PartnerCode 176163 `
  -UserAccessCode 333948 `
  -UserName "Seu Nome" `
  -Email "seu-email@dominio.com" `
  -Password (Read-Host "Senha CETESB" -AsSecureString) `
  -RecaptchaToken ""
```

O script chama `POST /v1/session-contexts` com `authMode=bootstrap`, força o login no gateway real e retorna o `sessionContextId` pronto para uso nos comandos assíncronos (ex.: `catalog-sync`, `manifest.submit`).

**Observação sobre recaptcha**: Campo `recaptchaToken` é **opcional** - CETESB aceita string vazia via API backend. O campo pode ser enviado vazio (`""`) ou omitido. Frontend pode gerar token reCAPTCHA, mas CETESB não o valida via API.

Exemplo de `catalog-sync` usando o `sessionContextId` retornado:

```powershell
$body = @{
  integrationAccountId = 'acc_nova_it_prod'
  sessionContextId     = 'scx_xxx'
  catalogs             = @('states','cities','classes','units','issuingAuthorities','residueTreatments','residueStates','packagingGroups','residueClasses','abnt','generatorAbnt')
  forceRefresh         = $true
  requestedBy          = 'flavio.padilha'
} | ConvertTo-Json -Depth 6

Invoke-RestMethod -Uri 'http://localhost:8080/v1/catalog-sync' -Method Post -Headers @{
  'X-Correlation-Id' = 'corr_catalog_sync_real'
  'Idempotency-Key'  = 'idem_catalog_sync_real'
  'Accept'           = 'application/json'
} -ContentType 'application/json' -Body $body
```

## Stack

- Node.js 20+
- Express
- Postgres (`pg`)
- fila por polling com `FOR UPDATE SKIP LOCKED`
- `fetch` nativo do Node 20 para integração HTTP com a CETESB

## Como subir localmente

### 1) infraestrutura

```bash
cp .env.example .env
npm install
```

Suba um Postgres local ou use Docker Compose:

```bash
docker compose up -d postgres
```

### 2) preparar banco

```bash
npm run migrate
```

### 3) iniciar API e worker

Terminal 1:

```bash
npm start
```

Terminal 2:

```bash
npm run worker
```

## Frontend Vue (novo)

Foi adicionado um frontend separado em `frontend/` para navegação e consulta de manifestos (`GET /v1/manifestos`).

### Funcionalidades

- **Autenticação**: login com token JWT, guards de rota, logout manual/automático
- **Manifestos**: busca, listagem, filtros, paginação, detalhes
- **Auto-inclusão de headers**: `Authorization` (token JWT) e `X-Correlation-Id` em todas as requisições

### Quick start

```bash
cd frontend
npm install
npm run dev
```

**Primeiro acesso**:

1. Acesse `http://localhost:5173`
2. Faça login com credenciais reais CETESB
3. Navegue para manifestos após autenticação

Por padrão, o frontend usa `VITE_API_BASE_URL=http://127.0.0.1:8080`.
Se necessário, copie `frontend/.env.example` para `frontend/.env` e ajuste a URL da API.

### Arquitetura de componentes frontend

- Guia de padronização e reuso de componentes: `docs/FRONTEND-COMPONENTS-ARCHITECTURE.md`

**Modo de autenticação**:

- **Real obrigatório no frontend**: para autenticar, rode backend em `CETESB_GATEWAY_MODE=real`

## Subir tudo via Docker Compose

```bash
docker compose up --build
```

## CI de contrato + fila (retry/DLQ)

Workflow dedicado: `.github/workflows/ci-contract-queue.yml`

Esse pipeline valida apenas o fluxo alterado e estável:

- `npm run test:contract`
- `npm run smoke:job:retry-dlq`

Validação local equivalente:

```bash
npm run migrate
npm run test:contract
npm run smoke:job:retry-dlq
```

## Variáveis principais de configuração

**Modo de operação (padrão: real):**

- `CETESB_GATEWAY_MODE=real` (padrão - conecta com CETESB real)

**Configurações do modo real:**

- `CETESB_TOKEN_HEADER_MODE=both`
- `CETESB_MANIFEST_SEARCH_STATUS_FILTER=8`
- `CETESB_MANIFEST_SEARCH_DAYS_BACK=30`
- `CETESB_DEFAULT_STATE_CODE=26`
- `CETESB_DEFAULT_PACKAGING_TIE_CODIGO=4`
- `CETESB_RESIDUE_SEARCH_SEED_TERMS=Classe A`

## Endpoints auxiliares

- `GET /health`
- `GET /docs`
- `GET /openapi.yaml`
- `GET /openapi.json`
- `GET /v1/manifestos/:id/documents/:documentId`

## Fluxos já conectados ao gateway real

### 1) Session context

`POST /v1/session-contexts`

- persiste contexto de autenticação
- opcionalmente já executa login real e salva JWT

### 2) Manifesto

`POST /v1/manifestos`
`POST /v1/manifestos/:id/submit`
`POST /v1/manifestos/:id/print`
`POST /v1/manifestos/:id/cancel`

No submit real:

- envia `PUT /api/mtr/manifesto`
- captura o hash retornado em `mensagem`
- faz lookup em `pesquisaManifesto` para resolver `manCodigo` e `manNumero`
- persiste os dados externos

Na impressão real:

- usa `GET /api/mtr/imprimir/imprimeManifesto/{hash}`
- persiste o PDF real retornado

No cancelamento real:

- usa `manCodigo` e `manNumero`
- se não existirem localmente, resolve via `pesquisaManifesto` antes de cancelar

### 3) Catálogos

`POST /v1/catalog-sync`

Sincroniza no Postgres os catálogos observados nos HARs.

### 4) Cadastro

`POST /v1/cadastros`

Envia o payload transformado para `POST /api/cadastro/salvarAcesso`.

### 5) Busca de parceiros

`GET /v1/partners/search?q=...`

- tenta primeiro o cache local
- se estiver em `real` e o cache não ajudar, consulta a CETESB e faz upsert local

## Limitações conhecidas

- o HAR confirma o retorno do JWT, mas não prova qual header o front usa depois; por isso o client envia `x-access-token` e `Authorization: Bearer ...` por padrão
- não há automação de recaptcha
- o endpoint de `pesquisaManifesto` foi parametrizado a partir do padrão observado no HAR; o filtro `8` ficou configurável por env
- `cities`, `generatorAbnt` e `packagingTypes` dependem de parâmetros como estado, partnerCode e `tieCodigo`; a API resolve isso a partir do `sessionContext`/conta de integração

## Estrutura

```text
src/
  app.ts
  server.ts
  worker.ts
  bootstrap/
  data/
  db/
  gateways/
    cetesb-gateway.js  # ← permanece JS (DL-093)
  lib/
  middlewares/
  repositories/
  routes/
  services/
  sql/
  workers/
tests/
  smoke/
    manifest-real-integration.test.js  # 5 testes básicos contra CETESB real
    manifest-real-end-to-end.test.js   # 2 testes E2E completos (submit + cancel)
  api/
  integration/
  worker/
```

## Testes End-to-End

Testes completos contra CETESB real implementados em `tests/smoke/manifest-real-end-to-end.test.js`.

**O que é testado:**

- Fluxo completo: Create → Enqueue → Worker → Verify
- Job polling com worker subprocess (`--once` flag)
- Tratamento de intermitência da CETESB API
- Submit e cancelamento de manifestos

**Executar (modo real é padrão):**

```powershell
$env:CETESB_USERNAME = "31913781000139"
$env:CETESB_PASSWORD = "2dlzft"
$env:NODE_EXTRA_CA_CERTS = (Resolve-Path ".\certs\cetesb-chain.pem")
node tests/smoke/manifest-real-end-to-end.test.js
```

**Saída esperada:**

```text
✅ Login realizado
✅ Token JWT obtido para: Nova IT (code: 176163)
✔ deve criar, submeter e verificar manifesto na CETESB (16091ms)
✔ deve criar, cancelar e verificar cancelamento na CETESB (1662ms)
ℹ tests 2
ℹ pass 2
ℹ fail 0
```

**Características:**

- ✅ Polling automático de jobs (1s interval)
- ✅ Worker subprocess trigger quando job `queued`
- ✅ Acceptance de `retry_wait`/`running` (CETESB tem intermitência)
- ✅ Timeout configurável (20s submit, 30s cancel)
- ✅ Logging detalhado de status transitions

**Documentação completa:**

- `docs/copilot/legado/autenticacao-cetesb/15-testes-end-to-end.md` - guia técnico histórico
- `docs/copilot/legado/autenticacao-cetesb/16-resumo-implementacao-e2e.md` - resumo executivo histórico

## Camada de contexto para GitHub Copilot

Este repositório inclui **framework completo de orquestração de agentes** para automatizar desenvolvimento, QA e documentação:

**Estrutura:**

- `.github/copilot-instructions.md` - regras centrais do repositório
- `.github/agents/` - 7 agentes especializados (orquestrador + 5 domínios + meta-evolution)
- `.github/prompts/` - 8 prompts operacionais (3 diários: feature, bug, hardening)
- `.github/skills/` - 6 skills por domínio técnico
- `.github/instructions/` - 8 categorias de regras por tipo de arquivo
- `docs/copilot/` - documentação técnica canônica da camada Copilot
- `docs/README.md` - índice da documentação do repositório

## Documentação canônica (Centro Operacional SICAT)

- [AGENTS.md](AGENTS.md) — arquitetura real, fronteiras e onboarding para qualquer agente.
- [docs/10-estado-atual/estado-atual.md](docs/10-estado-atual/estado-atual.md) — snapshot honesto do que está IMPLEMENTADO, EM PROGRESSO e PLANEJADO.
- [docs/10-estado-atual/PROXIMO_PROMPT.md](docs/10-estado-atual/PROXIMO_PROMPT.md) — próxima frente recomendada e prompt pronto para o orquestrador.
- [docs/_inputs/fonte-de-verdade-backlog-cto.md](docs/_inputs/fonte-de-verdade-backlog-cto.md) — visão de produto/CTO: pilares, KPIs, gaps SIGOR x SICAT e próximas frentes (DMR, MTR provisório, CDF especializado, armazenamento temporário, Command Center).
- [docs/04-arquitetura/centro-operacional-sicat.md](docs/04-arquitetura/centro-operacional-sicat.md) — arquitetura alvo do Centro Operacional (módulos, endpoints, taxonomia).
- [docs/04-arquitetura/command-center-sicat.md](docs/04-arquitetura/command-center-sicat.md) — base estrutural do futuro chat orquestrador (registry + UI palette, sem IA acoplada nesta etapa).
- [docs/05-operacao/taxonomia-status-erros-operacionais.md](docs/05-operacao/taxonomia-status-erros-operacionais.md) — taxonomia canônica dos 13 estados operacionais (label, severity, retryable, bucket, recommendedAction).
- [docs/CHANGELOG-CENTRO-OPERACIONAL.md](docs/CHANGELOG-CENTRO-OPERACIONAL.md) — release notes consolidadas da cadeia `centro-operacional-sicat`.

### Centro Operacional — entrega consolidada

A cadeia `centro-operacional-sicat` (concluída em 2026-04-25) entregou
camada operacional dedicada sobre o núcleo MTR/CDF, sem reescrever o
gateway CETESB nem violar a fronteira
`route → service → repository → job → worker → gateway`.

**Novos endpoints operacionais** (publicados em
[openapi/mtr_automacao_openapi_interna.yaml](openapi/mtr_automacao_openapi_interna.yaml)
e [src/generated/operations.ts](src/generated/operations.ts)):

- `GET /v1/operations/overview` — agregações operacionais (counters de
  jobs por status, succeeded/failed em 24h, manifestos por status,
  sumário de contas/sessões, top-10 DLQ, `recentJobs`, `recentErrors`).
- `GET /v1/jobs/search` — pesquisa avançada de jobs com
  `operationalStatus`, `label`, `severity`, `recommendedAction`,
  `retryable`, `bucket`.
- `POST /v1/jobs/{jobId}/retry` — retry transacional (DLQ → `requeueFromDLQ`;
  `failed`/`cancelled` → novo job preservando linhagem em
  `payload._retryOf`). Idempotente via `Idempotency-Key`.
- `GET /v1/audit/search` — pesquisa filtrada de trilhas de auditoria.
- `GET /v1/cetesb/accounts/health` — saúde agregada por conta CETESB
  (derivada de `sicat_cetesb_accounts`, `session_contexts` e `jobs`,
  zero round-trip externo).
- `GET /v1/cetesb/sessions/health` — saúde individual de sessões CETESB.
- `GET /v1/reports/mtrs` — relatório operacional dedicado de MTRs.
- `GET /v1/reports/mtrs/export` — export síncrono CSV (cap de 5000
  linhas; HTTP 413 `REPORT_EXPORT_LIMIT_EXCEEDED` acima do cap).

**Persistência (migration `src/sql/012_operations_indexes.sql`)**:
índices idempotentes (`idx_jobs_payload_integration_account`,
`idx_jobs_payload_session_context`, `idx_jobs_status_finished_at`,
`idx_jobs_operation_status`, `idx_jobs_correlation_id`,
`idx_audit_logs_entity_occurred`, `idx_audit_logs_component_occurred`,
`idx_session_contexts_account_status`,
`idx_session_contexts_status_updated`,
`idx_manifests_expedition_date_text`). Constraints DL-022 e
`version` (locking otimista) preservadas.

**Taxonomia operacional** ([src/lib/operational-status.ts](src/lib/operational-status.ts)):
13 estados com `label`, `severity`, `retryable`, `bucket` e
`recommendedAction`. Espelho frontend em
[frontend/src/modules/command-center/operationalStatus.js](frontend/src/modules/command-center/operationalStatus.js).

**Frontend Vue 3 — nova navegação "Centro Operacional"**
([frontend/src/App.vue](frontend/src/App.vue),
[frontend/src/router.js](frontend/src/router.js)):

- `/operacao/dashboard` — Operations Dashboard.
- `/operacao/jobs` — Jobs Console (busca + retry).
- `/operacao/auditoria` e `/operacao/auditoria/:correlationId` — Audit Explorer.
- `/operacao/cetesb-health` — Saúde de contas e sessões CETESB.
- `/operacao/relatorios/mtr` — Relatórios de MTR (com export CSV).
- `/operacao/command-center` — Base estrutural do Command Center
  (registry declarativo, sem backend de IA).

**Validação QA (2026-04-25)**: typecheck, validações OpenAPI / fonte
da verdade CETESB / HAR, `test:api` (23/23), `test:integration`
(124/124), `test:worker` (14/14), `test:contract` (4/4),
`test:source-of-truth` (6/6), unit+contract+smoke agregados (120/120),
nova spec `frontend/tests/ui/centro-operacional.spec.ts` (6/6),
regressão `audit` + `validation-e2e` (15/15), `smoke:health` (7/7),
`smoke:openapi` (2/2). Detalhes em
[docs/handoffs/centro-operacional-sicat/09-qa-validation.md](docs/handoffs/centro-operacional-sicat/09-qa-validation.md).

**Prompts operacionais diários:**

```bash
# Desenvolver feature completa (contrato + código + testes + docs)
@workspace usando #file:desenvolver-feature-completa.prompt.md
Implementar endpoint POST /v1/manifestos/:id/reopen

# Resolver bug crítico com rastreabilidade total
@workspace usando #file:resolver-bug-critico.prompt.md
Bug: POST /v1/manifestos/:id/submit retorna 500 com resNome vazio

# Hardening pré-produção (resiliência + observabilidade)
@workspace usando #file:hardening-producao.prompt.md
Sistema vai para produção em 1 semana, validar DLQ e retry
```

**Escalonamento automático:**

- Contrato HTTP → `programador-backend-mtr`
- Integração CETESB → `integrador-cetesb-mtr`
- Banco/fila/worker → `postgres-queue-mtr`
- Testes/smoke → `tester-qa-mtr`
- Documentação → `documentador-mtr`
- Evolução de estrutura → `meta-evolution-copilot`

Veja `.github/README.md` e `docs/copilot/14-estrutura-copilot.md` para detalhes.
