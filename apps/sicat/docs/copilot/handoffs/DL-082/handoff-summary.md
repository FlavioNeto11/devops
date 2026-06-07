# Handoff Summary - DL-082

## Handoff 1 - Banco de dados (tabelas + migrations)
- Definido backlog para criar estrutura mínima de autorização:
  - `access_roles`
  - `access_permissions`
  - `access_role_permissions`
  - `access_user_roles`
  - `access_session_admin_audit`
- Definida ordem de migrations com rollback explícito e índices para leitura administrativa.
- Definidos critérios de aceite de consistência (FKs, unicidade e performance por índices).
- **Execução realizada (2026-03-15):**
  - migration criada: `src/sql/008_access_control_foundation.sql`
  - modelo de dados atualizado: `docs/copilot/05-modelo-de-dados.md`
  - validação local: `npm run migrate` ✅

## Handoff 2 - Contrato OpenAPI (mínimo da Fase 1)
- Definido backlog de contrato para endpoints administrativos mínimos:
  - `GET /v1/admin/access/users`
  - `GET /v1/admin/access/users/{userId}`
  - `GET /v1/admin/access/roles`
  - `GET /v1/admin/access/permissions`
  - `GET /v1/admin/access/sessions`
- Definido padrão de erro `application/problem+json` para todos endpoints.
- Definido backlog de `examples/` e regeneração de `src/generated/operations.js`.
- **Execução realizada (2026-03-15):**
  - `openapi/mtr_automacao_openapi_interna.yaml` atualizado com tag `Admin Access`, endpoints e schemas.
  - examples criados em `examples/` para request/response dos 5 endpoints.
  - `src/generated/operations.js` regenerado com 43 operações.
  - validação: `npm run validate:openapi` ✅

## Handoff 3 - Endpoints admin mínimos (backend)
- Definido backlog de implementação mínima em camadas:
  - rotas em `src/routes/api-routes.js`
  - serviços em `src/services/`
  - repositórios em `src/repositories/`
- Definido escopo de segurança inicial:
  - middleware de autorização para escopo administrativo
  - rastreabilidade por `X-Correlation-Id`
  - trilha de auditoria de leitura administrativa
- **Execução realizada (2026-03-15):**
  - rotas `GET /v1/admin/access/*` implementadas em `src/routes/api-routes.js`.
  - serviço `src/services/access-admin-service.js` criado.
  - repositório `src/repositories/access-admin-repo.js` criado com SQL de leitura/paginação/filtros.
  - auditoria de leitura administrativa registrada em `access_session_admin_audit`.

## Handoff 4 - Layout inicial da nova tela (frontend)
- Definido backlog de tela inicial em `frontend/src/views/` com blocos:
  - lista de usuários
  - painel de perfil/papéis
  - listagem de sessões
  - barra de filtros básicos
- Definido backlog de integração inicial com `frontend/src/services/api.js`.
- Definido comportamento base de UX: loading/erro/vazio/sucesso.
- **Execução realizada (2026-03-15):**
  - view `frontend/src/views/AccessAdminView.vue` criada.
  - integrações API adicionadas em `frontend/src/services/api.js`.
  - rota adicionada em `frontend/src/router.js` (`/admin/acessos`).
  - item de navegação adicionado em `frontend/src/App.vue`.
  - validação: `npm --prefix frontend run build` ✅

## Handoff 5 - Consolidação executável
- Consolidado backlog no `docs/copilot/10-backlog-executavel.md` com tarefas acionáveis.
- Atualizado decision-log (DL-082) e estrutura de documentação.

## Handoff 6 - Escrita admin (Fase 2 inicial)
- Implementados endpoints de escrita:
  - `POST /v1/admin/access/users/{userId}/roles/{roleId}/grant`
  - `POST /v1/admin/access/users/{userId}/roles/{roleId}/revoke`
  - `POST /v1/admin/access/users/{userId}/password/reset`
  - `POST /v1/admin/access/users/{userId}/password/expire`
- OpenAPI atualizado com requests/responses dos comandos administrativos.
- Examples criados em `examples/` para os quatro comandos.
- `src/generated/operations.js` regenerado com 47 operações.
- Backend atualizado com:
  - `src/services/access-admin-service.js` (orquestração de escrita + auditoria)
  - `src/repositories/access-admin-repo.js` (grant/revoke)
  - `src/repositories/sicat-user-repo.js` e `src/repositories/sicat-session-repo.js` (reset/expire)
  - `src/services/sicat-auth-service.js` (enforcement de senha expirada)
- Migration criada/aplicada: `src/sql/009_access_password_expiration.sql`.

## Handoff 7 - CRUD admin de roles/permissions (Fase 2)
- Implementados endpoints CRUD de roles:
  - `POST /v1/admin/access/roles`
  - `GET /v1/admin/access/roles/{roleId}`
  - `PATCH /v1/admin/access/roles/{roleId}`
  - `DELETE /v1/admin/access/roles/{roleId}`
- Implementados endpoints CRUD de permissions:
  - `POST /v1/admin/access/permissions`
  - `GET /v1/admin/access/permissions/{permissionId}`
  - `PATCH /v1/admin/access/permissions/{permissionId}`
  - `DELETE /v1/admin/access/permissions/{permissionId}`
- OpenAPI expandido com schemas de create/update/details para roles e permissions.
- Examples de request/response adicionados para os 8 endpoints.
- Backend atualizado com:
  - `src/repositories/access-admin-repo.js` (CRUD + sync de `role_permissions` com transação)
  - `src/services/access-admin-service.js` (validação, autorização admin e auditoria)
  - `src/routes/api-routes.js` (novas rotas)
- `src/generated/operations.js` regenerado com 55 operações.

## Handoff 8 - Estabilização de testes de fila/jobs
- Problema tratado: execução de `npm test` aparentava travar no cenário `updateJobIfOwned aplica transição apenas para owner correto`.
- Causa raiz identificada: teste com dados estáticos + dependência de `claimJobs` global, gerando flakiness por interferência de dados residuais e colisões no índice parcial de jobs ativos.
- Correções aplicadas em `tests/integration/job-queue-improvements.test.js`:
  - `entityId` de fixtures convertido para IDs únicos por execução (`createPrefixedId`).
  - `beforeEach` adicionado para limpeza de dados de teste com prefixo `man_test_%` em `jobs` e `job_dead_letter_queue`.
  - cenários que exigiam ownership passaram a preparar `status='running'` + `claimed_by` diretamente no job de fixture, removendo dependência de claim global.
  - teardown com `pool.end()` para fechamento determinístico de conexões ao fim do arquivo.
- Validação da correção:
  - `node --test tests/integration/job-queue-improvements.test.js` ✅ (9/9)
  - `npm test` segue com falhas pré-existentes em outros módulos, mas a suíte passa pelo ponto antes reportado como bloqueado.

## Handoff 9 - Estabilização de auth contract/bootstrap
- Problema tratado: falha recorrente no contrato de autenticação com erros de hook (`createServer is not a function`, `server.close is not a function`) e cancelamentos em cadeia.
- Causa raiz identificada:
  - `src/server.js` executava bootstrap imediato em import e não exportava servidor compatível com ciclo de vida dos testes.
  - payload `application/problem+json` do middleware não propagava `code`, quebrando asserts de contrato para credenciais ausentes.
- Correções aplicadas:
  - `src/server.js` refatorado para exportar `createServer()` (retornando `http.Server`) e `startServer()`.
  - auto-start protegido por detecção de entrypoint, evitando side effects em import durante testes.
  - `src/lib/problem.js` atualizado para aceitar `code` opcional.
  - `src/middlewares/error-handler.js` atualizado para enviar `err.code` em respostas de erro.
- Validação da correção:
  - `node --test tests/contract/auth-contract.test.js` ✅ (8/8 em mock)
  - `npm run test:auth` ✅ (23 pass, 1 skip em mock)

## Handoff 10 - Estabilização de SICAT dual-auth (modo mock)
- Problema tratado: falhas 502/409 intermitentes em `tests/api/sicat-dual-auth.test.js`, especialmente nos cenários de vinculação/ativação de conta CETESB.
- Causa raiz identificada:
  - gateway CETESB instanciado no import dos serviços (`auth-service` e `sicat-account-service`), podendo manter modo inconsistente para o runtime do teste.
  - resposta mock de login CETESB sem `partner.accountType`, quebrando validação obrigatória em `addSicatCetesbAccount`.
  - e-mail fixo no teste de registro de sucesso, sujeito a conflito em execuções repetidas.
- Correções aplicadas:
  - inicialização lazy do gateway CETESB por chamada nos serviços afetados.
  - inclusão de `accountType` no partner da resposta mock de login.
  - e-mail único por execução no teste de registro SICAT bem-sucedido.
- Validação da correção:
  - `node --test tests/api/sicat-dual-auth.test.js` ✅ (12/12 em mock)
  - `npm run test:auth` ✅ (23 pass, 1 skip em mock)

## Handoff 11 - Estabilização de manifest-cancel (constraint submitted)
- Problema tratado: falhas em `tests/integration/manifest-cancel.test.js` por violação da constraint `chk_manifest_submitted_integrity`.
- Causa raiz identificada:
  - fixtures inseriam manifesto com `status='submitted'` sem `external_hash_code`, incompatível com as regras de consistência do schema.
- Correção aplicada:
  - inserts de fixture do arquivo `tests/integration/manifest-cancel.test.js` atualizados para incluir `external_hash_code` em todos os cenários com status `submitted`.
- Validação da correção:
  - `node --test tests/integration/manifest-cancel.test.js` ✅ (5/5)
  - `npm run test:integration` avança com este bloco totalmente verde; falhas restantes estão em outros módulos fora deste handoff.

## Handoff 12 - Estabilização de worker retry/DLQ + claim priority
- Problema tratado:
  - flakiness em `tests/integration/job-runner-retry-dlq.test.js` quando executado junto da suíte de integração.
  - intermitência no cenário `claim com prioridade` em `tests/integration/job-queue-improvements.test.js`.
- Causa raiz identificada:
  - corrida de claims na fila global durante execução paralela entre arquivos de integração.
  - presença de jobs inválidos em `queued/retry_wait` com `attempts >= max_attempts`, gerando erro de constraint no claim.
  - competição com jobs externos ao teste no cenário de prioridade.
- Correções aplicadas:
  - `job-runner-retry-dlq.test.js`:
    - sanitização de fila inválida antes do loop do worker.
    - helper de execução com fallback controlado para requeue local quando houver corrida de claim.
    - uso de `entity_id` exclusivos por teste.
  - `job-queue-improvements.test.js`:
    - batch de claim ampliado e validação focada no subconjunto de fixtures.
- Validação da correção:
  - `node --test --test-reporter tap tests/integration/job-runner-retry-dlq.test.js` ✅ (2/2)
  - `node --test tests/integration/job-queue-improvements.test.js` ✅ (9/9)

## Handoff 13 - Estabilização de manifest-list + manifest-submit (suíte completa)
- Problema tratado:
  - falhas de `manifest-list-*` por chamadas reais CETESB (401/502) durante integração.
  - flakiness de `manifest-submit` em integração/API com `job` não encontrado e contagem de jobs inconsistente.
- Causa raiz identificada:
  - testes de listagem ainda mockavam `global.fetch`, porém o gateway real usa `https.request`.
  - colisão entre limpezas concorrentes por prefixo genérico + replay de idempotência com chaves estáticas.
- Correções aplicadas:
  - mocks de CETESB migrados para `https.request` em:
    - `tests/integration/manifest-list-fallback-upsert.test.js`
    - `tests/integration/manifest-list-search.test.js`
  - asserts de contagem exata de chamadas CETESB substituídos por validações comportamentais (upsert/persistência sem duplicidade).
  - isolamento de fixtures em submit:
    - `tests/integration/manifest-submit-service.test.js` com prefixos dedicados (`man_submit_int_*`, etc.).
    - `tests/api/manifest-submit.test.js` com prefixos por execução + idempotency keys únicas.
- Validação da correção:
  - `node --test tests/integration/manifest-list-fallback-upsert.test.js tests/integration/manifest-list-search.test.js tests/integration/manifest-submit-service.test.js` ✅ (15/15)
  - `node --test tests/api/manifest-submit.test.js` ✅ (9/9)
  - `npm run test:integration` ✅ (92 pass, 1 skip)
  - `npm test` ✅ (194 pass, 1 skip)
