---
title: "Plataforma DevOps — Contrato de Agentes"
status: canonical
applies_to: [platform]
updated: 2026-06-09
language: pt-BR
---

# Contrato de Agentes da Plataforma DevOps

> **Fonte única, tool-agnóstica.** Qualquer agente de IA (Claude Code, GitHub Copilot, e futuros)
> que abrir este repositório lê **este arquivo primeiro**. Ele define escopo, ordem de leitura,
> matriz de decisão, fronteiras de operação e precedência. O [`CLAUDE.md`](./CLAUDE.md) é a camada
> específica do Claude e aponta para cá. Padrão de como este arquivo é escrito:
> [`docs/standards/meta-doc-standard.md`](./docs/standards/meta-doc-standard.md).

## 1. Visão geral

`C:\devops` é uma **plataforma DevOps local** (operador único) sobre o Kubernetes do Docker Desktop
(contexto `docker-desktop`). Hospeda apps de negócio + componentes + libs + infraestrutura GitOps:

- **Ingress:** Traefik (ns `traefik`) — IngressRoute/Middleware.
- **GitOps:** Argo CD (ns `argocd`) — app-of-apps `devops-platform`, auto-sync.
- **Identidade:** Keycloak (ns `identity`), realm `nvit` (OIDC).
- **Observabilidade:** kube-prometheus-stack + Loki/Promtail (ns `observability`).
- **Segredos:** Sealed Secrets (controller em `kube-system`).
- **Painel:** DevOps Console em `/devops` (lê o cluster ao vivo).

Contrato da máquina (idioma, regra de ouro, comandos): [`~/.claude/CLAUDE.md`](C:\Users\Administrator\.claude\CLAUDE.md).

## 2. Como começar uma tarefa (sempre)

1. **Ler** este `AGENTS.md` e o [`CLAUDE.md`](./CLAUDE.md) da plataforma.
2. **Identificar o escopo** (app, componente, pacote ou infra) e ler o `AGENTS.md`/`CLAUDE.md` dele.
3. **Consultar** [`docs/standards/hard-constraints.md`](./docs/standards/hard-constraints.md) antes de
   tocar em manifests, `devops.yaml`, Dockerfiles ou `platform/`.
4. **Planejar** — listar os arquivos que serão alterados.
5. **Executar.**
6. **Validar** — `scripts/validate-platform.ps1` e/ou os checks do escopo.
7. **Atualizar docs** afetados (estado real, sem prometer o que não existe).
8. **Relatório final** — o que foi feito, validado e o que ficou em aberto.

## 3. Ordem oficial de leitura (plataforma)

| # | Doc | Para quê |
|---|---|---|
| 1 | [`AGENTS.md`](./AGENTS.md) | Este arquivo — contrato |
| 2 | [`CLAUDE.md`](./CLAUDE.md) | Mapa do monorepo + ops seguras |
| 3 | [`docs/standards/hard-constraints.md`](./docs/standards/hard-constraints.md) | O que nunca quebrar |
| 4 | [`docs/standards/golden-path.md`](./docs/standards/golden-path.md) | Fluxo do zero ao app no ar |
| 5 | [`docs/new-project-contract.md`](./docs/new-project-contract.md) + [`schema/devops-schema.json`](./schema/devops-schema.json) | Schema do `devops.yaml` |
| 6 | [`docs/path-routing-pattern.md`](./docs/path-routing-pattern.md) | Roteamento (strip/priority) |
| 7 | [`docs/README.md`](./docs/README.md) | Índice completo da documentação |

Releia só o que o escopo da tarefa afeta.

## 4. Matriz de decisão

| Tipo de tarefa | Comece por | Fronteira |
|---|---|---|
| Criar app novo | `docs/standards/golden-path.md` + `scripts/new-app.ps1` + `schema/devops-schema.json` | segura (gera scaffold) |
| Editar `devops.yaml` / manifests de app | `apps/<app>/AGENTS.md` + `hard-constraints.md` | com aprovação se afeta recurso vivo |
| Publicar app | `scripts/publish-app.ps1 -App <name>` + `docs/deployment-flow.md` | **com aprovação** |
| Reverter publicação | `docs/runbooks/rollback.md` | **com aprovação** |
| Subir/validar plataforma | `scripts/up.ps1` / `validate-platform.ps1` | segura (idempotente) |
| Diagnosticar | `scripts/diagnose.ps1` + `docs/runbooks/docker-desktop-recovery.md` | segura (read-only) |
| Mexer em infra (`platform/*`) | `platform/README.md` + Argo | **com aprovação** |
| Editar segredos | — | **proibida** (ver §5) |

## 5. Fronteiras de operação

### ✅ Seguras (autônomas — idempotentes ou read-only)

| Operação | Comando |
|---|---|
| Validar saúde (17 checks) | `scripts/validate-platform.ps1` |
| Conferir pré-requisitos | `scripts/check-prereqs.ps1` |
| Coletar diagnóstico | `scripts/diagnose.ps1` |
| Inspecionar cluster | `kubectl get/describe/logs ...` ; `helm list` ; `helm template` |
| Subir tudo do zero (idempotente) | `scripts/up.ps1` |
| Gerar scaffold de app novo | `scripts/new-app.ps1 -Name <app> -Services ...` |

### ⚠️ Com aprovação do operador (efeito colateral / produção)

| Operação | Comando | Por quê |
|---|---|---|
| Publicar app | `scripts/publish-app.ps1 -App <name>` | aplica + rollout no cluster |
| Reverter | rollout/Argo (ver `runbooks/rollback.md`) | afeta o que está no ar |
| Instalar componente | `scripts/install-*.ps1` | muda a infra |
| Trocar domínio público | `scripts/set-domain.ps1` | exposição externa |
| Expor na internet | `scripts/install-cloudflare-tunnel.ps1` | exposição externa |
| Recuperar Docker travado | `scripts/recover-docker.ps1` | mata processos / `wsl --shutdown` |
| Resetar plataforma | `scripts/reset-platform.ps1` | **destrutivo** |
| `kubectl apply/delete` / `helm upgrade` em recurso vivo | — | muda estado do cluster |

### ⛔ Proibidas

| Operação | Razão |
|---|---|
| `git push --force` em `main` | reescreve história — sempre PR/branch |
| Commitar segredo real / editar `*.secret.yaml` / chave do Sealed Secrets | segurança (ver `hard-constraints.md` §3) |
| Mudar `metadata.name`/labels de recurso **vivo** sob Argo | o Argo apaga o antigo (`hard-constraints.md` §4) |
| Force-kill do Docker Desktop / "Reset to factory defaults" | corrompe sockets → crash no boot |
| Pular hooks (`--no-verify`) sem pedido explícito | quebra validações |

> "Com aprovação" = confirme com o operador antes de executar. Aprovação para uma operação não se
> estende às demais.

## 6. Segurança

- Nada secreto em git — só `*.example` + SealedSecret. Ver [`SECURITY.md`](./SECURITY.md).
- App com login próprio integra OIDC de forma **aditiva** (padrão SICAT) — sem tocar outras auths.
- Toda exposição externa (domínio/túnel) é operação com aprovação.

## 7. Política de atualização de docs

| Mudança | Atualizar |
|---|---|
| Novo app/serviço | `platform/argocd/apps/<app>.yaml` + `apps/README.md` + meta-doc do app |
| **Onboarding completo de app** (criar/importar) | **Obrigatório além do scaffold/portal** — cadastrar em **Projetos & Tarefas** (`console/pm-api/scripts/seed.js`), Application do Argo **na `main`**, card no **portal raiz** (`portal/frontend/index.html`), **Compartilhados** (`console/pm-api/src/data/shared-resources.json`). Passo a passo: [`docs/standards/golden-path.md`](./docs/standards/golden-path.md) §9 |
| Schema do `devops.yaml` | `schema/devops-schema.json` + `docs/new-project-contract.md` |
| Regra de infra | `docs/standards/{infra-standards,hard-constraints}.md` |
| Componente de infra novo/alterado | `platform/<x>/README.md` + `platform/README.md` |

## 8. Princípios não-negociáveis

1. **AGENTS.md é a fonte única** das fronteiras; não duplicar em CLAUDE.md nem em `.github/`.
2. **Argo é a verdade** do que está no cluster — não burlar o GitOps.
3. **Segredos nunca em plaintext** no git.
4. **Regra de ouro do roteamento** sempre (frontend sem strip; api/api2 com strip; `api2 > api > frontend`).
5. **Documentar é parte da entrega** — estado real, sem promessas.
6. **Operações externas/destrutivas exigem aprovação** do operador.

---
_Por escopo: [`apps/README.md`](./apps/README.md) · [`platform/README.md`](./platform/README.md). Padrão: [`docs/standards/meta-doc-standard.md`](./docs/standards/meta-doc-standard.md)._
