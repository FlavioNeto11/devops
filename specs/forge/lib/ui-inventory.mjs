// =============================================================================
// ui-inventory.mjs — FONTE ÚNICA dos schemas que descrevem o inventário de UI de um
// produto da Forja: FIELD / ENTITY / SCREEN / ARCHITECT_SCHEMA, mais helpers puros
// (pascal, normalizeInventory). ESM, zero-dep.
//
// Estes schemas são canônicos: o motor `generate-ui.workflow.mjs` (agente arquiteto-ux)
// EMITE um objeto ARCHITECT_SCHEMA, e o gerador de preview (`preview-ui.mjs`) o CONSOME.
// Mantendo-os aqui, os dois lados nunca divergem.
//
// Shape produzido pelo arquiteto / consumido pelo preview:
//   { brand:{name,accent,neutralBase,radius,displayFont?,vibe?},
//     entities:[{name,label,fields:[{name,label?,type,required?,enumValues?}],hasEndpoints,anchors?}],
//     screens:[{slug,title,kind,route,entity?,anchors,purpose?,components?,apiEndpoints?}],
//     navGroups?:[{group,items:[<screen.slug|route|title>]}], gaps?:[...] }
// =============================================================================

export const FIELD_TYPES = ['text', 'number', 'currency', 'date', 'datetime', 'boolean', 'enum', 'status', 'longtext'];
export const SCREEN_KINDS = ['dashboard', 'list', 'create', 'edit', 'detail', 'custom', 'calendar', 'booking'];
export const NEUTRAL_BASES = ['slate', 'graphite', 'zinc', 'warm'];
export const RADII = ['sm', 'md', 'lg'];

export const FIELD = {
  type: 'object', additionalProperties: false,
  required: ['name', 'type'],
  properties: {
    name: { type: 'string' },
    label: { type: 'string' },
    type: { enum: FIELD_TYPES },
    required: { type: 'boolean' },
    enumValues: { type: 'array', items: { type: 'string' } },
  },
};

export const ENTITY = {
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

export const SCREEN = {
  type: 'object', additionalProperties: false,
  required: ['slug', 'title', 'kind', 'route', 'anchors'],
  properties: {
    slug: { type: 'string', description: 'kebab-case único, ex.: product-list' },
    title: { type: 'string' },
    kind: { enum: SCREEN_KINDS },
    route: { type: 'string', description: 'rota começando com /, ex.: /products' },
    entity: { type: ['string', 'null'], description: 'slug da entidade (ou null p/ dashboard/custom)' },
    anchors: { type: 'array', items: { type: 'string' }, minItems: 1, description: 'IDs de requisito REAIS (>=1)' },
    purpose: { type: 'string', description: 'o que a tela faz + interações principais' },
    components: { type: 'array', items: { type: 'string' } },
    apiEndpoints: { type: 'array', items: { type: 'string' } },
  },
};

export const BRAND = {
  type: 'object', additionalProperties: false,
  required: ['name', 'accent', 'neutralBase', 'radius'],
  properties: {
    name: { type: 'string' }, accent: { type: 'string', description: 'hex, ex.: #0f766e' },
    neutralBase: { enum: NEUTRAL_BASES },
    radius: { enum: RADII }, displayFont: { type: 'string' }, vibe: { type: 'string' },
  },
};

export const ARCHITECT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['brand', 'entities', 'screens', 'navGroups', 'gaps'],
  properties: {
    brand: BRAND,
    entities: { type: 'array', items: ENTITY },
    screens: { type: 'array', items: SCREEN, minItems: 1 },
    navGroups: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['group', 'items'], properties: { group: { type: 'string' }, items: { type: 'array', items: { type: 'string' } } } } },
    gaps: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['title', 'why'], properties: { title: { type: 'string' }, why: { type: 'string' }, nearestReq: { type: 'string' }, action: { type: 'string' } } } },
  },
};

// ---- helpers PUROS -----------------------------------------------------------

// kebab/snake -> PascalCase. Usado p/ nomear o componente da view: <Pascal>View.vue.
export function pascal(slug) {
  return String(slug || 'screen')
    .split(/[-_\s/]/).filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('') || 'Screen';
}

// rótulo legível a partir de um campo/slug (espelha format.humanize do kit, sem depender dele).
export function humanizeLabel(s) {
  if (!s) return '';
  return String(s)
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

// ident — nome de campo/entidade saneado p/ IDENTIFICADOR SEGURO (vira código no .vue gerado:
// acesso por índice/membro, defs de mock). MESMA restrição da fronteira do reqhub-api
// (forge-preview.js ident). Vazio -> '' (o chamador DESCARTA o item). Defesa-de-fonte; o gerador
// ainda serializa o nome por literal (defesa-em-profundidade).
export function safeIdent(s) {
  return String(s == null ? '' : s).replace(/[^a-zA-Z0-9_]/g, '').slice(0, 60);
}

// slug seguro p/ nome de pasta/rota (a-z0-9-).
export function safeSlug(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'app';
}

// Normaliza/sanitiza um inventário cru (do arquiteto ou de um JSON de entrada) para o que o
// gerador de preview espera: campos com label, telas com kind/route válidos, entidades indexáveis.
// NÃO inventa telas; só preenche defaults seguros e descarta itens inválidos (fail-soft).
export function normalizeInventory(input) {
  const inv = input && typeof input === 'object' ? input : {};
  const brand = normalizeBrandLite(inv.brand);

  const entities = (Array.isArray(inv.entities) ? inv.entities : [])
    .map((e) => {
      if (!e || typeof e.name !== 'string') return null;
      const name = safeIdent(e.name);
      if (!name) return null; // nome vira código -> descarta o que não restou identificador
      return {
        name,
        label: e.label || humanizeLabel(name),
        hasEndpoints: e.hasEndpoints !== false,
        anchors: Array.isArray(e.anchors) ? e.anchors : [],
        fields: (Array.isArray(e.fields) ? e.fields : [])
          .map((f) => {
            if (!f || typeof f.name !== 'string') return null;
            const fname = safeIdent(f.name);
            if (!fname) return null; // idem p/ o campo
            return {
              name: fname,
              label: f.label || humanizeLabel(fname),
              type: FIELD_TYPES.includes(f.type) ? f.type : 'text',
              required: !!f.required,
              enumValues: Array.isArray(f.enumValues) ? f.enumValues.filter((v) => v != null).map(String) : undefined,
            };
          })
          .filter(Boolean),
      };
    })
    .filter(Boolean);

  const seen = new Set();
  const screens = (Array.isArray(inv.screens) ? inv.screens : [])
    .filter((s) => s && typeof s.slug === 'string' && typeof s.title === 'string')
    .map((s) => ({
      slug: s.slug,
      title: s.title,
      kind: SCREEN_KINDS.includes(s.kind) ? s.kind : 'custom',
      route: typeof s.route === 'string' && s.route.startsWith('/') ? s.route : ('/' + safeSlug(s.slug)),
      entity: typeof s.entity === 'string' && safeIdent(s.entity) ? safeIdent(s.entity) : null,
      anchors: Array.isArray(s.anchors) ? s.anchors.filter((a) => typeof a === 'string') : [],
      purpose: typeof s.purpose === 'string' ? s.purpose : '',
      components: Array.isArray(s.components) ? s.components : [],
      apiEndpoints: Array.isArray(s.apiEndpoints) ? s.apiEndpoints : [],
    }))
    .filter((s) => { if (seen.has(s.slug)) return false; seen.add(s.slug); return true; });

  const navGroups = (Array.isArray(inv.navGroups) ? inv.navGroups : [])
    .filter((g) => g && typeof g.group === 'string' && Array.isArray(g.items))
    .map((g) => ({ group: g.group, items: g.items.filter((i) => typeof i === 'string') }));

  return { brand, entities, screens, navGroups, gaps: Array.isArray(inv.gaps) ? inv.gaps : [] };
}

// brand mínima válida sem importar o módulo de tokens (que faz validação rígida de hex).
// name vira COMENTÁRIO/CSS (tokens.generated.css) e título; displayFont vira declaração CSS — saneamos
// os dois aqui (mesma restrição da fronteira do reqhub-api e do forge-brand.mjs). Defesa-em-profundidade.
function normalizeBrandLite(b) {
  const brand = b && typeof b === 'object' ? b : {};
  const name = String(brand.name == null ? '' : brand.name).replace(/\*\/|[{}]/g, '').slice(0, 80) || 'App';
  const displayFont = String(brand.displayFont == null ? '' : brand.displayFont).replace(/[^A-Za-z0-9 _-]/g, '').slice(0, 60) || 'Sora';
  return {
    name,
    accent: /^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(String(brand.accent || '')) ? brand.accent : '#4f46e5',
    neutralBase: NEUTRAL_BASES.includes(brand.neutralBase) ? brand.neutralBase : 'slate',
    radius: RADII.includes(brand.radius) ? brand.radius : 'md',
    displayFont,
    vibe: brand.vibe || '',
  };
}
