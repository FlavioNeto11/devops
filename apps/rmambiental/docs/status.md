---
title: "RM Ambiental — Estado Atual"
status: canonical
applies_to: [rmambiental]
updated: 2026-07-21
language: pt-BR
---

# RM Ambiental — Estado Atual

> Estado real do portal institucional (somente-frontend) na esteira DevOps. Ler **antes** de
> implementar. Contrato e fronteiras: [`../AGENTS.md`](../AGENTS.md); manual Claude:
> [`../CLAUDE.md`](../CLAUDE.md). Marcadores: `✅ Implementado` · `⚠️ Parcial` · `🔵 Planejado` ·
> `❌ Fora de escopo`.

## Estado deployado

| Item | Estado | Nota |
|---|---|---|
| SPA Vite/React (Home, Soluções, Contato) | ✅ | rotas `/`, `/solucoes`, `/contato`, base `/rmambiental` |
| Build estático + nginx (`Dockerfile`, `nginx.conf`) | ✅ | multi-stage; nginx:alpine serve `dist/`; `/healthz` → `ok` |
| Manifests K8s (`k8s/rmambiental.yaml`) | ✅ | Deployment + Service + IngressRoute (ns `apps`) |
| Roteamento Traefik | ✅ | `PathPrefix(/rmambiental)`, **sem strip**, `priority 10` (vence portal `/` `priority 1`) |
| Labels canônicos `app.kubernetes.io/part-of: rmambiental` | ✅ | aparece nas abas Apps/Publicações do Console |
| Probes + `requests`/`limits` | ✅ | readiness/liveness em `/healthz`; recursos declarados |
| Argo Application (`platform/argocd/apps/rmambiental.yaml`) | ✅ | auto-sync (`prune` + `selfHeal`) sobre `apps/rmambiental/k8s` |
| Imagem | ⚠️ | hoje `rmambiental-frontend:local` (`IfNotPresent`); CI/GHCR `<…>` ainda não validado neste app |
| `package-lock.json` | ⚠️ | ausente; Dockerfile cai em `npm install` (build não reproduzível) — ver gaps |

## Gaps conhecidos

- ⚠️ **Números de autoridade ilustrativos**: o bloco `stats` (`src/data/content.default.ts`, com a nota
  `* Indicadores ilustrativos`) é o **único** conteúdo fictício restante — substituir pelos oficiais
  via CMS. O **contato** (`src/lib/site.ts`) e a **galeria de cases** (`src/data/projects.ts`) já são
  **reais** (não existe `AuthoritySection.tsx`).
- ✅ **Imagens reais**: a galeria já traz **24 fotos reais** em `public/images/gallery/`, servidas por
  `/rmambiental/images/` (rota no `nginx.conf`); decorações SVG/CSS ficam em `public/images/decor/`.
- ⚠️ **Footer**: link da Política de Privacidade pendente (`src/components/Footer.tsx`, único `AJUSTAR`).
- ⚠️ **Build reproduzível**: sem `package-lock.json` versionado → `npm install` no build; gerar e
  commitar lock para `npm ci`.
- ❌ **Backend / formulário de contato com envio**: fora de escopo (app somente-frontend); contato é
  via canais externos (WhatsApp/e-mail em `site.ts`).
- ❌ **Auth / área logada**: fora de escopo.

## Próximos passos

1. 🔵 Trocar os **números do bloco `stats`** (`src/data/content.default.ts`) pelos indicadores oficiais
   da RM Ambiental Brasil via CMS — é o único conteúdo ilustrativo restante.
2. 🔵 Definir e linkar a Política de Privacidade no `Footer.tsx` (único `AJUSTAR` no código).
3. 🔵 Gerar/commitar `package-lock.json` para build reproduzível (`npm ci`).
4. 🔵 Validar pipeline CI/GHCR (`ghcr.io/flavioneto11/rmambiental/frontend`) e atualizar annotations
   `devops.flavioneto/*` em `k8s/rmambiental.yaml` na primeira publicação automatizada.

> _Contato (`src/lib/site.ts`), galeria (`src/data/projects.ts` + `public/images/gallery/`) e fotos já
> são reais — os passos antigos de "substituir placeholders de contato/cases/imagens" foram concluídos._
