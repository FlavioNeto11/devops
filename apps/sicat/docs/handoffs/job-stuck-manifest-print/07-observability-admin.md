# Checkpoint 07 - Observability & Admin Diagnostics

## Demanda
Diagnóstico de job de `manifest.print` enfileirado mas não executado  
**Correlation ID**: `frontend_5cd19089-d277-452e-bce7-0aca7ec29e0b`

## Data de Execução
2026-04-22 (13:49:39 UTC - queue time)

---

## 📊 Diagnóstico Realizado

### 1️⃣ Job Status
```
✅ Job encontrado: job_60b001ba258764ee1028d03428
- Operation: manifest.print
- Entity: manifest / man_db11a963673a12bc1a83e2f7e5
- Status: queued
- Attempts: 0/5
- Claimed By: (vazio)
- Age: 311+ segundos (5+ minutos stuck)
- Queued At: 2026-04-22T13:49:39.656Z
- Last Error: (nenhum)
```

### 2️⃣ Worker Health Status
```
❌ CRÍTICO: Nenhum worker registrado
- Total Workers: 0
- Healthy: 0
- Degraded: 0
- Unhealthy: 0
- Stopped: 0
- Active (last 5m): 0
```

### 3️⃣ Queue Summary
```
Total de jobs ativos: 1
- queued: 1 (este job)
- running: 0
- retry_wait: 0
```

### 4️⃣ Correlação de Problemas
```
⚠️ Job está queued mas não foi reclamado
❌ PROBLEMA RAIZ: Workers estão mortos ou não registrados
  → Sem workers ativos, nenhum job pode ser processado
  → Job permanece em 'queued' indefinidamente (starvation)
```

---

## 🔧 Root Cause Analysis

**Status**: `IDENTIFIED` ✅

**Root Cause**: Worker process não está em execução ou não se registrou na tabela `worker_health`

**Evidence**:
1. Job está corretamente enfileirado (`status='queued'`)
2. Não há erros no job (sem `last_error_message`)
3. Worker poll não está reclamando o job (`claimed_by` vazio)
4. Consulta em `/v1/health/workers` retorna `total_workers=0`

**Why It Happened**:
- Worker precisa ser iniciado manualmente: `npm run worker`
- OU worker falhou e parou sem registrar o motivo
- OU API não está vendo o registro de worker (issue de conexão BD)

---

## ✅ Ações Executadas

### Health Endpoints Consultados
- ✅ `GET /v1/health/system` - Sistema OK (respondendo na porta 8080, não 3000)
- ✅ `GET /v1/health/workers` - Confirmou 0 workers
- ✅ `GET /v1/health/jobs/active` - Job encontrado na fila

### Observability Tools Utilizados
- Script de diagnóstico: `scripts/diagnose-job-stuck.js`
- Database queries: Correlação via health endpoints
- Audit trail: Verificado (sem erros registrados)

### Dados Coletados
- API respondendo na porta 8080 (observado via smoke:health)
- PostgreSQL conectado e saudável
- Job persistence OK
- Worker health table OK (apenas sem registros)

---

## 🚨 Problemas Identificados

### 1. Nenhum Worker Ativo
| Severidade | Status | Impacto |
|------------|--------|---------|
| 🔴 CRÍTICO | OPEN | Todos os jobs `.queued` estão stuck indefinidamente |

**Manifestação**:
- Worker registration table vazia
- Job não é reclamado por nenhum worker
- Age do job continua crescendo (5min+)

**URL de Referência**: `/v1/health/workers` → `total_workers: 0`

---

## 📝 Recomendações de Ação

### Ação Imediata
```bash
# Terminal 1 (API)
npm run dev

# Terminal 2+ (Worker - um ou mais)
npm run worker
```

### Teste Rápido (One-Off Processing)
```bash
npm run worker:once
```

### Monitoramento
```bash
# Verificar job a cada 10s
npm run smoke:health

# Ou looping manual
while true; do
  node scripts/diagnose-job-stuck.js
  sleep 10
done
```

---

## 🔍 Expected Outcome

Após iniciar o worker:

1. Worker se registra em `worker_health`
2. Worker começa polling da fila (a cada 5s)
3. Job será detectado como `queued`
4. Worker reclama o job: `claimed_by = <worker_id>`
5. Job muda para `running`
6. Manifesto é impresso via CETESB gateway
7. Job completa com `status='succeeded'` OU falha com `status='failed'` + retry

---

## 📋 Checklist de Resolução

- [ ] Inicie o worker: `npm run worker`
- [ ] Verifique `/v1/health/workers` → deve ter `total_workers >= 1`
- [ ] Verifique `/v1/health/jobs/active` → job deve ter `claimed_by` preenchido
- [ ] Aguarde job processamento (30-120s dependendo de CETESB)
- [ ] Verifique se job completou: `status='succeeded'` ou `'failed'`
- [ ] Se falhar, revise logs do worker para `last_error_message`

---

## 📚 Referências

### Health Check Endpoints
- `GET /v1/health/system` - System health
- `GET /v1/health/workers` - Worker status & registration
- `GET /v1/health/jobs/active` - Active queue status
- `GET /v1/audit/{correlationId}` - Audit trail (se implementado)

### Scripts Disponíveis
- `npm run smoke:health` - Health check completo
- `npm run worker` - Start worker (continuous)
- `npm run worker:once` - Process jobs once and exit
- `scripts/diagnose-job-stuck.js` - Diagnóstico detalhado

### Code References
- Job health monitoring: `src/repositories/health-repo.ts` (funções `getWorkerStatistics`, `listActiveJobs`)
- Worker registration: `src/repositories/health-repo.ts` (função `registerWorker`)
- Queue logic: `src/workers/job-runner.ts`
- Active queue endpoint: `src/routes/api-routes.ts` → `/v1/health/jobs/active`

---

## 🎯 Status Final

**Diagnóstico**: ✅ COMPLETO  
**Root Cause**: ✅ IDENTIFICADO (Worker não rodando)  
**Resolução**: ✅ EXECUTADA (Worker iniciado e job processado)
**Job Status**: ✅ SUCCEEDED  
**Próximo Agente**: `tester-qa-mtr` (para validar procedimento)

---

## 📊 Resultado da Resolução

### Execução do Worker
```bash
npm run worker:once
[worker] Registrado como worker-34832-1776866124463
[worker] job job_60b001ba258764ee1028d03428 concluído em 200ms
```

### Verificação Pós-Resolução
- ✅ Job desapareceu da fila ativa
- ✅ Job NÃO foi para DLQ
- ✅ Manifesto completou com status `printed`
- ✅ Operação concluiu com sucesso

### Timeline Completo
| Evento | Horário | Duração |
|--------|---------|---------|
| Job enfileirado | 13:49:39 | - |
| Diagnóstico (job stuck) | 14:04:50 | 15m 11s de starvation |
| Worker iniciado | 14:04:51 | - |
| Job processado | 14:04:51 | 200ms |
| Verificação terminal | 14:04:52 | - |

---

## 🔄 Revalidação Operacional

### Data de Revalidação
2026-04-22 14:41 UTC

### Objetivo
Reiniciar o worker contínuo e validar se o job preso na fila com correlation ID `corr_1bc1e213d7579f187370eb898986d53e` seria reclamado e processado.

### Evidências Coletadas
- API confirmada em `http://localhost:8080`
- Endpoint `GET /v1/health/workers` mostrou `active_last_5m: 1`
- Endpoint `GET /v1/health/jobs/active` passou de `queued: 1` para `active_jobs: 0`
- Processo ativo confirmado: `src/worker.ts`
- Registro recente em `worker_health`: `worker-39536-1776868833311` com status `healthy`

### Confirmação no Banco
```sql
SELECT job_id, operation, status, attempts, max_attempts, queued_at, started_at, finished_at, claimed_by, correlation_id
FROM jobs
WHERE correlation_id = 'corr_1bc1e213d7579f187370eb898986d53e';
```

Resultado confirmado:
- `job_id`: `job_97c34db7967c49ee06317d6225`
- `operation`: `manifest.print`
- `status`: `succeeded`
- `attempts`: `1/5`
- `claimed_by`: `worker-39536`
- `started_at`: `2026-04-22 14:40:33.319187+00`
- `finished_at`: `2026-04-22 14:40:33.57+00`

### Conclusão
- ✅ Worker contínuo ativo e registrado
- ✅ Job foi reclamado pelo worker
- ✅ Job foi processado com sucesso
- ✅ Fila ativa ficou vazia após o processamento

### Recomendação Operacional
Manter o worker em modo sempre ativo com um supervisor de processo como PM2, NSSM, serviço Windows ou equivalente do ambiente para evitar starvation de jobs quando o processo cair.

---

**Executado por**: `jobs-monitoramento-logs-mtr`  
**Data/Hora Conclusão**: 2026-04-22 14:04:52 UTC  
**Status**: RESOLVIDO ✅
