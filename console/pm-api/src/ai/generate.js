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

const OPENAI_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1/chat/completions';
const MODEL = process.env.CMS_AI_MODEL || 'gpt-5-nano';
const TIMEOUT_MS = Number(process.env.CMS_AI_TIMEOUT_MS || 30_000);

// Kinds que a IA pode emitir: SOMENTE os genéricos (renderizáveis por qualquer
// portal e criáveis pelo editor). Nada de kinds específicos de um portal.
const AI_KINDS = new Set([
  'section-heading', 'rich-text', 'card-grid', 'timeline', 'accordion',
  'testimonials', 'logos', 'cta',
]);

export function aiEnabled() {
  if ((process.env.AI_ENABLED || '').toLowerCase() === 'false') return false;
  return Boolean(process.env.OPENAI_API_KEY);
}

const SYSTEM_PROMPT = `Você gera conteúdo inicial de um site institucional (portal) em pt-BR para um CMS de seções.
Responda APENAS um JSON válido com o formato:
{
  "palette": { "primary": "#hex", "accent": "#hex", "background": "#hex" },
  "pages": [
    { "slug": "home", "title": "Home", "sections": [ { "kind": "<kind>", "data": { ... } } ] }
  ]
}
Kinds permitidos e o shape do data de cada um:
- "section-heading": { "eyebrow", "title", "titleAccent", "subtitle", "center": bool }
- "rich-text": { "eyebrow", "heading", "html" }  (html simples: <p>, <ul>, <li>, <strong>)
- "card-grid": { "heading": {"eyebrow","title","titleAccent","subtitle"}, "layout": "grid", "columns": 2-4, "cards": [{"icon","title","desc"}] }
- "timeline": { "heading": {...}, "steps": [{"icon","title","desc"}] }
- "accordion": { "heading": {...}, "items": [{"q","a"}] }
- "testimonials": { "heading": {...}, "items": [{"quote","author","role"}] }
- "cta": { "title", "titleAccent", "titleTail", "text", "buttons": [{"label","kind":"proposal"}] }
Ícones: nomes do lucide-react (ex.: Sparkles, ShieldCheck, Users, Leaf, Target).
Gere conteúdo honesto e genérico (sem inventar números, clientes ou certificações).
Máximo de 3 páginas e 8 seções por página.`;

/**
 * Gera o rascunho de um portal a partir de um prompt do usuário.
 * Lança erro em qualquer falha (timeout/HTTP/JSON inválido) — quem chama marca
 * a request como failed e segue sem IA.
 */
export async function generatePortalDraft({ prompt, siteName, template, context }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        reasoning_effort: process.env.OPENAI_REASONING_EFFORT || 'low',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              `Nome do portal: ${siteName || '(sem nome)'}`,
              template ? `Template base escolhido: ${template}` : null,
              context && Object.keys(context).length ? `Contexto adicional: ${JSON.stringify(context)}` : null,
              `Descrição do dono do portal: ${prompt}`,
            ].filter(Boolean).join('\n'),
          },
        ],
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
    const parsed = JSON.parse(content);
    return sanitizeDraft(parsed);
  } finally {
    clearTimeout(timer);
  }
}

/** Valida/filtra a saída da IA: só kinds permitidos, shapes plausíveis, limites. */
export function sanitizeDraft(draft) {
  const out = { palette: null, pages: [] };
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
      .map((s) => ({ kind: s.kind, data: cleanData(s.data) }))
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

// Checagem mínima de shape por kind: o campo central precisa ter o tipo certo,
// senão a seção é descartada (melhor faltar seção do que renderizar lixo).
function sectionShapeOk({ kind, data }) {
  const str = (v) => typeof v === 'string';
  const arr = (v) => Array.isArray(v);
  switch (kind) {
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
