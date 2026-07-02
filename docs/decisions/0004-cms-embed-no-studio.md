---
title: "ADR 0004 — Editor do CMS embutido no trilho t1 do Product Studio (deep-link → embed)"
status: canonical
applies_to: [console, reqhub, platform]
updated: 2026-07-02
language: pt-BR
---

# ADR 0004 — Editor do CMS embutido no trilho t1 do Product Studio (deep-link → embed)

**Estado:** Aceito · **Data:** 2026-07-02 · **Escopo:** `console/frontend` (modo `?embed=1` +
nginx), `apps/reqhub/frontend` (fase Conteúdo do trilho t1), `specs/products/<portal>` (fase E4
do plano "Forja 4.1"). Revisita a decisão do **A4 (Forja 4.0)**.

## Contexto

No A4 a criação de produto foi unificada na Forja: o fork "portal de conteúdo" **não** duplicava
o wizard do CMS — terminava num **deep-link** para o Console (`/devops/#conteudo?novo=1`), e a
edição do conteúdo acontecia inteira lá. Funcionou como fronteira mínima, mas quebra a promessa
central do Product Studio ("cada produto nasce e é **acompanhado daqui**"): para o único tier em
que o executor é o CMS (t1), o trilho terminava com o operador **saindo** do Studio, sem fase de
trabalho visível e sem estado (o hub mostrava o portal como "fora da Forja").

O operador decidiu no ciclo 4.1: o editor de conteúdo do CMS passa a ser **embutido** no trilho
t1, via iframe de um **modo embed** do Console. Restrições herdadas:

- CSP do reqhub é estrita (zero inline); iframes same-origin já são praxe (fase Telas/E0,
  editor visual do CMS via `?cmsEdit=1`).
- O middleware `secure-headers` do Traefik põe `X-Frame-Options: DENY` em **todas** as
  respostas do Console — bloqueia qualquer framing, inclusive same-origin.
- `platform/traefik` **não é Argo-synced** — mexer no middleware da borda está fora da mesa.
- O E0 (#187) já provou o antídoto: **CSP3 `frame-ancestors` obsoleta o XFO no browser** — a
  resposta embutida que declara `Content-Security-Policy: frame-ancestors 'self'` anula o DENY
  da borda mantendo o anti-clickjacking (framing restrito à mesma origem).

## Decisão

1. **Modo embed no Console** (`console/frontend`): com `?embed=1` na URL, o `App` decide no
   bootstrap entre a casca completa e a `EmbedSurface` — **só** o editor de conteúdo
   (ContentEditor), sem sidebar/topbar/`<platform-shell>`. O foco de portal vem do hash
   `#conteudo?projeto=<key>` (mesma gramática dos deep-links E1). O embed anuncia
   `postMessage({ source: 'console-embed', type: 'embed:ready' })` ao carregar e
   `{ type: 'embed:navigate', view, projeto }` nas navegações internas — **sempre** com
   `targetOrigin` = a própria origem (embed é same-origin por contrato); o receptor valida
   `event.origin === location.origin` **e** `data.source === 'console-embed'`.
2. **Header escopado no nginx do Console** (não no Traefik): `map $arg_embed` emite
   `Content-Security-Policy: frame-ancestors 'self'` **apenas** quando a requisição carrega
   `?embed=1` — ou seja, só no **documento** do embed. O Console normal continua respondendo
   sem o header (o `X-Frame-Options: DENY` da borda segue valendo = não-emoldurável). Assets
   (`/devops/assets/`) ficam de fora: `frame-ancestors` só tem efeito em documentos. O escopo
   por **query string** foi possível (via `map` + `add_header` com valor vazio = header
   ausente); não foi preciso recorrer ao escopo por path de bundle.
3. **Fase "Conteúdo" no trilho t1 do Studio** (`apps/reqhub/frontend`): produto
   `app_type: cms_portal` (blueprint tier t1) ganha trilho **reduzido**
   Brief → **Conteúdo** → Publicação (`studioPhaseModel`). A fase Conteúdo tem dois iframes
   alternáveis: **Editar** (`/devops/?embed=1#conteudo?projeto=<key>`) e **Ver no ar**
   (`/sites/<chave>`, servido pelo site-renderer — rota que por design não tem `frameDeny`,
   ver `console/k8s/site-renderer.yaml`). O `postMessage` do embed vira estado de
   loading/erro **fail-soft**: sem `embed:ready` em 15s, a fase degrada com aviso + o
   **deep-link do Console, que continua existindo** como fallback (e como rota de uso direto).
4. **Portal t1 real registrado**: o portal CMS existente no pm-api vira produto da base
   (`specs/products/<slug>/product.json`, blueprint `cms-portal`, `base_path /sites/<slug>`,
   `origin: adopted`) — o hub do Studio passa a mostrá-lo com o trilho t1 em vez de
   "fora da Forja".

## Alternativas consideradas

- **Manter só o deep-link (status quo do A4)**: rejeitado pelo operador — o trilho t1 ficava
  sem fase de trabalho; o Studio deixava de ser o lugar único de acompanhamento exatamente no
  tier mais simples.
- **Reimplementar o editor no reqhub**: rejeitado (mesma razão do A4) — duplicaria o executor
  do CMS (pm-api + AutoForm + editor visual) num app read-only por design; custo e drift
  permanentes.
- **Afrouxar o `frameDeny` no middleware do Traefik** (borda): rejeitado — `platform/traefik`
  não é Argo-synced, o middleware é transversal (afrouxaria **todas** as rotas que o usam) e a
  regra do repo é escopo mínimo. O header vai no nginx do Console, só no que o embed serve.
- **`frame-ancestors 'self'` no Console inteiro** (sem escopo): rejeitado — tornaria **todo** o
  Console emoldurável por qualquer página same-origin (outros apps do host, ex.: um portal CMS
  comprometido via conteúdo), sem necessidade. O embed é uma superfície específica; o escopo por
  query string custa um `map` de 4 linhas.
- **Nova rota/porta dedicada ao embed**: rejeitado — mais um Service/IngressRoute para servir o
  MESMO bundle; o escopo por query resolve sem topologia nova.

## Riscos aceitos e mitigação

- **CSP/headers**: navegadores pré-CSP3 ignorariam `frame-ancestors` e obedeceriam o XFO DENY
  (embed quebrado). Aceito: laboratório de operador único com browsers evergreen; o fail-soft
  degrada para o deep-link.
- **Acoplamento de origem (same-site)**: o embed pressupõe Console e Studio na **mesma origem**
  (`nvit.localhost` / `dev.nvit.com.br`). Se um dia as superfícies forem para origens distintas,
  o `frame-ancestors 'self'` bloqueia o iframe e o `targetOrigin` do postMessage para de casar —
  o embed degrada para o deep-link (fail-soft já implementado), e este ADR precisa ser revisto
  (allowlist explícita de origens em vez de `'self'`).
- **SSO no iframe**: a rota do Console exige sessão (oauth2-proxy). Sem sessão, o iframe recebe
  um 302 para o login (que **não** carrega o header e não renderiza no frame) — coberto pelo
  timeout fail-soft com o deep-link.
- **Fallback permanente**: o deep-link `/devops/#conteudo?projeto=<key>` (A4/E1) **continua
  existindo** — o embed é aditivo, não substitui a rota direta.

## Consequências

**Positivas:** o trilho t1 fecha o ciclo dentro do Studio (criar → editar conteúdo → ver no
ar) sem duplicar o executor; o padrão embed (flag de bootstrap + `frame-ancestors` escopado +
postMessage validado) fica pavimentado para outras superfícies embutíveis; portais CMS reais
entram na base de produtos (visibilidade no hub, fim do "fora da Forja" para t1).

**Negativas / trade-offs:** mais um contrato entre superfícies (mensagens `console-embed`) a
manter; o Console ganha um segundo modo de renderização (testado apenas por build + prova de
headers, sem suite própria de frontend); o escopo por query string depende de comportamento
documentado do nginx (`add_header` com valor vazio não emite) — anotado no próprio conf.
Limitação conhecida: o fallback SPA do `try_files` descarta a query string, então uma rota de
**path** inexistente com `?embed=1` cairia no index sem o header — aceito porque a SPA não usa
rotas por path (hash/estado) e o embed usa sempre o documento canônico `/devops/?embed=1`;
preservar a query no fallback (`$is_args$args`) foi testado e **quebra** com `alias` (bug
conhecido do nginx), por isso não foi feito.
