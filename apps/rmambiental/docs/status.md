---
title: "RM Ambiental — Estado Atual"
status: canonical
applies_to: [rmambiental]
updated: 2026-06-09
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

- ⚠️ **Conteúdo placeholder**: contato/redes (`src/lib/site.ts`, campos `AJUSTAR`), cases
  (`src/data/projects.ts`) e números de autoridade (`src/components/AuthoritySection.tsx`) são
  **ilustrativos** — substituir por dados reais fornecidos pela empresa.
- ⚠️ **Imagens reais**: portal é 100% SVG/CSS; faltam fotos profissionais (com direitos) em
  `public/images/` (rota `/rmambiental/images/` já prevista no `nginx.conf`).
- ⚠️ **Footer**: link da Política de Privacidade pendente (`src/components/Footer.tsx`).
- ⚠️ **Build reproduzível**: sem `package-lock.json` versionado → `npm install` no build; gerar e
  commitar lock para `npm ci`.
- ❌ **Backend / formulário de contato com envio**: fora de escopo (app somente-frontend); contato é
  via canais externos (WhatsApp/e-mail em `site.ts`).
- ❌ **Auth / área logada**: fora de escopo.

## Próximos passos

1. 🔵 Substituir placeholders de `src/lib/site.ts` (e-mail, WhatsApp DDI+DDD+nº, cidade, redes).
2. 🔵 Trocar cases e números ilustrativos por reais (`src/data/projects.ts`, `AuthoritySection.tsx`).
3. 🔵 Adicionar fotos profissionais em `public/images/` e referenciá-las nas seções/cases.
4. 🔵 Definir e linkar a Política de Privacidade no `Footer.tsx`.
5. 🔵 Gerar/commitar `package-lock.json` para build reproduzível (`npm ci`).
6. 🔵 Validar pipeline CI/GHCR (`ghcr.io/flavioneto11/rmambiental/frontend`) e atualizar annotations
   `devops.flavioneto/*` em `k8s/rmambiental.yaml` na primeira publicação automatizada.
