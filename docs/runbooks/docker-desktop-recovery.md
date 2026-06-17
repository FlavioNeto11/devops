---
title: "Runbook — recuperar o Docker Desktop / Kubernetes"
status: guide
applies_to: [platform]
updated: 2026-06-17
language: pt-BR
---

# Runbook — recuperar o Docker Desktop / Kubernetes

> Quando o Docker Desktop trava (boot/reboot) ou o k8s some. Detalhes e causas em
> [`TROUBLESHOOTING.md`](../../TROUBLESHOOTING.md) (seção 13).

## Sintomas
- `kubectl` dá timeout / engine 500; pods somem; `docker ps` falha.
- Após `docker desktop restart` o Docker fica preso em **"stopping"**.
- **Pós-reboot**: a plataforma "não subiu sozinha" — `dev.nvit.com.br` fora (mas o
  `cloudflared` continua **Running**: o túnel está de pé apontando para um Traefik que caiu).
- **Start parcial** (o "docker deu erro"): há processos `Docker Desktop`/`com.docker.backend`,
  porém o serviço **`com.docker.service` = Stopped** e **`vmmem` ausente** → o engine nunca sobe.

## Pós-reboot — a plataforma não subiu sozinha

O Docker Desktop só dá autostart **no login interativo** (chave Run do Windows). Após um reboot
sem login na sessão do desktop, ele **não inicia** — e `docker desktop start` nesta máquina costuma
**travar** ou subir só pela metade (GUI sem `com.docker.service`/`vmmem`).

**Diagnóstico rápido (não usa o CLI do Docker, que pendura quando o engine está meio-subido):**
```powershell
foreach ($n in 'Docker Desktop','com.docker.backend','com.docker.service','vmmem','cloudflared') {
  $p = Get-Process -Name $n -ErrorAction SilentlyContinue
  if ($p) { "OK $n" } else { "-- $n parado" }
}
(Get-Service com.docker.service).Status   # Stopped = engine não vai subir
```
Se `com.docker.service` está **Stopped** ou `vmmem` ausente → **não** insista no `docker desktop start`;
vá direto para a recuperação abaixo (ela religa o serviço e relança limpo).

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
