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
    recordsClean: { type: 'boolean', description: 'true = nenhuma ocorrência de /records em frontend/src' },
    apiBackendConsistent: { type: 'boolean', description: 'true = todo recurso do api.js tem rota /v1/<name> real no backend (Só endpoints REAIS)' },
    viewContracts: { enum: ['pass', 'fail'], description: 'resultado do validate-view-contracts.mjs (rotas/payloads/navegação/alcançabilidade) — DEVE ser pass' },
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
  '- screens[].apiEndpoints cita SOMENTE rotas que EXISTEM no contrato/server.js lido acima; endpoint desejável que ainda NÃO existe é declarado no purpose como "endpoint novo" (o motor cria o backend depois) — nunca fingido como existente.',
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
  '2) GROUNDING DE CONTRATO (anti-fabricação): ANTES de escrever qualquer REF, LEIA o contrato REAL da API — ' + APPDIR + '/api/src/openapi/openapi.yaml (ou ' + APPDIR + '/api/openapi/openapi.yaml, o que existir) — e os repositories reais (' + APPDIR + '/api/src/repositories/*). App SEM openapi NÃO é desculpa: o contrato é a tabela de rotas do backend real — rode (Bash, na raiz C:\\\\devops) node specs/tools/extract-backend-contract.mjs --src ' + APPDIR + '/api/src e leia ' + APPDIR + '/api/src/server.js + routes/*. Rotas, campos e ENUMS citados nos REFs vêm DALI (fonte da verdade), nunca da imaginação.',
  '3) Para cada tela do inventário, escreva um refinamento REF em specs/refinements/' + APP + '/REF-' + APP.toUpperCase() + '-NNNN.yaml (NNNN sequencial 0001..), válido contra specs/schema/refinement.schema.json: campos id, title, kind:"screen", status:"approved", scope:{product_scope:"' + APP + '"}, anchors:[{requirement_id:<um ID real da tela>, relation:"implements"}], surface:{route,name,roles:["user"]}, behavior:{states:[{name:"normal"},{name:"loading"},{name:"empty"},{name:"error"}], data:[...campos], interactions:[...]}, source:{source_paths:["specs/products/' + APP + '/product.json","' + APPDIR + '/frontend/src/views"]}, version:{baseline_version:"1.0.0",item_revision:1}. Use Read no schema se precisar. NÃO falhe o build: âncora deve existir em ' + JSON.stringify(REQ_IDS) + '. REGRA DE CONTRATO em behavior.data[]: source cita SOMENTE rota que EXISTE no contrato lido no passo 2 (formato api:/v1/...) e field SOMENTE campo que existe no schema dessa rota/repository. Endpoint ou campo que AINDA NÃO existe DEVE levar contract:"proposed" no item (endpoint novo a criar — EXPLÍCITO; NUNCA finja que existe). Idem em interactions cuja action cite "MÉTODO /rota".',
  '4) VALIDAÇÃO DETERMINÍSTICA (rejeita, não conserta em silêncio): rode (Bash, na raiz C:\\\\devops) node specs/tools/validate-refinement-contract.mjs --product ' + APP + '. O validador funciona TAMBÉM sem openapi (extrai a tabela de rotas do backend real — não há mais skip). Se sair erro estruturado (route-not-in-contract / field-not-in-contract / interaction-*), CORRIJA os REFs (cite a rota/campo REAL do contrato ou marque contract:"proposed") e repita até exit 0. Confira os warnings field-unverifiable no repository real antes de manter o campo.',
  '5) Rode (Bash, na raiz C:\\\\devops): node packages/ui-vue/build.mjs && node packages/design-tokens/build.mjs — sincroniza o kit + a paleta da marca para dentro do app.',
  'Inventário de telas: ' + JSON.stringify(screens.map((s) => ({ slug: s.slug, title: s.title, route: s.route, kind: s.kind, entity: s.entity, anchors: s.anchors }))),
  'Não toque em ' + APPDIR + '/tests/locked/** nem em arquivos *.generated.css / src/ui/**.',
].join('\n'), { label: 'prep-base', phase: 'Base + Backend' });

// P2 — backend de domínio: GARANTE que TODA entidade do inventário tenha rota REAL /v1/<name>.
// NÃO confia no flag hasEndpoints do arquiteto (ele erra — ex.: marcar a entidade CENTRAL como
// já-existente e o backend ser pulado, deixando o frontend chamar uma rota 404). O agente verifica
// cada uma no server.js e cria as que faltarem — incluindo a entidade central do domínio.
if (entities.length) {
  log('Backend: verificando/criando endpoints de domínio (' + entities.map((e) => e.name).join(', ') + ')');
  await agent([
    'Você implementa o BACKEND de domínio do app ' + APP + ' (Node/Express estilo SICAT). Leia apps/' + APP + '/api/src/db.js, server.js, repositories/ e o migrate()/seed para seguir EXATAMENTE os padrões.',
    'Entidades do domínio (propostas pelo arquiteto): ' + JSON.stringify(entities),
    'REGRA DURA ("Só endpoints REAIS"): para CADA entidade <name>, rode `grep -n "/v1/<name>" apps/' + APP + '/api/src/server.js`. Se a rota NÃO existir, CRIE o backend REAL dela — IGNORE o flag hasEndpoints (o arquiteto erra; a entidade CENTRAL do domínio, ex.: tickets, PRECISA ser real, não pode ser pulada):',
    '- Migração: tabela <name> (plural) com colunas dos fields (+ id serial, tenant_id, created_at/updated_at) no migrate() do db.js. Seed 2-3 linhas de exemplo. Se a entidade referencia outra (ex.: comments.ticket_id), garanta que a tabela referenciada exista.',
    '- Repo + rotas REST finas em server.js: GET /v1/<name> (lista ?page&pageSize&sort&dir -> {data,total}), GET /v1/<name>/:id, POST /v1/<name>, PUT /v1/<name>/:id, DELETE /v1/<name>/:id (use wrap()/pool; validação mínima dos required).',
    '- openapi/openapi.yaml (se houver): ADICIONE as rotas (agrupe métodos por path) p/ o validate:openapi não acusar drift.',
    'Entidades que JÁ têm /v1/<name> no server.js: deixe como estão. NÃO altere ' + APPDIR + '/tests/locked/**. Mantenha as camadas (rota fina -> repo).',
    'Ao final, confirme: NENHUMA entidade do inventário ficou sem /v1/<name> real. Devolva um resumo das rotas criadas + a confirmação.',
  ].join('\n'), { label: 'backend-dominio', phase: 'Base + Backend' });
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
    'REGRAS DURAS: use SÓ componentes do kit (import de "../ui/index.js"); SÓ tokens --ui-* em CSS; PROIBIDO style= inline / :style / v-html; renderize TODOS os estados (loading/empty/error/normal); chame só endpoints reais via "../api.js"' + (s.entity ? (' (use api.' + s.entity + ', criado/garantido pelo integrador)') : ' (use os recursos de DOMÍNIO do api.js, ex.: api.products/api.orders)') + '. Ações destrutivas via useConfirm. Toast em sucesso/erro. Responsivo + a11y.',
    'PROIBIDO linkar/rotear para /records (é um recurso PLACEHOLDER do scaffold, não do domínio). TODO link (back/cancelar/ver/empty-action/quick-card) e TODA rota apontam para uma rota de DOMÍNIO do inventário (ex.: /products, /orders, /inventory) — NUNCA /records. Dashboard: cards/links vão para as listas de domínio.',
    'Leia 1-2 componentes em ' + APPDIR + '/frontend/src/ui/components/ se tiver dúvida de props. Veja o exemplar no contrato.',
    'Devolva o BuildResult.',
  ].join('\n'), { schema: BUILD_SCHEMA, label: 'build:' + s.slug, phase: 'Telas' }),
  // crítica adversarial
  (built, s) => !built || built.status !== 'built'
    ? built
    : agent([
        'Crítico de design ADVERSARIAL. Avalie a tela ' + APPDIR + '/frontend/src/views/' + pascal(s.slug) + 'View.vue contra a régua SICAT/GymOps. Leia o arquivo.',
        'Checklist (cada item é blocker se falhar): (1) usa SÓ o kit + tokens --ui-* (zero CSS ad-hoc/hex, zero style= inline/:style/v-html); (2) renderiza loading/empty/error/normal de verdade; (3) validação em todo input (create/edit) via useForm; (4) a11y (labels, foco, aria); (5) responsivo; (6) NÃO é feio/pobre (hierarquia, espaçamento, densidade, ações claras); (7) bate com o propósito da tela: ' + (s.purpose || s.title) + '; (8) chama só endpoints plausíveis de DOMÍNIO (api.js); (9) NENHUM link/rota para /records (placeholder do scaffold) — só rotas de domínio.',
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
  '3) ' + APPDIR + '/frontend/src/api.js: garanta um export resourceFactory para cada entidade usada: ' + JSON.stringify(entities.map((e) => e.name)) + ' (ex.: export const products = resourceFactory("products");). Mantenha health().',
  '4) REMOVA o demo genérico "records" (placeholder do scaffold): em api.js apague o export `records`; em router.js apague as rotas /records*; em nav.js qualquer item de records; apague/desreferencie ResourceListView/ResourceFormView/ResourceDetailView (use git rm/Write conforme o caso) — o router referencia SÓ as views de domínio + dashboard + 404. NENHUM arquivo em frontend/src pode conter "/records".',
  '5) BACKEND — rota de identidade: garanta GET /me em ' + APPDIR + '/api/src/server.js devolvendo a identidade da borda SSO: { email: req.header("X-Auth-Request-Email")||null, name: req.header("X-Auth-Request-Preferred-Username")||req.header("X-Auth-Request-User")||null, role: req.header("X-Auth-Request-Groups")||null }. Sem header (dev) -> {email:null} (NÃO 500). A casca chama @@BASE@@/api/me — assim mostra o usuário logado, não "Entrar". (Se o app tiver openapi, documente /me e rode validate:openapi.)',
  '6) Rode na pasta do frontend: npm install (se preciso) && npm run build (vite). CORRIJA erros de compilação (imports, nomes) até passar — até 2 rodadas. NÃO desabilite regras nem use style inline.',
  '7) Rode na raiz C:\\\\devops: node packages/ui-vue/build.mjs --check ; node packages/design-tokens/build.mjs --check. Se acusar drift do app, rode sem --check e confira.',
  '8) Se houver ' + APPDIR + '/api/openapi/validate.mjs, rode "npm run validate:openapi" em apps/' + APP + '/api e corrija drift.',
  '9) GUARDA OBRIGATÓRIA (a Forja se autocorrige): rode `grep -rn "/records" ' + APPDIR + '/frontend/src` — se houver QUALQUER ocorrência (link, rota, import, comentário de código vivo), CORRIJA até ZERO e rode de novo. Só conclua com 0 ocorrências. Reporte recordsClean=true.',
  '10) GUARDA "Só endpoints REAIS" (regra #4 do contrato; a Forja se autocorrige): para CADA recurso exportado no api.js (resourceFactory("<name>"), `= resource("<name>")`, store/objetos de domínio), rode `grep -n "/v1/<name>" ' + APPDIR + '/api/src/server.js`. Se ALGUM recurso do frontend NÃO tiver a rota /v1/<name> REAL no backend (ex.: a entidade central pulada por hasEndpoints errado), é VIOLAÇÃO — CRIE o backend dela (tabela no migrate()+seed, repo, rotas CRUD em server.js, openapi) seguindo os padrões do app; só re-aponte a view se o recurso for redundante. Repita até ZERO recursos órfãos. Confirme rodando o integration.mjs/locked se possível. Reporte apiBackendConsistent=true.',
  '11) GATE DE CONTRATO DAS VIEWS (determinístico; a Forja se autocorrige — lição do PR #211): rode (Bash, na raiz C:\\\\devops) node specs/tools/validate-view-contracts.mjs --product ' + APP + '. Ele valida CONTRA O BACKEND REAL: (a) toda rota/método chamado no api.js e nas views existe; (b) campos de payload enviados são LIDOS pelo handler (e enums batem); (c) FormData só vai para rota que aceita multipart; (d) campos de RESPOSTA lidos existem no shape do handler; (e) toda navegação (to=/router.push/wrappers) casa com o router.js; (f) toda rota do router é alcançável (ou meta:{directEntry:true}). Cada erro sai com arquivo:linha e known_fields/known_methods — CORRIJA o código apontado (cite a rota/campo REAL, nunca invente; rota de navegação órfã = ligue um call-site OU remova a rota morta) e REPITA até exit 0. NÃO enfraqueça o validador nem contorne com directEntry em massa. Reporte viewContracts=pass somente com exit 0 real.',
  'NÃO toque em ' + APPDIR + '/tests/locked/**. Devolva o VerifyReport (viteBuild pass/fail é o gate principal; recordsClean, apiBackendConsistent E viewContracts DEVEM ser true/pass).',
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
