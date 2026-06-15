// fieldKit — helpers PUROS de UX dos formulários do CMS (AutoForm).
// O usuário não precisa conhecer termos técnicos: cores viram seletor visual,
// chaves viram rótulos pt-BR, campos de escolha viram selects amigáveis e
// links do YouTube viram ID automaticamente. (Puro = testável via node.)

/** Rótulos pt-BR por chave (fallback: labelize). */
export const LABELS = {
  name: 'Nome do site',
  tagline: 'Frase de posicionamento (tagline)',
  description: 'Descrição (aparece no Google)',
  palette: 'Paleta de cores',
  primary: 'Cor principal',
  accent: 'Cor de destaque',
  background: 'Cor de fundo',
  contact: 'Contato',
  email: 'E-mail',
  whatsapp: 'WhatsApp',
  phone: 'Telefone',
  city: 'Cidade',
  state: 'UF',
  social: 'Redes sociais',
  photos: 'Fotos',
  title: 'Título',
  titleAccent: 'Parte destacada do título',
  titleTail: 'Final do título',
  subtitle: 'Subtítulo',
  eyebrow: 'Chapéu (texto pequeno acima do título)',
  intro: 'Texto de introdução',
  heading: 'Cabeçalho',
  html: 'Conteúdo',
  text: 'Texto de apoio',
  cards: 'Cards',
  steps: 'Etapas',
  items: 'Itens',
  buttons: 'Botões',
  indicators: 'Indicadores',
  floating: 'Labels flutuantes',
  axes: 'Eixos',
  stats: 'Números',
  desc: 'Descrição',
  icon: 'Ícone',
  label: 'Texto do botão/label',
  href: 'Link',
  url: 'Arquivo ou URL',
  caption: 'Legenda',
  alt: 'Texto alternativo (acessibilidade)',
  quote: 'Depoimento',
  author: 'Autor',
  role: 'Cargo/papel',
  q: 'Pergunta',
  a: 'Resposta',
  columns: 'Colunas',
  center: 'Centralizar',
  visible: 'Visível',
  available: 'Disponível',
  full: 'Largura total',
  position: 'Posição',
  kind: 'Tipo',
  youtubeId: 'Vídeo do YouTube',
  primaryCta: 'Botão principal',
  secondaryCta: 'Botão secundário',
  mapLabel: 'Label do mapa',
  mapSublabel: 'Destaque do mapa',
  photoCaption: 'Legenda da foto',
  visualImage: 'Imagem do destaque',
  layout: 'Layout',
  value: 'Número/valor',
};

export function labelize(k) {
  return String(k).replace(/([A-Z])/g, ' $1').replace(/[_-]/g, ' ').replace(/^./, (c) => c.toUpperCase());
}
export function labelFor(k) {
  return LABELS[k] || labelize(k);
}

/** Dicas exibidas sob o campo (linguagem de usuário, sem jargão). */
export const HINTS = {
  whatsapp: 'só números, com país e DDD — ex.: 5511999998888',
  youtubeId: 'cole o link do vídeo do YouTube; convertemos automaticamente',
  href: 'use #nome-da-secao para rolar até uma seção, ou um endereço completo (https://…)',
  state: 'ex.: SP',
  eyebrow: 'aquele textinho em destaque acima do título',
};
export function hintFor(k) {
  return HINTS[k] || null;
}

/** Campos internos que o usuário não deve ver/editar. */
export function isHiddenKey(k) {
  return k === 'aiPalette' || String(k).startsWith('_');
}

// ---------------------------------------------------------------------------
// Campos obrigatórios: chaves canônicas que não devem ficar vazias ao salvar.
// Marcamos com asterisco no formulário e avisamos/bloqueamos o save explícito.
// Conservador de propósito — só campos cujo vazio quebra a apresentação.
const REQUIRED_KEYS = new Set(['name', 'title', 'heading', 'label', 'q', 'a', 'quote']);

/** True quando a chave é um campo obrigatório (não pode ficar vazio). */
export function isRequiredKey(k) {
  return REQUIRED_KEYS.has(k);
}

/** True quando o valor de um campo obrigatório está "vazio" (string em branco). */
export function isEmptyRequired(k, v) {
  if (!isRequiredKey(k)) return false;
  if (v == null) return true;
  if (typeof v === 'string') return v.trim() === '';
  return false; // não-strings (números/objetos) não contam como vazios aqui
}

/**
 * Percorre `data` (recursivo) e retorna os rótulos dos campos obrigatórios
 * vazios — usado para avisar/bloquear no save. Ignora chaves internas.
 */
export function missingRequired(data, acc = []) {
  if (!data || typeof data !== 'object') return acc;
  if (Array.isArray(data)) {
    for (const item of data) missingRequired(item, acc);
    return acc;
  }
  for (const k of Object.keys(data)) {
    if (isHiddenKey(k)) continue;
    const v = data[k];
    if (isEmptyRequired(k, v)) acc.push(labelFor(k));
    else if (v && typeof v === 'object') missingRequired(v, acc);
  }
  return acc;
}

// ---------------------------------------------------------------------------
// Cores: chave de cor + valor hex (ou vazio) → seletor visual de cor.
const COLOR_KEYS = new Set(['primary', 'accent', 'background', 'color', 'colour', 'bg']);
const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export function isColorField(k, v) {
  if (typeof v !== 'string') return false;
  if (HEX_RE.test(v.trim())) return true;
  return COLOR_KEYS.has(k) && v.trim() === '';
}

/** Normaliza para o formato aceito pelo <input type="color"> (#rrggbb). */
export function toInputHex(v, fallback = '#888888') {
  const s = String(v || '').trim();
  if (!HEX_RE.test(s)) return fallback;
  if (s.length === 4) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  return s.slice(0, 7);
}

// ---------------------------------------------------------------------------
// Selects amigáveis para campos de escolha.
const POSITION_OPTIONS = [
  { value: '', label: 'Automática (segue a ordem)' },
  { value: 'top-left', label: 'Canto superior esquerdo' },
  { value: 'top-right', label: 'Canto superior direito' },
  { value: 'left', label: 'Meio à esquerda' },
  { value: 'right', label: 'Meio à direita' },
  { value: 'bottom-left', label: 'Canto inferior esquerdo' },
  { value: 'bottom-right', label: 'Canto inferior direito' },
];
const LAYOUT_OPTIONS = [
  { value: 'grid', label: 'Grade' },
  { value: 'list', label: 'Lista' },
];
const BUTTON_KIND_OPTIONS = [
  { value: 'proposal', label: 'Abrir contato (WhatsApp/e-mail do site)' },
  { value: '', label: 'Usar o campo Link' },
];

/**
 * Opções de select para a chave, se ela for "de escolha".
 * `siblings` = demais chaves do mesmo objeto (desambigua `kind` de botão vs outros).
 */
export function enumOptionsFor(k, v, siblings = []) {
  if (k === 'position' && (v === '' || POSITION_OPTIONS.some((o) => o.value === v))) return POSITION_OPTIONS;
  if (k === 'layout' && (v === '' || LAYOUT_OPTIONS.some((o) => o.value === v))) return LAYOUT_OPTIONS;
  if (k === 'kind' && siblings.includes('label') && (v === '' || v === 'proposal')) return BUTTON_KIND_OPTIONS;
  return null;
}

/** columns vira select 1–4 (em vez de número solto). */
export function isColumnsField(k) {
  return k === 'columns';
}

// ---------------------------------------------------------------------------
// Esqueleto do SITE: portal novo tem cms_site vazio e o formulário apareceria
// em branco — aqui garantimos que os campos padrão SEMPRE existam para
// preencher (o que já está salvo vence; chaves extras são preservadas).
export const SITE_SKELETON = {
  name: '',
  tagline: '',
  description: '',
  palette: { primary: '', accent: '', background: '' },
  contact: { email: '', whatsapp: '', phone: '', city: '', state: '' },
};

export function withSiteSkeleton(data) {
  const d = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  const out = { ...SITE_SKELETON, ...d };
  for (const k of ['palette', 'contact']) {
    const cur = d[k] && typeof d[k] === 'object' && !Array.isArray(d[k]) ? d[k] : {};
    out[k] = { ...SITE_SKELETON[k], ...cur };
  }
  return out;
}

// ---------------------------------------------------------------------------
// YouTube: aceita link completo (watch?v=, youtu.be, shorts, embed, live) e
// devolve só o ID; qualquer outra string passa intacta (uploads/arquivos).
export function extractYouTubeId(input) {
  const s = String(input || '').trim();
  if (!/youtube\.com|youtu\.be/i.test(s)) return s;
  const m = s.match(/(?:youtu\.be\/|v=|shorts\/|embed\/|live\/)([A-Za-z0-9_-]{6,20})/);
  return m ? m[1] : s;
}
