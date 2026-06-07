# Modelo de dados

## Tabelas centrais

### session_contexts
Armazena:
- dados de autenticação
- JWT atual
- metadados necessários para renovação controlada
- referências de integração

### integration_accounts
Representa a conta lógica usada nos fluxos externos.

### sicat_users ✅ NOVO (DL-042)
Identidade interna do SICAT (etapa 1 do login):
- `id`, `email` (único), `password_hash`, `name`, `is_active`
- `password_expires_at` para bloqueio administrativo de login até reset (DL-082 Fase 2)
- timestamps (`created_at`, `updated_at`)

Permite:
- separar autenticação do produto SICAT da autenticação operacional CETESB
- gestão de usuário interno sem acoplamento direto ao token CETESB

### sicat_sessions ✅ NOVO (DL-042)
Sessões de autenticação SICAT:
- `id`, `user_id`, `refresh_token_hash`, `expires_at`, `revoked_at`, `metadata`
- índice único por `refresh_token_hash`
- índice por `user_id`

Permite:
- rotação e revogação de refresh token
- trilha mínima de sessão por usuário SICAT

### sicat_cetesb_accounts ✅ NOVO (DL-042)
Vínculo de múltiplas contas CETESB por usuário SICAT (etapa 2 do login):
- `id`, `user_id`, `partner_code`, `partner_document`, `partner_name`
- `account_type` (`generator|carrier|receiver|unknown`)
- credenciais CETESB protegidas em repouso (`cetesb_password_ciphertext`, `cetesb_password_iv`, `cetesb_password_tag`)
- metadados operacionais (`last_connection_at`, `last_usage_at`, `usage_summary`, `is_active`)
- constraint de unicidade por usuário (`user_id`, `partner_code`, `partner_document`)
- índices em `user_id`, `is_active`, `last_usage_at`

Permite:
- seleção por cards da conta CETESB ativa no login
- retenção de histórico/resumo por conta para UX operacional
- troca de contexto sem novo cadastro da conta

### access_roles ✅ NOVO (DL-082 / Fase 1 Perfis e Acessos)
Catálogo de papéis de autorização:
- `id`, `role_name` (único), `description`
- flags operacionais (`is_system`, `is_active`)
- timestamps (`created_at`, `updated_at`)

Permite:
- base RBAC para governança de acesso
- separação entre papéis de sistema e papéis gerenciáveis

### access_permissions ✅ NOVO (DL-082 / Fase 1 Perfis e Acessos)
Catálogo de permissões por recurso/ação:
- `id`, `permission_key` (único), `resource`, `action`, `description`
- `is_active`
- validações de não-vazio (`permission_key`, `resource`, `action`)

Permite:
- controle fino de autorização por capacidade
- matriz de permissão evolutiva (resource/action)

### access_role_permissions ✅ NOVO (DL-082 / Fase 1 Perfis e Acessos)
Relação N:N entre papéis e permissões:
- `id`, `role_id`, `permission_id`
- metadados de concessão (`granted_at`, `granted_by_user_id`)
- unicidade por (`role_id`, `permission_id`)

Permite:
- composição de perfis com permissões reutilizáveis
- rastreabilidade mínima de concessão

### access_user_roles ✅ NOVO (DL-082 / Fase 1 Perfis e Acessos)
Relação N:N entre usuário SICAT e papel:
- `id`, `user_id`, `role_id`
- metadados de atribuição (`assigned_at`, `assigned_by_user_id`, `expires_at`)
- unicidade por (`user_id`, `role_id`)

Permite:
- múltiplos papéis por usuário
- atribuição temporária de perfil por `expires_at`

### access_session_admin_audit ✅ NOVO (DL-082 / Fase 1 Perfis e Acessos)
Trilha de auditoria para operações administrativas de acesso/sessão:
- ator/alvo (`actor_user_id`, `target_user_id`, `target_session_id`)
- ação (`action_type`, `action_status`, `reason`)
- correlação (`correlation_id`)
- `metadata` em JSONB e `occurred_at`

Permite:
- rastreabilidade de ações sensíveis de administração
- diagnóstico por usuário, sessão e correlação

### manifests
Armazena:
- manifesto interno
- status
- payload interno
- ids externos como hash, `manCodigo`, `manNumero`

### manifest_documents
Armazena metadados dos documentos gerados e caminho/local do artefato.

### jobs
Fila transacional:
- tipo de operação
- payload
- status
- tentativas
- datas de execução
- prioridade (`priority`)
- estratégia de retry (`retry_strategy`, `base_delay_ms`, `max_delay_ms`)
- histórico de retry (`retry_delays` em JSONB)
- rastreamento de execução (`claimed_at`, `claimed_by`, `execution_time_ms`)
- lease de execução (`claim_heartbeat_at`) para manter ownership durante jobs longos
- trilha de DLQ (`dlq_moved_at`, `dlq_reason`)
- **versioning otimista** (`version`) para prevenir race conditions (DL-022)

**Evolução DL-053 (2026-03-14): consistência transacional de enqueue/worker**
- migration `src/sql/007_queue_transactional_consistency.sql`.
- índice único parcial `ux_jobs_active_entity_operation` garante no máximo 1 job ativo (`queued|running|retry_wait`) por (`entity_type`, `entity_id`, `operation`).
- limpeza defensiva de duplicatas ativas legadas (promovendo excedentes para `failed` com erro técnico rastreável).
- updates de status no worker passam a respeitar ownership (`claimed_by`) para evitar overwrite por worker stale.
- novo índice `idx_jobs_running_owner_update` otimiza transições ownership-safe no path crítico de execução.

**Constraints de consistência** (DL-022):
- manifests submitted → devem ter `external_hash_code`
- jobs succeeded/failed → devem ter `finished_at`
- jobs running → devem ter `claimed_at` e `claimed_by`
- jobs running → devem ter `started_at` e `claim_heartbeat_at` válidos
- retry_wait → deve ter `next_retry_at` futuro
- attempts ≤ max_attempts (exceto DLQ)

**Evolução DL-038 (2026-03-10): claim lease heartbeat**
- `claim_heartbeat_at` passa a ser atualizado periodicamente pelo worker durante `status='running'`.
- recuperação de órfãos (`requeueStaleRunningJobs`) usa `coalesce(claim_heartbeat_at, claimed_at)` para distinguir:
	- worker realmente travado (lease expirado) vs.
	- job longo com worker saudável (lease renovado).
- nova migration: `src/sql/005_worker_claim_lease.sql`.

### job_dead_letter_queue
Armazena jobs irrecuperáveis após `max_attempts`:
- contexto completo do job
- último erro
- motivo de descarte (`reason`)
- datas originais da execução

Permite:
- análise operacional de falhas permanentes
- reprocessamento controlado (`requeueFromDLQ`)

### job_metrics_hourly
Estrutura para métricas agregadas por hora:
- volume por operação/status
- latência (`avg`, `min`, `max`, `p50`, `p95`, `p99`)
- total de retries

Status atual:
- schema implementado
- agregação automática ainda pendente

### worker_health ✅ NOVO (DL-022)
Monitoramento de workers:
- identificação (`worker_id`, `worker_name`, `hostname`, `pid`)
- heartbeat (`last_heartbeat_at`)
- métricas acumuladas (`total_jobs_claimed`, `total_jobs_succeeded`, `total_jobs_failed`, `total_jobs_dlq`)
- performance (`avg_job_duration_ms`)
- status (`healthy`, `degraded`, `unhealthy`, `stopped`)
- metadata (sistema operacional, versão Node, recursos)

Permite:
- detectar workers não responsivos
- monitorar performance em tempo real
- identificar degradação antes de falhas

### system_events ✅ NOVO (DL-022)
Auditoria de eventos de sistema:
- tipo de evento (`WORKER_STARTED`, `WORKER_STOPPED`, `JOB_DLQ_MOVED`, `STALE_JOBS_REQUEUED`, etc)
- severidade (`debug`, `info`, `warning`, `error`, `critical`)
- componente (`job-runner`, `migrations`, `cleanup`, etc)
- detalhes em JSONB
- correlação com `correlation_id`

Permite:
- rastreabilidade de operações críticas
- diagnóstico de problemas
- análise de incidentes

### performance_snapshots ✅ NOVO (DL-022)
Snapshots de métricas para dashboards:
- nome da métrica
- valor numérico
- tags em JSONB (para dimensões)
- timestamp automático

Permite:
- dashboards de performance
- análise de tendências
- alertas baseados em thresholds

### catalogs
Cache persistido de catálogos externos.

### catalog_sync_requests
Histórico de sincronizações.

### cadastros
Histórico e dados dos envios de cadastro.

### audit_logs
Trilha técnica de eventos e correlação.

### conversation_sessions ✅ NOVO (Fase 2 conversacional)
Sessões da camada conversacional:
- canal e chave de sessão por canal (`channel_type`, `channel_session_key`)
- vínculo operacional (`integration_account_id`, `session_context_id`)
- contexto de navegação (`current_screen`, `current_manifest_id`)
- correlação técnica (`last_correlation_id`, `last_turn_at`)

Permite:
- continuidade de conversa sem acoplamento ao canal de origem
- recuperação de contexto operacional seguro por sessão

### conversation_messages ✅ NOVO (Fase 2 conversacional)
Turnos/mensagens persistidas da conversa:
- `conversation_session_id`, `conversation_turn_id`, `role`
- texto e payload estruturado (`message_text`, `structured_payload`, `tool_calls`)
- correlação técnica (`correlation_id`, `job_id`, `integration_account_id`, `session_context_id`)

Permite:
- rastreabilidade de cada turno conversacional
- troubleshooting por correlação e por sessão

### conversation_action_logs ✅ NOVO (Fase 2 conversacional)
Trilha estruturada de ações da IA:
- tipo/status da ação (`action_type`, `action_status`)
- governança (`risk_level`, `requires_confirmation`, `blocked_reason`)
- execução (`tool_name`, `tool_arguments`, `result_payload`)
- rastreabilidade (`correlation_id`, `job_id`)

Permite:
- auditoria de bloqueios, execuções e falhas por turno
- investigação operacional de ferramentas acionadas pela conversa

### conversation_memory ✅ NOVO (Fase 2 conversacional)
Memória resumida por sessão:
- `summary_kind`, `summary_text`, `summary_payload`
- validade temporal (`valid_until`)

Permite:
- retenção controlada de contexto útil sem depender de histórico bruto completo
- escopo operacional seguro por `integrationAccountId` e `sessionContextId` dentro do `summary_payload`, evitando reaproveitamento indevido quando a mesma `conversationSessionId` é reutilizada por outra conta

### conversation_artifacts ✅ NOVO (Fase 4 conversacional / DL-104 implícita)
Artifacts persistidos do backend conversacional para download e rastreabilidade:
- vínculo conversacional (`conversation_session_id`, `conversation_turn_id`)
- tipo/origem (`artifact_type`, `source_kind`)
- estado operacional consolidado (`status`: `processing|available|partial|failed|expired`)
- conteúdo persistido (`file_name`, `mime_type`, `storage_path`)
- rastreabilidade (`correlation_id`, `job_id`, `integration_account_id`, `session_context_id`)
- contexto complementar (`source_refs`, `metadata`, `available_at`, `expires_at`)

Permite:
- expor PDF único e ZIP múltiplo no chat sem depender de estado efêmero da resposta HTTP
- correlacionar artifact com jobs assíncronos e com a sessão/turno que originou a ação
- reportar progresso, falhas parciais, expiração e disponibilidade de download de forma auditável
- sustentar estratégia de ZIP no backend via worker (`conversation.bundle_documents`) com persistência em disco e sem bypass arquitetural

### conversation_deterministic_trails ✅ NOVO (Fase 4 conversacional)
Trilha determinística por turno para preview/confirm/execução:
- escopo conversacional (`conversation_session_id`, `conversation_turn_id`)
- fase (`phase`: `snapshot|plan|result`)
- replay seguro (`snapshot_token`, `snapshot_payload`, `plan_payload`, `result_payload`)
- status de execução (`execution_status`: `processing|available|partial|failed|expired|blocked`)
- correlação operacional (`correlation_id`, `job_id`, `command_id`, `integration_account_id`, `session_context_id`)
- conjuntos congelados (`manifest_ids`, `cdf_ids`)

Permite:
- auditar que confirmações executaram o conjunto congelado sem recálculo silencioso
- rastrear plano e resultado com correlação fim-a-fim (`correlationId/jobId/commandId`)
- investigar divergência entre preview confirmado e execução efetiva
### conversation_channel_links ✅ NOVO (Fase 2 conversacional)
Vínculos de identidade por canal:
- `channel_type`, `external_user_key`, `user_id`
- vínculo opcional com conta operacional (`integration_account_id`)
- verificação de vínculo (`verification_status`, `verified_at`)

Permite:
- associação segura entre identidade externa do canal e usuário interno
- evolução para canais externos sem quebrar domínio conversacional

### idempotency_registry
Evita duplicação de comandos sensíveis.

## Notas de migração (DL-053)

- Antes de criar o índice único parcial de jobs ativos, a migration normaliza inconsistências históricas marcando duplicatas extras como `failed`.
- O comportamento de enqueue dos serviços de manifesto agora é transacional e com lock de linha do manifesto (`FOR UPDATE`), evitando janela entre atualização de status e inserção do job.
- Em cenários concorrentes, uma nova tentativa de enqueue da mesma operação reaproveita o job ativo existente, preservando consistência e idempotência operacional.

## Invariantes importantes

- comandos POST críticos precisam de idempotência
- documentos devem estar vinculados a manifesto
- jobs não podem perder contexto mínimo para retry
- sessão precisa estar vinculada a conta/integração coerente
