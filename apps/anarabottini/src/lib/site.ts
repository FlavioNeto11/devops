/**
 * Configuração central do portal de Ana Rabottini.
 *
 * >>> PREENCHER ANTES DE DIVULGAR <<<
 * Os campos de `contact`, `social` e `photos` estão como PLACEHOLDERS vazios.
 * Enquanto vazios, o site degrada com elegância (sem links quebrados):
 *   - botões "Solicitar proposta" levam à página /contato;
 *   - o botão flutuante de WhatsApp não aparece;
 *   - na página /contato, cada canal sem dado aparece como "a definir".
 * Basta colar os valores reais aqui — um único arquivo — e rebuildar.
 */
export const site = {
  name: 'Ana Rabottini',
  shortName: 'Ana Rabottini',
  basePath: '/anarabottini',
  role: 'Neuropsicopedagoga · Psicopedagoga Institucional · Palestrante Corporativa',
  positioning:
    'Especialista em Saúde Mental Corporativa, Neurodiversidade e Desenvolvimento Humano para adequação às novas exigências da NR-1.',
  intro:
    'Auxilio empresas a fortalecer a cultura organizacional, desenvolver lideranças mais conscientes e implementar ações preventivas relacionadas aos riscos psicossociais previstos na NR-1.',

  // === Contato — PREENCHER com os dados reais de Ana ===
  contact: {
    email: '',          // ex.: 'contato@anarabottini.com.br'
    whatsapp: '',       // ex.: '5511999999999' (E.164, só dígitos — DDI 55 + DDD + número)
    whatsappLabel: '',  // ex.: '(11) 99999-9999'
    city: '',           // ex.: 'São Paulo'
    state: '',          // ex.: 'SP'
  },

  // === Redes — PREENCHER (deixe vazio para ocultar do rodapé) ===
  social: {
    instagram: '',      // URL completa, ex.: 'https://instagram.com/...'
    linkedin: '',       // URL completa, ex.: 'https://linkedin.com/in/...'
  },

  // === Fotos — colocar arquivos em public/images/ e referenciar aqui ===
  photos: {
    hero: '',           // ex.: 'images/ana-hero.jpg' (servida em /anarabottini/images/ana-hero.jpg)
    about: '',          // ex.: 'images/ana-about.jpg'
  },
} as const;

export const hasWhatsApp = site.contact.whatsapp.trim().length > 0;
export const hasEmail = site.contact.email.trim().length > 0;
export const hasInstagram = site.social.instagram.trim().length > 0;
export const hasLinkedin = site.social.linkedin.trim().length > 0;

const DEFAULT_WA_MESSAGE =
  'Olá, Ana! Vim pelo seu site e gostaria de falar sobre uma palestra/treinamento para a minha empresa.';

/** URL do WhatsApp (wa.me) com mensagem pré-preenchida — `null` se o número não foi configurado. */
export function whatsappUrl(message?: string): string | null {
  if (!hasWhatsApp) return null;
  const text = message || DEFAULT_WA_MESSAGE;
  return `https://wa.me/${site.contact.whatsapp}?text=${encodeURIComponent(text)}`;
}

/** URL mailto com assunto — `null` se o e-mail não foi configurado. */
export function mailtoUrl(subject?: string, body?: string): string | null {
  if (!hasEmail) return null;
  const params = new URLSearchParams();
  params.set('subject', subject || 'Proposta de palestra — via site');
  if (body) params.set('body', body);
  return `mailto:${site.contact.email}?${params.toString()}`;
}
