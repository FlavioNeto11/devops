export const meta = {
  name: 'generate-ui',
  description: 'Motor ultracode: projeta o inventário COMPLETO de telas de um produto e constrói telas Vue ricas (nível SICAT/GymOps) sobre o kit ui-vue, com backend de domínio, crítico de design e verificação.',
  whenToUse: 'Gerar/elevar o frontend (e o backend de domínio que ele exige) de um app da Forja.',
  phases: [
    { title: 'Arquitetura UX', detail: 'inventário completo de telas + entidades + marca + lacunas (ancorado a requisitos)' },
    { title: 'Base + Backend', detail: 'marca, REFs, sync do kit/tokens; endpoints de domínio que faltam' },
    { title: 'Telas', detail: 'um builder por tela (Vue rico) + crítico adversarial + correção' },
    { title: 'Integração', detail: 'router/nav/api, vite build, testes, contrato OpenAPI, relatório de lacunas' },
  ],
};

// args (passados pelo invocador): { product, title, basePath, appDir, requirements:[{id,title,statement}], contract:<texto>, notes? }
let RAW = (typeof args !== 'undefined') ? args : undefined;
if (typeof RAW === 'string') { try { RAW = JSON.parse(RAW); } catch (e) { log('args veio como string não-JSON: ' + String(RAW).slice(0, 120)); } }
log('diagnóstico args: typeof=' + (typeof args) + ' -> product=' + (RAW && RAW.product));
const P = RAW || {};
const APP = P.product;
const TITLE = P.title || APP;
const APPDIR = P.appDir || ('apps/' + APP);
const CONTRACT = P.contract || '(veja specs/forge/ui-kit-contract.md)';
const REQS = Array.isArray(P.requirements) ? P.requirements : [];
const REQ_IDS = REQS.map((r) => r.id);
const reqBlock = REQS.map((r) => '- ' + r.id + ': ' + (r.title || '') + (r.statement ? (' — ' + r.statement) : '')).join('\n');

if (!APP) throw new Error('args.product é obrigatório');
log('Motor generate-ui — produto ' + APP + ' (' + REQS.length + ' requisitos, ' + REQ_IDS.length + ' IDs reais)');

// ---------------- schemas ----------------
const FIELD = {
  type: 'object', additionalProperties: false,
  required: ['name', 'type'],
  properties: {
    name: { type: 'string' },
    label: { type: 'string' },
    type: { enum: ['text', 'number', 'currency', 'date', 'datetime', 'boolean', 'enum', 'status', 'longtext'] },
    required: { type: 'boolean' },
    enumValues: { type: 'array', items: { type: 'string' } },
  },
};
const ENTITY = {
  type: 'object', additionalProperties: false,
  required: ['name', 'label', 'fields', 'hasEndpoints'],
  properties: {
    name: { type: 'string', description: 'slug PLURAL minúsculo, ex.: products, orders' },
    label: { type: 'string' },
    fields: { type: 'array', items: FIELD },
    hasEndpoints: { type: 'boolean', description: 'true se o backend JÁ expõe /v1/<name> CRUD' },
    anchors: { type: 'array', items: { type: 'string' } },
  },
};
const SCREEN = {
  type: 'object', additionalProperties: false,
  required: ['slug', 'title', 'kind', 'route', 'anchors'],
  properties: {
    slug: { type: 'string', description: 'kebab-case único, ex.: product-list' },
    title: { type: 'string' },
    kind: { enum: ['dashboard', 'list', 'create', 'edit', 'detail', 'custom'] },
    route: { type: 'string', description: 'rota começando com /, ex.: /products' },
    entity: { type: ['string', 'null'], description: 'slug da entidade (ou null p/ dashboard/custom)' },
    anchors: { type: 'array', items: { type: 'string' }, minItems: 1, description: 'IDs de requisito REAIS (>=1)' },
    purpose: { type: 'string', description: 'o que a tela faz + interações principais' },
    components: { type: 'array', items: { type: 'string' } },
    apiEndpoints: { type: 'array', items: { type: 'string' } },
  },
};
const ARCHITECT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['brand', 'entities', 'screens', 'navGroups', 'gaps'],
  properties: {
    brand: {
      type: 'object', additionalProperties: false,
      required: ['name', 'accent', 'neutralBase', 'radius'],
      properties: {
        name: { type: 'string' }, accent: { type: 'string', description: 'hex, ex.: #0f766e' },
        neutralBase: { enum: ['slate', 'graphite', 'zinc', 'warm'] },
        radius: { enum: ['sm', 'md', 'lg'] }, displayFont: { type: 'string' }, vibe: { type: 'string' },
      },
    },
    entities: { type: 'array', items: ENTITY },
    screens: { type: 'array', items: SCREEN, minItems: 1 },
    navGroups: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['group', 'items'], properties: { group: { type: 'string' }, items: { type: 'array', items: { type: 'string' } } } } },
    gaps: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['title', 'why'], properties: { title: { type: 'string' }, why: { type: 'string' }, nearestReq: { type: 'string' }, action: { type: 'string' } } } },
  },
};
const BUILD_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['screen', 'status', 'file'],
  properties: {
    screen: { type: 'string' }, status: { enum: ['built', 'blocked'] },
    file: { type: 'string' }, route: { type: 'string' }, component: { type: 'string' },
    navLabel: { type: 'string' }, navGroup: { type: 'string' },
    apiResources: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
};
const CRITIQUE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['screen', 'score', 'pass', 'findings'],
  properties: {
    screen: { type: 'string' }, score: { type: 'number' }, pass: { type: 'boolean' },
    findings: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['severity', 'issue'], properties: { severity: { enum: ['blocker', 'major', 'minor'] }, issue: { type: 'string' }, fix: { type: 'string' } } } },
  },
};
const VERIFY_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['viteBuild', 'summary'],
  properties: {
    viteBuild: { enum: ['pass', 'fail'] },
    backendTests: { enum: ['pass', 'fail', 'skip'] },
    tokensDrift: { enum: ['pass', 'fail', 'skip'] },
    openapiDrift: { enum: ['pass', 'fail', 'skip'] },
    repairs: { type: 'number' },
    summary: { type: 'string' },
    routesWired: { type: 'array', items: { type: 'string' } },
  },
};

// ---------------- P0 — Arquiteto UX ----------------
phase('Arquitetura UX');
const architect = await agent([
  'Você é um ARQUITETO de produto/UX sênior. Projete o inventário COMPLETO de telas que o sistema "' + TITLE + '" (' + APP + ') precisa para ser 100% utilizável e robusto — nível SICAT/GymOps. NÃO se limite ao que os requisitos pedem literalmente: para CADA entidade de domínio, infira o CRUD completo (lista, criar, editar, detalhe), além de dashboard e navegação. O usuário reclamou que sistemas gerados ficam pobres (ex.: "não tem nem tela de cadastrar produto") — não repita esse erro.',
  '',
  'REQUISITOS (fonte da verdade — ancore CADA tela/entidade a >=1 destes IDs REAIS):',
  reqBlock || '(sem requisitos passados — leia specs/requirements/' + APP + '/ com Read/Grep)',
  '',
  'Leia o backend existente para saber quais endpoints JÁ existem (apps/' + APP + '/api/src/server.js e, se houver, apps/' + APP + '/api/openapi/openapi.yaml). Marque entity.hasEndpoints=true quando /v1/<name> já existir; false quando a tela exigir uma entidade nova (o motor vai criar o backend).',
  'Leia também ' + APPDIR + '/product.json (stack, blueprint).',
  '',
  'REGRAS:',
  '- Toda tela e toda entidade ancora a >=1 requisito REAL desta lista: ' + JSON.stringify(REQ_IDS) + '. Não invente IDs.',
  '- O que for desejável MAS não coberto por nenhum requisito vai em gaps[] (com nearestReq), NÃO em screens[].',
  '- Proponha a MARCA do app (brand): accent (hex), neutralBase (slate/graphite/zinc/warm), radius, displayFont, vibe — coerente com o domínio (ex.: comércio=índigo/teal vibrante; operações=graphite sóbrio).',
  '- screens[].kind em dashboard|list|create|edit|detail|custom. Rotas REST (/products, /products/new, /products/:id, /products/:id/edit).',
  '- entities[].fields com tipos (text/number/currency/date/boolean/enum/status/longtext) e required.',
  '- Seja COMPLETO porém realista: cubra todas as entidades implícitas nos requisitos com CRUD; inclua 1 dashboard.',
  'Devolva o objeto do schema.',
].join('\n'), { schema: ARCHITECT_SCHEMA, label: 'arquiteto-ux', phase: 'Arquitetura UX' });

if (!architect || !architect.brand || !Array.isArray(architect.screens)) throw new Error('arquiteto-ux não retornou inventário válido');
// validação anti-fabricação: derruba âncoras inexistentes
const known = new Set(REQ_IDS);
const validAnchor = (a) => Array.isArray(a) && a.some((id) => known.has(id));
let screens = (architect.screens || []).filter((s) => REQ_IDS.length === 0 || validAnchor(s.anchors));
const dropped = (architect.screens || []).length - screens.length;
if (dropped > 0) log('⚠ ' + dropped + ' tela(s) descartada(s) por âncora inexistente (anti-alucinação).');
const entities = architect.entities || [];
const brand = architect.brand;
log('Arquiteto: ' + screens.length + ' telas, ' + entities.length + ' entidades, ' + (architect.gaps || []).length + ' lacunas. Marca: ' + brand.accent + '/' + brand.neutralBase + '.');

// ---------------- P1 — Base (marca + REFs + sync) ----------------
phase('Base + Backend');
const newEntities = entities.filter((e) => !e.hasEndpoints);
await agent([
  'Tarefa de PREPARAÇÃO da base do frontend de ' + APP + '. Faça, em ordem:',
  '1) Escreva specs/products/' + APP + '/brand.json com EXATAMENTE: ' + JSON.stringify(brand) + '',
  '2) Para cada tela do inventário, escreva um refinamento REF em specs/refinements/' + APP + '/REF-' + APP.toUpperCase() + '-NNNN.yaml (NNNN sequencial 0001..), válido contra specs/schema/refinement.schema.json: campos id, title, kind:"screen", status:"approved", scope:{product_scope:"' + APP + '"}, anchors:[{requirement_id:<um ID real da tela>, relation:"implements"}], surface:{route,name,roles:["user"]}, behavior:{states:[{name:"normal"},{name:"loading"},{name:"empty"},{name:"error"}], data:[...campos], interactions:[...]}, source:{source_paths:["specs/products/' + APP + '/product.json","' + APPDIR + '/frontend/src/views"]}, version:{baseline_version:"1.0.0",item_revision:1}. Use Read no schema se precisar. NÃO falhe o build: âncora deve existir em ' + JSON.stringify(REQ_IDS) + '.',
  '3) Rode (Bash, na raiz C:\\\\devops): node packages/ui-vue/build.mjs && node packages/design-tokens/build.mjs — sincroniza o kit + a paleta da marca para dentro do app.',
  'Inventário de telas: ' + JSON.stringify(screens.map((s) => ({ slug: s.slug, title: s.title, route: s.route, kind: s.kind, entity: s.entity, anchors: s.anchors }))),
  'Não toque em ' + APPDIR + '/tests/locked/** nem em arquivos *.generated.css / src/ui/**.',
].join('\n'), { label: 'prep-base', phase: 'Base + Backend' });

// P2 — backend das entidades que faltam (1 agente, edita arquivos compartilhados de forma coerente)
if (newEntities.length) {
  log('Backend: criando endpoints p/ ' + newEntities.map((e) => e.name).join(', '));
  await agent([
    'Você implementa o BACKEND de domínio do app ' + APP + ' (stack Node/Express estilo SICAT). Adicione CRUD REAL para as entidades abaixo, seguindo EXATAMENTE os padrões do app (leia apps/' + APP + '/api/src/db.js, server.js, repositories/ e migrations/seed).',
    'Entidades novas: ' + JSON.stringify(newEntities),
    'Para CADA entidade <name>:',
    '- Migração: tabela <name> com colunas dos fields (+ id serial, tenant_id, created_at/updated_at) — adicione no mesmo mecanismo de migrate() do db.js. Seed 2-3 linhas de exemplo.',
    '- Rotas REST finas em server.js: GET /v1/<name> (lista, suporta ?page&pageSize&sort&dir e devolve {data,total}), GET /v1/<name>/:id, POST /v1/<name>, PUT /v1/<name>/:id, DELETE /v1/<name>/:id. Use o wrap()/pool existentes. Validação mínima (campos required).',
    '- Se o app tiver openapi/openapi.yaml, ADICIONE as rotas lá (agrupe métodos por path) para o validate:openapi não acusar drift.',
    'NÃO altere ' + APPDIR + '/tests/locked/**. Rode apps/' + APP + '/api npm test se existir e estiver rápido. Mantenha o estilo (camadas: rota fina -> repo).',
    'Devolva um resumo curto (texto) das rotas adicionadas.',
  ].join('\n'), { label: 'backend-entidades', phase: 'Base + Backend' });
}

// ---------------- P3 — Telas (pipeline: build -> crítica -> correção) ----------------
phase('Telas');
const navGroups = architect.navGroups || [];
const results = await pipeline(
  screens,
  // build
  (s) => agent([
    'Você é um engenheiro frontend sênior (padrão "Opus 4.8 + reasoning + ultracode"). Implemente UMA tela Vue RICA e BONITA para o app ' + APP + ', escrevendo SOMENTE o arquivo ' + APPDIR + '/frontend/src/views/' + pascal(s.slug) + 'View.vue (não toque em outros arquivos).',
    '',
    'TELA: ' + JSON.stringify(s),
    'ENTIDADE (se houver): ' + JSON.stringify(entities.find((e) => e.name === s.entity) || null),
    '',
    'CONTRATO DE UI (siga à risca — kit, tokens --ui-*, CSP, estados, a11y):',
    CONTRACT,
    '',
    'REGRAS DURAS: use SÓ componentes do kit (import de "../ui/index.js"); SÓ tokens --ui-* em CSS; PROIBIDO style= inline / :style / v-html; renderize TODOS os estados (loading/empty/error/normal); chame só endpoints reais via "../api.js" (resourceFactory("' + (s.entity || 'records') + '") já deve existir ou será criado pelo integrador — use api.' + (s.entity || 'records') + '). Ações destrutivas via useConfirm. Toast em sucesso/erro. Responsivo + a11y.',
    'Leia 1-2 componentes em ' + APPDIR + '/frontend/src/ui/components/ se tiver dúvida de props. Veja o exemplar no contrato.',
    'Devolva o BuildResult.',
  ].join('\n'), { schema: BUILD_SCHEMA, label: 'build:' + s.slug, phase: 'Telas' }),
  // crítica adversarial
  (built, s) => !built || built.status !== 'built'
    ? built
    : agent([
        'Crítico de design ADVERSARIAL. Avalie a tela ' + APPDIR + '/frontend/src/views/' + pascal(s.slug) + 'View.vue contra a régua SICAT/GymOps. Leia o arquivo.',
        'Checklist (cada item é blocker se falhar): (1) usa SÓ o kit + tokens --ui-* (zero CSS ad-hoc/hex, zero style= inline/:style/v-html); (2) renderiza loading/empty/error/normal de verdade; (3) validação em todo input (create/edit) via useForm; (4) a11y (labels, foco, aria); (5) responsivo; (6) NÃO é feio/pobre (hierarquia, espaçamento, densidade, ações claras); (7) bate com o propósito da tela: ' + (s.purpose || s.title) + '; (8) chama só endpoints plausíveis (api.' + (s.entity || 'records') + ' / api.js).',
        'Pontue 0..1. pass=true só se score>=0.8 e zero blocker. Liste findings com fix concreto.',
        'Devolva o Critique.',
      ].join('\n'), { schema: CRITIQUE_SCHEMA, label: 'critica:' + s.slug, phase: 'Telas' }).then((c) => ({ built, critique: c })),
  // correção (1 passada) se reprovou
  (cr, s) => {
    if (!cr) return null;
    if (cr.built && cr.built.status === 'built' && cr.critique && !cr.critique.pass) {
      return agent([
        'Corrija a tela ' + APPDIR + '/frontend/src/views/' + pascal(s.slug) + 'View.vue aplicando os findings do crítico. Mantenha as REGRAS DURAS (kit + tokens --ui-*, sem style inline/v-html, todos os estados, a11y).',
        'Findings: ' + JSON.stringify(cr.critique.findings),
        'Contrato (referência): kit em ../ui/index.js; veja specs/forge/ui-kit-contract.md se precisar.',
        'Devolva o BuildResult atualizado.',
      ].join('\n'), { schema: BUILD_SCHEMA, label: 'fix:' + s.slug, phase: 'Telas' }).then((b) => ({ ...cr, built: b, fixed: true }));
    }
    return cr;
  },
);
const finalScreens = results.filter(Boolean).map((r) => (r.built ? r : { built: r }));
const builtOk = finalScreens.filter((r) => r.built && r.built.status === 'built');
log('Telas: ' + builtOk.length + '/' + screens.length + ' construídas.');

// ---------------- P4 — Integração + verificação ----------------
phase('Integração');
const verify = await agent([
  'Você INTEGRA e VERIFICA o frontend de ' + APP + '. Edite os arquivos COMPARTILHADOS do frontend para amarrar todas as telas construídas, depois valide.',
  '1) ' + APPDIR + '/frontend/src/router.js: importe TODAS as views construídas e registre as rotas (mantendo o catch-all 404 por último). Telas: ' + JSON.stringify(builtOk.map((r) => ({ comp: r.built.component || (pascal(r.built.screen) + 'View'), file: r.built.file, route: r.built.route }))),
  '2) ' + APPDIR + '/frontend/src/nav.js: monte a sidebar a partir dos grupos: ' + JSON.stringify(navGroups) + ' (use os títulos/rotas das telas; ícones unicode simples).',
  '3) ' + APPDIR + '/frontend/src/api.js: garanta um export resourceFactory para cada entidade usada: ' + JSON.stringify(entities.map((e) => e.name)) + ' (ex.: export const products = resourceFactory("products");). Mantenha health() e records.',
  '4) Rode na pasta do frontend: npm install (se preciso) && npm run build (vite). CORRIJA erros de compilação (imports, nomes) até passar — até 2 rodadas. NÃO desabilite regras nem use style inline.',
  '5) Rode na raiz C:\\\\devops: node packages/ui-vue/build.mjs --check ; node packages/design-tokens/build.mjs --check. Se acusar drift do app, rode sem --check e confira.',
  '6) Se houver ' + APPDIR + '/api/openapi/validate.mjs, rode "npm run validate:openapi" em apps/' + APP + '/api e corrija drift.',
  'NÃO toque em ' + APPDIR + '/tests/locked/**. Devolva o VerifyReport (viteBuild pass/fail é o gate principal).',
].join('\n'), { schema: VERIFY_SCHEMA, label: 'integrar-verificar', phase: 'Integração' });

const report = {
  product: APP,
  brand,
  screens_planned: screens.length,
  screens_built: builtOk.length,
  entities: entities.map((e) => e.name),
  new_backend_entities: newEntities.map((e) => e.name),
  gaps: architect.gaps || [],
  verify,
  blocked: finalScreens.filter((r) => r.built && r.built.status === 'blocked').map((r) => r.built.screen),
};
log('PRONTO — ' + APP + ': build ' + verify.viteBuild + ', ' + builtOk.length + '/' + screens.length + ' telas. Lacunas: ' + (architect.gaps || []).length + '.');
return report;

// ---------------- helpers ----------------
function pascal(slug) { return String(slug || 'screen').split(/[-_]/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(''); }
