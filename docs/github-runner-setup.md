---
title: "Configuracao do GitHub Actions Self-Hosted Runner"
status: guide
applies_to: [platform]
updated: 2026-06-09
language: pt-BR
---

# Configuracao do GitHub Actions Self-Hosted Runner

Este guia mostra, passo-a-passo, como instalar e registrar o **runner self-hosted** do
GitHub Actions para o repositorio **`FlavioNeto11/devops`**, rodando como **servico do
Windows** na propria maquina (host com Docker Desktop + Kubernetes). O runner e o que
permite que os workflows facam **build das imagens** (Docker) e **deploy no cluster local**
(`docker-desktop`) — o GitHub hospedado **nao** alcanca o cluster local.

> Script de apoio: [`scripts/install-github-runner.ps1`](../scripts/install-github-runner.ps1)
> (idempotente). Seguranca do runner em [`SECURITY.md`](../SECURITY.md) (secao 3).

---

## 1. Visao geral

```
GitHub Actions (nuvem)                      Host Windows (esta maquina)
  workflow app-pipeline  --- agenda job --> Runner self-hosted (servico)
                                              |  docker buildx build/push (GHCR)
                                              |  kubectl apply (contexto docker-desktop)
                                              v
                                            Cluster Kubernetes local
```

- O **build/push** roda em `ubuntu-latest` (runner hospedado do GitHub).
- O **deploy** roda no **self-hosted runner** desta maquina, porque so ele tem acesso ao
  `kubectl`/contexto `docker-desktop`. Veja
  [`.github/workflows/reusable-deploy-k8s.yaml`](../.github/workflows/reusable-deploy-k8s.yaml)
  (`runs-on: [self-hosted, windows, docker-desktop, local-k8s, flavio-devops]`).

> No laboratorio com imagens `:local` voce **nao** precisa do runner — a publicacao local
> e feita por scripts (veja [`deployment-flow.md`](./deployment-flow.md)). O runner e para o
> fluxo **completo via GitHub Actions/GHCR**.

---

## 2. Pre-requisitos

| Item                         | Como verificar                                   | Resultado esperado                          |
|------------------------------|--------------------------------------------------|---------------------------------------------|
| Windows Server x64           | `systeminfo`                                      | Windows Server Datacenter x64.              |
| PowerShell 7+ (`pwsh`)       | `pwsh -v`                                          | `PowerShell 7.x`.                            |
| Docker Desktop + Kubernetes  | `docker version` / `kubectl config current-context` | engine respondendo; contexto `docker-desktop`. |
| `kubectl` no PATH            | `kubectl version --client`                        | versao do client.                            |
| Nodes do cluster acessiveis  | `kubectl get nodes`                               | ao menos 1 node `Ready`.                     |
| Git instalado                | `git --version`                                   | versao do git.                               |
| (Opcional) `gh` autenticado  | `gh auth status`                                  | `Logged in to github.com as FlavioNeto11`.   |
| Permissao **admin** no repo  | dono `FlavioNeto11`                               | necessario para gerar o registration token.  |

> Se o `gh` estiver autenticado com permissao de admin no repo, o script obtem o
> **registration token automaticamente** (via `gh api`). Caso contrario, voce gera o token
> manualmente (secao 3).

Verificacao rapida (PowerShell 7):

```powershell
pwsh -v
docker version --format '{{.Server.Version}}'
kubectl config current-context
kubectl get nodes
```

Saida esperada (exemplo):

```
PowerShell 7.5.4
27.x.x
docker-desktop
NAME             STATUS   ROLES           AGE   VERSION
docker-desktop   Ready    control-plane   10d   v1.31.x
```

---

## 3. Gerar o registration token (caminho EXATO na UI do GitHub)

O **registration token** e **efemero** (vale por ~1h) e serve apenas para registrar o
runner. **Nunca** o commite.

Caminho exato na interface do GitHub:

1. Acesse o repositorio **`FlavioNeto11/devops`**.
2. **Settings** (aba do repositorio).
3. No menu lateral, **Actions** -> **Runners**.
4. Botao **New self-hosted runner** (canto superior direito).
5. Em **Runner image**, selecione **Windows**; em **Architecture**, selecione **x64**.

URL direta (logado como `FlavioNeto11`):

```
https://github.com/FlavioNeto11/devops/settings/actions/runners/new?arch=x64&os=win
```

Na pagina, a secao **Configure** mostra a linha do `config.cmd` com o token, por exemplo:

```
./config.cmd --url https://github.com/FlavioNeto11/devops --token AAAA....
```

**Copie apenas o token** (o trecho `AAAA....` que vem depois de `--token`). Voce vai passa-lo
para o script via `-Token`.

> **Atalho com `gh`:** se voce tiver o GitHub CLI autenticado com admin no repo, **pule a
> UI** — o script obtem o token sozinho. Voce tambem pode gera-lo manualmente:
> ```powershell
> gh api -X POST repos/FlavioNeto11/devops/actions/runners/registration-token --jq '.token'
> ```

---

## 4. Rodar o `scripts/install-github-runner.ps1`

Abra um **PowerShell 7** (de preferencia **como Administrador**, pois o runner sera
instalado como **servico**).

### 4.1 Com token informado (caminho manual)

```powershell
pwsh -File C:/devops/scripts/install-github-runner.ps1 -Token <COLE_O_TOKEN_AQUI>
```

### 4.2 Sem token (deixa o `gh` obter automaticamente)

```powershell
# Requer 'gh auth login' previo com admin no repo.
pwsh -File C:/devops/scripts/install-github-runner.ps1
```

### 4.3 Parametros disponiveis

| Parametro        | Padrao                                                          | Para que serve                                              |
|------------------|----------------------------------------------------------------|------------------------------------------------------------|
| `-Repo`          | `FlavioNeto11/devops`                                           | Repositorio `owner/repo`.                                   |
| `-Token`         | *(vazio)*                                                       | Registration token. Vazio = tenta obter via `gh`.          |
| `-RunnerVersion` | *(vazio)*                                                       | Versao especifica do runner (sem `v`). Vazio = a mais recente. |
| `-Labels`        | `self-hosted,windows,docker-desktop,local-k8s,flavio-devops`   | Labels aplicadas ao runner.                                |

### 4.4 O que o script faz (idempotente)

1. Cria a pasta `C:/devops/runner`.
2. **Idempotencia**: se ja existe `.runner` **ou** um servico `actions.runner.*`, apenas
   imprime o status e sai (nao reconfigura).
3. Descobre a versao mais recente do runner via `gh api` (com fallback fixo se o `gh`
   falhar).
4. Baixa e extrai o pacote do runner (pula se ja extraido).
5. Obtem o registration token (via `-Token` ou via `gh api`); se nao conseguir, imprime os
   **passos manuais EXATOS** (incluindo a URL da secao 3) e sai com codigo 0.
6. Executa `config.cmd ... --unattended --runasservice` (registra **e** instala o servico).
7. Faz a **validacao final** (secao 6) e lembra de fazer `docker login ghcr.io`.

Saida esperada (trechos, com cabecalhos de secao):

```
======================================================================
 Preparando a pasta do runner
======================================================================
[OK] Pasta criada: C:/devops/runner
...
======================================================================
 Configurando o runner como servico
======================================================================
[..] Registrando runner 'NOME-DO-HOST-devops' no repo FlavioNeto11/devops com labels: self-hosted,windows,docker-desktop,local-k8s,flavio-devops
[OK] Runner configurado e servico instalado.
...
[OK] Servico do runner: actions.runner.FlavioNeto11-devops.NOME-DO-HOST-devops (Status: Running)
[OK] Instalacao do runner concluida.
```

---

## 5. Labels aplicadas

O script registra o runner com estas labels (sobrescreviveis via `-Labels`):

```
self-hosted, windows, docker-desktop, local-k8s, flavio-devops
```

Essas labels **devem** casar com o `runs-on` do job de deploy:

```yaml
# .github/workflows/reusable-deploy-k8s.yaml
runs-on: [self-hosted, windows, docker-desktop, local-k8s, flavio-devops]
```

> Se voce alterar as labels do runner, atualize o `runs-on` do workflow de deploy (e
> vice-versa), senao o job de deploy ficara **eternamente em fila** (nenhum runner casa).

---

## 6. Runner como servico do Windows

O runner e instalado como servico (inicia junto com a maquina). Comandos uteis (PowerShell):

```powershell
# Status do servico do runner (o nome comeca com 'actions.runner.')
Get-Service -Name 'actions.runner.*'

# Iniciar / parar / reiniciar
Start-Service  -Name 'actions.runner.*'
Stop-Service   -Name 'actions.runner.*'
Restart-Service -Name 'actions.runner.*'
```

Saida esperada de `Get-Service`:

```
Status   Name                                                          DisplayName
------   ----                                                          -----------
Running  actions.runner.FlavioNeto11-devops.HOST-devops                GitHub Actions Runner (...)
```

Gerenciar via os scripts da pasta do runner (`C:/devops/runner`):

```powershell
# (na pasta do runner) instalar/iniciar/parar/desinstalar o servico
C:/devops/runner/svc.cmd status
C:/devops/runner/svc.cmd start
C:/devops/runner/svc.cmd stop
C:/devops/runner/svc.cmd uninstall
```

---

## 7. Validacoes (apos a instalacao)

### 7.1 Validacao automatica (o script ja faz)

O `install-github-runner.ps1` valida ao final: `docker version`, `kubectl
current-context` (espera `docker-desktop`), `kubectl get nodes` e o status do servico.

### 7.2 Validacao manual

```powershell
# 1) Docker respondendo
docker version --format '{{.Server.Version}}'

# 2) Contexto kube correto
kubectl config current-context        # esperado: docker-desktop

# 3) Nodes acessiveis
kubectl get nodes                     # esperado: 1+ node Ready

# 4) Servico do runner ativo
Get-Service -Name 'actions.runner.*'  # esperado: Running

# 5) Login no GHCR (necessario p/ pull de imagens privadas no deploy local)
#    O PAT precisa de write:packages (push) e read:packages (pull).
$env:CR_PAT = "<SEU_PAT>"
$env:CR_PAT | docker login ghcr.io -u flavioneto11 --password-stdin
Remove-Item Env:CR_PAT
```

Saida esperada do `docker login`:

```
Login Succeeded
```

### 7.3 Validacao no GitHub (UI)

1. **Settings -> Actions -> Runners**: o runner deve aparecer com o nome
   `<host>-devops`, status **Idle** (verde) e as labels listadas.
2. Dispare o workflow (push em `main` ou **Run workflow** manual) e confirme que o job
   **Deploy K8s local** sai da fila e roda no seu runner.

### 7.4 Teste de fumaca do pipeline

```powershell
# A partir do repo da app (ou do proprio devops), com a aba Actions habilitada:
gh workflow run app-pipeline.yaml        # dispara manualmente (workflow_dispatch)
gh run watch                             # acompanha a execucao em tempo real
```

Resultado esperado: jobs `discover` -> `build` (matrix por service) -> `deploy` concluindo;
o job de deploy executa no runner self-hosted e termina com `rollout concluido`.

---

## 8. GHCR — autenticacao para o deploy local

Os workflows de **build/push** logam no GHCR automaticamente com o `GITHUB_TOKEN`
(`packages: write`). Mas o **deploy local** (puxar a imagem para o cluster do Docker
Desktop) pode exigir que **o Docker desta maquina** esteja autenticado no GHCR para imagens
**privadas**:

```powershell
# Gere um PAT (classic) com escopos write:packages e read:packages em:
#   https://github.com/settings/tokens
$env:CR_PAT = "<SEU_PAT>"
$env:CR_PAT | docker login ghcr.io -u flavioneto11 --password-stdin   # usuario MINUSCULO
Remove-Item Env:CR_PAT
```

> Lembre-se: o owner no GHCR e sempre **minusculo** (`flavioneto11`). Veja
> [`platform/registry/ghcr-guide.md`](../platform/registry/ghcr-guide.md) e
> [`SECURITY.md`](../SECURITY.md) (secao 2).

---

## 9. Troubleshooting

### 9.1 Runner aparece OFFLINE / job preso em fila

- **Servico parado?** `Get-Service -Name 'actions.runner.*'` -> se nao estiver `Running`,
  `Start-Service -Name 'actions.runner.*'`.
- **Labels nao casam?** Confirme que as labels do runner (UI: Settings -> Actions ->
  Runners) sao exatamente `self-hosted, windows, docker-desktop, local-k8s, flavio-devops`
  e que o `runs-on` do workflow usa as mesmas. Sem casamento, o job fica em fila.
- **Maquina/Docker desligados:** o job de deploy so roda com o host ligado e o Docker
  Desktop ativo. Ligue ambos e o job sai da fila.
- **Logs do runner:** veja os arquivos em `C:/devops/runner/_diag/*.log`.

### 9.2 Erro de permissao ao obter o token / instalar o servico

- **Token (403/sem retorno):** o `gh` precisa de **admin no repo** para emitir o
  registration token. Use o caminho manual (secao 3) e passe `-Token`.
- **Instalacao do servico falha:** abra o PowerShell **como Administrador** e rode o script
  de novo. Instalar/registrar servico exige privilegios elevados.
- **Politica de execucao bloqueando o script:**
  ```powershell
  pwsh -ExecutionPolicy Bypass -File C:/devops/scripts/install-github-runner.ps1 -Token <token>
  ```

### 9.3 Re-registro (reconfigurar do zero)

O script e idempotente e **nao** reconfigura se ja houver `.runner`/servico. Para refazer:

```powershell
# 1) Parar e desinstalar o servico (na pasta do runner)
C:/devops/runner/svc.cmd stop
C:/devops/runner/svc.cmd uninstall

# 2) Remover o registro no GitHub (precisa de um token de remocao).
#    Gere um novo token (mesma pagina da secao 3) e rode:
C:/devops/runner/config.cmd remove --token <REMOVAL_TOKEN>

# 3) Re-registrar com um novo registration token
pwsh -File C:/devops/scripts/install-github-runner.ps1 -Token <NOVO_REGISTRATION_TOKEN>
```

> Se o runner sumiu da UI mas o servico local persiste (ou vice-versa), execute os passos
> 1 e 2 para limpar ambos os lados antes de re-registrar.

### 9.4 `docker login` falha no GHCR

- Confira que o usuario e **minusculo** (`flavioneto11`).
- Confira os escopos do PAT (`write:packages`, `read:packages`).
- Teste o token: `gh auth status` (se usar `gh`) ou regenere o PAT e tente de novo.

### 9.5 Deploy aborta com "contexto esperado 'docker-desktop'"

O workflow de deploy tem uma **trava de seguranca**: se o `kubectl config
current-context` nao for `docker-desktop`, ele **falha de proposito** (evita deploy em
cluster errado). Corrija o contexto:

```powershell
kubectl config use-context docker-desktop
```

---

## 10. Referencias

- [`scripts/install-github-runner.ps1`](../scripts/install-github-runner.ps1) — script
  idempotente de instalacao/registro.
- [`.github/workflows/reusable-deploy-k8s.yaml`](../.github/workflows/reusable-deploy-k8s.yaml)
  — job de deploy que roda no runner (labels e trava de contexto).
- [`.github/workflows/reusable-build-push.yaml`](../.github/workflows/reusable-build-push.yaml)
  — build/push das imagens no GHCR.
- [`templates/github-actions/app-pipeline-template.yaml`](../templates/github-actions/app-pipeline-template.yaml)
  — pipeline da app (discover -> build -> deploy).
- [`SECURITY.md`](../SECURITY.md) — seguranca do runner e escopos do PAT.
- [`deployment-flow.md`](./deployment-flow.md) — fluxo completo (local e via Actions).
