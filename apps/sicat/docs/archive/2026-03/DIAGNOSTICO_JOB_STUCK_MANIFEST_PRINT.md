# 📋 DIAGNÓSTICO EXECUTIVO - Job Stuck manifest.print

## 🔴 Problema Reportado
Um job de `manifest.print` foi enfileirado mas não estava sendo executado.
- **Correlation ID**: `frontend_5cd19089-d277-452e-bce7-0aca7ec29e0b`
- **Job ID**: `job_60b001ba258764ee1028d03428`
- **Status na UI**: "aguardando" (orange)
- **Localização**: Fila Ativa (1 job)
- **Age**: 5+ minutos sem progresso

---

## ✅ Resolução Implementada

### Root Cause Identificado
**Nenhum worker estava em execução ou registrado no sistema**

```
Worker Health Status:
  ✅ Total Workers Registrados: 0
  ✅ Workers Ativos (últimos 5m): 0
  ✅ Healthy Workers: 0
```

Este foi o obstáculo: sem workers, nenhum job pode sair do estado `queued`.

### Timeline de Resolução
```
1️⃣ 13:49:39 - Job enfileirado com sucesso
2️⃣ 14:04:50 - Diagnóstico completo realizado (15m 11s depois)
3️⃣ 14:04:51 - Worker iniciado manualmente
4️⃣ 14:04:51 - Job processado com sucesso (200ms)
5️⃣ 14:04:52 - Verificação confirmada → Manifesto em estado 'printed'
```

### Ações Tomadas
```javascript
// Script de diagnóstico criado
scripts/diagnose-job-stuck.js

// Comando que resolveu o problema
npm run worker:once
  // Resultado: [worker] job job_60b001ba258764ee1028d03428 concluído em 200ms
```

---

## 📊 Diagnóstico Técnico Detalhado

### 1. Status do Job (ANTES)
```
Job ID:       job_60b001ba258764ee1028d03428
Operation:    manifest.print
Status:       queued ← STUCK AQUI
Attempts:     0/5 (nenhuma tentativa)
Claimed By:   (vazio) ← NENHUM WORKER REIVINDICOU
Age:          311 segundos (5+ minutos)
Queued At:    2026-04-22T13:49:39.656Z
Last Error:   (nenhum)
```

### 2. Worker Health (ANTES)
```
Total Workers:       0 ← ROOT CAUSE
Healthy:             0
Degraded:            0
Unhealthy:           0
Stopped:             0
Active (last 5m):    0

Queue Status:
  queued:            1 (este job)
  running:           0
  retry_wait:        0
```

### 3. API Health
```
✅ API respondendo (porta 8080)
✅ Health endpoints operacionais
✅ PostgreSQL conectado
✅ Job persistence OK
❌ Worker registration table vazia
```

### 4. Status do Job (DEPOIS)
```
Job ID:       job_60b001ba258764ee1028d03428
Status:       succeeded (saiu da fila ativa)
DLQ Status:   não está em DLQ
Manifesto:    printed (status final do recurso)
Duration:     200ms (processamento rápido)
```

---

## 🔧 Ações Recomendadas para Prevenção

### 1. Monitoramento Contínuo
```bash
# Verificar saúde a cada 10s
watch -n 10 'npm run smoke:health'

# Ou script personalizado
while true; do
  node scripts/diagnose-job-stuck.js
  sleep 10
done
```

### 2. Setup Production-Ready
```bash
# Terminal 1 - API
npm run dev

# Terminal 2+ - Worker(s)
npm run worker
npm run worker  # segundo worker em paralelo para redundância
```

### 3. Alertas Recomendados
```javascript
// Monitorar em /v1/health/workers
if (workers.total_workers === 0) {
  alert("🔴 CRÍTICO: Nenhum worker registrado!")
}

if (workers.active_last_5m === 0 && jobs.queued > 0) {
  alert("🔴 CRÍTICO: Jobs stuck - workers inativos!")
}

if (job.age_seconds > 600) {
  alert(`⚠️ Job starvation: ${job.job_id} por ${job.age_seconds}s`)
}
```

### 4. One-Off Job Processing
```bash
# Útil para testar rapidamente
npm run worker:once
```

---

## 🎯 Resultado Final

| Critério | Status | Detalhes |
|----------|--------|----------|
| **Job Encontrado** | ✅ | Localizado na fila ativa |
| **Root Cause** | ✅ | Worker não rodando |
| **Resolução** | ✅ | Worker iniciado |
| **Job Processado** | ✅ | Status → printed (200ms) |
| **Sem Erros** | ✅ | Nenhuma exceção ou DLQ |
| **Outcome** | ✅ | SUCCESS |

---

## 📚 Referências Técnicas

### Arquivos Envolvidos
- Health monitoring: `src/repositories/health-repo.ts`
- Worker registration: `src/repositories/health-repo.ts` → `registerWorker()`
- Job queue: `src/workers/job-runner.ts`
- Health endpoints: `src/routes/api-routes.ts` → `/v1/health/*`

### Endpoints Consultados
```
GET /v1/health/system         - Status do sistema
GET /v1/health/workers        - Status de workers
GET /v1/health/jobs/active    - Jobs na fila
GET /v1/health/jobs/dlq       - Dead letter queue
GET /v1/manifestos/{id}       - Status do manifesto
```

### Scripts Criados
- `scripts/diagnose-job-stuck.js` - Diagnóstico completo
- `scripts/check-job-terminal-state.js` - Verificar estado final
- `scripts/diagnose-job-stuck.ps1` - PowerShell wrapper (ajustado)

---

## 🚀 Próximos Passos

### Para Produção
1. Configurar alertas em `/v1/health/workers`
2. Implementar health check em CI/CD
3. Documentar procedimento de restart de worker
4. Configurar múltiplos workers para redundância

### Para QA
- Testar cenário: "o que acontece se worker cair?"
- Validar recovery automático de jobs
- Medir tempo de processamento típico
- Documentar SLA de latência job

---

**Relatório Executado**: 2026-04-22 14:04:52 UTC  
**Agente**: jobs-monitoramento-logs-mtr  
**Status**: ✅ RESOLVIDO  
**Documentação**: [docs/handoffs/job-stuck-manifest-print/07-observability-admin.md](../handoffs/job-stuck-manifest-print/07-observability-admin.md)
