---
title: "Implementação das Melhorias do Portal NovaIT"
status: reference
applies_to: [portal]
updated: 2026-06-13
language: pt-BR
---

# Implementação das Melhorias do Portal NovaIT — Relatório Técnico

> Execução end-to-end do escopo de `melhorias.md` no componente [`portal/`](../portal/).
> Tudo validado com testes, lint, build de imagem e _smoke_ em navegador real.

## 1. Resumo do que foi implementado

O portal evoluiu de uma página estática hardcoded para um **produto institucional maduro**,
mantendo a estratégia **estática + progressive enhancement** (sem SPA, sem build de bundle,
sem dependência de infra pesada — adequado ao notebook/lab). Principais eixos:

- **SEO completo**: canonical, robots, keywords, author, Open Graph, Twitter Cards, JSON-LD
  (Organization + WebSite), favicon, `site.webmanifest`, `robots.txt`, `sitemap.xml`.
- **Design system** em CSS externo com **tokens** e **modo escuro** automático
  (`prefers-color-scheme`), microinterações leves e `prefers-reduced-motion`.
- **UX**: busca/filtro, estados **loading/erro/vazio** na descoberta dinâmica de apps,
  selos de status (no ar / exige login / interno), menu mobile, "voltar ao topo", 404 amigável,
  CTAs padronizados (verbo + destino).
- **Descoberta dinâmica real**: o JS agora de fato consome `/devops/api/ingressroutes`
  (corrige a divergência doc↔realidade), com degradação graciosa.
- **Acessibilidade WCAG AA**: semântica, um `<h1>`, skip link, foco visível, teclado,
  `aria-*`, contraste nos dois temas, estado não-só-por-cor.
- **NFR**: headers de segurança (CSP/Referrer-Policy/Permissions-Policy) + gzip + cache no nginx;
  `livenessProbe` no k8s; observabilidade por logs + hook opcional de eventos.
- **Qualidade**: testes `node:test` (zero dependência de runtime), ESLint + Prettier,
  workflow de CI dedicado (`ci-portal`), runbook, checklists e ADR.

## 2. Arquivos criados / alterados

### Criados (25)
| Caminho | O quê |
|---|---|
| `portal/frontend/assets/styles.css` | Design system (tokens, dark mode, estados, responsivo) |
| `portal/frontend/assets/catalog.js` | Catálogo declarativo de apps/ferramentas (config-driven) |
| `portal/frontend/assets/portal.js` | Progressive enhancement (funções puras + init de DOM) |
| `portal/frontend/assets/og-cover.svg` | Imagem social (Open Graph/Twitter) 1200×630 |
| `portal/frontend/404.html` | Página de erro amigável |
| `portal/frontend/favicon.svg` | Ícone vetorial da marca |
| `portal/frontend/robots.txt` · `sitemap.xml` · `site.webmanifest` | SEO/PWA |
| `portal/frontend/package.json` · `package-lock.json` | Scripts de qualidade (não entram na imagem) |
| `portal/frontend/eslint.config.js` · `.dockerignore` | Config de lint / exclusão de build |
| `portal/frontend/test/helpers.mjs` | Utilidades de teste |
| `portal/frontend/test/{seo,markup,portal-logic,catalog,static-assets}.test.mjs` | 5 suites (40 testes) |
| `.github/workflows/ci-portal.yml` | CI: format + lint + test + docker build + kubeconform |
| `docs/runbooks/portal-operations.md` | Runbook (publicar/validar/rollback/diagnóstico) |
| `docs/standards/portal-quality-checklist.md` | Checklist de qualidade |
| `docs/standards/portal-ux-accessibility-checklist.md` | Checklist de UX & acessibilidade |
| `docs/decisions/README.md` · `0001-portal-progressive-enhancement.md` | ADR |
| `docs/IMPLEMENTACAO_MELHORIAS_PORTAL.md` | Este relatório |

### Alterados (7)
| Caminho | Mudança |
|---|---|
| `portal/frontend/index.html` | SEO completo, semântica/a11y, busca, seção dinâmica, badges, menu mobile, back-to-top; CSS/JS externalizados |
| `portal/frontend/nginx.conf` | Headers de segurança, gzip, cache de assets, 404 customizado, logs |
| `portal/frontend/Dockerfile` | Copia todos os assets estáticos; labels OCI |
| `portal/k8s/portal.yaml` | `livenessProbe` em `/healthz` |
| `portal/README.md` · `portal/AGENTS.md` | Refletem a nova realidade (assets, tooling, progressive enhancement) |
| `docs/README.md` | Índice: runbook, checklists, decisions |

## 3. Melhorias de UX/UI
- Identidade NovaIT consistente; hero, cards padronizados, hierarquia visual forte.
- **Modo escuro** automático e tokenizado (verificado em navegador, sem vazar superfícies claras).
- Busca/filtro com contador ("9 aplicações" → "1 resultado").
- Estados **loading** (skeleton), **vazio** e **erro** (alerta acessível + "Tentar novamente").
- Selos: **no ar** (dinâmico), **exige login**, **interno**.
- Menu mobile (hamburger com `aria-expanded`), **voltar ao topo**, seção ativa destacada.
- Microinterações em hover/focus; `prefers-reduced-motion` respeitado.

## 4. Melhorias funcionais
- **Descoberta dinâmica real** das apps via `/devops/api/ingressroutes` (read-only), com
  dedupe contra o catálogo curado e inferência de "exige login" por middleware.
- Catálogo extraído para `catalog.js` (config-driven) — adicionar app não exige reescrever HTML.
- Atualização discreta a cada 60s; timeout de 8s com `AbortController`; retry manual.
- Rotas/subpaths preservados (`/`, `/devops`, `/sicat`, `/gymops`, `/rmambiental`,
  `/anarabottini`, `/grafana`, `/argocd`, `/auth`, `/portal-rec`).

## 5. Melhorias não funcionais
- **Performance**: CSS/JS externos versionados (`?v=`) com cache `immutable` 30d; HTML `no-cache`;
  gzip; zero JS de terceiros; `preconnect` só para as fontes.
- **Resiliência**: `readiness` + `liveness` probes; stateless ⇒ rollback instantâneo;
  degradação graciosa quando a API cai.
- **Escalabilidade**: `requests`/`limits` coerentes com notebook (10m/16Mi → 100m/64Mi).
- **Observabilidade**: logs nginx → Loki; hook `window.PORTAL_CONFIG.onEvent` opcional (sem chave real).

## 6. Melhorias de segurança
- nginx adiciona (defesa em profundidade sobre o Traefik): **CSP endurecida** —
  `script-src 'self'` **e** `style-src 'self' https://fonts.googleapis.com` (**sem `'unsafe-inline'`**;
  todo CSS/JS é externo e não há `style=`/`<script>` inline), **Referrer-Policy**,
  **Permissions-Policy**, **X-Content-Type-Options: nosniff**; `frame-ancestors 'none'`.
- CSP libera apenas o necessário (Google Fonts + fetch same-origin); verificada em navegador
  real (zero violações no console) e travada por testes (sem `unsafe-inline`, sem inline no HTML).
- Saída dinâmica **escapada** (`escapeHtml`) contra XSS; teste cobre injeção.
- Sem segredos no código; integrações futuras por env/config.

## 7. Melhorias de performance
- Verificado no container: `Cache-Control: public, max-age=2592000, immutable` em `/assets/*` e
  `no-cache` no HTML; `Content-Encoding: gzip` + `Vary: Accept-Encoding`.
- Página sem dependências de runtime; assets pequenos; fontes com fallback de sistema.

## 8. Melhorias de acessibilidade
- Semântica (`header`/`nav`/`main`/`section`/`footer`), **um** `<h1>`, skip link.
- `:focus-visible` consistente; navegação por teclado; menu fecha com `Esc`.
- `aria-label`/`aria-labelledby`, `role="search"`, região `aria-live` nos estados.
- Ícones decorativos `aria-hidden`; status com texto + ponto/ícone (não só cor).
- Contraste AA nos temas claro e escuro (verificado em screenshots).

## 9. Melhorias de CI/CD
- Novo workflow [`ci-portal.yml`](../.github/workflows/ci-portal.yml) (não altera os existentes):
  - **quality**: `prettier --check` + `eslint` + `node --test`.
  - **docker**: `docker build` (smoke) da imagem.
  - **manifests**: `kubeconform` em `portal/k8s/portal.yaml`.
- Falhas reais quebram o pipeline; cache de npm via `actions/setup-node`.

## 10. Testes criados (44, `node:test`, zero dependência de runtime)
- `seo.test.mjs` — lang/charset/viewport, título/descrição, **um h1**, canonical/robots/keywords,
  OG/Twitter, favicon/manifest/theme-color, CSS/JS externos, JSON-LD parseável, sem `${` vazado.
- `markup.test.mjs` — semântica + skip link, **CTAs** principais, **rotas** preservadas, badges
  de login/interno, busca/seção dinâmica/estado, menu mobile e back-to-top acessíveis.
- `portal-logic.test.mjs` — funções puras: escape, parse de IngressRoutes, namespace, dedupe,
  busca, render de card (com escape de XSS) e **estados loading/erro/vazio**.
- `catalog.test.mjs` — catálogo cobre produtos/ferramentas e é consistente.
- `static-assets.test.mjs` — 404/robots/sitemap/manifest/favicon/og + nginx (CSP/gzip/404) + CSS (dark mode).

## 11. Comandos executados e resultados

| Comando | Resultado |
|---|---|
| `node --test` (portal/frontend) | ✅ **44 pass / 0 fail** |
| `npm install` | ✅ 88 pacotes (devDeps de qualidade) |
| `npm run format:check` → `npm run format` | ✅ 2 arquivos ajustados pelo Prettier |
| `npm run lint` | ✅ 0 erros (removido `const` não usado) |
| `npm run validate` | ✅ format + lint + test verdes |
| `docker build -t portal-frontend:local portal/frontend` | ✅ imagem construída |
| _smoke_ via `curl` no container | ✅ CSP/Referrer-Policy/Permissions-Policy/nosniff; `no-cache` (HTML) e `immutable` (assets); gzip; `/healthz` 200; **404 amigável** |
| Preview em navegador (`serve` + Playwright) | ✅ sem erros no console; dark/light/mobile OK; busca filtra; menu mobile abre; estado de erro acessível renderiza |

> **Bug encontrado e corrigido na verificação visual:** o atributo `[hidden]` não escondia os
> cards porque `.prod{display:flex}` vencia o `display:none` do UA. Adicionado
> `[hidden]{display:none !important}` no CSS — filtro de busca passou a esconder corretamente.

## 11.1. Revisão adversarial (multi-agente) e correções aplicadas

Após a implementação, rodou-se uma revisão adversarial multi-lente (correção / acessibilidade /
segurança / SEO-consistência) com verificação de cada achado. Itens **reais** corrigidos:

| # | Severidade | Correção |
|---|---|---|
| 1 | alta | **Refresh silencioso** não mostra mais estado de erro (não estraga a UI boa); só na carga inicial/retry. |
| 2 | alta/correção | **`discoverExtras` agrupa por raiz da app** — a rota de API `/sicat/api` não vira card extra duplicado; um app novo com frontend+api gera 1 card. |
| 3 | média | `fetchWithTimeout` sem param `signal` morto (sem leak); **guard de requisição em voo** evita refreshes concorrentes. |
| 4 | média | `basePathOf` **normaliza trailing slash** (`/sicat/` → `/sicat`). |
| 5 | média (a11y) | **`--muted2` escurecido** (#929bad → #6e7689) para contraste AA em textos pequenos. |
| 6 | média (a11y) | **Alvos de toque ≥44px** no mobile (botões + hamburger). |
| 7 | média (sec) | **CSP endurecida**: removido `'unsafe-inline'` de `style-src` (estilos inline da 404 movidos p/ CSS). |
| 8 | baixa (a11y) | **Esc** no menu mobile devolve foco ao botão; **`.grad-txt`** com fallback de cor sólida (`@supports`). |
| 9 | baixa (SEO) | `og:image:type/width/height` adicionados. |
| 10 | — | Testes novos travam os invariantes: dedupe por raiz, trailing slash, CSP sem inline, HTML sem `style=`/handlers, CTA do catálogo ↔ HTML. |

Achados **descartados** na verificação (falsos-positivos / já corretos): headers de segurança já
ótimos (confirmados), `escapeHtml` já cobre XSS, contraste do gradiente passa como texto grande,
Dockerfile não vaza `node_modules`/testes, sem segredos. Debounce da busca: aceito como não-issue
na escala atual (~14 cards) e documentado.

## 12. Pendências reais (justificadas)
- **Lighthouse/axe** (Performance/Acessibilidade com nota): exigem Chrome/headless e ficam como
  passo **manual documentado** (comandos nos checklists), fora do gate automatizado — o lab é
  notebook e não queremos baixar Chrome no CI por padrão.
- **og:image em SVG**: alguns scrapers sociais preferem PNG. O SVG funciona na maioria; para
  produção, rasterizar com `rsvg-convert assets/og-cover.svg -o og-cover.png` e referenciar o PNG.
- **HSTS efetivo**: depende de TLS na borda (Cloudflare/Traefik) — o middleware já está pronto.
- **nginx como não-root**: mantido o default da imagem oficial (bind :80) para não arriscar o lab;
  endurecer para não-root (listen 8080 + securityContext) é melhoria futura.
- **i18n**: portal segue pt-BR (público nacional), conforme `melhorias.md` (impacto médio).

## 13. Como validar localmente
```powershell
cd C:\devops\portal\frontend
npm install            # opcional (só p/ lint/format); os testes rodam sem isso
npm run validate       # format:check + lint + node:test  → tudo verde
npx --yes serve -l 5055 C:\devops\portal\frontend   # abrir http://localhost:5055
# build + smoke da imagem:
docker build -t portal-frontend:local C:\devops\portal\frontend
docker run -d --name portal -p 8099:80 portal-frontend:local
curl.exe -I http://localhost:8099/        # ver headers
curl.exe -s -o NUL -w "%{http_code}`n" http://localhost:8099/healthz
docker rm -f portal
```

## 14. Como publicar
```powershell
docker build -t portal-frontend:local C:\devops\portal\frontend
kubectl apply -f C:\devops\portal\k8s\portal.yaml
kubectl -n devops-system rollout restart deploy/portal
kubectl -n devops-system rollout status deploy/portal
```

## 15. Como fazer rollback
```powershell
kubectl -n devops-system rollout undo deploy/portal
kubectl -n devops-system rollout status deploy/portal
```
Stateless ⇒ sem dados a restaurar. Runbook: [`runbooks/portal-operations.md`](./runbooks/portal-operations.md).

## 16. Próximos passos recomendados
1. Rodar Lighthouse/axe e registrar as notas nos checklists (fechar os itens `[ ]`).
2. Gerar `og-cover.png` para máxima compatibilidade social.
3. Habilitar TLS/HSTS na borda (Cloudflare/Traefik) e o middleware `redirect-https`.
4. (Opcional) `assets/config.js` de deploy para ligar analytics/Sentry via env (sem chave no git).
5. (Opcional) endurecer a imagem para rodar nginx como não-root.
