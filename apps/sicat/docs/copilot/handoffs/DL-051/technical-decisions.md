# Decisões Técnicas - DL-051

## 1) Transporte de evento: `LISTEN/NOTIFY` no Postgres
**Decisão:** usar `pg_notify` no repositório de jobs e `LISTEN job_events` na API.

**Racional:**
- Mantém o design assíncrono existente (jobs + worker + banco).
- Evita acoplamento direto API↔worker.
- Permite binding em tempo real sem polling.

## 2) Stream HTTP em `application/x-ndjson`
**Decisão:** expor `GET /v1/jobs/{jobId}/events` como stream NDJSON.

**Racional:**
- Simples de consumir com `fetch` no browser, preservando headers (`Authorization`, `X-Correlation-Id`).
- Cada linha é um evento JSON independente.

## 3) Snapshot inicial + heartbeat
**Decisão:** enviar `job.snapshot` no início e `heartbeat` periódico.

**Racional:**
- Snapshot elimina condição de corrida entre abertura da stream e estado atual.
- Heartbeat mantém conexão observável e evita timeouts silenciosos em proxies.

## 4) Encerramento em estado terminal
**Decisão:** encerrar stream automaticamente quando job atingir `succeeded|failed|cancelled|dlq`.

**Racional:**
- Reduz consumo de recursos.
- Frontend não mantém conexão aberta sem necessidade.

## 5) Binding explícito por `jobId` no redirect
**Decisão:** transportar `jobId` da resposta de submit para query da rota de detalhe.

**Racional:**
- Garante assinatura imediata do job correto.
- Evita depender apenas da descoberta posterior em payload do manifesto.
