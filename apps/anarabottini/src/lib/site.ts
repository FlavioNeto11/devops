/**
 * Configuração do portal. `DEFAULT_SITE` é o fallback estático (usado quando o CMS
 * não responde). Em runtime, o conteúdo vem do CMS (ver lib/content.ts + SiteContext),
 * e os componentes usam `useSite()`. Os exports nomeados abaixo ficam ligados ao
 * DEFAULT_SITE por retrocompatibilidade (qualquer import antigo continua funcionando).
 */
export type SiteData = {
  name: string;
  shortName: string;
  role: string;
  positioning: string;
  intro: string;
  contact: { email: string; whatsapp: string; whatsappLabel: string; city: string; state: string };
  social: { instagram: string; linkedin: string };
  media: { youtube: string; spotify: string };
  forms: { embedUrl: string };
  photos: { hero: string; about: string };
};

export const DEFAULT_SITE: SiteData = {
  name: 'Ana Rabottini',
  shortName: 'Ana Rabottini',
  role: 'Neuropsicopedagoga · Psicopedagoga Institucional · Palestrante Corporativa',
  positioning:
    'Especialista em Saúde Mental Corporativa, Neurodiversidade e Desenvolvimento Humano para adequação às novas exigências da NR-1.',
  intro:
    'Auxilio empresas a fortalecer a cultura organizacional, desenvolver lideranças mais conscientes e implementar ações preventivas relacionadas aos riscos psicossociais previstos na NR-1.',
  contact: { email: '', whatsapp: '', whatsappLabel: '', city: '', state: '' },
  social: { instagram: '', linkedin: '' },
  media: { youtube: '', spotify: '' },
  forms: { embedUrl: '' },
  photos: { hero: '', about: '' },
};

const DEFAULT_WA_MESSAGE =
  'Olá, Ana! Vim pelo seu site e gostaria de falar sobre uma palestra/treinamento para a minha empresa.';

export type SiteApi = ReturnType<typeof makeSiteApi>;

/** Constrói os helpers (URLs/flags) a partir de um objeto de site (CMS ou default). */
export function makeSiteApi(s: SiteData) {
  const t = (v?: string) => (v || '').trim();
  const hasWhatsApp = t(s.contact?.whatsapp).length > 0;
  const hasEmail = t(s.contact?.email).length > 0;
  const hasInstagram = t(s.social?.instagram).length > 0;
  const hasLinkedin = t(s.social?.linkedin).length > 0;
  const hasYoutube = t(s.media?.youtube).length > 0;
  const hasSpotify = t(s.media?.spotify).length > 0;
  const hasFormEmbed = t(s.forms?.embedUrl).length > 0;

  const whatsappUrl = (message?: string): string | null =>
    hasWhatsApp ? `https://wa.me/${s.contact.whatsapp}?text=${encodeURIComponent(message || DEFAULT_WA_MESSAGE)}` : null;

  const mailtoUrl = (subject?: string, body?: string): string | null => {
    if (!hasEmail) return null;
    const params = new URLSearchParams();
    params.set('subject', subject || 'Proposta de palestra — via site');
    if (body) params.set('body', body);
    return `mailto:${s.contact.email}?${params.toString()}`;
  };

  return { site: s, hasWhatsApp, hasEmail, hasInstagram, hasLinkedin, hasYoutube, hasSpotify, hasFormEmbed, whatsappUrl, mailtoUrl };
}

/** Mescla a config do CMS (parcial) sobre o DEFAULT_SITE. */
export function mergeSite(partial?: Partial<SiteData> | null): SiteData {
  const p = partial || {};
  return {
    ...DEFAULT_SITE,
    ...p,
    contact: { ...DEFAULT_SITE.contact, ...(p.contact || {}) },
    social: { ...DEFAULT_SITE.social, ...(p.social || {}) },
    media: { ...DEFAULT_SITE.media, ...(p.media || {}) },
    forms: { ...DEFAULT_SITE.forms, ...(p.forms || {}) },
    photos: { ...DEFAULT_SITE.photos, ...(p.photos || {}) },
  };
}

// === YouTube (independente de site) ===
export function youtubeEmbed(id: string, opts?: { autoplay?: boolean }): string | null {
  if (!id) return null;
  const p = new URLSearchParams({ rel: '0', modestbranding: '1' });
  if (opts?.autoplay) p.set('autoplay', '1');
  return `https://www.youtube-nocookie.com/embed/${id}?${p.toString()}`;
}
export function youtubePoster(id: string): string | null {
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
}

// === Retrocompatibilidade (fallback estático = DEFAULT_SITE) ===
export const site = DEFAULT_SITE;
const _def = makeSiteApi(DEFAULT_SITE);
export const hasWhatsApp = _def.hasWhatsApp;
export const hasEmail = _def.hasEmail;
export const hasInstagram = _def.hasInstagram;
export const hasLinkedin = _def.hasLinkedin;
export const hasYoutube = _def.hasYoutube;
export const hasFormEmbed = _def.hasFormEmbed;
export const whatsappUrl = _def.whatsappUrl;
export const mailtoUrl = _def.mailtoUrl;
