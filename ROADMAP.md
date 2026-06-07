# Roadmap da Plataforma DevOps Local

Plano de execucao em **6 fases**, cada uma como um checklist. Marque as caixinhas
conforme avanca. Ao final, a secao **Evolucao futura** lista os proximos passos.

> Visao geral em [`README.md`](./README.md) · Detalhes tecnicos em
> [`ARCHITECTURE.md`](./ARCHITECTURE.md).

Legenda: `[ ]` pendente · `[x]` concluido.

---

## Fase 1 — Diagnostico e preparacao

- [ ] Confirmar host **Windows Server Datacenter x64** com virtualizacao habilitada.
- [ ] Instalar **Docker Desktop** e validar que o daemon esta rodando.
- [ ] Habilitar o **Kubernetes** no Docker Desktop (Settings → Kubernetes → *Enable*).
- [ ] Garantir o contexto kube `docker-desktop` ativo: `kubectl config use-context docker-desktop`.
- [ ] Instalar **kubectl**, **Helm 3** e **PowerShell 7** e valida-los no `PATH`.
- [ ] Confirmar que as portas **80** e **443** estao livres no host.
- [ ] Definir `xpto.localhost` resolvendo para `127.0.0.1` (verificar/ajustar `hosts`).
- [ ] Rodar `.\scripts\diagnose.ps1` e revisar a saida inicial.
- [ ] Clonar o repositorio em `C:/devops` e revisar o `devops.yaml` de exemplo.

## Fase 2 — Plataforma Kubernetes

- [ ] Criar os namespaces: `devops-system`, `traefik`, `argocd`, `observability`,
      `apps`, `apps-dev`, `apps-prod-local`.
- [ ] Instalar o **Traefik** via Helm no namespace `traefik` (entrypoints `web`/`websecure`).
- [ ] Aplicar as CRDs/configuracoes base (`IngressRoute`, `Middleware`).
- [ ] Instalar o **Argo CD** (`argocd server --insecure`, rootpath `/argocd`).
- [ ] Instalar a stack de observabilidade: **Prometheus**, **Grafana** (subpath
      `/grafana`), **Loki**, **Promtail**.
- [ ] Validar tudo com `.\scripts\validate-platform.ps1` (todos os pods `Ready`).

## Fase 3 — Esteira GitHub (CI/CD)

- [ ] Criar o **PAT** do GHCR com escopos `write:packages` e `read:packages`.
- [ ] Configurar o **runner self-hosted** na maquina e registra-lo como **servico**.
- [ ] Validar login no GHCR: `docker login ghcr.io` (usuario `flavioneto11`).
- [ ] Criar o workflow do **GitHub Actions** (build `buildx` + push GHCR + deploy).
- [ ] Garantir que o workflow le o `devops.yaml` e monta a matriz de services.
- [ ] Confirmar tags publicadas: `<sha>`, `<branch>` e `latest`.
- [ ] Garantir que o `Deployment` e **anotado** com metadados da esteira (sha, autor, data).

## Fase 4 — Modelo de aplicacao

- [ ] Definir o schema canonico do `devops.yaml` (app/services).
- [ ] Criar os `templates/` que geram `Deployment`/`Service`/`IngressRoute`/`Middleware`.
- [ ] Implementar a convencao de roteamento: frontend **sem** strip, API **com** strip.
- [ ] Definir `priority` para `/<base>/api` vencer `/<base>`.
- [ ] Criar a `aplicacao1` de exemplo (frontend + api + worker) com imagens `:local`.
- [ ] Validar `imagePullPolicy: IfNotPresent` para imagens locais.

## Fase 5 — Painel DevOps (Console)

- [ ] Implementar o **backend** Node.js (Express + `@kubernetes/client-node`), somente
      leitura, com **SSE** em tempo real.
- [ ] Implementar o **frontend** React + Vite com base `/devops/`.
- [ ] Criar o **RBAC** restrito: `ServiceAccount` + `ClusterRole` apenas
      `get`/`list`/`watch` (sem `create`/`update`/`delete`).
- [ ] Publicar as imagens `console-backend:local` e `console-frontend:local`.
- [ ] Expor as rotas `/devops` (frontend, sem strip) e `/devops/api` (backend, com strip).
- [ ] Validar a visualizacao em tempo real de Deployments/Pods/rotas.

## Fase 6 — Validacao final

- [ ] Rodar o Quick Start completo (`bootstrap` → `validate-platform` → `publish-sample-app`).
- [ ] Acessar todas as URLs: `/devops`, `/aplicacao1`, `/aplicacao1/api/health`,
      `/argocd`, `/grafana`.
- [ ] Conferir o roteamento/strip-prefix de cada rota (prioridade correta).
- [ ] Verificar metricas no Grafana e logs no Loki.
- [ ] Confirmar que o Console reflete o cluster em tempo real.
- [ ] Re-executar os scripts para comprovar a **idempotencia**.
- [ ] Revisar `SECURITY.md` (segredos, RBAC, HTTPS) e `TROUBLESHOOTING.md`.

---

## Evolucao futura

- [ ] **HTTPS real**: emitir certificado valido e habilitar o entrypoint `websecure`
      (hoje pendente com self-signed) — ver [`SECURITY.md`](./SECURITY.md).
- [ ] **Cloudflare Tunnel**: expor a plataforma para `www.xpto.com` sem abrir portas no
      roteador, com TLS gerenciado.
- [ ] **`aplicacao2`**: adicionar uma segunda aplicacao usando o mesmo modelo de
      `devops.yaml` e o mesmo layout de paths.
- [ ] **Auto-sync do Argo CD**: habilitar reconciliacao automatica (GitOps) com
      self-heal e prune.
- [ ] **Alerting do Prometheus**: configurar regras de alerta e Alertmanager
      (notificacoes de saude/recursos).
