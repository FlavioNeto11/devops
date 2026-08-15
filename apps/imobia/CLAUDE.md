---
title: "imobia — Ecossistema Imobiliário + IA (Manual para Claude Code)"
status: canonical
applies_to: [imobia]
updated: 2026-07-21
language: pt-BR
---

# imobia — Ecossistema Imobiliário + IA (Manual para Claude Code)

> Contexto da plataforma: [`../../CLAUDE.md`](../../CLAUDE.md) · fronteiras: [`../../AGENTS.md`](../../AGENTS.md)
> · máquina: [`~/.claude/CLAUDE.md`](C:\Users\Administrator\.claude\CLAUDE.md). **Não repita** — aponte.

## O que é

Ecossistema **imobiliário + fintech** onde o **WhatsApp é o eixo central** e **múltiplas IAs atuam como
funcionários especializados**. Nasceu de uma conversa de concepção + um diagrama (ver
`docs/CONCEPCAO.md`). Módulos: **Captação/Imóveis, Clientes/Leads, Financeiro PJ/PF, Agenda/Eventos,
WhatsApp multi-instância, ACM (varredura de portais), PTAM (laudo ABNT NBR 14653), Corbam/COBAN
(recuperação de crédito), Vistoria/Laudos, Documentos (validação por etapa)**.

**Orquestração 4-modelos (a estrela):** **Cortex** = triagem rápida/barata (roteador) · **GPT** =
lógica/function-calling · **Claude** = redação/análise · **Gemini** = documentos/visão. Tudo
**fail-soft**: sem chaves de API, cada módulo funciona manualmente e as IAs ficam dormentes.

## Stack & arquitetura

| Aspecto | Decisão |
|---|---|
| Frontend | Vue 3 + Vite + Pinia + Vue Router (**DS próprio: tokens `--im-*` em `src/styles.css`** — o kit `ui-vue`/`--ui-*` **não** foi adotado), nginx, base `/imobia/`, sem strip, priority 10 |
| API | Node 20 + **Fastify** + TypeScript via **tsx** (ESM), rotas na raiz (Traefik faz strip de `/imobia/api`), priority 30 |
| Worker | **mesma imagem da api**, comando `npm run worker` (padrão SICAT/GymOps) — filas BullMQ |
| Persistência | **Postgres 16 / pgvector** (Prisma) + **Redis/BullMQ** + PVC `imobia-files` (uploads/PDFs) — entram em F1 |
| IA | `@flavioneto11/ai-core` (grafo router→especialistas + tools + memória pgvector) + **adaptador Gemini** (F2); multimodal via `file-ingest-kit` |
| Auth | local (JWT via `oidc-kit`) + **Keycloak SSO** realm `nvit` (F1) |
| Deploy | `apps/imobia/k8s` (Argo CD auto-sync) · imagens `:local` no laboratório |

> **Design system (decisão):** o imobia mantém um **DS próprio** com tokens `--im-*` (definidos em
> `frontend/src/styles.css`) — a paleta imobiliária/fintech do produto. O kit central `ui-vue`/`--ui-*`
> **não** é dependência do frontend (`frontend/package.json` só traz `vue`/`pinia`/`vue-router`). Uma
> eventual convergência para `ui-vue` é trabalho futuro, não um fato entregue.

## Fases (roadmap) — TODAS ENTREGUES e no ar (`:local`)

`F0` skeleton ✅ · `F1` data plane + auth ✅ · `F2` motor IA + adaptador Gemini (ai-core 0.7.0) ✅ ·
`F3` Captação/Imóveis + Leads (busca semântica) ✅ · `F4` Agenda + Documentos + Vistoria (uploads) ✅ ·
`F5` Financeiro PJ/PF + Corbam/COBAN ✅ · `F6` WhatsApp multi-instância + ACM ✅ ·
`F7` PTAM (laudo ABNT) + especialistas ao vivo ✅ · `F8` registro no Console + hardening ✅.

**Estado:** 29 tabelas (Prisma), 7 migrações versionadas, 11 módulos com telas Vue, orquestração
multi-modelo (Cortex/GPT/Claude/Gemini) fail-soft. **Para acender a IA:** o operador põe
`OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GOOGLE_API_KEY` no Secret `imobia-config` (Sealed Secrets)
— até lá as IAs ficam dormentes e todos os módulos funcionam manualmente.

> **Dívida técnica — verificação:** as fases foram validadas por **build/typecheck e smoke manual**;
> **não há suíte de testes automatizados** (o `frontend` só expõe `dev`/`build`/`preview`; a `api`, só
> `typecheck`). "Entregue" ≠ "coberto por testes" — criar um smoke E2E das jornadas principais é
> trabalho pendente, não um fato entregue.

> **GitOps:** o app **já vive sob Argo CD** (Application `platform/argocd/apps/imobia.yaml` com
> `automated: { prune, selfHeal }`). Logo, **manifesto** (`apps/imobia/k8s/**`, env/mem/secret) muda
> **pelo git** — `kubectl apply` solto é revertido pelo `selfHeal`. Só o **código** vai por
> `docker build :local` + recriar o pod (ver Armadilhas). Sequência: build → commit → push → sync.

## Rodar / publicar

```powershell
# API local (smoke): npm --prefix apps/imobia/api install; npm --prefix apps/imobia/api start   (porta 8080)
# Frontend local:    npm --prefix apps/imobia/frontend install; npm --prefix apps/imobia/frontend run dev  (proxy /imobia/api -> :8080)
docker build -t imobia-api:local apps/imobia/api
docker build -t imobia-frontend:local apps/imobia/frontend
# Código (nova imagem :local): recriar os pods para puxá-la (com aprovação):
kubectl rollout restart deploy/imobia-api deploy/imobia-frontend -n apps
# Manifesto (k8s/**): vai pelo GIT — o Argo (selfHeal) sincroniza; `kubectl apply` solto é revertido.
```

Validar: `http://nvit.localhost/imobia` (SPA) e `http://nvit.localhost/imobia/api/health` (API pós-strip).
Público: `https://dev.nvit.com.br/imobia`.

## Armadilhas

- **Base path**: build embute `/imobia/` (`VITE_BASE_PATH`); nginx serve por **prefixo+alias** (MIME-safe);
  Traefik **não** faz strip do frontend. XHR do frontend vai para `/imobia/api/*` (priority 30 > 10).
- **api = worker**: mesma imagem, `command` diferente. tsx executa TS direto (sem `dist/`), padrão SICAT.
- **Deploy sob Argo (`selfHeal`)**: código = `docker build` + recriar pod; **manifesto** (env/mem/secret) tem
  de ir pelo **git** (apply solto é revertido). Sequência: build → commit → push → `argocd refresh=hard`.
- **IA fail-soft**: sem `OPENAI/ANTHROPIC/GOOGLE_API_KEY`, `/imobia/api/ai/*` responde fallback e o pod
  segue Ready. Chaves entram no Secret `imobia-config` (Sealed Secrets), nunca em git.
- **pgvector + PVC** (F1+): `CREATE EXTENSION vector` na 1ª migração; Postgres mem ≥1Gi; `fsGroup:1000`
  na api+worker para escrever o PVC como usuário não-root.

