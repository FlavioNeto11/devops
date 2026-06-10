---
title: "Plataforma DevOps Local (Kubernetes em Windows)"
status: canonical
applies_to: [platform]
updated: 2026-06-09
language: pt-BR
---

# Plataforma DevOps Local (Kubernetes em Windows)

Plataforma DevOps completa, auto-hospedada, rodando em um cluster Kubernetes local
do **Docker Desktop** em **Windows Server Datacenter x64**. Ela cobre a esteira
inteira: do descritor da aplicacao (`devops.yaml`) ao build de imagens, publicacao,
deploy no cluster, roteamento por Ingress (Traefik) e observabilidade em tempo real
atraves de um **DevOps Console** somente leitura.

> Idioma: documentacao, comentarios e textos de UI em Portugues (pt-BR).
> Identificadores de codigo, chaves YAML e comandos de CLI permanecem em ingles.

- Repositorio: <https://github.com/FlavioNeto11/devops>
- Dono: `FlavioNeto11` | Namespace GHCR (minusculo): `flavioneto11`
- Raiz do repo no host: `C:/devops`
- Contexto Kubernetes: `docker-desktop`

---

## Visao geral

O objetivo e ter, em uma unica maquina Windows, um ambiente que se comporta como uma
plataforma de entrega continua "de verdade", mas 100% local:

1. Voce descreve uma aplicacao em um `devops.yaml` (contrato canonico).
2. Ao dar `push`, o **GitHub Actions** roda em um **runner self-hosted** (na propria
   maquina), faz build das imagens com `docker buildx` e publica no **GHCR**.
3. O mesmo runner aplica os manifests no cluster (`helm`/`kubectl apply`), anotando o
   `Deployment` com metadados da esteira.
4. O **Traefik** publica as rotas declaradas (frontends, APIs, worker) sob um unico host.
5. O **DevOps Console** (backend Node.js somente leitura + frontend React) mostra o
   estado do cluster em tempo real via SSE.

Para o laboratorio, as imagens da `aplicacao1` e do proprio Console sao buildadas
**localmente** (tag `:local`, `imagePullPolicy: IfNotPresent`) e **nao** sao enviadas
ao registry. O fluxo via GHCR fica disponivel para quando voce quiser publicar de fato.

---

## Arquitetura (componentes)

| Componente              | Tecnologia                                  | Onde roda                          | Proposito                                                                 |
|-------------------------|---------------------------------------------|------------------------------------|--------------------------------------------------------------------------|
| Cluster Kubernetes      | Docker Desktop (Kubernetes embutido)        | Host Windows (contexto `docker-desktop`) | Orquestracao de containers de toda a plataforma.                    |
| Ingress Controller      | Traefik (via Helm, namespace `traefik`)     | Cluster                            | Roteamento HTTP por path; CRDs `IngressRoute` e `Middleware`.            |
| Registry de imagens     | GHCR (`ghcr.io/flavioneto11/...`)           | GitHub (nuvem)                     | Armazena imagens publicadas pela esteira (fluxo opcional no lab).       |
| CI/CD                   | GitHub Actions + runner self-hosted         | Workflow na nuvem; runner no host  | Build (`buildx`), push GHCR e deploy (`helm`/`kubectl`).                |
| GitOps (opcional)       | Argo CD (namespace `argocd`)                | Cluster                            | Reconciliacao declarativa de manifests (rootpath `/argocd`).            |
| Metricas                | Prometheus + Grafana (namespace `observability`) | Cluster                       | Coleta de metricas e dashboards (`/grafana`).                          |
| Logs                    | Loki + Promtail (namespace `observability`) | Cluster                            | Agregacao e consulta de logs dos pods.                                  |
| DevOps Console          | Backend Node.js (Express + `@kubernetes/client-node`) + frontend React/Vite | Cluster (`devops-system`) | Visao somente leitura do cluster em tempo real (SSE).      |
| Identidade / SSO        | Keycloak (namespace `identity`)             | Cluster                            | IdP OIDC em `/auth` (realm `nvit`); SSO de Grafana e Argo CD. Ver `docs/sso-keycloak.md`. |
| Cofre de segredos       | Sealed Secrets (controller `kube-system`)   | Cluster                            | Secrets criptografados e versionados no git (`kubeseal`).               |

---

## Roteamento por path (host unico)

Host local: `xpto.localhost` | Host real futuro: `dev.nvit.com.br` (mesmo layout de paths).

Todas as rotas locais usam o entrypoint `web` (HTTP/porta 80). O `websecure`
(HTTPS/porta 443) fica documentado como **pendente** (certificado self-signed) — ver
[`SECURITY.md`](./SECURITY.md).

| Path                     | Destino (Service)     | StripPrefix | Observacao                                                                 |
|--------------------------|-----------------------|-------------|---------------------------------------------------------------------------|
| `/devops`                | `console-frontend`    | NAO         | SPA servida no subpath; build com base `/devops/`.                        |
| `/devops/api`            | `console-backend`     | SIM         | API somente leitura; strip de `/devops/api`.                              |
| `/argocd`                | Argo CD `server`      | NAO         | `argocd server --insecure`, rootpath `/argocd`.                          |
| `/grafana`               | Grafana               | NAO         | `serve_from_sub_path=true`, `root_url=.../grafana`.                       |
| `/aplicacao1`            | `aplicacao1-frontend` | NAO         | SPA; build com `VITE_BASE_PATH=/aplicacao1/`.                             |
| `/aplicacao1/api`        | `aplicacao1-api`      | SIM         | Strip de `/aplicacao1/api`; backend ve rotas na raiz (ex.: `/health`).   |
| `/aplicacao1/worker`     | `aplicacao1-worker`   | SIM         | Health do worker (opcional); strip de `/aplicacao1/worker`.              |

### Regra de prioridade (critica)

No mesmo host, **o `PathPrefix` mais especifico/longo deve vencer**. Definimos
`priority` explicito em cada `IngressRoute` para garantir que `/<base>/api` tenha
prioridade **MAIOR** que `/<base>`. Exemplo: `/aplicacao1/api` (priority alta) vence
`/aplicacao1` (priority baixa), mesmo que o Traefik tambem leve em conta o tamanho da
regra. Convencao de roteamento detalhada em [`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## Convencao de roteamento e strip-prefix

| Tipo de servico        | `expose` | `stripPrefix` | Comportamento                                                                                  |
|------------------------|----------|---------------|------------------------------------------------------------------------------------------------|
| Frontend (SPA)         | `true`   | **`false`**   | Servido no subpath. Build com base path `/<basePath>/`; o nginx serve o conteudo sob o subpath. |
| API / api2 / worker    | `true`   | **`true`**    | `Middleware` StripPrefix remove o prefixo COMPLETO; o processo ve rotas na raiz.               |

Exemplo concreto: uma requisicao para `/aplicacao1/api/health` chega ao Traefik, que
aplica o `StripPrefix` de `/aplicacao1/api` e encaminha `/health` ao `aplicacao1-api`.

---

## Quick Start — subir TUDO com um comando

Abra um **PowerShell 7 como Administrador** e rode:

```powershell
cd C:/devops
.\scripts\up.ps1
```

O `up.ps1` e **idempotente** e faz a esteira inteira de ponta a ponta:
pre-requisitos → ferramentas (winget) → arquivo `hosts` → **habilita o Kubernetes** do
Docker Desktop → instala a plataforma (Traefik, Argo CD, Observabilidade, Console) →
builda as imagens `:local` dos samples → publica a `aplicacao1` → valida. Pode re-rodar
quando quiser.

Prefere por partes? Os scripts tambem rodam isolados (todos idempotentes):

```powershell
.\scripts\enable-kubernetes.ps1   # garante o k8s do Docker Desktop Ready
.\scripts\install-platform.ps1    # Traefik, Argo CD, observabilidade, Console
.\scripts\build-samples.ps1       # builda imagens :local de samples/*
.\scripts\publish-sample-app.ps1  # aplica a aplicacao1
.\scripts\validate-platform.ps1   # relatorio de saude (17 checks)
.\scripts\diagnose.ps1            # coleta diagnostico se algo falhar
.\scripts\recover-docker.ps1      # recupera o Docker Desktop travado no boot
```

### Criar um app novo na esteira (1 comando)

```powershell
.\scripts\new-app.ps1 -Name minhaapp -Services frontend,api,api2,worker
```

Gera `devops.yaml` + Dockerfiles + `k8s/` + workflow + **Application do Argo (GitOps)** no
padrao da plataforma, e imprime os comandos de `docker build` / `kubectl apply`. Resultado:
`http://xpto.localhost/minhaapp` (e `/minhaapp/api`, `/minhaapp/api2`...).

---

## URLs de acesso

Apos o Quick Start (e com `xpto.localhost` apontando para `127.0.0.1` no arquivo
`hosts` — ver [`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md)):

| Recurso                 | URL                                              |
|-------------------------|--------------------------------------------------|
| DevOps Console          | <http://xpto.localhost/devops>                   |
| Aplicacao 1 (frontend)  | <http://xpto.localhost/aplicacao1>               |
| Aplicacao 1 (API health)| <http://xpto.localhost/aplicacao1/api/health>    |
| Argo CD                 | <http://xpto.localhost/argocd>                    |
| Grafana                 | <http://xpto.localhost/grafana>                   |
| Keycloak (SSO)          | <http://xpto.localhost/auth> (realm `nvit`)       |

> `xpto.localhost` resolve para `127.0.0.1` na maioria dos sistemas; se nao resolver,
> adicione a entrada no arquivo `hosts` conforme o [`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md).

---

## Arvore do repositorio

```
C:/devops
├── README.md                     # Este arquivo (visao geral)
├── ARCHITECTURE.md               # Componentes, fluxo da esteira, namespaces, roteamento
├── ROADMAP.md                    # 6 fases em checklist + evolucao futura
├── SECURITY.md                   # Segredos, PAT GHCR, runner, RBAC, HTTPS, .gitignore
├── TROUBLESHOOTING.md            # Problemas comuns e comandos de correcao
├── .gitignore                    # Ignora segredos, artefatos e a pasta do runner
├── scripts/                      # Scripts PowerShell 7 idempotentes
│   ├── up.ps1                    # UM comando: sobe TODA a plataforma do zero
│   ├── enable-kubernetes.ps1     # Habilita/garante o k8s do Docker Desktop
│   ├── recover-docker.ps1        # Recupera o Docker Desktop travado no boot
│   ├── install-platform.ps1      # Traefik, Argo CD, observabilidade, Console
│   ├── build-samples.ps1         # Builda imagens :local de samples/*
│   ├── publish-sample-app.ps1    # Aplica a aplicacao1
│   ├── new-app.ps1               # Gera um app novo no padrao (incl. Application do Argo)
│   ├── validate-platform.ps1     # Valida saude da plataforma
│   ├── bootstrap.ps1             # (legado) prereqs + install-platform + validate
│   └── diagnose.ps1              # Coleta diagnostico do ambiente
├── platform/                     # Manifests/Helm values da plataforma
│   ├── traefik/                  # Values do Helm e CRDs base do Traefik
│   ├── argocd/                   # Instalacao e config do Argo CD (rootpath /argocd)
│   └── observability/            # Prometheus, Grafana, Loki, Promtail
├── console/                      # DevOps Console (somente leitura)
│   ├── backend/                  # Node.js (Express + @kubernetes/client-node), SSE
│   └── frontend/                 # React + Vite (base /devops/)
├── templates/                    # Templates de manifests parametrizados por devops.yaml
├── samples/                      # Apps de exemplo: aplicacao1, aplicacao2 (api2), aplicacao3 (gerada)
└── docs/                         # Documentacao complementar
```

> Algumas subpastas sao criadas/preenchidas por outras etapas da plataforma; a arvore
> acima reflete o layout canonico do projeto.

---

## Pre-requisitos

- **Windows Server Datacenter x64** (ou Windows 10/11 Pro) com virtualizacao habilitada.
- **Docker Desktop** instalado, com **Kubernetes habilitado** (Settings → Kubernetes →
  *Enable Kubernetes*). Contexto `docker-desktop` ativo.
- **kubectl** disponivel no `PATH` (o Docker Desktop instala um; ou instale separado).
- **Helm 3** no `PATH`.
- **PowerShell 7+** (`pwsh`).
- **Git** + uma conta no GitHub (`FlavioNeto11`) para o fluxo de CI/CD opcional.
- **GitHub Personal Access Token (PAT)** com escopos `write:packages` e `read:packages`
  para login no GHCR (ver [`SECURITY.md`](./SECURITY.md)). Necessario apenas para o
  fluxo que publica imagens no registry.
- Portas **80** e **443** livres no host (o Traefik as utiliza). Ver
  [`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md) caso estejam em uso.

---

## Documentacao e links

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — componentes detalhados, diagrama do fluxo da
  esteira, namespaces, tabela de roteamento/strip-prefix, portas, fluxo das imagens.
- [`ROADMAP.md`](./ROADMAP.md) — as 6 fases do projeto em checklist e a evolucao futura.
- [`SECURITY.md`](./SECURITY.md) — tratamento de segredos, escopos do PAT, seguranca do
  runner, RBAC do Console, status do HTTPS e o que o `.gitignore` protege.
- [`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md) — problemas comuns com comandos exatos.
- [`docs/`](./docs/) — documentacao complementar (guias, notas e referencias adicionais).

---

## Licenca e contato

Projeto pessoal de laboratorio DevOps de **FlavioNeto11**. Consulte o repositorio
<https://github.com/FlavioNeto11/devops> para issues e contribuicoes.
