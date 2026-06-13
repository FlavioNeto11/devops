---
title: "Checklist de Qualidade — Portal NovaIT"
status: reference
applies_to: [portal]
updated: 2026-06-13
language: pt-BR
---

# Checklist de Qualidade — Portal NovaIT

> Gate antes de publicar. Comando único: `cd portal/frontend; npm run validate`.
> Complementa o [checklist de UX & acessibilidade](./portal-ux-accessibility-checklist.md).

## SEO & metadados
- [x] `<html lang="pt-BR">`, `charset=UTF-8`, `<meta viewport>`
- [x] `<title>` e `<meta name="description">` com a marca
- [x] `<link rel="canonical">` para `https://dev.nvit.com.br/`
- [x] `<meta name="robots">` + `keywords` + `author`
- [x] Open Graph (`og:title/description/url/image`) + Twitter Cards
- [x] Dados estruturados JSON-LD (Organization + WebSite)
- [x] `favicon.svg`, `site.webmanifest`, `robots.txt`, `sitemap.xml`
- [x] Um único `<h1>`, hierarquia de headings coerente

## Performance
- [x] CSS/JS externos, **versionados** (`?v=`) e cacheáveis (`immutable`, 30d)
- [x] HTML servido com `no-cache` (deploy reflete imediatamente)
- [x] gzip habilitado (nginx) + `Vary: Accept-Encoding`
- [x] Sem dependências de runtime (zero JS de terceiros na página)
- [x] `preconnect` apenas para as fontes usadas
- [x] **Lighthouse medido** (2026-06-13, `http://xpto.localhost/`, headless): **Performance 92 ·
      Accessibility 100 · Best Practices 96 · SEO 100** (todos ≥ 90). Best Practices em 96 por **1**
      erro de console esperado: o probe de descoberta (`/devops/api/ingressroutes`) responde **401**
      para anônimo (recurso de operador) — o navegador loga o 401; trade-off intencional.

## Segurança
- [x] CSP (`script-src 'self'`, sem inline), Referrer-Policy, Permissions-Policy (nginx)
- [x] `X-Content-Type-Options: nosniff`; frame-ancestors `'none'` (CSP) + Traefik `frameDeny`
- [x] Sem segredos/credenciais no código; integrações por env/config
- [x] Links externos com `rel="noopener noreferrer"` (não há `target=_blank` externo hoje)
- [x] Saída dinâmica escapada (`escapeHtml`) contra XSS
- [ ] HTTPS/HSTS efetivo (depende de TLS na borda — ver `local-domain-setup.md`)

## Observabilidade
- [x] Logs nginx (access/error) em stdout/stderr → Loki
- [x] `/healthz` para probes (readiness + liveness)
- [x] Estados de erro logáveis via `window.PORTAL_CONFIG.onEvent` (opcional, sem chave)
- [ ] Probe de uptime externo apontando para `/healthz` (UptimeRobot/Cloudflare)

## Resiliência / escalabilidade
- [x] `requests`/`limits` coerentes com notebook (10m/16Mi → 100m/64Mi)
- [x] `readinessProbe` + `livenessProbe` em `/healthz`
- [x] Stateless → rollback instantâneo (`kubectl rollout undo`)
- [x] Degradação graciosa: API fora ⇒ cards curados continuam acessíveis

## Testes & CI
- [x] `node:test` cobre SEO, marca, CTAs, rotas, estados loading/erro/vazio, funções puras
- [x] ESLint + Prettier limpos
- [x] `ci-portal.yml`: format + lint + test + `docker build` (smoke) + `kubeconform`
- [x] Smoke local validado (headers, gzip, 404, healthz)

## Como medir o que falta (itens `[ ]`)
```powershell
# Lighthouse (precisa de Chrome instalado)
npx --yes serve -l 5055 C:\devops\portal\frontend
npx --yes lighthouse http://localhost:5055 --only-categories=performance,seo,accessibility,best-practices --view
```
