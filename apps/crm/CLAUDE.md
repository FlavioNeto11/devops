---
title: "CRM-lite — Manual para Claude Code"
status: guide
applies_to: [crm]
updated: 2026-06-17
language: pt-BR
---

# CRM-lite — Manual para Claude Code

> App GERADO pelo FORGE (produto greenfield) a partir dos requisitos em
> `specs/requirements/crm/`. Fronteiras: `AGENTS.md`. Plataforma:
> `../../CLAUDE.md` · Máquina: `~/.claude/CLAUDE.md`.

## O que é
Um CRM enxuto para pequenas operações de vendas: cadastrar contatos e empresas, registrar negócios (deals) num funil simples e ver um painel com a situação atual. Sem complexidade — uma tela por tarefa, busca rápida, foco em colocar dados e acompanhar.

- **Blueprint:** API Node + SPA Vue (produto CRUD com Postgres) (node-api-vue-spa) — stack: web=Vue 3 + Vite (nginx) · api=Node 20 + Express (TypeScript via tsx) · worker=Node 20 (mesma imagem da api, npm run worker) · db=PostgreSQL 16.
- **Reusa:** packages/oidc-kit, packages/design-tokens, infra-postgres, infra-traefik, infra-argocd.
- Roteamento: `basePath: /crm` (frontend sem strip, base `/crm/`; API com strip, vê rotas na raiz).

## Como o Claude implementa aqui
Cada requisito `REQ-CRM-*` vira código DENTRO de `apps/crm/**` (a esteira
abre PR `Closes-Req`). Consulte a baseline (`specs/baseline/current-baseline.json`) e o
requisito antes de implementar. Mantenha as camadas do blueprint: Persistência: Postgres 16 + fila transacional na tabela jobs (FOR UPDATE SKIP LOCKED), sem broker externo; Camadas do backend: route → service → repository → worker (sem acesso a dados nas rotas); Auth: sessão própria do app via packages/oidc-kit (OIDC Keycloak) — aditivo, sem tocar outras auths; Frontend Vue buildado com base path /<app>/ (sem stripPrefix); API com stripPrefix.

## Regras inegociáveis
Ver `../../docs/standards/hard-constraints.md` (labels, roteamento, segredos, GitOps, imagens) +
`../../docs/standards/golden-path.md`. Segredo NUNCA em git.
