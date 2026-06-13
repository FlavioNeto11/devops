# Portal NovaIT (landing na raiz `/`)

> **Para agentes:** leia [`AGENTS.md`](./AGENTS.md) primeiro (escopo, fronteiras seguras/aprovação/proibidas, princípios).

Página inicial pública da plataforma, servida na **raiz** de `https://dev.nvit.com.br`
(e `http://xpto.localhost/` no dev local). Apresenta os produtos, portais e
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
  > "Aplicações publicadas" começa **oculta** e só aparece para **operadores logados**
  > (a sessão same-origin autoriza o fetch). Visitante anônimo recebe **401** → a seção
  > permanece oculta (o site público mostra só os cards curados, que já cobrem todas as apps).
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

## Deploy (lab local)

```powershell
docker build -t portal-frontend:local C:\devops\portal\frontend
kubectl apply -f C:\devops\portal\k8s\portal.yaml
kubectl -n devops-system rollout status deploy/portal
```

Validar no ar:

```powershell
curl.exe -I http://xpto.localhost/                 # 200 + headers de segurança
curl.exe -s -o NUL -w "%{http_code}" http://xpto.localhost/healthz   # 200
```

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
  `http://xpto.localhost/` (dev local).
- Checklists: [qualidade](../docs/standards/portal-quality-checklist.md) ·
  [UX & acessibilidade](../docs/standards/portal-ux-accessibility-checklist.md).
