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

## 1. Publicar uma alteração (GitOps — tag da imagem no git)

```powershell
# 1) Commitar a mudança do portal (a árvore RASTREADA precisa estar limpa)
cd C:\devops\portal\frontend; npm run validate    # Prettier + ESLint + node:test
git add portal/ ; git commit -m "feat(portal): ..."

# 2) Release GitOps: builda :<sha>, FIXA a tag no manifest, commita, aplica, smoke
C:\devops\scripts\publish-portal.ps1
```

`publish-portal.ps1` é **GitOps real**: builda `portal-frontend:<gitsha>` (imutável), **troca o
`image:` em `portal/k8s/portal.yaml`** (fonte da verdade), commita+push, aplica o manifest declarativo
e aguarda o rollout. **Falha alto** (throw) se rollout/`/`/`/healthz` não passarem — sem falso `[OK]`.
O Argo (`platform/argocd/apps/portal.yaml`) reconcilia esse mesmo manifest; **não há `kubectl set
image` nem `ignoreDifferences`**. A imagem é local (Docker Desktop compartilha o daemon, `IfNotPresent`);
o CI publica o mesmo artefato em `ghcr.io/flavioneto11/portal/frontend:<sha>` (portabilidade).

> Para usar **GHCR-pull** (cluster puxando do registry): torne o pacote público
> (`gh auth refresh -s write:packages` + visibility public, ou pela UI) e troque o `image:` do
> manifest para o caminho GHCR. Enquanto privado, o lab usa a imagem local.

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

## 3. Rollback (GitOps = `git revert`)

A tag da imagem vive no manifest (commit do bump). Rollback = **reverter esse commit** — o Argo (ou
`kubectl apply`) volta o `<sha>` anterior, que ainda está no store local do Docker Desktop.

```powershell
# GitOps (recomendado): reverte o commit "chore(portal): deploy <sha>"
git revert <sha-do-bump> ; git push        # Argo reconcilia o sha anterior
# Feedback imediato (opcional): aplica o manifest revertido na hora
kubectl apply -f C:\devops\portal\k8s\portal.yaml
kubectl -n devops-system rollout status deployment/portal

# Alternativa rápida no cluster (não-GitOps): revisão anterior do Deployment
kubectl -n devops-system rollout undo deployment/portal
```

> O portal é **stateless** (sem banco/volume): rollback é só de imagem. Como cada release é uma
> imagem imutável distinta (`portal-frontend:<sha>`), tanto `git revert` quanto `rollout undo`
> restauram a versão anterior de verdade. Para apps com estado, ver [`rollback.md`](./rollback.md).

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
