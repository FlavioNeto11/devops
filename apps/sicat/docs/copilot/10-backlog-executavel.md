# Backlog executável

## Novo ciclo prioritário (2026-03-15)

### Fase 1 — Módulo Perfis e Acessos (fundação executável) 🔥
**Objetivo**
- Entregar base mínima operacional para módulo admin de perfis/acessos: dados, contrato, endpoints de leitura e layout inicial da tela.

**Escopo obrigatório da fase**
- tabelas/migrations
- contratos OpenAPI
- endpoints admin mínimos
- layout inicial da nova tela

**Backlog executável (ordem sugerida)**

1) **Banco: schema mínimo de autorização**
- Criar migration com tabelas:
	- `access_roles`
	- `access_permissions`
	- `access_role_permissions`
	- `access_user_roles`
	- `access_session_admin_audit`
- Incluir constraints:
	- unicidade por chave natural (`role_name`, `permission_key`)
	- integridade referencial em tabelas de vínculo
- Incluir índices para consultas administrativas:
	- usuário
	- sessão
	- data de auditoria

**Saída esperada**
- migration com `up/down` idempotente e validada localmente.

2) **Contrato OpenAPI mínimo (admin read-only)**
- Adicionar endpoints:
	- `GET /v1/admin/access/users`
	- `GET /v1/admin/access/users/{userId}`
	- `GET /v1/admin/access/roles`
	- `GET /v1/admin/access/permissions`
	- `GET /v1/admin/access/sessions`
- Definir schemas de resposta e erro `application/problem+json`.
- Criar exemplos em `examples/` para request/response.
- Regenerar `src/generated/operations.js`.

**Saída esperada**
- contrato validado e exemplos coerentes com implementação prevista.

3) **Endpoints admin mínimos (backend)**
- Implementar rotas em `src/routes/api-routes.js`.
- Implementar serviços de leitura em `src/services/`.
- Implementar repositórios em `src/repositories/`.
- Garantir `X-Correlation-Id` e trilha em `access_session_admin_audit`.
- Proteger endpoints com autorização administrativa mínima.

**Saída esperada**
- endpoints retornando dados reais com paginação/filtros básicos.

4) **Layout inicial da nova tela admin (frontend)**
- Criar view inicial (ex.: `frontend/src/views/AccessAdminView.vue`) com:
	- cabeçalho operacional
	- filtros básicos (usuário/status)
	- tabela de usuários
	- painel simples de perfil/papéis
	- tabela de sessões
- Integrar chamadas iniciais em `frontend/src/services/api.js`.
- Cobrir estados: loading/erro/vazio/sucesso.

**Saída esperada**
- tela navegável com dados de endpoints mínimos e UX previsível.

5) **Validação e consolidação da fase**
- Validar contrato:
	- `npm run validate:openapi`
- Regenerar operações:
	- `npm run gen:operations`
- Validar frontend:
	- `npm --prefix frontend run build`
- Validar testes aplicáveis:
	- `npm test` (ou suíte direcionada quando aplicável)

**Referência de orquestração**
- `docs/copilot/handoffs/DL-082/`
- `docs/copilot/implementacoes/IMPLEMENTACAO-MODULO-PERFIS-ACESSOS.md`

## Estado consolidado (2026-03-12)

### Entregas recentes já incorporadas
- ✅ **DL-039**: persistência de retorno em jobs finalizados (`src/workers/operation-handlers.js`, `src/repositories/catalog-repo.js`, `src/services/catalog-service.js`).
- ✅ **DL-040**: hardening de cancelamento CETESB com retry de headers + refresh real de sessão (`src/gateways/cetesb-gateway.js`, `tests/unit/cetesb-gateway.test.js`).
- ✅ **DL-041**: refinamento visual multi-tela no frontend operacional MTR (`frontend/src/components/ManifestCreateForm.vue`, `frontend/src/views/*`).

## Próximos itens de maior valor

### 1) Regressão operacional de cancelamento (auth/session) 🔥
**Objetivo**
- Garantir que `manifest.cancel` continue resiliente em `401/403` e em contexto de sessão degradada.

**Escopo técnico**
- Validar fluxo `manifest.cancel` com fallback de header (`x-access-token`, `Authorization`, `both`) em `src/gateways/cetesb-gateway.js`.
- Cobrir explicitamente cenário `SESSION_CONTEXT_REFRESH_CREDENTIALS_MISSING` (erro definitivo com diagnóstico claro).
- Expandir testes direcionados em `tests/unit/cetesb-gateway.test.js` e smoke/manual em `tests/manual/`.

**Saída esperada**
- Matriz de casos de autenticação documentada em `docs/copilot/11-checklist-qa.md`.
- Evidência de execução (comandos + resultado) registrada em artefato de teste manual.

### 2) QA de consistência visual multi-view ✅/🔄
**Objetivo**
- Consolidar regressão visual após DL-041 para evitar retorno de espaçamento/estrutura inconsistente.

**Escopo técnico**
- Verificar `ManifestCreateView`, `ManifestsView`, `ManifestDetailView`, `JobsView`, `DashboardView`, `SessionAccountView`.
- Cobrir estados: `loading`, `erro`, vazio e sucesso onde aplicável.
- Confirmar comportamento responsivo (mobile/tablet/desktop) no frontend.

**Saída esperada**
- Checklist QA atualizado com critérios por view em `docs/copilot/11-checklist-qa.md`.
- Evidência de build (`frontend`) e smoke visual arquivada.

### 3) Contrato/OpenAPI x examples x implementação 🚧
**Objetivo**
- Fechar lacunas restantes de aderência contract-first nos fluxos de manifesto/catálogo/parceiros.

**Escopo técnico**
- Revisar `openapi/`, `examples/` e rotas/controladores impactados por mudanças recentes de fluxo.
- Verificar se payloads/respostas seguem comportamento real e erros `application/problem+json`.
- Priorizar divergências com evidência HAR (`docs/cetesb/`) como fonte primária.

**Saída esperada**
- Lista objetiva de gaps com owner/ação.
- Atualizações sincronizadas de contrato, exemplos e testes quando necessário.

### 4) Observabilidade operacional (fila + DLQ) 🚧
**Objetivo**
- Tornar monitoramento acionável para operação diária.

**Escopo técnico**
- Avançar agregação automática de métricas em `job_metrics_hourly`.
- Definir alertas para DLQ e degradação de worker.
- Consolidar playbook de manutenção/cleanup com os endpoints `/health/*`.

**Saída esperada**
- Procedimento de operação enxuto em docs.
- Critérios de alerta mínimos por severidade.

## Ordem sugerida de execução
1. Regressão operacional de cancelamento (auth/session)
2. QA de consistência visual multi-view
3. Contrato/OpenAPI x examples x implementação
4. Observabilidade operacional (fila + DLQ)

## Referências rápidas
- Fluxos: `docs/copilot/04-fluxos-operacionais.md`
- Roadmap: `docs/copilot/09-roadmap.md`
- Decisões: `docs/copilot/13-decision-log.md` (DL-039, DL-040, DL-041)
