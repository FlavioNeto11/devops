// Árvore de conteúdo de FALLBACK (usada quando o CMS não responde). Construída a
// partir dos dados atuais do app, garantindo que o portal sempre renderize.
import type { ContentTree } from '../lib/content';
import { DEFAULT_SITE } from '../lib/site';
import { palestras, palestraCategorias } from './palestras';
import { faq } from './faq';
import { materiais } from './materiais';
import { videos } from './videos';

const homeSections = [
  {
    kind: 'hero', anchor: 'inicio',
    data: {
      eyebrow: 'Saúde mental · Neurodiversidade · NR-1',
      name: DEFAULT_SITE.name, role: DEFAULT_SITE.role,
      title: 'Saúde emocional no trabalho como ', titleAccent: 'estratégia de prevenção', titleTail: ' — e de conformidade com a NR-1.',
      intro: DEFAULT_SITE.intro,
      primaryCta: { label: 'Solicitar proposta' },
      secondaryCta: { label: 'Ver palestras', href: '#palestras' },
      axes: [
        { title: 'Prevenção', desc: 'Riscos psicossociais (NR-1)' },
        { title: 'Inclusão', desc: 'Neurodiversidade nas equipes' },
        { title: 'Liderança', desc: 'Gestão mais humana e consciente' },
      ],
      floating: [
        { icon: 'ShieldCheck', label: 'Adequação à NR-1', position: 'top-left' },
        { icon: 'Brain', label: 'Neurodiversidade', position: 'right' },
        { icon: 'HeartPulse', label: 'Saúde emocional', position: 'bottom-left' },
      ],
      photoCaption: 'Palestrante corporativa',
    },
  },
  {
    kind: 'section-heading', anchor: 'nr1',
    data: { eyebrow: 'NR-1 · vigência 2026', title: 'O que mudou na NR-1 — e por que virou ', titleAccent: 'pauta do RH e do SESMT', subtitle: 'A atualização da Norma Regulamentadora nº 1 passou a exigir que as empresas incluam os riscos psicossociais relacionados ao trabalho dentro do Gerenciamento de Riscos Ocupacionais (GRO).' },
  },
  {
    kind: 'rich-text',
    data: { html: '<p>A partir de 2026, a exigência entrou em vigor de forma expressa, ampliando a responsabilidade das organizações na prevenção de fatores que podem levar ao adoecimento mental relacionado ao trabalho. Esses fatores precisam ser <strong>identificados, avaliados e tratados</strong> pela empresa: sobrecarga, assédio, metas abusivas, falhas de comunicação, conflitos e organização inadequada do trabalho.</p><p><strong>Você não transfere a responsabilidade da empresa.</strong> Nenhum consultor, palestrante ou profissional externo elimina a responsabilidade legal da organização. O que ofereço é ajudar a empresa a <strong>demonstrar atuação preventiva</strong> e a construir um ambiente mais saudável — reduzindo riscos de adoecimento, afastamentos, conflitos e passivos trabalhistas.</p>' },
  },
  {
    kind: 'card-grid',
    data: {
      heading: { title: 'O que eu ofereço' }, layout: 'grid', columns: 3,
      cards: [
        { icon: 'FileCheck2', title: 'Evidências de prevenção' },
        { icon: 'GraduationCap', title: 'Capacitação das lideranças' },
        { icon: 'BookOpen', title: 'Educação corporativa' },
        { icon: 'Megaphone', title: 'Programas de conscientização' },
        { icon: 'Sprout', title: 'Fortalecimento da cultura organizacional' },
        { icon: 'TrendingDown', title: 'Estratégias de redução dos riscos psicossociais' },
      ],
    },
  },
  {
    kind: 'rich-text', anchor: 'sobre',
    data: { eyebrow: 'Sobre Ana Rabottini', heading: 'Desenvolvimento humano com base em neurociência e educação', html: `<p>Especialista em desenvolvimento humano, neurodiversidade e estratégias para promoção da saúde emocional no ambiente de trabalho. ${DEFAULT_SITE.intro}</p><p><strong>${DEFAULT_SITE.positioning}</strong></p>` },
  },
  {
    kind: 'timeline', anchor: 'como-trabalho',
    data: {
      heading: { eyebrow: 'Como trabalho', title: 'Do contexto da empresa à ', titleAccent: 'ação preventiva', subtitle: 'Um caminho simples e adaptável — pensado para gerar evidência de prevenção e impacto real na cultura.' },
      steps: [
        { icon: 'Search', title: 'Diagnóstico', desc: 'Entendo o contexto da empresa, o público (RH, SESMT, lideranças) e os pontos de atenção.' },
        { icon: 'PencilRuler', title: 'Conteúdo sob medida', desc: 'Adapto temas, linguagem e formato (palestra, workshop ou treinamento) ao seu objetivo.' },
        { icon: 'Presentation', title: 'Execução', desc: 'Conduzo o encontro — presencial ou online — com escuta, prática e foco em prevenção.' },
        { icon: 'Repeat', title: 'Continuidade', desc: 'Sugiro próximos passos e trilhas para sustentar a cultura de cuidado ao longo do tempo.' },
      ],
    },
  },
  {
    kind: 'card-grid', anchor: 'valores',
    data: {
      heading: { eyebrow: 'Abordagem', title: 'Princípios que guiam ', titleAccent: 'cada encontro', center: true }, layout: 'grid', columns: 4, center: true,
      cards: [
        { icon: 'Heart', title: 'Cuidado humano', desc: 'Saúde emocional tratada com acolhimento e responsabilidade — pessoas no centro.' },
        { icon: 'ShieldCheck', title: 'Prevenção real', desc: 'Foco em evidência de prevenção e na construção de ambientes mais saudáveis.' },
        { icon: 'Sparkles', title: 'Base científica', desc: 'Neuropsicopedagogia e educação aplicadas ao contexto corporativo.' },
        { icon: 'Users', title: 'Inclusão', desc: 'Neurodiversidade e diversidade como caminho para equipes mais fortes.' },
      ],
    },
  },
  {
    kind: 'palestras', anchor: 'palestras',
    data: {
      heading: { eyebrow: 'Portfólio corporativo', title: 'Palestras que conectam ', titleAccent: 'saúde mental e resultado', subtitle: 'Conteúdos para RHs, SESMT, gestores e departamentos de pessoas — da prevenção dos riscos psicossociais às campanhas temáticas. Clique para ver detalhes, vídeos e materiais.' },
      categorias: palestraCategorias.map((c) => ({ id: c.id, label: c.label })),
      items: palestras,
    },
  },
  {
    kind: 'video-gallery', anchor: 'midia',
    data: { heading: { eyebrow: 'Mídia', title: 'Veja a Ana ', titleAccent: 'em ação', subtitle: 'Trechos de palestras, entrevistas e depoimentos — para você sentir o tom e a abordagem antes de levar à sua empresa.' }, items: videos.map((v) => ({ youtubeId: v.youtubeId, title: v.title, tipo: v.tipo })) },
  },
  {
    kind: 'materials', anchor: 'materiais',
    data: { heading: { eyebrow: 'Materiais & recursos', title: 'Conteúdos para ', titleAccent: 'apoiar o seu RH', subtitle: 'Guias, e-books e checklists para ajudar a sua empresa a entender e endereçar os riscos psicossociais da NR-1 — gratuitos, à medida que ficam disponíveis.' }, items: materiais.map((m) => ({ icon: m.icon, title: m.title, desc: m.desc, kind: m.kind, url: m.url, available: m.available })) },
  },
  {
    kind: 'card-grid', anchor: 'publico',
    data: {
      heading: { eyebrow: 'Para quem', title: 'Um posicionamento que conversa com quem decide sobre ', titleAccent: 'pessoas', subtitle: 'Profissionais que estão procurando apoio justamente para a prevenção dos riscos psicossociais previstos na norma.', center: true }, layout: 'grid', columns: 4, center: true,
      cards: [
        { icon: 'Building2', title: 'RH e Gestão de Pessoas', desc: 'Áreas que buscam fortalecer cultura, clima e desenvolvimento humano.' },
        { icon: 'ShieldCheck', title: 'SESMT', desc: 'Times de saúde e segurança que precisam endereçar os riscos psicossociais da NR-1.' },
        { icon: 'UserCog', title: 'Gestores e lideranças', desc: 'Líderes que querem conduzir equipes com mais escuta e consciência emocional.' },
        { icon: 'Users', title: 'Departamentos de pessoas', desc: 'Quem busca prevenção, engajamento e redução de afastamentos e conflitos.' },
      ],
    },
  },
  {
    kind: 'accordion', anchor: 'faq',
    data: { heading: { eyebrow: 'Perguntas frequentes', title: 'Tudo o que o RH pergunta sobre a ', titleAccent: 'NR-1', subtitle: 'Respostas diretas sobre a norma, os riscos psicossociais e como funcionam as palestras e a consultoria.', center: true }, items: faq.map((f) => ({ q: f.q, a: f.a })) },
  },
  {
    kind: 'cta',
    data: {
      title: 'Vamos construir um ambiente de trabalho mais ', titleAccent: 'saudável', titleTail: '?',
      text: 'Conte o momento da sua empresa — palestra, campanha temática, treinamento de lideranças ou um programa contínuo de educação corporativa. Eu ajudo a desenhar o caminho.',
      buttons: [{ label: 'Solicitar proposta', kind: 'proposal' }, { label: 'Rever as palestras', kind: 'anchor', href: '#palestras' }],
    },
  },
];

const contatoSections = [
  { kind: 'section-heading', data: { eyebrow: 'Contato', title: 'Vamos falar sobre a ', titleAccent: 'sua empresa', subtitle: 'Palestra, campanha temática (Setembro Amarelo, Dia da Mulher), treinamento de lideranças ou um programa contínuo — me conte o contexto e eu retorno com uma proposta.' } },
  { kind: 'lead-form', data: { variant: 'page' } },
];

export const contentDefault: ContentTree = {
  project: { key: 'anarabottini', name: 'Ana Rabottini' },
  site: DEFAULT_SITE,
  pages: [
    { slug: 'home', title: 'Home', sections: homeSections },
    { slug: 'contato', title: 'Contato', sections: contatoSections },
  ],
};
