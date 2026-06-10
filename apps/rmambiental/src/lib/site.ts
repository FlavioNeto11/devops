/**
 * Configuração do portal RM Ambiental. `DEFAULT_SITE` é o fallback estático; em
 * runtime o conteúdo vem do CMS (lib/content.ts + SiteContext) e os componentes
 * usam `useSite()`. Os exports nomeados ficam ligados ao DEFAULT_SITE (retrocompat).
 */
export type SiteData = {
  name: string;
  shortName: string;
  basePath: string;
  tagline: string;
  description: string;
  contact: { email: string; whatsapp: string; whatsappLabel: string; city: string; state: string; country?: string; coverage?: string };
  social: { linkedin: string; instagram: string };
};

export const DEFAULT_SITE: SiteData = {
  name: 'RM Ambiental Brasil',
  shortName: 'RM Ambiental',
  basePath: '/rmambiental',
  tagline: 'Consultoria ambiental, engenharia e regularização para projetos que exigem precisão.',
  description:
    'Unimos conhecimento técnico, visão regulatória e gestão multidisciplinar para apoiar empresas em licenciamento, estudos ambientais, obras, regularizações e soluções sustentáveis em todo o Brasil.',
  contact: {
    email: 'contatormambiental@gmail.com',
    whatsapp: '5511975954015',
    whatsappLabel: '(11) 97595-4015',
    city: 'São Paulo',
    state: 'SP',
    country: 'Brasil',
    coverage: 'Atuação em todo o território nacional',
  },
  social: { linkedin: '', instagram: '' },
};

export type SiteApi = ReturnType<typeof makeSiteApi>;

export function makeSiteApi(s: SiteData) {
  const t = (v?: string) => (v || '').trim();
  const hasWhatsApp = t(s.contact?.whatsapp).length > 0;
  const hasEmail = t(s.contact?.email).length > 0;
  const hasInstagram = t(s.social?.instagram).length > 0;
  const hasLinkedin = t(s.social?.linkedin).length > 0;

  const whatsappUrl = (message?: string): string => {
    const text = message || 'Olá! Gostaria de falar com um especialista da RM Ambiental Brasil.';
    return `https://wa.me/${s.contact.whatsapp || ''}?text=${encodeURIComponent(text)}`;
  };
  const mailtoUrl = (subject?: string, body?: string): string => {
    const params = new URLSearchParams();
    params.set('subject', subject || 'Contato — RM Ambiental Brasil');
    if (body) params.set('body', body);
    return `mailto:${s.contact.email || ''}?${params.toString()}`;
  };

  return { site: s, hasWhatsApp, hasEmail, hasInstagram, hasLinkedin, whatsappUrl, mailtoUrl };
}

export function mergeSite(partial?: Partial<SiteData> | null): SiteData {
  const p = partial || {};
  return {
    ...DEFAULT_SITE,
    ...p,
    contact: { ...DEFAULT_SITE.contact, ...(p.contact || {}) },
    social: { ...DEFAULT_SITE.social, ...(p.social || {}) },
  };
}

// Retrocompatibilidade (fallback estático = DEFAULT_SITE).
export const site = DEFAULT_SITE;
const _def = makeSiteApi(DEFAULT_SITE);
export const whatsappUrl = _def.whatsappUrl;
export const mailtoUrl = _def.mailtoUrl;
