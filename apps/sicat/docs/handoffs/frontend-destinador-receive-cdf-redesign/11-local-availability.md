# 11 - Local Availability

## Objetivo da fase

Disponibilizar a stack local necessaria para validacao manual da entrega em localhost, sem alterar codigo de produto, e registrar o estado operacional efetivo observado ao final do bootstrap.

## Resultado final

- Localhost disponivel para validacao manual via frontend em `http://127.0.0.1:5174/`.
- Backend HTTP disponivel em `http://127.0.0.1:8080/`.
- Postgres local ativo em `127.0.0.1:5432`.
- Stack parcialmente saudavel: portas e frontend responderam, mas `GET /health/system` retornou `503` com status `degraded`.

## Tasks e comandos utilizados

### Tasks acionadas

- `workflow: dev (real-dev)`
- `stack: prepare quick`
- `stack: restart (real-dev + frontend)`
- `shell: stack: stop processes`

### Comandos efetivamente usados para manter a stack disponivel

- Backend API:

```powershell
$env:CETESB_GATEWAY_MODE='real'; npm run start
```

- Worker:

```powershell
$env:CETESB_GATEWAY_MODE='real'; npm run worker
```

- Frontend:

```powershell
$env:VITE_API_BASE_URL='http://127.0.0.1:8080'; Set-Location frontend; npm run dev -- --host 127.0.0.1 --port 5174
```

### Comandos de verificacao executados

```powershell
Get-NetTCPConnection -LocalPort 5174,8080,5432 -State Listen
Invoke-WebRequest http://127.0.0.1:5174
Invoke-WebRequest http://127.0.0.1:8080/health/system -SkipHttpErrorCheck
Invoke-WebRequest http://127.0.0.1:8080/health/workers -SkipHttpErrorCheck
```

## URLs e portas efetivas

- Frontend manual: `http://127.0.0.1:5174/`
- Backend base: `http://127.0.0.1:8080/`
- Worker health: `http://127.0.0.1:8080/health/workers`
- System health: `http://127.0.0.1:8080/health/system`
- Postgres local: `127.0.0.1:5432`

## Estado de saude observado

### Sinais positivos

- Porta `5174` em escuta e frontend retornando `200`.
- Porta `8080` em escuta.
- Endpoint `GET /health/workers` retornando `200`.
- Porta `5432` ativa com container Postgres em execucao.

### Sinal de degradacao

- Endpoint `GET /health/system` retornou `503` com payload:

```json
{
  "status": "degraded",
  "jobs": {
    "queued": 0,
    "running": 0,
    "retryWait": 0,
    "succeeded1h": 0,
    "failed1h": 0,
    "dlqTotal": 1,
    "avgDurationMs1h": 0
  },
  "workers": {
    "healthy": 11,
    "degraded": 0,
    "active5m": 2,
    "total": 25,
    "stats": {
      "totalJobsClaimed": 8,
      "totalJobsSucceeded": 1,
      "totalJobsFailed": 0,
      "totalJobsDLQ": 3,
      "avgJobDurationMs": 212
    }
  }
}
```

## Limitacoes operacionais conhecidas

1. A stack ficou disponivel para navegacao manual no frontend, mas o backend reporta estado sistêmico `degraded` em vez de `healthy`.
2. A degradacao aparenta estar ligada ao historico operacional do worker e fila, com `dlqTotal=1` e varios registros antigos de workers parados ainda contabilizados no total agregado.
3. As tasks compostas de VS Code nao refletiram de forma confiavel a subida final da stack nesta sessao; por isso, os processos estaveis foram mantidos por comandos diretos em terminais persistentes.
4. `GET /ping` respondeu `404` nesta execucao, entao a verificacao efetiva de backend foi feita via `/health/system` e `/health/workers`.

## Conclusao operacional

- O usuario ja pode validar a entrega no navegador usando `http://127.0.0.1:5174/`.
- O backend necessario ao frontend esta acessivel em `http://127.0.0.1:8080/`.
- O ambiente nao esta totalmente saudavel segundo o health sistêmico, mas esta operacional o suficiente para validacao manual da UX local desta entrega.
