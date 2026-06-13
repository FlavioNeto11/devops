---
title: "Runbook — Operar o Portal NovaIT"
status: reference
applies_to: [portal]
updated: 2026-06-13
language: pt-BR
---

# Runbook — Operar o Portal NovaIT (`/`)

> Componente: [`portal/`](../../portal/) (namespace `devops-system`). Detalhe técnico no
> [`portal/README.md`](../../portal/README.md); fronteiras em [`portal/AGENTS.md`](../../portal/AGENTS.md).

## 1. Publicar uma alteração

```powershell
# 1) Validar antes de buildar (gate local)
cd C:\devops\portal\frontend
npm run validate                 # Prettier + ESLint + node:test

# 2) Build da imagem local do lab
docker build -t portal-frontend:local C:\devops\portal\frontend

# 3) Aplicar manifest (idempotente) e reiniciar o rollout
kubectl apply -f C:\devops\portal\k8s\portal.yaml
kubectl -n devops-system rollout restart deploy/portal
kubectl -n devops-system rollout status deploy/portal --timeout=90s
```

> ⚠️ Como a imagem é `:local` com `imagePullPolicy: IfNotPresent`, **rebuild + rollout restart**
> é o que efetiva a nova versão (não há `:tag` nova para o k8s detectar).

## 2. Validar no ar (smoke)

```powershell
# Status + headers de segurança (espere CSP, Referrer-Policy, Permissions-Policy, nosniff)
curl.exe -I http://xpto.localhost/

# Health (deve responder 200 "ok")
curl.exe -s -o NUL -w "%{http_code}`n" http://xpto.localhost/healthz

# Compressão (deve aparecer Content-Encoding: gzip)
curl.exe -s -D - -o NUL -H "Accept-Encoding: gzip" http://xpto.localhost/ | Select-String "Content-Encoding"

# 404 amigável (deve servir /404.html com status 404)
curl.exe -s -o NUL -w "%{http_code}`n" http://xpto.localhost/rota-inexistente
```

Checklist visual: ver [`portal-ux-accessibility-checklist.md`](../standards/portal-ux-accessibility-checklist.md).

## 3. Rollback

```powershell
# Reverter para a revisão anterior do Deployment
kubectl -n devops-system rollout undo deploy/portal
kubectl -n devops-system rollout status deploy/portal

# (Opcional) reverter o arquivo no git e reaplicar
git checkout HEAD~1 -- portal/
docker build -t portal-frontend:local C:\devops\portal\frontend
kubectl -n devops-system rollout restart deploy/portal
```

> O portal é **stateless** (sem banco/volume) — o rollback é seguro e instantâneo. Não há dados a
> restaurar. Para apps com estado (ex.: SICAT/GymOps), ver [`rollback.md`](./rollback.md).

## 4. Diagnóstico

```powershell
kubectl -n devops-system get deploy,pods,svc,ingressroute -l app.kubernetes.io/part-of=devops-portal
kubectl -n devops-system logs deploy/portal --tail=100        # logs do nginx (access/error)
kubectl -n devops-system describe deploy/portal               # eventos, probes
```

Sintomas comuns:

| Sintoma | Provável causa | Ação |
|---|---|---|
| Portal 404 na raiz | IngressRoute do portal ausente/priority errada | `kubectl apply -f portal/k8s/portal.yaml`; confirme `priority: 1` |
| Paths de apps caindo no portal | priority do portal elevada acima de 1 | **nunca** elevar; reverter para `priority: 1` |
| Seção "Aplicações publicadas" **não aparece** | API do Console exige login; visitante anônimo recebe 401 | **comportamento esperado** — é recurso de operador; logue no Console para vê-la |
| Seção "Aplicações publicadas" em **erro transitório** | timeout/5xx do `console-backend` | degrada com retry; verifique o `console-backend` (não é falha do portal) |
| CSS/JS antigos após deploy | cache do browser | os assets são versionados via `?v=`; bump em `index.html`/`404.html` ao mudar `assets/` |
| Pod reiniciando | liveness falhando | `kubectl logs`/`describe`; cheque `/healthz` |

## 5. Observabilidade

- **Logs**: nginx escreve `access.log`/`error.log` em stdout/stderr → coletados pelo Promtail/Loki.
  Filtrar no Grafana (Explore → Loki) por `{namespace="devops-system", app="portal"}`.
- **Uptime**: ver [`portal-quality-checklist.md`](../standards/portal-quality-checklist.md) (seção
  observabilidade) — sugestão de probe externo (UptimeRobot/Cloudflare Health Check) para `/healthz`.
- **Front-end**: o portal expõe um _hook_ opcional `window.PORTAL_CONFIG.onEvent(name, data)` para
  encaminhar eventos (ex.: erro da descoberta dinâmica) a um coletor — **sem chave real**; configurável
  por um `assets/config.js` injetado no deploy (não versionado).
