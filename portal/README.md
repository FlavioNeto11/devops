# Portal NovaIT (landing na raiz `/`)

> **Para agentes:** leia [`AGENTS.md`](./AGENTS.md) primeiro (escopo, fronteiras seguras/aprovação/proibidas, princípios).

Página inicial pública da plataforma, servida na **raiz** de `https://dev.nvit.com.br`
(e `http://nvit.localhost/` no dev local). Apresenta os produtos, portais e
ferramentas da NovaIT e **descobre dinamicamente** as aplicações publicadas no
cluster — tudo isso a partir de um frontend **estático** (nginx).

## Como funciona

O portal é **estático e útil sem JavaScript** (bom para SEO e acessibilidade). O
JS apenas **enriquece** a página (_progressive enhancement_):

- **Conteúdo curado** (HTML estático): hero, cards de produtos/portais, capacidades,
  ferramentas da plataforma e rodapé. Os metadados dos cards vivem em
  [`frontend/assets/catalog.js`](./frontend/assets/catalog.js) e o HTML os espelha.
- **Descoberta dinâmica** ([`frontend/assets/portal.js`](./frontend/assets/portal.js)):
  busca `/devops/api/ingressroutes` (API read-only do DevOps Console), filtra o namespace
  `apps`, marca os cards curados como **"no ar"** e renderiza um card extra (agrupado pela
  raiz da app) por aplicação **navegável** (com frontend na raiz `/<app>`) fora do catálogo.
  Serviços **só-de-API / control-plane / worker** (ex.: `ai-control-plane`, só `/ai-control/api`)
  são ignorados — linkar para a raiz daria 404. Atualiza a cada **60s**.
  > ⚠️ **Recurso de operador.** A API do Console **exige autenticação**. Por isso a seção
  > "Aplicações publicadas" (e os atalhos de operação: Grafana/Argo/Keycloak/Console/Recorder)
  > começam **ocultos** e só aparecem para **operadores logados** (a sessão same-origin autoriza
  > o fetch). Anônimo recebe **401** → ficam ocultos.
  >
  > 🔒 **Esconder na home é UX, NÃO segurança.** O portal é público e não impõe auth a outras rotas.
  > A proteção REAL de cada app é o **middleware OIDC no IngressRoute do próprio app** (o Console e
  > o **Portal Recorder** usam `console-auth-*`/oauth2-proxy). Não conte com o gate da home para
  > proteger nada.
- **Estados tratados**: _vazio_ (nenhuma app extra) e _erro transitório_ (timeout/5xx, com
  botão **Tentar novamente**, só na carga inicial). 401/403 ⇒ seção oculta. Se a API falhar,
  os cards curados continuam acessíveis — a página nunca quebra.
- **UX**: busca/filtro client-side, menu mobile (hamburger), botão "voltar ao topo",
  _reveal on scroll_, destaque da seção ativa na navegação, modo escuro automático
  (`prefers-color-scheme`), `prefers-reduced-motion`.

**Roteamento**: `IngressRoute` em `devops-system` com `PathPrefix("/")` e **`priority: 1`**
(a menor) — os paths específicos (`/devops`, `/sicat`, `/grafana`, `/argocd`...) sempre
vencem; só a raiz cai no portal. Fica em `devops-system` (componente da plataforma), por
isso **não** aparece na própria lista (que mostra só o namespace `apps`).

## Estrutura

```
portal/frontend/
  index.html            # página principal (SEO completo, semântica, a11y)
  404.html              # página de erro amigável
  nginx.conf            # headers de segurança, gzip, cache, 404
  Dockerfile            # imagem estática (nginx:alpine)
  robots.txt sitemap.xml site.webmanifest favicon.svg
  assets/
    styles.css          # design system (tokens + dark mode)
    catalog.js          # catálogo declarativo de apps/ferramentas
    portal.js           # enriquecimento progressivo (funções puras + init)
    og-cover.svg        # imagem social (Open Graph/Twitter)
  test/                 # testes node:test (zero dependência de runtime)
  package.json          # scripts de qualidade (test/lint/format) — NÃO entra na imagem
  eslint.config.js
```

## Rodar / validar localmente

Não há build de bundle — o conteúdo é servido como está. Para qualidade use Node ≥ 20:

```powershell
cd C:\devops\portal\frontend
npm install            # instala devDeps (eslint, prettier) — só para qualidade
npm test               # testes (node:test) — roda sem instalar nada
npm run lint           # ESLint
npm run format:check   # Prettier
npm run validate       # format:check + lint + test (o gate completo)
```

Pré-visualizar no navegador (servidor estático efêmero):

```powershell
npx --yes serve -l 5055 C:\devops\portal\frontend
# abra http://localhost:5055  (a descoberta dinâmica mostrará o estado de erro,
# pois não há API /devops nesse servidor — comportamento esperado)
```

> Os testes do portal **não exigem** instalação (`node --test` é nativo). Em CI o job
> `ci-portal` roda `format:check` + `lint` + `test` + _smoke_ `docker build` +
> `kubeconform` (ver [`.github/workflows/ci-portal.yml`](../.github/workflows/ci-portal.yml)).

## Deploy

**Recomendado** — imagem IMUTÁVEL por commit (rollback confiável):

```powershell
C:\devops\scripts\publish-portal.ps1
# builda portal-frontend:<sha> (+ :local), aplica, set image, rollout, smoke.
```

O portal está sob **GitOps (Argo CD)**: [`platform/argocd/apps/portal.yaml`](../platform/argocd/apps/portal.yaml)
sincroniza `portal/k8s` (com `ignoreDifferences` no `image`, para não brigar com a tag publicada). O
**CI** ([`ci-portal.yml`](../.github/workflows/ci-portal.yml)) publica a mesma versão no GHCR
(`ghcr.io/flavioneto11/portal/frontend:<sha>`) em push para `main`. O portal também entra no
**"sobe tudo"** (`scripts/up.ps1` → `install-platform.ps1` etapa 6/6).

Validar no ar:

```powershell
curl.exe -I http://nvit.localhost/                 # 200 + headers de segurança
curl.exe -s -o NUL -w "%{http_code}" http://nvit.localhost/healthz   # 200
```

Rollback e diagnóstico: [`../docs/runbooks/portal-operations.md`](../docs/runbooks/portal-operations.md).

## Adicionar um app/card ao portal

Em geral **não é preciso** — apps com `IngressRoute` no namespace `apps` aparecem
sozinhas na seção "Aplicações publicadas na plataforma". Para um card **curado**
(destaque com descrição/tags/CTA):

1. Acrescente a entrada em [`frontend/assets/catalog.js`](./frontend/assets/catalog.js)
   (`PRODUCTS` ou `TOOLS`), com `path`, `requiresLogin`, etc.
2. Espelhe um `<article class="card prod">` (ou `tool`) em `index.html`, com
   `data-path`, `data-search` e o slot `<span data-status></span>` (para o selo "no ar").
3. Rode `npm run validate` (os testes verificam presença de CTAs/rotas e dedupe).

## Rollback

```powershell
kubectl -n devops-system rollout undo deploy/portal
```

Veja o runbook completo: [`../docs/runbooks/portal-operations.md`](../docs/runbooks/portal-operations.md).

## Observações

- Headers de segurança: o **Traefik** aplica `secure-headers` na borda; o nginx adiciona
  em **defesa em profundidade** os que faltam (CSP, Referrer-Policy, Permissions-Policy).
- Acessível em `https://dev.nvit.com.br/` (público via Cloudflare Tunnel) e
  `http://nvit.localhost/` (dev local).
- Checklists: [qualidade](../docs/standards/portal-quality-checklist.md) ·
  [UX & acessibilidade](../docs/standards/portal-ux-accessibility-checklist.md).
