---
title: "Runbook — reverter uma publicação"
status: guide
applies_to: [platform]
updated: 2026-06-09
language: pt-BR
---

# Runbook — reverter uma publicação

> Como voltar atrás com segurança. Ver também [`deployment-flow.md`](../deployment-flow.md) (sec.8).

## Deployment (rollout)
```powershell
kubectl -n apps rollout history deploy/<app>-<svc>
kubectl -n apps rollout undo    deploy/<app>-<svc>            # volta 1 revisão
kubectl -n apps rollout undo    deploy/<app>-<svc> --to-revision=<n>
kubectl -n apps rollout status  deploy/<app>-<svc>
```

## Sob GitOps (Argo)
- App com `selfHeal`: **reverta no Git** (revert do commit) → o Argo re-sincroniza para o estado anterior.
- Ad-hoc: na UI do Argo, **History → Rollback** para uma revisão sincronizada.
- ⚠️ Não delete recursos vivos à mão (o `selfHeal` recria; e mudar `name`/labels faz o `prune` apagar).

## Imagem
- Lab `:local`: rebuild da tag anterior + `kubectl rollout restart`.
- GHCR: re-aponte o Deployment para o `:<sha>` bom anterior (as anotações `devops.flavioneto/*`
  na aba **Publicações** do Console mostram qual SHA estava no ar).

## Refactor de lib compartilhada (Fase 2)
Se um app passou a consumir `@flavioneto11/ai-kit`/`oidc-kit` e algo regrediu, **reverta a flag**:
```
AI_KIT=off    # volta ao caminho inline anterior (idem OIDC_KIT=off)
```
Redeploy do serviço. Depois investigue a lib sem pressa. Ver [`deprecation-policy.md`](../standards/deprecation-policy.md).

## Confirmar
```powershell
curl.exe -s -o NUL -w "%{http_code}" http://xpto.localhost/<app>/api/health   # 200
```
