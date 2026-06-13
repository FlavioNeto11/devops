---
title: "Riscos de Host & Prontidão para Produção"
status: reference
applies_to: [platform]
updated: 2026-06-13
language: pt-BR
---

# Riscos de Host & Prontidão para Produção

> Diagnóstico **read-only** dos riscos do host que executa a plataforma (notebook + Docker Desktop).
> São **recomendações**, não mudanças aplicadas — a plataforma é um **lab de operador único**
> ([`CLAUDE.md`](../../CLAUDE.md)). Use isto ao planejar evolução para produção confiável.

## 1. Disco quase cheio (CRÍTICO)

O volume **`D:` estava com ~98% de uso (≈14 GB livres de 476 GB)** em 2026-06-13. Docker Desktop
(WSL2) guarda imagens/volumes num `ext4.vhdx` que **cresce** e raramente encolhe sozinho — encher o
disco trava o cluster (pods `Evicted`, builds falham).

**Diagnóstico:**
```powershell
Get-PSDrive -PSProvider FileSystem | Select Name,
  @{n='FreeGB';e={[math]::Round($_.Free/1GB,1)}}, @{n='UsedGB';e={[math]::Round($_.Used/1GB,1)}}
# Onde está o vhdx do WSL/Docker:
Get-ChildItem "$env:LOCALAPPDATA\Docker\wsl" -Recurse -Filter *.vhdx -ErrorAction SilentlyContinue |
  Select FullName, @{n='GB';e={[math]::Round($_.Length/1GB,1)}}
```
**Ações recomendadas:**
- `docker system prune -af --volumes` (cuidado: remove imagens/volumes não usados) e
  `docker builder prune -af` (limpa cache de build — costuma ser o maior ofensor).
- Compactar o vhdx do WSL2 (parar o Docker, `wsl --shutdown`, `Optimize-VHD` ou `diskpart compact`).
- Mover o data-root do Docker Desktop para um disco com folga (Settings → Resources → Disk image location).
- **Alerta**: um check de disco no `validate-platform.ps1` / monitor de uptime evita ser pego de surpresa.

## 2. Docker Desktop em Windows Server (NÃO suportado)

A Docker declara que **Docker Desktop não é suportado em Windows Server**
(<https://docs.docker.com/desktop/setup/install/windows-install/>). Funciona hoje, mas **uma
atualização pode quebrar** sem suporte oficial — ver as armadilhas conhecidas em
[`TROUBLESHOOTING.md`](../../TROUBLESHOOTING.md) (seção 13) e o runbook de recuperação
[`docker-desktop-recovery.md`](./docker-desktop-recovery.md).

**Caminho de produção (recomendação, não ação):** migrar o cluster para um host **Linux + K3s/k0s**
(ou kubeadm) ou, para manter Docker Desktop, **Windows 11 Pro**. O repo já é GitOps (Argo) — a maior
parte dos manifests reaplica em outro cluster; o que prende ao lab é `docker-desktop` (contexto) e as
imagens `:local`. Migrar = publicar as imagens no GHCR (o portal já tem CI p/ isso) e apontar o Argo
para o novo cluster.

## 3. Ponto único de falha (notebook)

Energia, suspensão, temperatura, rede e reboot derrubam **tudo** (sem HA). Mitigações:
- **UPS** (nobreak) para o host; desabilitar suspensão automática enquanto serve.
- **Backup**: código → git (ok). **Dados com estado** (Postgres do SICAT/GymOps, etc.) **não** estão
  cobertos por git — definir `pg_dump`/snapshot agendado para um disco/serviço externo.
- **Uptime externo**: monitor (UptimeRobot / Cloudflare Health Check) batendo em
  `https://dev.nvit.com.br/healthz` (portal) e nas rotas críticas, com alerta.
- **Observabilidade**: Grafana/Loki já coletam logs do nginx do portal
  (`{namespace="devops-system", app="portal"}`) — ver [`portal-operations.md`](./portal-operations.md) §5.

## 4. TLS/HSTS

O middleware `redirect-https` e o HSTS do `secure-headers` existem mas dependem de TLS válido na borda
(Cloudflare/Traefik). Em produção, habilitar TLS e o HSTS efetivo (ver
[`local-domain-setup.md`](../local-domain-setup.md) e `platform/traefik/middlewares.yaml`).

## 5. Resumo de prioridade

| Risco | Severidade | Ação mínima |
|---|---|---|
| Disco D: ~98% | **Alta** | `docker builder prune -af` + compactar vhdx + alerta de disco |
| Docker Desktop em Win Server | Média (latente) | documentar; planejar Linux+K3s / Win11 Pro |
| SPOF do notebook | Média | UPS + backup de dados + uptime externo |
| Sem TLS/HSTS efetivo | Média | TLS na borda + habilitar HSTS |
