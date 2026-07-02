---
title: "Documentação da Plataforma DevOps Local"
status: reference
applies_to: [platform]
updated: 2026-07-02
language: pt-BR
---

# Documentação da Plataforma DevOps Local (`docs/`)

Hub da documentação (pt-BR) da Plataforma DevOps Local (Kubernetes do Docker Desktop em Windows).

> Visão geral e Quick Start no [`README.md`](../README.md) da raiz. Arquitetura em
> [`ARCHITECTURE.md`](../ARCHITECTURE.md). Segurança em [`SECURITY.md`](../SECURITY.md).
> Como contribuir em [`CONTRIBUTING.md`](../CONTRIBUTING.md). Fases em [`ROADMAP.md`](../ROADMAP.md).
>
> **Para agentes de IA (Claude/Copilot):** comece por [`../CLAUDE.md`](../CLAUDE.md) (mapa do
> monorepo) e [`../AGENTS.md`](../AGENTS.md) (fronteiras de operação). Como a meta-documentação é
> escrita: [`standards/meta-doc-standard.md`](./standards/meta-doc-standard.md).

---

## 📐 Padrões (`standards/`)
Comece aqui ao desenhar/avaliar um app.

| Doc | Para que serve |
|---|---|
| [`golden-path.md`](./standards/golden-path.md) | A estrada pavimentada do zero ao app no ar. |
| [`hard-constraints.md`](./standards/hard-constraints.md) | **Regras inegociáveis** (labels, roteamento, segredos, GitOps, imagens) num só lugar. |
| [`functional-requirements.md`](./standards/functional-requirements.md) | Template de FR + índice; estado (pronto/falta) por app em [`fr/`](./standards/fr/). |
| [`non-functional-requirements.md`](./standards/non-functional-requirements.md) | Recursos, probes, SLO, observabilidade, segurança, backup. |
| [`infra-standards.md`](./standards/infra-standards.md) | Regras de infra: labels (HARD), roteamento, quotas, segredos, GitOps. |
| [`shared-libraries-and-versioning.md`](./standards/shared-libraries-and-versioning.md) | Reúso entre projetos: pacotes `@flavioneto11/*`, SemVer, offline. |
| [`deprecation-policy.md`](./standards/deprecation-policy.md) | Como trocar/remover sem quebrar (flag por 1 ciclo). |
| [`documentation-style.md`](./standards/documentation-style.md) | Como **escrever docs**: naming, front-matter, idioma, ToC, cross-link, ciclo de vida. |
| [`meta-doc-standard.md`](./standards/meta-doc-standard.md) | Como autorar **meta-docs** (CLAUDE.md/AGENTS.md/skills): fonte única, precedência, seções. |
| [`portal-quality-checklist.md`](./standards/portal-quality-checklist.md) | Checklist de qualidade do Portal (SEO/perf/segurança/observabilidade/testes). |
| [`portal-ux-accessibility-checklist.md`](./standards/portal-ux-accessibility-checklist.md) | Checklist de UX & acessibilidade do Portal (WCAG AA, responsividade, estados). |

## 📘 Guias operacionais (nesta pasta)

| Guia | Para que serve |
|---|---|
| [`new-project-contract.md`](./new-project-contract.md) | Referência completa do `devops.yaml` (schema máquina-legível: [`../schema/devops-schema.json`](../schema/devops-schema.json)). |
| [`multi-env.md`](./multi-env.md) | Ambiente `dev` opt-in e efêmero por produto (contrato v2 + `devops-compile --env`): criar → usar → destruir, promoção, teto de capacidade. |
| [`path-routing-pattern.md`](./path-routing-pattern.md) | Roteamento: strip vs base path, prioridade, exemplos. |
| [`deployment-flow.md`](./deployment-flow.md) | Fluxo fim-a-fim: instalar, publicar, reverter, logs, Argo/Grafana/Console. |
| [`project-onboarding-checklist.md`](./project-onboarding-checklist.md) | Checklist de uma nova app. |
| [`github-runner-setup.md`](./github-runner-setup.md) | Runner self-hosted (Actions). |
| [`local-domain-setup.md`](./local-domain-setup.md) | hosts, domínio real, túneis, HTTPS. |
| [`cloudflare-tunnel-setup.md`](./cloudflare-tunnel-setup.md) | Expor a plataforma na internet. |
| [`sso-keycloak.md`](./sso-keycloak.md) | Keycloak realm `nvit`, OIDC, integração aditiva de apps. |

## 🛠️ Runbooks (`runbooks/`)
| Runbook | Quando |
|---|---|
| [`docker-desktop-recovery.md`](./runbooks/docker-desktop-recovery.md) | Docker/k8s travado no boot. |
| [`platform-bootstrap-and-reset.md`](./runbooks/platform-bootstrap-and-reset.md) | Subir, validar, resetar. |
| [`rollback.md`](./runbooks/rollback.md) | Reverter uma publicação (rollout/Argo/flag). |
| [`portal-operations.md`](./runbooks/portal-operations.md) | Operar o Portal NovaIT (`/`): publicar, validar, rollback, diagnóstico. |
| [`host-risks-and-readiness.md`](./runbooks/host-risks-and-readiness.md) | Riscos do host (disco, Docker Desktop em Win Server, SPOF, backup, TLS) e prontidão p/ produção. |
| [`sicat-gcp-key-rotation.md`](./runbooks/sicat-gcp-key-rotation.md) | Revogar a GCP API Key vazada no histórico do repo legado do SICAT e arquivá-lo. |
| [`imobia-ai-keys.md`](./runbooks/imobia-ai-keys.md) | Acender as chaves de IA do imobia (Secret `imobia-config` via Sealed Secrets). |

## 🧭 Decisões de arquitetura (`decisions/`)
ADRs leves (contexto → decisão → consequências). Índice em [`decisions/README.md`](./decisions/README.md).
Ex.: [`0001`](./decisions/0001-portal-progressive-enhancement.md) — Portal estático com progressive enhancement.

## 🤝 Contribuir (`contributing/`)
[`repo-structure.md`](./contributing/repo-structure.md) — mapa autoritativo do repo. Visão de
contribuição em [`CONTRIBUTING.md`](../CONTRIBUTING.md). Estilo de escrita em
[`standards/documentation-style.md`](./standards/documentation-style.md).

> **Índices por escopo:** [`../apps/README.md`](../apps/README.md) (apps) ·
> [`../platform/README.md`](../platform/README.md) (infra). Meta-docs por app/componente: `CLAUDE.md`
> + `AGENTS.md` em cada escopo (padrão em [`standards/meta-doc-standard.md`](./standards/meta-doc-standard.md)).

---

## Cobertura dos 17 tópicos

| #  | Tópico | Onde |
|----|--------|------|
| 1  | Arquitetura | [`ARCHITECTURE.md`](../ARCHITECTURE.md); resumo em [`deployment-flow.md`](./deployment-flow.md) (sec.1). |
| 2  | Diagrama do fluxo | [`deployment-flow.md`](./deployment-flow.md) (sec.1); [`ARCHITECTURE.md`](../ARCHITECTURE.md) (sec.2). |
| 3  | Instalar do zero | [`runbooks/platform-bootstrap-and-reset.md`](./runbooks/platform-bootstrap-and-reset.md); [`deployment-flow.md`](./deployment-flow.md) (sec.2). |
| 4  | Resetar | [`runbooks/platform-bootstrap-and-reset.md`](./runbooks/platform-bootstrap-and-reset.md); [`deployment-flow.md`](./deployment-flow.md) (sec.3). |
| 5  | Criar nova app | [`standards/golden-path.md`](./standards/golden-path.md) + [`new-project-contract.md`](./new-project-contract.md) + [`project-onboarding-checklist.md`](./project-onboarding-checklist.md). |
| 6–8 | Publicar frontend/API/worker | [`deployment-flow.md`](./deployment-flow.md) (sec.5–7). |
| 9  | Domínio local | [`local-domain-setup.md`](./local-domain-setup.md) (sec.1–4). |
| 10 | Domínio real | [`local-domain-setup.md`](./local-domain-setup.md) (sec.5); [`path-routing-pattern.md`](./path-routing-pattern.md) (sec.8). |
| 11 | Cloudflare Tunnel | [`cloudflare-tunnel-setup.md`](./cloudflare-tunnel-setup.md); [`local-domain-setup.md`](./local-domain-setup.md) (sec.6). |
| 12 | Diagnosticar | [`deployment-flow.md`](./deployment-flow.md) (sec.10); [`runbooks/docker-desktop-recovery.md`](./runbooks/docker-desktop-recovery.md). |
| 13 | Ver logs | [`deployment-flow.md`](./deployment-flow.md) (sec.9). |
| 14 | Reverter publicação | [`runbooks/rollback.md`](./runbooks/rollback.md); [`deployment-flow.md`](./deployment-flow.md) (sec.8). |
| 15 | Argo CD | [`deployment-flow.md`](./deployment-flow.md) (sec.12). |
| 16 | Grafana | [`deployment-flow.md`](./deployment-flow.md) (sec.11). |
| 17 | DevOps Console | [`deployment-flow.md`](./deployment-flow.md) (sec.13); módulo Projetos & Tarefas (Fase 3) em [`fr/devops-console.md`](./standards/fr/devops-console.md). |
| 18 | CMS dos portais (conteúdo gerenciável) | [`cms.md`](./cms.md) — editor no `/devops`, leitura pública, portais dinâmicos. |
| 19 | Plataforma de IA (estrutura única) | [`ai-platform.md`](./ai-platform.md) — ai-core, métricas `ai_*`, Langfuse, KPIs, golden sets. |

---

## Contrato compartilhado (lembrete rápido)

- **Host local**: `nvit.localhost` | **Host real**: `dev.nvit.com.br` (mesmo layout de paths).
- **Contexto Kubernetes**: `docker-desktop`. **Raiz do repo**: `C:/devops`.
- **Namespaces**: `devops-system`, `traefik`, `argocd`, `observability`, `identity`, `apps`,
  `apps-dev`, `apps-prod-local`.
- **Roteamento**: frontends `stripPrefix: false` (base path no build); APIs/worker-health
  `stripPrefix: true`; `/<base>/api` com `priority` maior que `/<base>`. Ver [`infra-standards.md`](./standards/infra-standards.md).
- **Imagens locais (lab)**: `<app>-<service>:local` (`imagePullPolicy: IfNotPresent`) — ex.:
  `sicat-api:local`, `gymops-web:local`, `console-backend:local`.
- **Imagens GHCR (esteira)**: `ghcr.io/flavioneto11/<app>/<service>:<tag>` (owner minúsculo; tag = SHA + branch + `latest`).
- **Apps no ar**: `/sicat`, `/gymops`, `/rmambiental`; plataforma em `/devops`, `/argocd`, `/grafana`, `/auth`.

---

## Por onde começar
1. **Padrões**: [`standards/golden-path.md`](./standards/golden-path.md).
2. **Instalar/validar**: [`runbooks/platform-bootstrap-and-reset.md`](./runbooks/platform-bootstrap-and-reset.md).
3. **Acessar local**: [`local-domain-setup.md`](./local-domain-setup.md).
4. **Adicionar app**: [`new-project-contract.md`](./new-project-contract.md) + [`project-onboarding-checklist.md`](./project-onboarding-checklist.md).
5. **Publicar/operar**: [`deployment-flow.md`](./deployment-flow.md); reverter em [`runbooks/rollback.md`](./runbooks/rollback.md).
