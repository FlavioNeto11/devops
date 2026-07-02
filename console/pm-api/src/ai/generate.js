// =============================================================================
// Geração de conteúdo de portal por IA — provider mínimo do pm-api.
//
// Contrato alinhado ao padrão gpt-5 da plataforma (packages/ai-kit): modelo da
// família gpt-5 SEM temperature, com reasoning_effort baixo, timeout curto e
// falha graciosa (o CMS continua 100% funcional sem IA). Implementado com fetch
// nativo (Node 20) para não arrastar dependência; a fase 2 troca este módulo
// por @flavioneto11/ai-kit + prompts versionados no ai-control-plane
// (ex.: cms.portal.sitemap) sem mudar o contrato das rotas.
//
// Segredo: OPENAI_API_KEY vem de Secret do k8s (nunca em git/plaintext).
// =============================================================================

import { supportsVision } from '@flavioneto11/file-ingest-kit';

const OPENAI_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1/chat/completions';
const MODEL = process.env.CMS_AI_MODEL || 'gpt-5-nano';
// Modelo p/ entrada com IMAGENS (gpt-5-nano não tem visão). Mesmo contrato gpt-5 (reasoning_effort).
const VISION_MODEL = process.env.CMS_AI_VISION_MODEL || 'gpt-5';
const TIMEOUT_MS = Number(process.env.CMS_AI_TIMEOUT_MS || 60_000);

// Kinds que a IA pode emitir: os genéricos + hero (todos renderizáveis pelo
// site-renderer em /sites/<chave>). Nada de kinds específicos de um portal.
const AI_KINDS = new Set([
  'hero', 'section-heading', 'rich-text', 'card-grid', 'timeline', 'accordion',
  'testimonials', 'logos', 'cta',
]);

export function aiEnabled() {
  if ((process.env.AI_ENABLED || '').toLowerCase() === 'false') return false;
  return Boolean(process.env.OPENAI_API_KEY);
}

const SYSTEM_PROMPT = `Você gera o conteúdo COMPLETO de um site institucional (portal) em pt-BR para um CMS de seções.
Responda APENAS um JSON válido com o formato:
{
  "site": { "name": "nome do site", "tagline": "frase curta de posicionamento", "description": "1-2 frases sobre o site" },
  "palette": { "primary": "#hex", "accent": "#hex", "background": "#hex claro" },
  "pages": [
    { "slug": "home", "title": "Home", "sections": [ { "kind": "<kind>", "data": { ... } } ] }
  ]
}
Kinds permitidos e o shape do data de cada um:
- "hero": { "eyebrow", "title", "titleAccent", "titleTail", "intro", "primaryCta": {"label","kind":"proposal"}, "secondaryCta": {"label","href":"#ancora"}, "indicators": [{"title","desc"}] (3 itens) }
- "section-heading": { "eyebrow", "title", "titleAccent", "subtitle", "center": bool }
- "rich-text": { "eyebrow", "heading", "html" }  (html simples: <p>, <ul>, <li>, <strong>)
- "card-grid": { "heading": {"eyebrow","title","titleAccent","subtitle"}, "layout": "grid", "columns": 2-4, "cards": [{"icon","title","desc"}] }
- "timeline": { "heading": {...}, "steps": [{"icon","title","desc"}] }
- "accordion": { "heading": {...}, "items": [{"q","a"}] }
- "testimonials": { "heading": {...}, "items": [{"quote","author","role"}] }
- "cta": { "title", "titleAccent", "titleTail", "text", "buttons": [{"label","kind":"proposal"}] }
Regras de composição:
- A PRIMEIRA seção da home é SEMPRE um "hero" forte e específico do negócio descrito.
- Monte um site completo e coerente: home rica (hero + 4-7 seções variadas terminando em cta) e
  1-2 páginas internas quando fizer sentido (ex.: serviços/programas, sobre).
- Use a paleta combinando com o segmento (background SEMPRE claro).
Ícones: nomes do lucide-react (ex.: Sparkles, ShieldCheck, Users, Leaf, Target, Dumbbell, Heart).
Gere conteúdo honesto e genérico (sem inventar números, clientes ou certificações).
Máximo de 3 páginas e 8 seções por página.`;

/** Chamada JSON única ao modelo (timeout curto; lança em qualquer falha). */
async function callJSON(messages, modelOverride, externalSignal) {
  const model = modelOverride || MODEL;
  // reasoning_effort só existe na família gpt-5/o-series; em gpt-4o etc. seria rejeitado.
  const isReasoning = /gpt-5|^o\d/.test(model);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  // cancelamento externo (ex.: cliente fechou o stream SSE) também aborta a chamada à IA.
  if (externalSignal) {
    if (externalSignal.aborted) ctrl.abort();
    else externalSignal.addEventListener('abort', () => ctrl.abort(), { once: true });
  }
  try {
    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        ...(isReasoning ? { reasoning_effort: process.env.OPENAI_REASONING_EFFORT || 'low' } : {}),
        response_format: { type: 'json_object' },
        messages,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`OpenAI ${res.status}: ${body.slice(0, 300)}`);
    }
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string') {
      throw new Error('resposta da OpenAI sem message.content (estrutura inesperada)');
    }
    return JSON.parse(content);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Gera o rascunho de um portal a partir de um prompt do usuário.
 * Lança erro em qualquer falha (timeout/HTTP/JSON inválido) — quem chama marca
 * a request como failed e segue sem IA.
 */
export async function generatePortalDraft({ prompt, siteName, template, context, blocks, onProgress, signal }) {
  const userText = [
    `Nome do portal: ${siteName || '(sem nome)'}`,
    template ? `Template base escolhido: ${template}` : null,
    context && Object.keys(context).length ? `Contexto adicional: ${JSON.stringify(context)}` : null,
    `Descrição do dono do portal: ${prompt}`,
  ].filter(Boolean).join('\n');

  // Imagens enviadas → modelo com VISÃO + content multimodal (image_url). PDFs já vieram
  // como texto extraído no prompt (OpenAI não tem PDF nativo). Sem imagens → modelo de texto (barato).
  const images = (Array.isArray(blocks) ? blocks : []).filter((b) => b && b.type === 'image');
  let userContent = userText;
  let model = MODEL;
  if (images.length && supportsVision(VISION_MODEL)) {
    model = VISION_MODEL;
    userContent = [
      { type: 'text', text: userText },
      ...images.slice(0, 8).map((b) => ({ type: 'image_url', image_url: { url: `data:${b.mediaType};base64,${b.dataBase64}` } })),
    ];
  }

  // emite as ETAPAS ao consumidor (SSE) — onProgress é opcional (rotas síncronas não passam).
  onProgress?.('ai-start', { model, multimodal: model === VISION_MODEL, images: images.length });
  const t0 = Date.now();
  const parsed = await callJSON([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ], model, signal);
  onProgress?.('ai-done', { elapsedMs: Date.now() - t0, model });

  const draft = sanitizeDraft(parsed);
  const aiHadHero = homeHasHero(draft);     // o que a IA realmente entregou (antes do reforço)
  ensureMinimumHome(draft, siteName);       // garante home com hero + >=2 seções (estrutura mínima)
  const report = draftReport(parsed, draft);
  report.homeHasHero = aiHadHero;
  report.reinforced = !aiHadHero;           // tivemos que sintetizar o hero/estrutura
  onProgress?.('validate', report);
  return draft;
}

/** A home (ou 1ª página) já tem um hero? (estrutura mínima de um portal). */
function homeHasHero(draft) {
  const h = (draft.pages || []).find((p) => p.slug === 'home') || (draft.pages || [])[0];
  return !!(h && h.sections.some((s) => s.kind === 'hero'));
}

/** Reforço de estrutura: garante home com um hero e ao menos 2 seções (o "valide toda a estrutura").
 *  Se a IA não entregou hero, sintetiza um a partir da identidade/nome — portal nunca nasce sem cara. */
export function ensureMinimumHome(draft, siteName) {
  if (!Array.isArray(draft.pages)) draft.pages = [];
  // Mesma heurística do homeHasHero: a inicial é a 'home' OU a primeira página — assim não criamos
  // uma 'home' redundante quando a IA nomeou a inicial com outro slug (ex.: 'inicio').
  let home = draft.pages.find((p) => p.slug === 'home') || draft.pages[0];
  if (!home) { home = { slug: 'home', title: 'Home', sections: [] }; draft.pages.unshift(home); }
  if (!Array.isArray(home.sections)) home.sections = [];
  if (!home.sections.some((s) => s.kind === 'hero')) {
    const name = (draft.site && draft.site.name) || siteName || 'Bem-vindo';
    const intro = (draft.site && (draft.site.tagline || draft.site.description)) || 'Edite este conteúdo no editor visual.';
    home.sections.unshift({ kind: 'hero', data: { title: String(name).slice(0, 120), intro: String(intro).slice(0, 300) } });
  }
  if (home.sections.length < 2) {
    home.sections.push({ kind: 'cta', data: { title: 'Fale com a gente', text: '', buttons: [{ label: 'Entrar em contato', kind: 'proposal', href: '' }] } });
  }
  return draft;
}

/** Relatório de validação: o que a IA produziu vs o que sobreviveu à sanitização (visível ao usuário). */
export function draftReport(parsed, draft) {
  const rawPages = Array.isArray(parsed?.pages) ? parsed.pages : [];
  const rawKinds = rawPages.flatMap((p) => (Array.isArray(p?.sections) ? p.sections : []).map((s) => s && s.kind).filter(Boolean));
  const keptKinds = new Set(draft.pages.flatMap((p) => p.sections.map((s) => s.kind)));
  const sectionsKept = draft.pages.reduce((n, p) => n + p.sections.length, 0);
  return {
    pagesKept: draft.pages.length,
    sectionsKept,
    sectionsDropped: Math.max(0, rawKinds.length - sectionsKept),
    droppedKinds: [...new Set(rawKinds.filter((k) => !keptKinds.has(k)))],
    paletteValid: !!(draft.palette && (draft.palette.primary || draft.palette.accent)),
  };
}

// ---------------------------------------------------------------------------
// Edição assistida de UMA seção / do SITE — usada pelo botão ✨ do editor.
// O contexto sempre inclui o site inteiro (resumo) + os prompts ORIGINAIS de
// criação do portal, para a IA manter tom/segmento coerentes.
// ---------------------------------------------------------------------------
const SECTION_EDIT_PROMPT = `Você edita UMA seção de um site institucional em pt-BR num CMS de seções.
Receberá: o kind da seção, o data ATUAL (JSON), o contexto do site (identidade, resumo das páginas e
os pedidos originais do dono) e uma INSTRUÇÃO.
Responda APENAS um JSON válido no formato { "data": { ... } } com o data COMPLETO atualizado:
- mantenha o MESMO kind e o MESMO shape de campos do data atual (não invente campos novos);
- altere SOMENTE o que a instrução pede; preserve o restante exatamente como está;
- conteúdo honesto: não invente números, clientes, certificações nem dados de contato;
- ícones continuam sendo nomes do lucide-react.`;

export async function aiEditSection({ instruction, kind, data, context }) {
  const parsed = await callJSON([
    { role: 'system', content: SECTION_EDIT_PROMPT },
    {
      role: 'user',
      content: [
        `CONTEXTO DO SITE:\n${context}`,
        `KIND DA SEÇÃO: ${kind}`,
        `DATA ATUAL DA SEÇÃO:\n${JSON.stringify(data)}`,
        `INSTRUÇÃO DO USUÁRIO: ${instruction}`,
      ].join('\n\n'),
    },
  ]);
  const next = parsed && typeof parsed.data === 'object' && parsed.data && !Array.isArray(parsed.data)
    ? fixTitleSpacing(cleanData(parsed.data))
    : null;
  if (!next || !Object.keys(next).length) throw new Error('IA não retornou um data válido para a seção');
  // kinds genéricos passam pela checagem de shape; específicos de portal só pelo cleanData
  if (AI_KINDS.has(kind) && !sectionShapeOk({ kind, data: next })) {
    throw new Error('IA retornou um shape inválido para o kind da seção');
  }
  return next;
}

const SITE_EDIT_PROMPT = `Você edita a CONFIGURAÇÃO de um site institucional em pt-BR (header/rodapé/identidade).
Campos editáveis: name, tagline, description, palette { primary, accent, background } (hex; background claro)
e contact { email, whatsapp, phone, city, state }.
Responda APENAS um JSON válido { "site": { ... } } contendo SOMENTE os campos que a instrução pede para
alterar (não repita os demais). NUNCA invente dados de contato — só inclua contact se a instrução os fornecer.`;

export async function aiEditSite({ instruction, site, context }) {
  const parsed = await callJSON([
    { role: 'system', content: SITE_EDIT_PROMPT },
    {
      role: 'user',
      content: [
        `CONTEXTO DO SITE:\n${context}`,
        `CONFIGURAÇÃO ATUAL:\n${JSON.stringify(site || {})}`,
        `INSTRUÇÃO DO USUÁRIO: ${instruction}`,
      ].join('\n\n'),
    },
  ]);
  const raw = parsed && typeof parsed.site === 'object' && parsed.site && !Array.isArray(parsed.site) ? parsed.site : null;
  if (!raw) throw new Error('IA não retornou campos de site válidos');
  const s = (v, max = 300) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
  const hex = (v) => (typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : undefined);
  const out = { name: s(raw.name), tagline: s(raw.tagline), description: s(raw.description) };
  if (raw.palette && typeof raw.palette === 'object') {
    const p = { primary: hex(raw.palette.primary), accent: hex(raw.palette.accent), background: hex(raw.palette.background) };
    if (p.primary || p.accent || p.background) out.palette = p;
  }
  if (raw.contact && typeof raw.contact === 'object') {
    const c = {
      email: s(raw.contact.email, 120), whatsapp: s(raw.contact.whatsapp, 30), phone: s(raw.contact.phone, 30),
      city: s(raw.contact.city, 80), state: s(raw.contact.state, 40),
    };
    Object.keys(c).forEach((k) => c[k] === undefined && delete c[k]);
    if (Object.keys(c).length) out.contact = c;
  }
  Object.keys(out).forEach((k) => out[k] === undefined && delete out[k]);
  if (!Object.keys(out).length) throw new Error('IA não retornou nenhuma alteração aplicável');
  return out;
}

/** Valida/filtra a saída da IA: só kinds permitidos, shapes plausíveis, limites. */
export function sanitizeDraft(draft) {
  const out = { site: null, palette: null, pages: [] };
  if (draft && typeof draft.site === 'object' && draft.site && !Array.isArray(draft.site)) {
    const s = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 300) : undefined);
    out.site = { name: s(draft.site.name), tagline: s(draft.site.tagline), description: s(draft.site.description) };
    if (!out.site.name && !out.site.tagline && !out.site.description) out.site = null;
  }
  if (draft && typeof draft.palette === 'object' && draft.palette) {
    const hex = (v) => (typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : undefined);
    out.palette = {
      primary: hex(draft.palette.primary),
      accent: hex(draft.palette.accent),
      background: hex(draft.palette.background),
    };
  }
  const pages = Array.isArray(draft?.pages) ? draft.pages.slice(0, 3) : [];
  for (const p of pages) {
    const slug = typeof p?.slug === 'string' ? p.slug.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') : '';
    if (!slug) continue;
    const sections = (Array.isArray(p.sections) ? p.sections : [])
      .filter((s) => s && AI_KINDS.has(s.kind) && s.data && typeof s.data === 'object' && !Array.isArray(s.data))
      .map((s) => ({ kind: s.kind, data: fixTitleSpacing(cleanData(s.data)) }))
      .filter((s) => sectionShapeOk(s))
      .slice(0, 8);
    out.pages.push({ slug, title: typeof p.title === 'string' && p.title ? p.title : slug, sections });
  }
  return out;
}

// Mantém só tipos JSON simples (string/número/booleano/objeto/array) e poda
// profundidade/da tamanho — a IA não injeta funções, mas pode errar tipos.
function cleanData(value, depth = 0) {
  if (depth > 6) return undefined;
  if (typeof value === 'string') return value.slice(0, 8000);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.slice(0, 24).map((v) => cleanData(v, depth + 1)).filter((v) => v !== undefined);
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value).slice(0, 32)) {
      const c = cleanData(v, depth + 1);
      if (c !== undefined) out[k] = c;
    }
    return out;
  }
  return undefined;
}

// A IA às vezes emite title/titleAccent sem o espaço de junção ("SkyFitA academia…").
// Os renderers concatenam cru (o espaço pertence ao conteúdo) — normalizamos aqui,
// recursivamente (headings aninhados em card-grid/timeline/etc. também).
function fixTitleSpacing(value) {
  if (Array.isArray(value)) { value.forEach(fixTitleSpacing); return value; }
  if (!value || typeof value !== 'object') return value;
  if (typeof value.title === 'string' && typeof value.titleAccent === 'string'
    && value.title && value.titleAccent && !/[\s(\["'—–:-]$/.test(value.title) && !/^[\s,.;:!?)]/.test(value.titleAccent)) {
    value.title += ' ';
  }
  if (typeof value.titleAccent === 'string' && typeof value.titleTail === 'string'
    && value.titleAccent && value.titleTail && !/[\s]$/.test(value.titleAccent) && !/^[\s,.;:!?)—–-]/.test(value.titleTail)) {
    value.titleTail = ` ${value.titleTail}`;
  }
  Object.values(value).forEach(fixTitleSpacing);
  return value;
}

// Checagem mínima de shape por kind: o campo central precisa ter o tipo certo,
// senão a seção é descartada (melhor faltar seção do que renderizar lixo).
function sectionShapeOk({ kind, data }) {
  const str = (v) => typeof v === 'string';
  const arr = (v) => Array.isArray(v);
  switch (kind) {
    case 'hero': return str(data.title);
    case 'rich-text': return str(data.html);
    case 'section-heading': return str(data.title);
    case 'card-grid': return arr(data.cards) && data.cards.every((c) => c && str(c.title));
    case 'timeline': return arr(data.steps) && data.steps.every((s) => s && str(s.title));
    case 'accordion': return arr(data.items) && data.items.every((i) => i && str(i.q) && str(i.a));
    case 'testimonials': return arr(data.items) && data.items.every((i) => i && str(i.quote));
    case 'logos': return arr(data.items);
    case 'cta': return str(data.title);
    default: return false;
  }
}
