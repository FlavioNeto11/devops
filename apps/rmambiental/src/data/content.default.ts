// Árvore de fallback do rmambiental (usada quando o CMS não responde).
import type { ContentTree } from '../lib/content';
import { DEFAULT_SITE } from '../lib/site';
import { serviceGroups } from './services';
import { sectors } from './sectors';
import { galleryPhotos, galleryCategories } from './projects';

const homeSections = [
  {
    kind: 'hero', anchor: 'inicio',
    data: {
      eyebrow: 'Engenharia · Meio ambiente · Regularização',
      title: 'Engenharia, licenciamento e soluções ambientais para ', titleAccent: 'projetos complexos', titleTail: ' em todo o Brasil.',
      intro: 'A RM Ambiental Brasil integra especialistas multidisciplinares para entregar segurança técnica, conformidade regulatória e eficiência em projetos ambientais, urbanos, industriais e de infraestrutura.',
      primaryCta: { label: 'Solicitar diagnóstico', kind: 'proposal' },
      secondaryCta: { label: 'Conhecer soluções', href: '/rmambiental/solucoes' },
      indicators: [
        { title: 'Nacional', desc: 'Atuação em todo o Brasil' },
        { title: 'Multidisciplinar', desc: 'Engenharia + meio ambiente' },
        { title: 'Regulatório', desc: 'Relacionamento com órgãos' },
      ],
    },
  },
  {
    kind: 'card-grid', anchor: 'sobre',
    data: {
      heading: { eyebrow: 'Posicionamento', title: 'Soluções ambientais com visão ', titleAccent: 'técnica, jurídica e estratégica', subtitle: 'Somos um grupo multidisciplinar de especialistas focado em soluções eficazes para problemas complexos. Atuamos em todo o território nacional, unindo precisão de engenharia, segurança jurídica e gestão ambiental de ponta a ponta.' },
      layout: 'grid', columns: 4,
      cards: [
        { icon: 'ShieldCheck', title: 'Segurança técnica', desc: 'Responsabilidade técnica formal e decisões embasadas em dados, normas e engenharia.' },
        { icon: 'BadgeCheck', title: 'Conformidade ambiental', desc: 'Aderência integral à legislação e às exigências dos órgãos reguladores.' },
        { icon: 'Gauge', title: 'Agilidade regulatória', desc: 'Condução eficiente dos processos para reduzir prazos e destravar projetos.' },
        { icon: 'Workflow', title: 'Gestão completa do projeto', desc: 'Coordenação multidisciplinar do diagnóstico à aprovação ou entrega final.' },
      ],
    },
  },
  {
    kind: 'card-grid', anchor: 'solucoes',
    data: {
      heading: { eyebrow: 'Soluções', title: 'Quatro frentes integradas para o seu ', titleAccent: 'projeto ambiental', subtitle: 'Do licenciamento à operação — encontre rapidamente a solução certa.' },
      layout: 'grid', columns: 2,
      cards: serviceGroups.map((g) => ({ icon: g.icon, title: g.title, desc: g.tagline, bullets: g.items.slice(0, 6) })),
    },
  },
  {
    kind: 'timeline', anchor: 'processo',
    data: {
      heading: { eyebrow: 'Como trabalhamos', title: 'Um método claro, do ', titleAccent: 'diagnóstico à aprovação', subtitle: 'Conduzimos cada projeto por etapas bem definidas, com responsáveis e marcos transparentes.', center: true },
      steps: [
        { icon: 'Search', title: 'Diagnóstico inicial', desc: 'Entendemos o projeto, os riscos e os objetivos para definir a estratégia.' },
        { icon: 'FileSearch', title: 'Levantamento técnico e documental', desc: 'Reunimos dados, estudos, documentação e o enquadramento legal aplicável.' },
        { icon: 'Map', title: 'Planejamento da estratégia ambiental', desc: 'Desenhamos o caminho regulatório, os marcos e os responsáveis técnicos.' },
        { icon: 'FileCheck2', title: 'Execução, estudos e protocolos', desc: 'Elaboramos estudos, projetos e conduzimos protocolos junto aos órgãos.' },
        { icon: 'BadgeCheck', title: 'Acompanhamento até a aprovação', desc: 'Tratamos exigências e acompanhamos até a aprovação ou a entrega final.' },
      ],
    },
  },
  {
    kind: 'stats',
    data: {
      heading: { eyebrow: 'Autoridade', title: 'Sólida, técnica e ', titleAccent: 'confiável', subtitle: 'Reunimos engenharia, ciência ambiental e visão regulatória para conduzir projetos que exigem responsabilidade e precisão.' },
      stats: [
        { to: 250, prefix: '+', label: 'Projetos analisados' },
        { to: 15, prefix: '+', label: 'Anos de experiência' },
        { to: 12, prefix: '', label: 'Estados atendidos' },
        { to: 30, prefix: '+', label: 'Especialistas multidisciplinares' },
      ],
      differentials: [
        'Atuação em todo o território nacional',
        'Especialistas multidisciplinares em uma só equipe',
        'Experiência em projetos técnicos complexos',
        'Relacionamento próximo com órgãos ambientais',
        'Soluções integradas: engenharia, meio ambiente e regularização',
      ],
      note: '* Indicadores ilustrativos — substituir pelos dados oficiais da RM Ambiental Brasil.',
    },
  },
  {
    kind: 'card-grid', anchor: 'setores',
    data: {
      heading: { eyebrow: 'Setores atendidos', title: 'Experiência aplicada a ', titleAccent: 'cada segmento', subtitle: 'Adaptamos a abordagem técnica e regulatória à realidade de cada setor.', center: true },
      layout: 'grid', columns: 5, center: true,
      cards: sectors.map((s) => ({ icon: s.icon, title: s.label, desc: s.desc })),
    },
  },
  {
    kind: 'gallery', anchor: 'projetos',
    data: {
      heading: { eyebrow: 'Projetos', title: 'Trabalhos que ', titleAccent: 'falam por nós', subtitle: 'Registros reais de obras, supressão, britagem, monitoramento e serviços técnicos.', center: true },
      categories: [...galleryCategories],
      photos: galleryPhotos.map((p) => ({ file: p.file, category: p.category, alt: p.alt })),
    },
  },
  {
    kind: 'card-grid', anchor: 'esg',
    data: {
      heading: { eyebrow: 'ESG & Sustentabilidade', title: 'Crescimento com ', titleAccent: 'responsabilidade', subtitle: 'Projetos sólidos nascem da integração entre desenvolvimento, conformidade e preservação. A sustentabilidade é parte da engenharia.' },
      layout: 'grid', columns: 3,
      cards: [
        { icon: 'Leaf', title: 'Responsabilidade ambiental', desc: 'Compromisso com a preservação em cada decisão de projeto.' },
        { icon: 'Sprout', title: 'Desenvolvimento sustentável', desc: 'Equilíbrio entre crescimento econômico e meio ambiente.' },
        { icon: 'ShieldAlert', title: 'Redução de riscos', desc: 'Antecipação de passivos e mitigação de impactos.' },
        { icon: 'ScrollText', title: 'Conformidade', desc: 'Aderência integral à legislação e às boas práticas.' },
        { icon: 'Recycle', title: 'Impacto positivo', desc: 'Soluções que geram valor ambiental e social duradouro.' },
        { icon: 'Scale', title: 'Integração estratégica', desc: 'Crescimento e preservação caminhando juntos.' },
      ],
    },
  },
  {
    kind: 'cta',
    data: {
      title: 'Seu projeto precisa de segurança ambiental, técnica e regulatória?',
      text: 'Fale com a RM Ambiental Brasil e conte com uma equipe multidisciplinar para conduzir seu projeto com responsabilidade, clareza e eficiência.',
      buttons: [{ label: 'Falar no WhatsApp', kind: 'proposal' }, { label: 'Solicitar proposta', kind: 'link', href: '/rmambiental/contato' }],
    },
  },
];

export const contentDefault: ContentTree = {
  project: { key: 'rmambiental', name: 'RM Ambiental Brasil' },
  site: DEFAULT_SITE,
  pages: [
    { slug: 'home', title: 'Home', sections: homeSections },
    { slug: 'contato', title: 'Contato', sections: [{ kind: 'section-heading', data: { eyebrow: 'Contato', title: 'Vamos conversar sobre o seu ', titleAccent: 'projeto', subtitle: 'Conte o contexto, o setor e o objetivo — nossa equipe retorna com os próximos passos.' } }] },
  ],
};
