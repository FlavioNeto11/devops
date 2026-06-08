/**
 * Configuração central do portal. Os campos marcados com "AJUSTAR" são placeholders
 * profissionais — substitua pelos dados REAIS da RM Ambiental Brasil antes de divulgar.
 */
export const site = {
  name: 'RM Ambiental Brasil',
  shortName: 'RM Ambiental',
  basePath: '/rmambiental',
  tagline: 'Consultoria ambiental, engenharia e regularização para projetos que exigem precisão.',
  description:
    'Unimos conhecimento técnico, visão regulatória e gestão multidisciplinar para apoiar empresas em licenciamento, estudos ambientais, obras, regularizações e soluções sustentáveis em todo o Brasil.',

  // === Contato — AJUSTAR com os dados reais ===
  contact: {
    email: 'contatormambiental@gmail.com',
    whatsapp: '5511975954015', // (11) 97595-4015
    whatsappLabel: '(11) 97595-4015',
    city: 'São Paulo',
    state: 'SP',
    country: 'Brasil',
    coverage: 'Atuação em todo o território nacional',
  },

  // Opcional — deixe vazio para ocultar do rodapé. AJUSTAR.
  social: {
    linkedin: '',
    instagram: '',
  },
} as const;

export function whatsappUrl(message?: string): string {
  const text = message || 'Olá! Gostaria de falar com um especialista da RM Ambiental Brasil.';
  return `https://wa.me/${site.contact.whatsapp}?text=${encodeURIComponent(text)}`;
}

export function mailtoUrl(subject?: string, body?: string): string {
  const params = new URLSearchParams();
  params.set('subject', subject || 'Contato — RM Ambiental Brasil');
  if (body) params.set('body', body);
  return `mailto:${site.contact.email}?${params.toString()}`;
}
