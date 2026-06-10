---
title: "Runbook — subir, validar e resetar a plataforma"
status: guide
applies_to: [platform]
updated: 2026-06-09
language: pt-BR
---

# Runbook — subir, validar e resetar a plataforma

> Fluxo de bootstrap completo em [`deployment-flow.md`](../deployment-flow.md). Este runbook é o
> resumo acionável.

## Subir tudo do zero (idempotente)
```powershell
# PowerShell 7 como Admin
C:\devops\scripts\up.ps1
```
Encadeia: prereqs → Kubernetes (Docker Desktop) → plataforma (Traefik, Argo CD, observabilidade,
Console) → apps. Use os scripts individuais (`install-*.ps1`) para rodar partes.

## Validar
```powershell
C:\devops\scripts\validate-platform.ps1   # 17 checks (pods Ready, serviços, rotas)
kubectl get pods,svc,ingressroute -A
```
Acessos: `/devops` (Console), `/argocd`, `/grafana`, `/auth` (Keycloak), `traefik.localhost/dashboard/`.

## Resetar (destrutivo)
```powershell
C:\devops\scripts\reset-platform.ps1      # apaga namespaces/recursos (com confirmação)
```
> O cluster é descartável. Dados de apps vivem em PVCs; o reset os remove — re-semeie depois
> (`seed` de cada app). Não guarde no lab dado que não possa ser re-semeado.

## Senhas úteis
```powershell
# Grafana admin
kubectl get secret kube-prometheus-stack-grafana -n observability -o jsonpath='{.data.admin-password}' | %{ [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($_)) }
# Argo CD UI (port-forward; o subpath serve base href quebrado)
kubectl port-forward svc/argocd-server -n argocd 8080:80
```
