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

## Site fora mesmo com k8s Ready: forwarding de host do Docker Desktop não voltou

Sintoma clássico **pós-recuperação**: `kubectl get nodes` Ready, pods Running, mas
`dev.nvit.com.br`/`nvit.localhost` dão **502/503 ou "connection refused"** — porque o
**host não está escutando a porta 80/443** (nem os NodePorts). O `kubectl` chega (apiserver
em `127.0.0.1:6443`), mas a ponte host→serviço do Docker Desktop (o **`vpnkit-controller`**
em `kube-system`, que liga LoadBalancer/NodePort ao `localhost`) não re-sincronizou após o
`wsl --shutdown`.

**Diagnóstico:**
```powershell
foreach ($p in 80,443,30000..30001) { if (Get-NetTCPConnection -LocalPort $p -State Listen -EA 0) {"$p LISTEN"} }  # vazio = forwarding fora
kubectl get svc traefik -n traefik          # EXTERNAL-IP <pending> = controlador de LB não atribuiu
kubectl get pod vpnkit-controller -n kube-system
```

**⚠️ NÃO recrie o Service do Traefik** para "forçar". Recriar zera o `status.loadBalancer`
(EXTERNAL-IP volta a `<pending>`) e o controlador **não reatribui** `localhost` sem um restart
— você só piora. O EXTERNAL-IP é atribuído **no boot limpo**, varrendo os Services existentes.

**Conserto durável** — reiniciar o Docker Desktop para reinicializar o `vpnkit-controller`:
```powershell
# `docker desktop restart` TRAVA nesta máquina (context deadline exceeded) → use o recover:
C:\devops\scripts\recover-docker.ps1
# aguarde, SEM tocar no Service do Traefik. O controlador atribui EXTERNAL-IP=localhost e a
# porta 80 liga sozinha em ~2 min após o nó ficar Ready. Confirme:
kubectl get svc traefik -n traefik   # EXTERNAL-IP = localhost
```

**Ponte temporária (se precisar do site no ar AGORA, antes do restart durável):** usa o túnel
do apiserver, contorna o forwarding quebrado — mas **não sobrevive a reboot/fim de sessão**:
```powershell
kubectl port-forward --address 0.0.0.0 -n traefik svc/traefik 80:80 443:443
```

## Postgres de um app em CrashLoop com WAL corrompido (pós-OOMKill/reboot)

Um reboot abrupto (ou um `OOMKilled` no meio de uma escrita) pode corromper o WAL de um
Postgres → CrashLoopBackOff com:
```
PANIC: could not locate a valid checkpoint record   (invalid resource manager ID / invalid checkpoint record)
```
Os **data files costumam estar íntegros** — só o WAL/checkpoint está ilegível. Recuperação com
`pg_resetwal` (preserva tudo até o último checkpoint; pode perder as escritas mais recentes —
confirme com o dono dos dados antes). **Não há backup automático** dos PVCs hostpath.

> ⚠️ Causa comum: **limite de memória baixo** no Postgres (era `512Mi` no SICAT) → suba o limite
> junto, senão volta a OOMKillar e re-corromper. Ex.: SICAT agora usa `1Gi`.

```powershell
# 1) desligar o selfHeal do Argo do app (senão ele religa o pod e trava o PVC RWO)
kubectl patch application <app> -n argocd --type=merge -p '{"spec":{"syncPolicy":{"automated":null}}}'
# 2) parar o Postgres (libera o PVC)
kubectl scale deploy/<app>-postgres -n apps --replicas=0   # espere o pod sair
# 3) rodar pg_resetwal num pod efêmero sobre o MESMO PVC (subPath e uid do postgres = 999)
#    command: pg_resetwal -n <PGDATA>  (dry-run)  e depois  pg_resetwal -f <PGDATA>
#    PGDATA do SICAT: /var/lib/postgresql/data  (mount com subPath: pgdata)
# 4) religar e reativar o Argo
kubectl apply -f apps/<app>/k8s/postgres.yaml      # replicas=1 (+ memória corrigida)
kubectl patch application <app> -n argocd --type=merge -p '{"spec":{"syncPolicy":{"automated":{"prune":true,"selfHeal":true}}}}'
kubectl delete pod -n apps -l app.kubernetes.io/name=<app>-api   # reinicia o backend (pula o backoff)
```
Manifesto do pod efêmero (pg16): `securityContext.runAsUser/Group/fsGroup: 999`, monta o PVC com
`subPath: pgdata`, e roda `/usr/lib/postgresql/16/bin/pg_resetwal -f /var/lib/postgresql/data`.
Depois confirme `pg_isready` e o health do app.

## Regras de ouro (não piorar)
- **Nunca force-kill o Docker** sem necessidade (deixa sockets AF_UNIX órfãos → crash no boot).
- **Não** usar "Reset to factory defaults".
- `AutoStart` no `settings-store.json` **reverte** com o Docker rodando → use o **toggle da GUI**.
- node-exporter no WSL2: `prometheus-node-exporter.hostRootFsMount.enabled: false`.

## Validar
```powershell
C:\devops\scripts\validate-platform.ps1   # 17 checks
```
