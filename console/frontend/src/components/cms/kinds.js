/**
 * kinds.js
 * --------
 * Fonte única dos "kinds" genéricos de seção do CMS: templates de dados iniciais
 * ("Nova seção"), rótulos legíveis e o utilitário que casa um projeto/portal com
 * a app viva do cluster. Compartilhado por ContentEditor (modo lista) e
 * VisualEditor (modo visual).
 *
 * Apenas kinds GENÉRICOS (criáveis pelo editor) entram em KIND_TEMPLATES. Kinds
 * específicos de portal (hero, palestras, lead-form, stats, gallery,
 * services-detail, contact-form) são semeados e editados, não criados aqui.
 */

/** Templates de "Nova seção" — dados iniciais por kind genérico. */
export const KIND_TEMPLATES = {
  'section-heading': { label: 'Título de seção', data: { eyebrow: '', title: 'Novo título', titleAccent: '', subtitle: '', center: false } },
  'rich-text': { label: 'Texto rico', data: { eyebrow: '', heading: '', html: '<p>Novo texto…</p>' } },
  'card-grid': { label: 'Grade de cards', data: { heading: { eyebrow: '', title: 'Título', titleAccent: '', subtitle: '', center: false }, layout: 'grid', columns: 3, cards: [{ icon: 'Sparkles', title: 'Card', desc: '' }] } },
  'timeline': { label: 'Linha do tempo', data: { heading: { eyebrow: '', title: 'Como funciona', titleAccent: '' }, steps: [{ icon: 'Search', title: 'Etapa', desc: '' }] } },
  'accordion': { label: 'FAQ / Acordeão', data: { heading: { eyebrow: '', title: 'Perguntas frequentes', titleAccent: '', center: true }, items: [{ q: 'Pergunta?', a: 'Resposta.' }] } },
  'video-gallery': { label: 'Galeria de vídeos', data: { heading: { eyebrow: 'Mídia', title: 'Vídeos', titleAccent: '' }, items: [{ youtubeId: '', title: 'Vídeo', tipo: 'palestra' }] } },
  'materials': { label: 'Materiais', data: { heading: { eyebrow: 'Materiais', title: 'Recursos', titleAccent: '' }, items: [{ icon: 'FileText', title: 'Material', desc: '', kind: 'pdf', url: '', available: false }] } },
  'testimonials': { label: 'Depoimentos', data: { heading: { eyebrow: '', title: 'Depoimentos', titleAccent: '', center: true }, items: [{ quote: '', author: '', role: '' }] } },
  'logos': { label: 'Logos / marcas', data: { heading: { eyebrow: '', title: 'Quem confia', titleAccent: '' }, items: [{ name: '', logoUrl: '' }] } },
  'cta': { label: 'Chamada (CTA)', data: { title: 'Vamos conversar', titleAccent: '', titleTail: '?', text: '', buttons: [{ label: 'Solicitar proposta', kind: 'proposal', href: '' }] } },
};

/**
 * Templates de ITEM por `kind:path` — usados quando "+ adicionar item" roda numa
 * lista VAZIA (sem 1º item para clonar). Shape mínimo viável por bloco.
 */
export const ITEM_TEMPLATES = {
  'palestras:items': {
    id: '', icon: 'Mic', categoria: '', tag: '', title: 'Nova palestra', subtitle: '',
    objetivo: '', descricao: '', temasLabel: 'Temas abordados', temas: [], beneficios: [],
    modalidades: ['Palestra'], duracao: '', youtubeId: '', materiais: [],
  },
  'video-gallery:items': { id: '', youtubeId: '', title: 'Novo vídeo', tipo: 'palestra' },
};

/** Rótulo curto por kind (inclui os específicos de portal para exibição). */
export const KIND_LABEL = {
  hero: 'Hero', 'section-heading': 'Título', 'rich-text': 'Texto', 'card-grid': 'Cards',
  timeline: 'Timeline', accordion: 'FAQ', 'video-gallery': 'Vídeos', materials: 'Materiais',
  palestras: 'Palestras', testimonials: 'Depoimentos', logos: 'Logos', cta: 'CTA', 'lead-form': 'Formulário',
  stats: 'Números', gallery: 'Galeria', 'services-detail': 'Soluções', 'contact-form': 'Contato',
};

/** Casa um projeto/portal com a app viva do cluster (para o ponto verde/amarelo). */
export function liveAppFor(apps, proj) {
  if (!proj) return null;
  return (apps || []).find((a) => a && (a.app === proj.k8s_label_selector || a.app === proj.key)) || null;
}
