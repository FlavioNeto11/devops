# Taxonomia de Status Operacionais e Erros — Centro Operacional SICAT

> **Fase**: 04 — observability-admin (`docs/handoffs/centro-operacional-sicat/07-observability-admin.md`).
> **Owner**: `dashboard-observability-mtr`.
> **Implementação canônica**: [src/lib/operational-status.ts](../../src/lib/operational-status.ts) — constante `OPERATIONAL_STATUS_REGISTRY` + helpers `mapJobToOperationalStatus` / `describeOperationalStatus`.
> **Contrato**: enum `JobOperationalStatus` em [openapi/mtr_automacao_openapi_interna.yaml](../../openapi/mtr_automacao_openapi_interna.yaml).

## Por que existe

O status físico armazenado em `jobs.status` (`queued`, `running`, `retry_wait`,
`dlq`, `succeeded`, `failed`, `cancelled`) é insuficiente para a operação
humana. O Centro Operacional precisa de um vocabulário menor e orientado a
ação, com severidade visual, indicação de retry e bucket de ciclo de vida.

A taxonomia operacional é estável e única. Backend, frontend e dashboards
consomem o mesmo registry. Qualquer mudança aqui exige lockstep:
`docs` → `src/lib/operational-status.ts` → `openapi` → `examples` →
`src/generated/operations.ts` → testes.

## Tabela canônica (13 estados)

| status | label (PT-BR) | severity | retryable | bucket | recommendedAction |
| --- | --- | --- | --- | --- | --- |
| `ready` | Aguardando execução | `info` | `false` | `lifecycle` | Aguardar o worker iniciar a execução. |
| `running` | Em execução | `info` | `false` | `in_flight` | Acompanhar até a conclusão; verificar lease se exceder o SLA. |
| `retry_wait` | Aguardando reprocessamento | `warning` | `conditional` | `in_flight` | Aguardar o próximo retry agendado ou disparar retry manual após análise. |
| `dlq` | Em fila morta (DLQ) | `danger` | `true` | `blocked` | Inspecionar a causa, corrigir dados/contexto e reenfileirar via `/v1/jobs/{id}/retry`. |
| `blocked_external_data` | Bloqueado por dado externo | `warning` | `conditional` | `blocked` | Validar parceiros, resíduos ou cadastros na CETESB antes de tentar novamente. |
| `blocked_missing_context` | Bloqueado por contexto ausente | `warning` | `conditional` | `blocked` | Reautenticar a conta CETESB ou revalidar a sessão antes de reprocessar. |
| `awaiting_remote_confirmation` | Aguardando confirmação remota | `info` | `false` | `in_flight` | Aguardar a CETESB confirmar a operação; reconciliar via job de sincronização se exceder a janela. |
| `completed_with_no_items` | Concluído sem itens | `neutral` | `false` | `terminal_success` | Revisar filtros/parâmetros — operação concluída mas não retornou registros. |
| `completed_with_document` | Concluído com documento | `success` | `false` | `terminal_success` | Disponibilizar o documento (MTR/CDF) para o operador; registrar ciência. |
| `failed_validation` | Falha de validação | `danger` | `conditional` | `terminal_failure` | Corrigir o payload conforme as mensagens de validação e reenviar o comando. |
| `failed_remote_auth` | Falha de autenticação remota | `danger` | `true` | `terminal_failure` | Reautenticar a conta CETESB (sessão expirada/revogada) e tentar novamente. |
| `failed_remote_contract` | Falha no contrato remoto (CETESB) | `danger` | `conditional` | `terminal_failure` | Inspecionar exchange auditado; abrir incidente se a CETESB retornou erro inesperado. |
| `failed_internal_processing` | Falha de processamento interno | `danger` | `conditional` | `terminal_failure` | Verificar logs/correlationId; corrigir o defeito e reprocessar via retry. |

## Domínio dos campos

- `severity`: `info` | `success` | `warning` | `danger` | `neutral`.
- `retryable`: `true` | `false` | `conditional`.
  - `true`: pode ser reenfileirado direto via `/v1/jobs/{id}/retry`.
  - `conditional`: pode ser reprocessado, mas exige correção prévia
    (payload, contexto, sessão).
  - `false`: terminal ou em andamento — não cabe retry imediato.
- `bucket`: agrupador para dashboards.
  - `lifecycle`: estados normais de transição.
  - `in_flight`: jobs em execução ou aguardando ação assíncrona.
  - `blocked`: precisa intervenção operacional.
  - `terminal_success`: terminou positivamente.
  - `terminal_failure`: terminou com falha (não-retomável sem ação).

## Mapeamento `jobs.status → operationalStatus`

Implementado em `mapJobToOperationalStatus` (src/lib/operational-status.ts).
Critérios e exemplos:

| operação / sinal | jobs.status | last_error_code / dlq_reason | operationalStatus emitido |
| --- | --- | --- | --- |
| qualquer | `queued` | — | `ready` |
| qualquer | `running` | — | `running` |
| qualquer | `retry_wait` | sem hint | `retry_wait` |
| qualquer | `retry_wait` | contém `EXTERNAL_DATA`/`PARTNER_NOT_FOUND`/`CADASTRO`/`RESIDUO` | `blocked_external_data` |
| qualquer | `retry_wait` | contém `MISSING_CONTEXT`/`NO_SESSION`/`SESSION_REQUIRED`/`NO_ACCOUNT` | `blocked_missing_context` |
| qualquer | `retry_wait` | contém `AWAITING`/`PENDING_REMOTE`/`PENDING_CONFIRMATION` | `awaiting_remote_confirmation` |
| qualquer | `dlq` | sem hint | `dlq` |
| qualquer | `dlq` | dlq_reason contém hint de external_data | `blocked_external_data` |
| qualquer | `dlq` | dlq_reason contém hint de missing_context | `blocked_missing_context` |
| qualquer | `cancelled` | — | `failed_internal_processing` |
| qualquer | `failed` | contém `VALIDATION`/`CONTRACT`/`INVALID`/`SCHEMA` | `failed_validation` |
| qualquer | `failed` | contém `AUTH`/`SESSION_EXPIRED`/`TOKEN` | `failed_remote_auth` |
| qualquer | `failed` | contém `REMOTE`/`CETESB`/`TIMEOUT`/`GATEWAY`/`UPSTREAM` | `failed_remote_contract` |
| qualquer | `failed` | demais | `failed_internal_processing` |
| `manifest.print` / `cdf.download` etc. | `succeeded` | result_summary contém `NO_ITEMS`/`EMPTY_RESULT` | `completed_with_no_items` |
| qualquer | `succeeded` | demais | `completed_with_document` |
| desconhecido | `<custom>` | — | `<custom>` (passthrough) |

> O passthrough preserva compatibilidade com testes existentes
> (`tests/unit/operations-status-mapper.test.js`) e com status físicos
> futuros que ainda não tenham hint na taxonomia.

## Regras de transição (resumo)

- `ready → running`: claim do worker (DL-022, lease em
  `idx_jobs_running_claim_lease`).
- `running → retry_wait`: erro retentável; backoff em `next_retry_at`.
- `running → succeeded`: handler concluiu com `commit`.
- `running → failed`: erro não-retentável (validation, auth, contract).
- `retry_wait → running`: novo claim quando `next_retry_at <= now()`.
- `retry_wait → dlq`: `attempts >= max_attempts` (constraint
  `chk_job_attempts_integrity`).
- `failed | cancelled → ready`: retry manual cria **novo** job preservando
  linhagem em `payload._retryOf` (operations-service `retryJob`).
- `dlq → ready`: `requeueFromDLQ` mantém o `job_id` original.
- `succeeded`: terminal; nunca retorna a `ready` — novo comando gera novo
  job/commandId.

## Onde aparece

- `GET /v1/operations/overview` — campos enriquecidos em `recentDlq`,
  `recentJobs` e `recentErrors` (cada item carrega `operationalStatus`,
  `label`, `severity`, `recommendedAction`, `retryable`, `bucket`).
- `GET /v1/jobs/search` — cada `JobSearchItem` carrega os mesmos campos.
- `GET /v1/health/jobs/active` e `GET /v1/health/jobs/dlq` — consumem a
  mesma taxonomia (frontend aplica via `describeOperationalStatus` se
  necessário).
- Frontend (fase 05) — `src/lib/operational-status.ts` é a fonte para
  badges, filtros e ações sugeridas. **Não** duplicar tabela no Vue.

## Boas práticas

- Sempre publicar `operationalStatus` ao lado do `status` físico — nunca
  substituí-lo. UIs podem precisar do `status` cru para auditoria.
- Severities `danger`/`warning` devem disparar destaque visual no
  dashboard; `neutral` é silencioso (não bloqueia operador).
- `retryable=true` habilita botão de retry imediato; `conditional` exige
  passo intermediário (modal de correção, reauth, etc.).
- Buckets devem ser usados para colunas/agregações em dashboards
  (Kanban operacional).
