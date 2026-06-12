---
title: "CMS dos portais — gerenciamento de conteúdo desacoplado"
status: canonical
applies_to: [platform, apps]
updated: 2026-06-11
language: pt-BR
---

# CMS dos portais (conteúdo gerenciável e desacoplado)

> Os portais de marketing (`apps/rmambiental`, `apps/anarabottini`) têm o conteúdo **gerenciável** por
> uma seção logada dentro do **DevOps Console** (`/devops` → **Conteúdo**), usada pelos **mesmos
> usuários do Projetos & Tarefas**. O gerenciamento é **desacoplado** do portal: o conteúdo vive no
> `pm-api` (Postgres) e os portais o consomem em runtime, com **fallback embutido**.

## Arquitetura

```
[Console /devops > Conteúdo]  --auth (oauth2-proxy)-->  pm-api  /devops/api/pm/*            (CRUD escrita)
[Portal /<app>]   useContent() --PÚBLICO (sem auth)-->  pm-api  /devops/api/cms/public/<key> (leitura publicada)
                                                                 /devops/api/cms/public/files/<id> (arquivos)
                              fallback -> src/data/content.default.ts (embutido no bundle)
```

- **Mesma pod `pm-api`** serve as duas faces: editor autenticado (`/devops/api/pm`, gated por
  `console-auth-401`) e leitura pública (`/devops/api/cms`, **sem** gate — só conteúdo **publicado**,
  escopado por projeto). Rotas Traefik: `console/k8s/pm/{pm-ingressroute,pm-public-ingressroute}.yaml`.
- **Mesma origem** (`dev.nvit.com.br`) → sem CORS.
- **Acesso** = idêntico ao Projetos & Tarefas: `platform-admins` (todos os portais) + `project-members`
  (escopado aos projetos atribuídos, via `pm_user_access`). Portal **==** projeto (a `key` do portal é
  a `key` do projeto). Reusa `assertProjectAccess` (ver `console/pm-api/src/auth.js`).

## Taxonomia: portal CMS ≠ produto/software

Todo projeto tem `projects.app_type` (`cms_portal` | `product_software` | `platform_tool` —
migration `004_taxonomy.sql`; mesmo vocabulário do `devops.yaml > app.appType` e do label
`devops.flavioneto/app-type`). Efeitos no Console:

- O editor de **Conteúdo** lista **apenas** `cms_portal` (produtos como sicat/gymops não aparecem —
  evita páginas CMS órfãs num software).
- O **painel do usuário** (member) separa "Meus Portais" (→ Conteúdo) de "Meus Sistemas & Produtos"
  (→ Projetos & Tarefas): quem só gerencia portal **não vê** o board; quem só tem produto não vê o CMS.
- Apps/Publicações/Health/Compartilhados exibem o badge do tipo (lookup pelo cadastro do pm-api,
  com fallback no label k8s quando presente).

## Governança: criação e aprovação de portal

Portal novo é criado pelo Console (**Conteúdo → Novo portal**, `NewPortalWizard`): identidade
**própria** (key própria — key de produto existente é recusada com 409 —, `cms_site`, páginas e
publicação próprios) + vínculo **opcional** `projects.related_project_id` com um produto/sistema
(relacional: contexto p/ IA, governança e relatórios; nunca transforma o portal no produto).

- **Admin cria → nasce `approved`** (aprovado automaticamente, `approved_by/approved_at` registrados).
- **Member cria → nasce `pending_approval`** (e o criador ganha `pm_user_access` ao portal): o
  conteúdo pode ser montado como rascunho, mas a **rota pública responde 404** até o admin aprovar
  (botões Aprovar/Rejeitar no editor). Rastreio: `created_by`, `approved_by`, `approved_at`
  (migration `006_portal_governance.sql`).
- A publicação **de infraestrutura** (deploy de um frontend dedicado, Argo Application etc.) continua
  pelo golden path normal, com aprovação do operador — o CMS governa o **conteúdo**; o GitOps governa
  o **deploy**. Um portal só de conteúdo (servido por um frontend genérico futuro) não precisa de deploy.

## Modelo de conteúdo

Projeto → **páginas** → **seções** ordenadas. Cada seção é um "bloco" com `kind` (texto livre,
validado no app) e `data jsonb`. Reordenar = 1 UPDATE de `position`; publicar/ocultar = filtro na
leitura pública; novos `kind` genéricos **não exigem migração**.

Tabelas (`console/pm-api/src/sql/003_cms.sql` + migrations 004–007): `cms_site` (config tipo site.ts
por projeto), `cms_pages`, `cms_sections` (`kind`/`anchor`/`position`/`data`/`status`/`visible` +
`generated_by`/`generation_id` p/ rastrear IA), `cms_files` (imagens/PDF como `bytea`, com **escopo**),
`cms_generation_requests` (pedidos de geração por IA). Enum `cms_status` = `draft|published`.

### Biblioteca de mídia em dois níveis

`cms_files.scope` (migration `005_media_scopes.sql`):

- **`project`** (default) — arquivo exclusivo do portal (comportamento original; `project_id` obrigatório).
- **`global`** — **biblioteca pública** da plataforma (`project_id` NULL): logos, fundos, ícones,
  placeholders reutilizáveis por **qualquer** portal. Upload/exclusão de arquivo global = **só admin**
  (member nem vê o botão; o backend devolve 403).

Endpoints: `GET /projects/:id/cms/files?scope=project|global|all` (default `all`); upload com campo
`scope=global` (admin). O **MediaPicker/Biblioteca** tem as abas "Todos disponíveis / Este portal /
Biblioteca pública" + badge `pública`. A URL pública `/devops/api/cms/public/files/<id>` é a mesma
para os dois escopos (serve por id) — nada quebra nos portais publicados.

### Block kinds
Genéricos (criáveis pelo editor sem código): `section-heading`, `rich-text`, `card-grid`
(grid|list, N colunas), `timeline`, `accordion`, `video-gallery`, `materials`, `testimonials`,
`logos`, `cta`. Específicos por portal: `hero`, `palestras`, `lead-form` (anarabottini); `hero`,
`stats`, `gallery`, `services-detail`, `contact-form` (rmambiental). Ícones em `data.icon` são **nome**
(string) resolvido por allowlist (`src/lib/icons.ts`) — JSON não guarda componente React.

O `hero` dos dois portais é 100% CMS: além de textos/CTAs/indicadores, aceita
`floating[]` (`{ icon, label, position, visible }` — labels flutuantes com posição em presets
`top-left|top-right|right|left|bottom-left|bottom-right`), e no rmambiental `mapLabel`/`mapSublabel`
("Pontos de atuação" / "Brasil · multirregião") e `visualImage` (substitui o CoverageMap por imagem);
no anarabottini, `photoCaption` (legenda da foto, ex.: "Palestrante corporativa"). Sem os campos no
dado vivo, o renderer usa fallback com os textos históricos (nada some em portais já publicados).

### Geração assistida por IA (base)

`POST /projects/:id/cms/generate` (`console/pm-api/src/routes/cms-ai.js`) registra uma
`cms_generation_request` (prompt/template/contexto salvos p/ rastreabilidade), chama o provider
(`src/ai/generate.js` — contrato gpt-5: sem temperature, `reasoning_effort` low, timeout curto,
saída restrita aos kinds **genéricos**) e materializa o resultado como **rascunho** (`status=draft`,
`generated_by='ai'`, `generation_id`): regenerar **adiciona** novos rascunhos — nunca sobrescreve
seção/ajuste manual. Paleta sugerida vai para `cms_site.data.aiPalette` (aplicar é decisão humana).
Sem `OPENAI_API_KEY` no Secret do pm-api (ou com `AI_ENABLED=false`) a rota responde 503 e o CMS segue
funcionando sem IA. O wizard "Novo portal" tem o campo opcional "Descreva o portal…" que usa essa rota.
Fase 2 (planejada): trocar o provider por `@flavioneto11/ai-kit` + prompts versionados no
ai-control-plane (`cms.portal.*`) sem mudar o contrato das rotas.

## Como editar (operador)

`https://dev.nvit.com.br/devops/` → **Conteúdo** → escolha o portal. Há dois modos (alternados no topo):

- **Visual (padrão)** — uma **prévia ao vivo** do portal num iframe (`<rota>/?cmsEdit=1`). Passe o mouse
  sobre uma seção para ver a barra de ações (**mover ↑/↓**, **publicar/rascunho**, **ocultar/mostrar**,
  **excluir**, **+ seção abaixo**); **clique** numa seção para abrir o **painel contextual** (formulário
  daquela seção). Textos em destaque (títulos, subtítulos, cards) são **editáveis direto na prévia**
  (clique e digite). Listas têm **+ adicionar** e controles por item; mídia abre o campo de **upload**
  no painel. Tudo **auto-salva** (otimista, com debounce). Trocar de página pelas abas; **Editar site**
  (contato/redes/fotos) e **+ Seção** ficam no topo.
- **Avançado** — a lista de seções com drawer/formulário e reordenação por arraste (modo clássico).

> Arquitetura do modo visual: o portal embarcado **nunca grava** — só emite `postMessage` (mesma origem);
> a árvore EDITÁVEL (inclui rascunho/oculto) é montada e injetada pelo console **autenticado**, que
> persiste via `pm-api`. O gate de edição exige iframe + `?cmsEdit=1` + handshake same-origin — visitante
> normal nunca vê o chrome de edição. Recarregue o portal público para ver (cache ~30s).

> Membros (`project-members`) só veem/editam os portais a que têm acesso — mesmo escopo do P&T.

## Como o portal consome (desenvolvedor)

Cada portal tem:
- `src/lib/content.ts` — tipos + `fetchContent()` (busca `${location.origin}/devops/api/cms/public/<key>`,
  timeout curto). **Não** usar `import.meta.env.BASE_URL` (é o subpath do portal).
- `src/lib/SiteContext.tsx` — `ContentProvider` (default-first: renderiza o embutido na hora e troca
  para o do CMS quando carrega) + `useSite()` / `useContentTree()`.
- `src/data/content.default.ts` — árvore de **fallback** (montada a partir dos dados do app), garante
  render mesmo com a API fora.
- `src/components/SectionRenderer.tsx` — 1 renderer por `kind`, reusando `ui.tsx` + componentes do app.
- `src/lib/site.ts` — `DEFAULT_SITE` + `makeSiteApi(s)` + `mergeSite(partial)`; componentes de
  contato (Header/Footer/WhatsAppFab/etc.) usam `useSite()`.

`App.tsx` envolve as rotas em `<ContentProvider>`; `Home`/`Solucoes`/`Contato` renderizam
`<SectionRenderer sections={findPage(tree, '<slug>')?.sections} />`.

## Adicionar um portal novo ao CMS

1. **Seed** em `console/pm-api/scripts/cms-seed-<app>.js` (idempotente — só semeia se o portal não tem
   seções): `cms_site` + páginas/seções a partir do conteúdo atual. Chame em `scripts/seed.js`.
2. **Portal**: criar `lib/{content,SiteContext,icons}.ts`, `data/content.default.ts`,
   `components/SectionRenderer.tsx` (kinds do portal), refatorar `site.ts` (DEFAULT_SITE/makeSiteApi/
   mergeSite) e apontar `Home`/páginas para o `SectionRenderer`. Espelhe `apps/anarabottini`.
3. **Sem** mudança no console (o editor lista qualquer projeto) e **sem** nova IngressRoute (a rota
   pública serve qualquer `:projectKey`).

## Arquivos-chave

- Backend: `console/pm-api/src/sql/{003_cms,004_taxonomy,005_media_scopes,006_portal_governance,007_ai_generation}.sql`,
  `src/routes/{cms,cms-public,cms-ai,projects}.js`, `src/ai/generate.js`, `src/auth.js`,
  `scripts/cms-seed-{anarabottini,rmambiental}.js`.
- Rota pública: `console/k8s/pm/pm-public-ingressroute.yaml`.
- Editor: `console/frontend/src/components/ContentEditor.jsx` (toggle visual/lista + governança) +
  `VisualEditor.jsx` (prévia ao vivo + bridge postMessage) + `components/cms/*` (`kinds.js`,
  `AutoForm`, `FileField`, `MediaPicker` com escopos, `RichTextField`, `NewPortalWizard`) +
  `lib/{jsonPath,appTypes}.js` + `api.js` (`pmCms*`, `pmApproveProject`, `pmCmsGenerate`).
- Portais: `apps/<app>/src/{lib/content.ts,lib/SiteContext.tsx,lib/cmsEdit.tsx,components/SectionRenderer.tsx,data/content.default.ts}`
  (`cmsEdit.tsx` = gate + primitivos EditableText/SectionFrame/ItemControls/AddButton/MediaSlot).

## Notas / armadilhas

- Leitura pública é montada **antes** do `authContext` no Express **e** sem `console-auth-401` na
  IngressRoute; só devolve `published` + `visible`, escopado por projeto (nunca draft/oculto/outro app)
  — **e** exige `projects.approval_status = 'approved'` (portal pendente/rejeitado responde 404).
- Re-seed: o guard pula se o portal já tem seções (não sobrescreve edições). Para re-semear no lab,
  limpe `cms_pages` do projeto e reinicie o `pm-api`.
- Imagens/PDF são `bytea` no Postgres do `pm-api` (limite 8 MB, mimes em allowlist). Vídeos = URL/ID do
  YouTube. Para volume maior, migrar `cms_files` para storage de objetos mantendo o contrato da URL.
