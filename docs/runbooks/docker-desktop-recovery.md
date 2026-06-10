---
title: "Runbook — recuperar o Docker Desktop / Kubernetes"
status: guide
applies_to: [platform]
updated: 2026-06-09
language: pt-BR
---

# Runbook — recuperar o Docker Desktop / Kubernetes

> Quando o Docker Desktop trava (boot/reboot) ou o k8s some. Detalhes e causas em
> [`TROUBLESHOOTING.md`](../../TROUBLESHOOTING.md) (seção 13).

## Sintomas
- `kubectl` dá timeout / engine 500; pods somem; `docker ps` falha.
- Após `docker desktop restart` o Docker fica preso em **"stopping"**.

## Recuperação (idempotente)
```powershell
# PowerShell 7 como Admin
C:\devops\scripts\recover-docker.ps1
```
O script: mata processos do Docker, `wsl --shutdown`, **renomeia** sockets/pastas órfãos
(`%LOCALAPPDATA%\docker-*`, `Docker\run`), e relança. Depois os pods se recriam sozinhos.

## Garantir o Kubernetes pronto
```powershell
C:\devops\scripts\enable-kubernetes.ps1   # edita settings-store.json + espera Ready
kubectl config use-context docker-desktop
kubectl get nodes
```

## Regras de ouro (não piorar)
- **Nunca force-kill o Docker** sem necessidade (deixa sockets AF_UNIX órfãos → crash no boot).
- **Não** usar "Reset to factory defaults".
- `AutoStart` no `settings-store.json` **reverte** com o Docker rodando → use o **toggle da GUI**.
- node-exporter no WSL2: `prometheus-node-exporter.hostRootFsMount.enabled: false`.

## Validar
```powershell
C:\devops\scripts\validate-platform.ps1   # 17 checks
```
