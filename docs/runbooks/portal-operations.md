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

## 1. Publicar uma alteração (recomendado: tag imutável)

```powershell
# 1) Validar antes de buildar (gate local)
cd C:\devops\portal\frontend; npm run validate    # Prettier + ESLint + node:test

# 2) Publicar com imagem IMUTÁVEL por commit (build :<sha> + :local, set image, rollout, smoke)
C:\devops\scripts\publish-portal.ps1
```

`publish-portal.ps1` builda `portal-frontend:<gitsha>` (imutável) + alias `:local`, aplica
`portal/k8s/portal.yaml`, faz `kubectl set image` para o `<sha>` e aguarda o rollout. Como **cada
publicação é uma imagem distinta**, o `rollout undo` passa a restaurar a versão anterior de verdade
(ver §3). O CI publica a mesma versão no GHCR (`ghcr.io/flavioneto11/portal/frontend:<sha>`).

> ⚠️ Evite **rebuildar sempre a tag `:local`** sem o `<sha>`: como `:local` é mutável e
> `imagePullPolicy: IfNotPresent`, o `rollout undo` voltaria para a MESMA imagem `:local` (já a
> mais nova) — rollback não confiável. Por isso publicamos com tag por commit.
>
> O portal está sob Argo (`platform/argocd/apps/portal.yaml`) com `ignoreDifferences` no campo
> `image` — o `set image` acima **não** é revertido pelo selfHeal.

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

O rollback é confiável **porque cada publicação usa uma imagem imutável distinta**
(`portal-frontend:<sha>`). Três caminhos, do mais rápido ao mais GitOps:

```powershell
# A) Revisão anterior do Deployment (volta à imagem :<sha> anterior — confiável)
kubectl -n devops-system rollout undo deployment/portal
kubectl -n devops-system rollout status deployment/portal

# B) Pinar um sha conhecido (as anotações devops.flavioneto/* mostram qual estava no ar)
kubectl -n devops-system set image deployment/portal portal=portal-frontend:<sha-bom>

# C) GitOps (se a mudança veio de um commit): reverter o commit; o Argo re-sincroniza
git revert <sha-ruim> ; git push       # Argo aplica o manifest anterior
```

> O portal é **stateless** (sem banco/volume): não há dados a restaurar — o rollback é só de imagem.
> Para apps com estado (SICAT/GymOps), ver [`rollback.md`](./rollback.md).
>
> ⚠️ O `rollout undo` só é confiável quando se publica por tag imutável (via `publish-portal.ps1`).
> Se a publicação anterior reusou a tag `:local` mutável, o `undo` pode voltar à mesma imagem.

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
