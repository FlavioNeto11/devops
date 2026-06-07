# Documentacao da Plataforma DevOps Local (`docs/`)

Indice da documentacao detalhada (pt-BR) da Plataforma DevOps Local (Kubernetes do Docker
Desktop em Windows). Cada guia abaixo e completo, com comandos e resultados esperados, e
consistente com o **contrato compartilhado** da plataforma.

> Visao geral e Quick Start no [`README.md`](../README.md) da raiz. Arquitetura em
> [`ARCHITECTURE.md`](../ARCHITECTURE.md). Seguranca em [`SECURITY.md`](../SECURITY.md).
> Fases do projeto em [`ROADMAP.md`](../ROADMAP.md).

---

## Guias nesta pasta

| Guia                                                                  | Para que serve                                                                                                  |
|-----------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------|
| [`new-project-contract.md`](./new-project-contract.md)                | Referencia completa do `devops.yaml`: cada campo de `app`/`services`, tipos, `expose`/`stripPrefix`/`env`/`health`/`port`/`path`, exemplos por tipo e exemplo `aplicacao2`. |
| [`path-routing-pattern.md`](./path-routing-pattern.md)                | Convencao de roteamento: quando ha strip e quando nao; base path do frontend; StripPrefix das APIs; prioridade `/<base>` vs `/<base>/api`; exemplos de IngressRoute+Middleware; tabela de rotas; versao `www.xpto.com`. |
| [`github-runner-setup.md`](./github-runner-setup.md)                  | Self-hosted runner: pre-requisitos, registration token (caminho exato na UI), `install-github-runner.ps1 -Token`, labels, servico, validacoes e troubleshooting. |
| [`local-domain-setup.md`](./local-domain-setup.md)                    | Arquivo `hosts` do Windows; dominio real (DNS A/CNAME, firewall, port-forward); Cloudflare Tunnel; ngrok; notas de HTTPS. |
| [`deployment-flow.md`](./deployment-flow.md)                          | Fluxo fim-a-fim: instalar (bootstrap), resetar, publicar frontend/API/worker (local e Actions/GHCR), reverter, ver logs, diagnosticar, Argo CD, Grafana, DevOps Console. |
| [`project-onboarding-checklist.md`](./project-onboarding-checklist.md)| Checklist objetivo para adicionar uma nova app (repo, `devops.yaml`, Dockerfiles, workflows, base path, strip, k8s/Helm, publicar, validar rotas, conferir no Console). |

---

## Cobertura dos 17 topicos

Mapa de onde cada topico e tratado nesta documentacao:

| #  | Topico                          | Onde                                                                                              |
|----|----------------------------------|--------------------------------------------------------------------------------------------------|
| 1  | Visao geral da arquitetura      | [`ARCHITECTURE.md`](../ARCHITECTURE.md); resumo em [`deployment-flow.md`](./deployment-flow.md) (sec.1). |
| 2  | Diagrama do fluxo               | [`deployment-flow.md`](./deployment-flow.md) (sec.1); [`ARCHITECTURE.md`](../ARCHITECTURE.md) (sec.2). |
| 3  | Instalar do zero (bootstrap)    | [`deployment-flow.md`](./deployment-flow.md) (sec.2).                                             |
| 4  | Resetar                         | [`deployment-flow.md`](./deployment-flow.md) (sec.3).                                             |
| 5  | Criar nova app                  | [`new-project-contract.md`](./new-project-contract.md) + [`project-onboarding-checklist.md`](./project-onboarding-checklist.md). |
| 6  | Publicar frontend               | [`deployment-flow.md`](./deployment-flow.md) (sec.5).                                             |
| 7  | Publicar API                    | [`deployment-flow.md`](./deployment-flow.md) (sec.6).                                             |
| 8  | Publicar worker                 | [`deployment-flow.md`](./deployment-flow.md) (sec.7).                                             |
| 9  | Configurar dominio local        | [`local-domain-setup.md`](./local-domain-setup.md) (sec.1-4).                                     |
| 10 | Configurar dominio real         | [`local-domain-setup.md`](./local-domain-setup.md) (sec.5); roteamento em [`path-routing-pattern.md`](./path-routing-pattern.md) (sec.8). |
| 11 | Configurar Cloudflare Tunnel    | [`local-domain-setup.md`](./local-domain-setup.md) (sec.6); ngrok na sec.7.                       |
| 12 | Diagnosticar falhas             | [`deployment-flow.md`](./deployment-flow.md) (sec.10).                                            |
| 13 | Ver logs                        | [`deployment-flow.md`](./deployment-flow.md) (sec.9).                                             |
| 14 | Reverter publicacao             | [`deployment-flow.md`](./deployment-flow.md) (sec.8).                                             |
| 15 | Usar Argo CD                    | [`deployment-flow.md`](./deployment-flow.md) (sec.12).                                            |
| 16 | Usar Grafana                    | [`deployment-flow.md`](./deployment-flow.md) (sec.11).                                            |
| 17 | Usar o DevOps Console           | [`deployment-flow.md`](./deployment-flow.md) (sec.13).                                            |

---

## Contrato compartilhado (lembrete rapido)

- **Host local**: `xpto.localhost` | **Host real futuro**: `www.xpto.com` (mesmo layout de paths).
- **Contexto Kubernetes**: `docker-desktop`. **Raiz do repo**: `C:/devops`.
- **Namespaces**: `devops-system`, `traefik`, `argocd`, `observability`, `apps`, `apps-dev`,
  `apps-prod-local`.
- **Ingress**: Traefik (CRDs `traefik.io/v1alpha1`: `IngressRoute`, `Middleware`),
  entrypoints `web` (80) e `websecure` (443, pendente/self-signed).
- **Roteamento**: frontends `stripPrefix: false` (base path no build); APIs/api2/worker-health
  `stripPrefix: true` (Traefik remove o prefixo completo); `/<base>/api` com `priority` maior
  que `/<base>`.
- **Imagens locais (lab)**: `aplicacao1-frontend:local`, `aplicacao1-api:local`,
  `aplicacao1-worker:local`, `console-backend:local`, `console-frontend:local`
  (`imagePullPolicy: IfNotPresent`).
- **Imagens GHCR (esteira)**: `ghcr.io/flavioneto11/<app>/<service>:<tag>` (owner minusculo;
  tag = SHA do commit, + branch + `latest`).
- **Rotas no host unico**: `/devops` (console-frontend), `/devops/api` (console-backend),
  `/argocd`, `/grafana`, `/aplicacao1` (frontend), `/aplicacao1/api` (api),
  `/aplicacao1/worker` (worker, opcional).

---

## Por onde comecar

1. **Instalar e validar** a plataforma: [`deployment-flow.md`](./deployment-flow.md) (sec.2).
2. **Acessar localmente**: [`local-domain-setup.md`](./local-domain-setup.md) (hosts).
3. **Adicionar sua app**: [`new-project-contract.md`](./new-project-contract.md) +
   [`project-onboarding-checklist.md`](./project-onboarding-checklist.md).
4. **Publicar e operar**: [`deployment-flow.md`](./deployment-flow.md) (publicar, logs,
   rollback, Argo CD, Grafana, Console).
5. **Esteira via Actions/GHCR**: [`github-runner-setup.md`](./github-runner-setup.md).
6. **Dominio real**: [`local-domain-setup.md`](./local-domain-setup.md) (sec.5-8).
