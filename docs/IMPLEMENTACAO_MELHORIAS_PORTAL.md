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

## 10. Testes criados (48, `node:test`, zero dependência de runtime)
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
| `node --test` (portal/frontend) | ✅ **48 pass / 0 fail** |
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

## 15.1. Publicação no domínio e ajuste pós-deploy

Publicado em produção (commit `ba10c9c` + ajuste de descoberta) e **no ar em
`https://dev.nvit.com.br/`** (e `http://nvit.localhost/`):

- `docker build :local` → `kubectl apply` (livenessProbe efetivado) → `rollout restart` ✅
- Smoke público: `GET /` → **200** servindo a nova versão (assets `?v=5`, CSP endurecida);
  `/healthz` 200; `/assets/*` 200 (`text/css`/`application/javascript`); 404 amigável.

**Ajuste pós-deploy (operador via card):** a descoberta gerava um card "Ai Control" → `/ai-control`
(404), porque `ai-control-plane` é **só-de-API** (`PathPrefix /ai-control/api`, sem frontend na
raiz). **Correção:** `discoverExtras` só cria card para apps **navegáveis** (com rota servindo a
raiz `/<app>`); serviços só-de-API/control-plane/worker são ignorados. Verificado **com os dados
reais do cluster** (6 IngressRoutes de `apps`): `/ai-control` excluído, demais apps navegáveis já
curadas → nenhum card extra espúrio. Travado por testes (app só-de-API ⇒ 0 cards).

**Ajuste descoberto no deploy real:** `/devops/api/ingressroutes` retorna **401** para visitante
anônimo (a API do Console é autenticada) — tanto no público quanto no local. Sem tratamento, todo
visitante veria a caixa de erro da descoberta dinâmica. **Correção:** a seção "Aplicações
publicadas" virou **recurso de operador** — começa oculta (`#cluster-section hidden`) e o
`portal.js` a esconde em 401/403 (`isAuthError`); só aparece para operador logado (sessão
same-origin autoriza o fetch → 200). Verificado no portal implantado (`nvit.localhost`):
`cluster-section.hidden = true`, **sem caixa de erro**, 4 cards curados visíveis, **zero erros no
console**. Travado por testes (`isAuthError`, seção inicia oculta).

## 16. Próximos passos recomendados
1. Gerar `og-cover.png` para máxima compatibilidade social (scrapers que não leem SVG).
2. Habilitar TLS/HSTS na borda (Cloudflare/Traefik) e o middleware `redirect-https`.
3. Substituir os placeholders do showcase por **screenshots reais** dos produtos (`assets/shots/<app>.png`).
4. (Opcional) endpoint público read-only no Console p/ a descoberta não logar 401 no anônimo.
5. (Opcional) endurecer a imagem para rodar nginx como não-root.

---

# Rodada 2 — Resposta à revisão externa (2026-06-13)

Uma revisão externa apontou bugs reais e lacunas de prontidão. Tratados (plano aprovado em
`~/.claude/plans/...melhorias...md`):

### Bugs do portal corrigidos
| # | Achado da revisão | Correção |
|---|---|---|
| A1 | **Sem-JS quebra a página** (`.reveal{opacity:0}` órfão) | Gate `.js .reveal`: conteúdo **visível por padrão**; um `<script>` no `<head>` adiciona `js` antes do paint (liberado por **hash sha256** no CSP — sem `unsafe-inline`). Cobre JS desabilitado/bloqueado/com erro. Verificado: `.reveal` opacity=1 sem a classe `js`. |
| A2 | **Loading nunca exibido** | `loadClusterApps()` mostra `stateMarkup('loading')` (skeleton) na carga inicial/retry. |
| A3 | **`devops` requiresLogin=false** (mas é OIDC) | `catalog.js` → `true`; selo "login" no card do Console (confirmado `console-auth-401/redirect` no IngressRoute; `portal-rec` segue `false`). |
| — | **Home pública expõe tools de operador** | Seção Plataforma + link da nav + coluna do rodapé **gated**: ocultas para anônimo (401), reveladas só para operador logado (mesmo sinal da descoberta). Busca respeita o gate. |
| — | **Hook de analytics sem arquivo** | `assets/config.js` (no-op carregado antes de `portal.js`) + `config.example.js`. |
| — | **Cards "contam mas não mostram"** | Seção `#showcase` com slots de imagem por produto (placeholders `assets/shots/placeholder.svg` + TODO p/ screenshots reais). |

### Deploy imutável + GitOps + CI (decisão do usuário: "Completo GHCR/CI")
- **CI** (`ci-portal.yml`, job `build-push`): publica `ghcr.io/flavioneto11/portal/frontend:<sha>` em push p/ main (após quality+docker). Node 20→**22**.
- **Argo** (`platform/argocd/apps/portal.yaml`): portal sob GitOps; `ignoreDifferences` + `RespectIgnoreDifferences=true` no `image` (não briga com a tag publicada).
- **Rollback confiável** (`scripts/publish-portal.ps1`): build de tag **imutável** `portal-frontend:<sha>` + `set image` + `rollout restart` → cada deploy é imagem distinta ⇒ `rollout undo` volta a versão anterior **de verdade**. Runbook corrigido (sem "rollback instantâneo" enganoso).
- **"Sobe tudo"**: `install-platform.ps1` ganhou a etapa **6/6 Portal** (via `publish-portal.ps1`).

### CI/Dependabot
- `ci-apps` agora cobre **anarabottini** (`typecheck build`). Dependabot ampliado: `apps/anarabottini`, `console/site-renderer`, `portal/frontend`.

### Medição (Chrome local)
- **Lighthouse** (`http://nvit.localhost/`): **Performance 92 · Accessibility 100 · Best Practices 96 · SEO 100**. **axe-core/cli: 0 violações**.
- Corrigidos no processo: contraste de botão no escuro (token `--btn-bg` fixo `#2563eb` = 5.8:1), `--muted2` escuro (#828fa9 AA), ordem de headings (rodapé `h4`→`h3`). Best Practices 96 = **1** erro de console esperado (401 do probe de operador) — trade-off intencional.

### Riscos de host documentados (sem migrar)
- Novo [`docs/runbooks/host-risks-and-readiness.md`](./runbooks/host-risks-and-readiness.md): **disco D: ~98%**, Docker Desktop não suportado em Win Server, SPOF do notebook, backup/UPS/uptime, TLS/HSTS.

### Fora de escopo (registrado)
- Migrar de Windows Server + Docker Desktop (lab documentado); merge dos PRs major do Dependabot; testes de integração WIP (gymops/sicat); screenshots reais (placeholders entregues); endpoint público no Console p/ zerar o 401.

---

# Rodada 3 — Resposta à 2ª revisão externa (2026-06-13)

A 2ª revisão aprovou com ressalvas críticas. Tratadas (decisões do usuário entre parênteses):

| # | Achado | Correção |
|---|---|---|
| 1 | **publish-portal reportava falso sucesso** | Reescrito: checa `$LASTEXITCODE` de tudo e o **smoke dá throw** se rollout/`/`/`/healthz` falharem (não há mais `[OK]` cego). `-SkipBuild` (quebrado) removido. |
| 2 | **"100% GitOps" era híbrido** (kubectl set image + ignoreDifferences) (GitOps real) | **GitOps real**: a tag da imagem vive em `portal/k8s/portal.yaml` (git), `publish-portal.ps1` faz o **bump + commit**, o Argo reconcilia. Removidos `kubectl set image`, `ignoreDifferences` e `RespectIgnoreDifferences`. Rollback = `git revert`. O stat "100% GitOps" passa a ser honesto. |
| 3 | **Tags GHCR `sha-<sha>` vs docs `<sha>`** | `reusable-build-push.yaml` (+ template) → `type=sha,prefix=,format=short` (alinha a `<sha>`). CI = artefato; CD = commit do bump → Argo. |
| 4 | **Avisos Node 20** (actions) (bump todos) | `actions/checkout@v4`→`@v5` e `setup-node@v4`→`@v5` em **todos** os workflows + templates (Node 24). |
| 5 | **Portal Recorder aberto na internet** (proteger) | **OIDC operador-only** no `apps/portal-recorder/k8s/ingressroute.yaml`: `console-auth-redirect` (frontend, 302) e `console-auth-401` (api+stream, 401), cross-namespace. AGENTS/README do app atualizados; card vira "login". |
| 6 | **No-JS quebrava se o módulo falhasse** | Failsafe: o `<script>` do `<head>` arma um timer de 2,5s que adiciona `.no-anim` (revela tudo) se `portal.js` não inicializar; init() cancela o timer. CSP re-hashada; verificado no navegador. |
| 7 | **Flicker do skeleton p/ anônimo** | Skeleton **adiado 350ms** (cancelado ao resolver): 401 rápido ⇒ nunca aparece; só surge em consulta lenta de operador. |
| 8 | **CI não cobria portal-recorder/ai-control-plane** (incluir) | `ci-apps` virou **ciente de subpasta** (`path`): cobre `portal-recorder/api` (test), `portal-recorder/frontend` (build), `ai-control-plane/api` (test). |
| — | **Framing "gate = segurança"** | Docs corrigidas: esconder na home é **UX**, não segurança; a proteção de rota é por app (Portal Recorder agora via OIDC). |

**Nota sobre GHCR-pull:** o usuário pediu o cluster puxando do GHCR, mas o token `gh` desta máquina
**não tem escopo `write:packages`** para tornar o pacote público (403), e GHCR privado exigiria pull
secret. Entregamos **GitOps real com tag LOCAL imutável** (Docker Desktop compartilha o daemon — mesmas
propriedades GitOps: tag no git, Argo reconcilia, rollback por `git revert`), **totalmente implantável e
verificável**. Trocar para GHCR-pull é 1 passo: tornar o pacote público (`gh auth refresh -s
write:packages` + visibility) e apontar o `image:` do manifest ao GHCR.

### Addendum — 3ª revisão (aceite técnico ~8,8/10)

1. **Release atômico (validate-then-push):** `publish-portal.ps1` reordenado — commita o bump **localmente**,
   aplica + rollout + smoke e **só dá `git push` se tudo passar**. Em qualquer falha, **AUTO-ROLLBACK**:
   descarta o commit do bump (não pushado) e reaplica o manifest anterior (volta git local **e** cluster).
   A `main` nunca recebe um release quebrado; o Argo nunca reconcilia um manifest ruim. Verificado live
   (rollback restaurou git+cluster com **zero downtime** — o pod antigo seguiu servindo 200).
   - **Corrida com o Argo corrigida:** com `selfHeal: true`, o Argo (desired em cache até re-ler o git)
     revertia o `kubectl apply` de validação para o sha anterior. Mudado para **`selfHeal: false`** (mantém
     auto-sync quando o GIT muda; o publish dá um `refresh=hard` no Argo logo após o push). Sem isso, o
     deploy "passava" e depois flapava para o sha antigo.
2. **Avisos Node 20:** `checkout`/`setup-node` já em `@v5`; para as JS actions restantes (docker/*,
   `pnpm/action-setup`) adicionado `env: FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true` em todos os workflows +
   templates — força Node 24 e zera os avisos antes da troca forçada.
3. **Honestidade do stat:** a home não diz mais "100% GitOps" (passou a **"Argo · GitOps · CD"**). É GitOps
   **válido para o lab**, mas **não reprodutível só pelo git** enquanto a imagem viver apenas no daemon
   local (um cluster novo não rebuilda do git). Reprodutibilidade plena exige **GHCR-pull ativo** (pacote
   público) — pré-requisito antes de classificar como pronto para migração de host.

### Addendum 2 — 4ª revisão (aceite ~9/10)

1. **Tag GHCR alinhada ao manifest (pré-requisito real do GHCR-pull):** antes a tag era o **sha do commit**,
   mas o manifest pina uma imagem buildada ANTES do commit do bump → a tag que o CI publicava (sha do bump)
   nunca batia com a do manifest. Agora a tag é o **tree-sha do conteúdo de `portal/frontend`**
   (`git rev-parse HEAD:portal/frontend` 12c) — **determinístico e idêntico** no `publish-portal.ps1` e no
   CI (job `treesha` → input `tag` no `reusable-build-push`). O GHCR passa a publicar **exatamente** a tag
   que o manifest pina; ativar GHCR-pull deixa de exigir ajuste de pipeline (só pacote público + trocar o
   `image:` para o caminho GHCR).
2. **Rollback cobre TODAS as falhas:** o `git push` passou para **dentro do try** (falha no push também
   dispara o auto-rollback — a `main` nunca fica adiantada nem atrás de um deploy ruim). Cada passo do
   `Invoke-AutoRollback` (reset, apply, rollout) é **checado**, e o script avisa alto se o rollback **não**
   completou (sem "revertido" falso). O `refresh=hard` do Argo é checado (aviso, não-fatal).
3. **Aviso Node 20 (esclarecimento):** com `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` o **runtime** já roda
   em Node 24; a *annotation* remanescente ("...being forced to run on Node.js 24") é **informativa** e só
   some quando os mantenedores das actions (docker/*, pnpm) lançarem majors nativas em Node 24 — fora do
   nosso controle (upstream). Risco de execução: mitigado.
