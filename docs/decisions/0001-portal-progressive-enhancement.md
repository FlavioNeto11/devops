---
title: "ADR 0001 — Portal estático com progressive enhancement"
status: canonical
applies_to: [portal]
updated: 2026-06-13
language: pt-BR
---

# ADR 0001 — Portal estático com _progressive enhancement_

**Estado:** Aceito · **Data:** 2026-06-13 · **Escopo:** `portal/`

## Contexto

O portal NovaIT (`/`) precisava evoluir de uma landing simples para um produto maduro
(UX, SEO, acessibilidade, segurança, observabilidade, testes), **sem**:

- depender de infraestrutura pesada, SaaS pago, GPU ou segredos reais (ambiente notebook/lab);
- quebrar rotas/subpaths existentes (`/devops`, `/sicat`, `/grafana`, ...);
- introduzir um framework SPA + build de bundle só para uma página institucional.

A documentação do componente já prometia "lista dinâmica das apps via API do Console", mas o
HTML era 100% estático e hardcoded — havia uma divergência doc↔realidade a resolver.

## Decisão

Manter o portal **estático** (nginx + `index.html` + `assets/`) e adotar **progressive
enhancement**:

1. **Conteúdo curado em HTML estático** — útil sem JS (SEO + acessibilidade + no-JS). Os
   metadados dos cards vivem em `assets/catalog.js` (config-driven); o HTML os espelha.
2. **JS opcional** (`assets/portal.js`, ES module, CSP `script-src 'self'`) que **enriquece**:
   descobre apps publicadas via `/devops/api/ingressroutes` (read-only), marca cards "no ar",
   renderiza cards extras e trata **loading/vazio/erro** — nunca sendo pré-requisito do conteúdo.
3. **Funções puras** (parsing, dedupe, render-para-string, estados) separadas da `init()` de DOM,
   testadas com `node:test` (zero dependência de runtime/browser).
4. **Segurança em defesa em profundidade**: Traefik na borda + headers extra no nginx (CSP,
   Referrer-Policy, Permissions-Policy), gzip e cache de assets versionados (`?v=`).
5. **Modo escuro** via `prefers-color-scheme` com tokens centralizados (sem segundo CSS).

## Alternativas consideradas

- **Migrar para SPA (React/Vite)** como os apps: rejeitado — overhead de build/bundle e JS de
  terceiros numa página institucional; pioraria first paint e SEO sem ganho real.
- **Renderizar os cards via JS** (sem HTML estático): rejeitado — quebraria SEO/no-JS e tornaria
  o conteúdo refém da API.
- **Confiar só no Traefik para headers**: insuficiente — Traefik não aplica CSP/Referrer-Policy/
  Permissions-Policy, e o acesso direto ao pod (debug) ficaria sem proteção.

## Consequências

**Positivas:** página leve e indexável; resiliente (API fora ⇒ degrada para os cards curados);
testável sem browser; fácil de operar/reverter (stateless); um app novo aparece sozinho.

**Negativas / trade-offs:** os cards curados são duplicados entre `catalog.js` e o HTML (mitigado
por testes que verificam consistência de CTAs/rotas); auditorias visuais (Lighthouse/axe) exigem
Chrome e ficam como passo manual documentado, fora do gate automatizado.

**Descoberta é recurso de operador.** A API `/devops/api/ingressroutes` do Console **exige
autenticação** (401 para anônimo). Logo a seção "Aplicações publicadas" começa **oculta** e só
aparece para operadores logados (cookie de sessão same-origin autoriza o fetch); o visitante
público vê apenas os cards curados — que já cobrem todas as apps reais. O portal trata 401/403
escondendo a seção (sem caixa de erro) e mantém retry só para erros transitórios. Expor um endpoint
público read-only no Console seria uma alternativa futura (fora do escopo do portal).

**Regras herdadas:** IngressRoute do portal permanece em `devops-system` com `priority: 1`
(ver [`portal/AGENTS.md`](../../portal/AGENTS.md)); imagem `:local`/`IfNotPresent`.
