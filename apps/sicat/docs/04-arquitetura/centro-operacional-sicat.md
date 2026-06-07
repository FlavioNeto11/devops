# Arquitetura alvo — Centro Operacional SICAT

> Documento de arquitetura conceitual. Define módulos, contratos e
> taxonomia de status/erros do Centro Operacional SICAT. Não inicia
> implementação. Endpoints e UIs descritos abaixo são alvos das fases
> 02 a 06 do `work_id` `centro-operacional-sicat`.

## 1. Visão geral

O Centro Operacional SICAT é a camada de produto que consolida, em
módulos dedicados:

- visão operacional consolidada (overview);
- monitor de jobs (active + DLQ + retry);
- audit explorer (trilha por `correlationId`);
- saúde de contas e sessões CETESB;
- relatórios MTR;
- base estrutural (registry + palette) para o futuro Command Center.

Princípio condutor: **toda informação operacional crítica deve ter um
endpoint contratual e uma UI dedicada**, sem depender de scripts
ad-hoc, queries manuais ou navegação no portal CETESB.

## 2. Diagrama lógico (alto nível)

```text
                     ┌──────────────────────────────┐
                     │   Frontend (Vue 3, /modules) │
                     │                              │
   ┌───────► operations-dashboard                   │
   │      ┌─► jobs-console                          │
   │      │ ┌► audit-explorer                       │
   │      │ │ ┌► cetesb-accounts-health             │
   │      │ │ │ ┌► mtr-reports                      │
   │      │ │ │ │ ┌► command-center (registry/UI)   │
   │      │ │ │ │ │                                  │
   ▼      ▼ ▼ ▼ ▼ ▼                                  │
┌──────────────────────────────────────────────────┐ │
│ Backend SICAT (Express + services + repositories)│ │
│                                                  │ │
│  /v1/operations/overview                         │ │
│  /v1/jobs/search                                 │ │
│  /v1/jobs/:id/events                             │ │
│  /v1/jobs/:id/retry                              │ │
│  /v1/audit/search                                │ │
│  /v1/audit/:correlationId                        │ │
│  /v1/cetesb/accounts/health                      │ │
│  /v1/cetesb/sessions/health                      │ │
│  /v1/reports/mtrs[, /export]                     │ │
└─────────────┬──────────────┬─────────────────────┘ │
              │              │                       │
       ┌──────▼─────┐  ┌─────▼──────┐                │
       │ Postgres   │  │ Worker     │                │
       │ (jobs,     │  │ + gateway  │                │
       │ manifests, │  │ CETESB     │                │
       │ audit,     │  │ (DL-093)   │                │
       │ workers,   │  └─────┬──────┘                │
       │ sessions)  │        │                       │
       └────────────┘        ▼                       │
                       CETESB real                   │
                                                     │
                     Command Center (futuro):  ──────┘
                       hooks + contratos +
                       UI palette, sem IA
                       acoplada nesta etapa.
```

## 3. Módulos do Centro Operacional

Estrutura sugerida no frontend:

```text
frontend/src/modules/
  operations-dashboard/
  jobs-console/
  audit-explorer/
  cetesb-accounts-health/
  mtr-reports/
  command-center/
```

Cada módulo agrupa view(s), composables, serviços HTTP e stores
locais. Reutilizar padrões de
`docs/FRONTEND-COMPONENTS-ARCHITECTURE.md`.

### 3.1 operations-dashboard

Objetivo: visão única de saúde operacional.

KPIs (referência: `docs/_inputs/fonte-de-verdade-backlog-cto.md` §3):

- jobs por status (24h/7d);
- tempo médio por operação;
- taxa de erro CETESB;
- DLQ ativa;
- contas CETESB ativas e sessões próximas do vencimento;
- workers saudáveis;
- MTRs e CDFs emitidos no período.

Endpoint primário:

- `GET /v1/operations/overview` — agregação consolidada read-only.

### 3.2 jobs-console

Objetivo: substituir scripts ad-hoc por console operacional.

Funcionalidades:

- pesquisa avançada por `operation_type`, `status`, `entityId`,
  `correlationId`, janela de tempo;
- inspeção de eventos por job;
- retry manual transacional, com `Idempotency-Key` e auditoria.

Endpoints:

- `GET /v1/jobs/search` — pesquisa paginada (read-only);
- `GET /v1/jobs/:id/events` — eventos do job (já existe; consolidar
  contrato);
- `POST /v1/jobs/:id/retry` — comando assíncrono `202`, idempotente.

### 3.3 audit-explorer

Objetivo: navegar a trilha completa de uma operação.

Funcionalidades:

- pesquisa por `correlationId`, janela de tempo, `operation_type`,
  `entityId`;
- timeline de exchanges (request/response do gateway);
- correlação com job e manifesto.

Endpoints:

- `GET /v1/audit/search` — pesquisa paginada;
- `GET /v1/audit/:correlationId` — detalhe (já existe; consolidar
  contrato).

### 3.4 cetesb-accounts-health

Objetivo: visibilidade de saúde das contas e sessões CETESB.

Funcionalidades:

- listar contas vinculadas com status de credenciais;
- expor sessões com tempo restante de JWT;
- sinalizar contas com falhas recorrentes.

Endpoints:

- `GET /v1/cetesb/accounts/health`;
- `GET /v1/cetesb/sessions/health`.

### 3.5 mtr-reports

Objetivo: relatório dedicado equivalente ao portal SIGOR, adaptado à
UX SICAT.

Funcionalidades:

- filtros por período, papel (gerador/destinador), parceiros, status;
- exportação CSV/PDF.

Endpoints:

- `GET /v1/reports/mtrs` — consulta filtrada (read-only);
- `GET /v1/reports/mtrs/export` — exportação assíncrona (`202`) ou
  síncrona conforme volume; decisão final na fase 02.

### 3.6 command-center (base)

Detalhado em `docs/04-arquitetura/command-center-sicat.md`. Nesta
arquitetura é apenas o módulo que hospedará o registry de comandos e
a paleta UI; nenhum backend de IA é introduzido.

## 4. Contratos transversais

Todos os endpoints novos seguem as convenções do repositório:

- contract-first em `openapi/mtr_automacao_openapi_interna.yaml`,
  exemplos em `examples/`, geração em `src/generated/operations.ts`;
- erros como `application/problem+json` (`src/lib/problem.ts`);
- comandos retornam `202` + `command-accepted`, com job persistido;
- preservação de `correlationId`, `jobId`, `commandId`,
  `sessionContextId`, `integrationAccountId`;
- read-only endpoints retornam `200` com paginação consistente
  (`page`, `pageSize`, `total`).

## 5. Taxonomia de status/erros operacionais (placeholder)

Esta arquitetura define a **necessidade** de uma taxonomia única de
status e erros operacionais, com mapping `label`, `severity`,
`recommendedAction`, `retryable`. A criação do documento canônico
fica sob responsabilidade da fase 04 (`dashboard-observability-mtr`),
no arquivo:

```text
docs/05-operacao/taxonomia-status-erros-operacionais.md
```

Requisitos mínimos para esse documento:

- enumerar todos os `status` de `jobs` (`queued`, `running`,
  `retry_wait`, `succeeded`, `failed`, `dlq`, `cancelled`);
- enumerar `operation_type` reconhecidos pelo worker;
- categorizar erros CETESB recorrentes (autenticação, validação,
  indisponibilidade, indeterminado);
- para cada item, definir `label`, `severity`
  (`info|warning|error|critical`), `recommendedAction` e `retryable`
  (`true|false|manual`);
- ser consumido por backend (problem+json) e frontend (badges, tooltips,
  ações sugeridas).

Enquanto o documento da fase 04 não existe, o Centro Operacional usa
labels temporárias do código atual e referencia este placeholder.

## 6. Hooks para Command Center (futuro)

A arquitetura prevê os pontos de extensão a seguir, sem implementar
camada generativa nesta etapa:

- **registry de comandos**: cada operação assíncrona já implementada
  expõe metadata (nome, descrição, parâmetros, idempotência, escopo
  de RBAC) que o Command Center poderá consumir;
- **palette UI**: componente Vue reservado em `command-center/` para
  invocação rápida;
- **contratos read-only previsíveis**: `/v1/operations/overview`,
  `/v1/jobs/search`, `/v1/audit/search` são desenhados para serem
  consumidos por uma camada generativa futura sem reescrita.

Nenhum endpoint `/v1/ai/*` é introduzido nesta arquitetura.

## 7. Restrições e invariantes

- preservar fronteira route → service → repository → job → worker →
  gateway;
- toda comunicação CETESB permanece em
  `src/gateways/cetesb-gateway.js`;
- nenhum endpoint do Centro Operacional contorna validadores
  existentes (manifest-validator, idempotency-service);
- nenhuma agregação de KPI deve quebrar a constraint de consistência
  do banco — usar views/materializações se necessário, na fase 03;
- nada é marcado como IMPLEMENTADO sem evidência verificável.

## 8. Próximas fases (depois da baseline)

- fase 02 — `programador-backend-mtr`: implementar/consolidar
  endpoints listados na seção 3, atualizando OpenAPI, exemplos e
  `operations.ts`;
- fase 03 — `postgres-queue-mtr`: queries, índices e suporte a
  `jobs/search`, retry manual, agregações de DLQ/retry e auditoria;
- fase 04 — `dashboard-observability-mtr`: criar
  `docs/05-operacao/taxonomia-status-erros-operacionais.md` e
  consolidar overview/KPIs;
- fase 05 — `frontend-vue-ux-mtr`: implementar os módulos Vue;
- fase 07 — `tester-qa-mtr`: typecheck, testes API/integration/worker
  e Playwright dos novos módulos;
- fase 08 — `documentador-mtr`: regenerar
  `docs/10-estado-atual/estado-atual.md` e
  `docs/10-estado-atual/PROXIMO_PROMPT.md`.
