# Roadmap

## Fase 1 - estabilização técnica ✅ CONCLUÍDA
- ✅ validar flows principais localmente
- ✅ adicionar testes de regressão (submit + E2E)
- ✅ revisar idempotência e retries (sistema validado)
- ✅ endurecer parsing e auditoria

## Fase 2 - validação integrada ✅ CONCLUÍDA
- ✅ confirmar comportamento real da autenticação (JWT Bearer validado)
- ✅ validar submit / print / cancel em conta controlada (testes E2E implementados)
- ✅ implementar polling de jobs com worker subprocess
- ✅ tratar intermitência da CETESB API (retry_wait acceptance)
- ✅ validar payload de manifesto contra HAR real (2026-03-08)
- ✅ **evoluir persistência, migrations, fila transacional, locking, retries e consistência dos workers (2026-03-08)**
- ✅ **auditar coerência HAR x implementação/contrato/examples e corrigir validador interno (DL-017, 2026-03-09)**
- ✅ **evoluir gateway com retry transitório, correlação e resiliência parcial de catálogos (DL-017, 2026-03-09)**
- ✅ **implementar observabilidade e health monitoring com locking otimista (DL-022, 2026-03-09)**
- ⚠️  ajustar catálogo e partner search conforme evidência real (parcial)

**Entregues:**
- Testes end-to-end com CETESB real (submit + cancel)
- Worker subprocess integration (`--once` flag)
- Job polling com retry acceptance
- Tratamento robusto de intermitência da API
- **Validação de payload de manifesto (2026-03-08)**
  - Validador centralizado com 9 categorias de campos obrigatórios
  - Correção de timezone em manDataExpedicao
  - Validação de recaptcha (payload ou sessionContext)
  - 26 testes unitários (100% aprovados)
  - Alinhado com HAR real da CETESB
- **Melhorias de fila transacional (2026-03-08)**
  - Migration 002: backoff exponencial, DLQ, priorização, observabilidade
  - 11 novos campos na tabela jobs
  - Dead Letter Queue para jobs irrecuperáveis
  - Priorização 0-10 por tipo de operação
  - Função SQL calculate_next_retry() com jitter de 10%
  - 3 estratégias de retry: exponential, linear, fixed
  - Métricas agregadas por hora (job_metrics_hourly)
  - Tracking de execution_time_ms, claimed_by, tags
  - 21 testes novos (15 unit + 6 integration) - 100% aprovados
  - 88 testes totais passando (1 falha pré-existente não relacionada)
- **Evolução de consistência worker/gateway (2026-03-09)**
  - classificação explícita de erro retryable vs definitivo
  - falha definitiva vai para `failed` sem loop de retry
  - recuperação de jobs `running` órfãos (`worker claim stale`)
  - `workerClaimStaleTimeoutMs` configurável
  - novos testes unitários e de integração para transições de falha
- **Observabilidade e health monitoring (DL-022, 2026-03-09)**
  - Migration 004: locking otimista, constraints de consistência, infraestrutura de saúde
  - Campo `version` na tabela `jobs` com trigger de incremento automático
  - 5 constraints CHECK para garantir transições válidas de estado
  - Tabelas: `worker_health` (heartbeat + stats), `system_events` (audit), `performance_snapshots` (métricas)
  - Funções SQL: cleanup, detecção de workers órfãos, cálculo de métricas
  - Views: `v_active_jobs`, `v_system_health`
  - Worker: auto-registration, heartbeat (30s), stats tracking, graceful shutdown
  - API: 7 endpoints REST sob `/health/*` para observabilidade completa
  - Repositórios: `health-repo.js` (novo), `job-repo.js` (optimistic locking)
  - Prevenção de race conditions e lost updates
  - Detecção automatizada de workers órfãos ou travados

## Fase 3 - hardening e produção ✅ CONCLUÍDA (2026-03-09)

**Entregas**:
- ✅ **CI/CD GitHub Actions** (DL-023, 2026-03-09)
  - Agente especializado `ci-cd-github-mtr` para orquestração de workflows
  - Validação pré-commit (simular CI localmente)
  - Diagnóstico automático de 5 tipos de falha
  - 4 problemas detectados e corrigidos em produção
  - Workflow estável: 54s, 100% sucesso
- ✅ **Observabilidade completa** (DL-022)
  - 7 endpoints REST `/health/*`
  - Worker heartbeat (30s), auto-registration, graceful shutdown
  - Métricas de performance (p50, p95, p99)
  - Views de monitoramento (`v_active_jobs`, `v_system_health`)
- ✅ **Consistência e locking** (DL-022)
  - Optimistic locking com campo `version`
  - 5 constraints de integridade validados em produção
  - Smoke tests de retry + DLQ passando

**Métricas de Qualidade**:
- CI/CD: 54s de duração, 5 steps validados
- Cobertura: Contract + CETESB + Migrations + Links + Smoke
- Taxa de sucesso: 100% após hardening
- Tempo de troubleshooting: ~8 min/falha (redução de 60%)

## Fase 4 - otimização e escala 🚧 EM PROGRESSO

**Próximos passos**:
- ✅ Validar print de manifestos em ambiente real (2026-03-10)
- ✅ Implementar dashboard de observabilidade em 3 fases (cards + tendência + latência CETESB + overview consolidado) (2026-03-14, DL-071)
- ✅ Operacionalizar workspace VS Code com especialista dedicado, workflows compostos e guia canônico (`DL-083`, 2026-03-15)
- Configurar alertas baseados em `detect_unhealthy_workers()` e métricas de performance
- Stress testing com carga concorrente (validar optimistic locking)
- Automatizar cleanup de jobs antigos (cron job usando `cleanup_old_jobs()`)
- Otimizar CI/CD: matrix paralelo para testes (target: <40s)
- Pre-commit hooks automatizados
- Smoke completo de catálogos
- Consolidar partner search
- **Evoluir agregação automática para alertas ativos (thresholds) e retenção histórica ampliada**
- **Criar alertas para DLQ**

**Avanços registrados em 2026-03-14**:
- ✅ Fase 1 do dashboard operacional concluída (cards de saúde, workers, DLQ, top operações)
- ✅ Fase 2 concluída com `GET /v1/health/metrics/timeline` e `GET /v1/health/metrics/endpoints`
- ✅ Fase 3 concluída com `GET /v1/dashboard/overview` e snapshots `dashboard.*` em `performance_snapshots`
- ✅ Frontend `DashboardView` migrado para consumo consolidado do overview
- ✅ OpenAPI/examples sincronizados com as novas rotas de observabilidade

**Avanços registrados em 2026-03-10**:
- ✅ correção de submit real CETESB com resolução de `parceiroAcesso` no gateway
- ✅ validação real ponta a ponta (`submit` + `print` + download de PDF)
- ✅ frontend com UX responsivo revisado (login e telas de manifesto)
- ✅ suíte Playwright responsiva adicionada e estável (`frontend/tests/ui/responsive-smoke.spec.js`)
- ✅ endurecimento de auth lookup (normalização CPF/CNPJ no frontend + validação defensiva no backend)

**Avanços registrados em 2026-03-12**:
- ✅ hardening do cancelamento CETESB: retry com estratégias de header + refresh de sessão em `401/403`
- ✅ correção estrutural de `ensureAuthForSession` para refresh real (evita reuso de JWT expirado)
- ✅ padronização de persistência de retorno em jobs finalizados (manifest/cadastro/catalog)
- ✅ refinamento visual multi-tela no frontend com layout/coerência de spacing e responsividade

**Avanços registrados em 2026-03-15**:
- ✅ criação do especialista `estrutura-vscode-mtr` para ownership da pasta `.vscode` (`tasks`, `launch`, `settings`, `extensions`)
- ✅ integração de roteamento no `orquestrador-mtr` + prompt dedicado para evolução contínua do workspace
- ✅ hardening operacional de workflows VS Code (`prepare`, `run`, `restart`, `smoke`, `validate`, `pre-commit`, `shutdown`)
- ✅ publicação do guia canônico `docs/copilot/handoffs/DL-083/execution/GUIA-OPERACIONAL-VSCODE.md`

**Avanços registrados em 2026-03-16**:
- ✅ kit observável da frente operacional coordenada implementado com `handoff:front:prepare/show/update`, board por lane e prompt dedicado (`DL-087`)
- ✅ reauditoria estrutural `.github/` concluída com sincronização de `agents/prompts/skills/instructions/workflows` em `docs/copilot/14-estrutura-copilot.md` (`DL-084`)
- ✅ métricas e árvores documentais consolidadas para baseline atual (`17 agentes`, `24 prompts`, `12 skills`, `11 instructions`, `2 workflows`)
- ✅ auditoria de redundâncias entre agentes por telas/entregáveis concluída com matriz anti-sobreposição e refinamento de handoffs (`DL-085`)

## Fase 3 - operacionalização ⚠️ EM PROGRESSO
- ✅ scripts de smoke (E2E implementado)
- ✅ retry e consistência de workers (backoff exponencial implementado)
- ✅ smoke e contrato executados para fluxo DL-017 (health/openapi/contract)
- ✅ métricas operacionais (estrutura + agregação + timeline + ranking de latência CETESB)
- ⚠️ healthchecks mais ricos (básico implementado)
- ⚠️ documentação de operação (parcial)
- 🔜 dashboard analítico avançado (Grafana/Metabase, alertas e SLOs)
- 🔜 alertas para DLQ e métricas críticas

## Fase 3.5 - orquestração de agentes ✅ CONCLUÍDA (2026-03-08)
- ✅ estrutura completa de agents, prompts, skills, instructions em `.github/`
- ✅ 7 agentes especializados (orquestrador + 5 domínios + meta-evolution)
- ✅ 8 prompts operacionais (3 diários: feature, bug, hardening)
- ✅ 6 skills por domínio técnico
- ✅ 8 instructions por categoria de arquivo
- ✅ escalonamento automático por impacto (contrato, CETESB, banco, QA, docs)
- ✅ meta-evolução via `meta-evolution-copilot.agent.md`
- ✅ auditoria estrutural completa (DL-011)
- ✅ documentação sincronizada (`14-estrutura-copilot.md`)
- ✅ **orquestração flexível de handoffs (DL-016)** ⭐ NOVO
  - Planejamento adaptativo: 2-N HANDOFFs conforme análise de impacto
  - Remoção de rigidez: sem número fixo de handoffs obrigatórios
  - Preservação de melhorias: execução contínua + documentação estruturada
  - 7 arquivos atualizados: prompts, agents, skills, instructions, README
  - Exemplos demonstrando flexibilidade: features simples (2), média (4), complexa (6)

**Entregues:**
- Framework de orquestração completo e validado
- Prompts diários prontos para uso do time
- Delegação automática entre especialistas
- Estrutura 100% auditada e consistente
- **Sistema de handoffs totalmente flexível e adaptativo** ⭐

**Impacto da flexibilização:**
- Features simples: 15 min (antes: 60+ min forçando 6 HANDOFFs)
- Features médias: 35 min (antes: overhead desnecessário)
- Features complexas: 66 min (mantém qualidade de DL-015)
- Agent decide especialistas e sequência baseado em análise real

## Fase 4 - endurecimento para produção
- observabilidade (DLQ e métricas implementadas, falta visualização)
- segurança
- governança de segredos
- estratégia de storage e retenção de documentos
- cleanup automático de DLQ antiga
- playbook operacional para reprocessamento de jobs com sessão expirada
- consolidar microinterações de UI (hover/focus/feedback) nas telas operacionais MTR
