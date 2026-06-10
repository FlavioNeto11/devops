// =============================================================================
// Seed do CMS para o portal anarabottini: converte o conteudo atual (hardcoded
// no app) em cms_site + cms_pages + cms_sections. Idempotente: so semeia se o
// portal ainda nao tem nenhuma secao (nao sobrescreve edicoes do editor).
// Deve refletir o conteudo de apps/anarabottini (paridade no dia 1).
// =============================================================================
import { query, withTx } from '../src/db/pool.js';

const SITE = {
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

const PALESTRAS = [
  {
    id: 'nr1-saude-mental', icon: 'ShieldCheck', categoria: 'nr1',
    title: 'NR-1 e Saúde Mental nas Organizações',
    objetivo: 'Capacitar gestores e equipes para compreender os fatores de risco psicossociais e construir ambientes de trabalho mais saudáveis.',
    descricao: 'Uma leitura prática das novas exigências da NR-1 sobre riscos psicossociais e do papel das lideranças na prevenção. A empresa entende o que precisa identificar, avaliar e tratar — e como demonstrar atuação preventiva no dia a dia.',
    temasLabel: 'Temas abordados',
    temas: ['Fatores de risco psicossociais', 'Exigências da NR-1 e o GRO', 'Construção de ambientes saudáveis', 'Papel das lideranças na prevenção'],
    beneficios: ['Maior conscientização das lideranças', 'Fortalecimento da cultura preventiva', 'Redução de conflitos internos', 'Apoio às exigências da NR-1', 'Melhoria do clima organizacional'],
    modalidades: ['Palestra', 'Workshop', 'Treinamento in-company'], duracao: '60–90 min', youtubeId: '', materiais: [],
  },
  {
    id: 'bem-estar', icon: 'HeartPulse', categoria: 'bem-estar',
    title: 'Saúde Mental e Bem-Estar no Trabalho',
    objetivo: 'Promover saúde emocional preventiva e dar às equipes ferramentas práticas para lidar com a pressão do dia a dia.',
    descricao: 'Conteúdo voltado ao cuidado emocional cotidiano: como reconhecer o estresse ocupacional, prevenir o burnout e cultivar equilíbrio — com impacto direto em engajamento e produtividade.',
    temasLabel: 'Temas abordados',
    temas: ['Estresse ocupacional', 'Burnout', 'Autorregulação emocional', 'Equilíbrio entre vida pessoal e profissional', 'Saúde emocional preventiva'],
    beneficios: ['Redução do absenteísmo', 'Aumento do engajamento', 'Melhora da produtividade'],
    modalidades: ['Palestra', 'Workshop', 'Treinamento in-company'], duracao: '60–90 min', youtubeId: '', materiais: [],
  },
  {
    id: 'neurodiversidade', icon: 'Infinity', categoria: 'neurodiversidade',
    title: 'Neurodiversidade nas Empresas',
    objetivo: 'Apoiar a inclusão de profissionais neurodivergentes e a potencialização de talentos em equipes diversas.',
    descricao: 'Como criar ambientes que acolhem e potencializam profissionais neurodivergentes — do entendimento do TDAH no trabalho à comunicação e gestão de equipes diversas, transformando diversidade em inovação.',
    temasLabel: 'Temas abordados',
    temas: ['TDAH no ambiente corporativo', 'Inclusão de profissionais neurodivergentes', 'Comunicação e gestão de equipes diversas', 'Potencialização de talentos'],
    beneficios: ['Ambientes mais inclusivos', 'Retenção de talentos', 'Maior inovação'],
    modalidades: ['Palestra', 'Workshop', 'Treinamento in-company'], duracao: '60–90 min', youtubeId: '', materiais: [],
  },
  {
    id: 'lideranca-humanizada', icon: 'Users', categoria: 'lideranca',
    title: 'Liderança Humanizada',
    objetivo: 'Desenvolver líderes mais preparados para conduzir pessoas com escuta, comunicação e gestão emocional.',
    descricao: 'Desenvolvimento de lideranças que conduzem pessoas com escuta ativa, comunicação assertiva e inteligência emocional — base para equipes mais engajadas e menor rotatividade.',
    temasLabel: 'Temas abordados',
    temas: ['Comunicação assertiva', 'Escuta ativa', 'Gestão emocional', 'Prevenção de conflitos'],
    beneficios: ['Líderes mais preparados', 'Equipes mais engajadas', 'Menor rotatividade'],
    modalidades: ['Palestra', 'Workshop', 'Treinamento in-company'], duracao: '60–90 min', youtubeId: '', materiais: [],
  },
  {
    id: 'setembro-amarelo', icon: 'LifeBuoy', categoria: 'campanha', tag: 'Setembro Amarelo',
    title: 'Setembro Amarelo', subtitle: '“Cuidar da saúde emocional é cuidar da vida”',
    objetivo: 'Sensibilizar a organização para a valorização da vida e a identificação precoce do sofrimento psicológico.',
    descricao: 'Palestra de campanha para o Setembro Amarelo: acolhimento, rede de apoio e identificação precoce do sofrimento psicológico — com linguagem cuidadosa e foco na valorização da vida.',
    temasLabel: 'Conteúdo',
    temas: ['Rede de apoio', 'Autoconhecimento', 'Saúde emocional', 'Identificação precoce de sofrimento psicológico'],
    beneficios: ['Ambiente de acolhimento e escuta', 'Cultura de cuidado e prevenção', 'Quebra de estigmas sobre saúde mental'],
    modalidades: ['Palestra', 'Workshop'], duracao: '60 min', youtubeId: '', materiais: [],
  },
  {
    id: 'dia-da-mulher', icon: 'HandHeart', categoria: 'campanha', tag: 'Dia Internacional da Mulher',
    title: 'Dia Internacional da Mulher', subtitle: '“Saúde emocional feminina e os desafios da mulher no mercado de trabalho”',
    objetivo: 'Abordar a saúde emocional feminina e os desafios específicos da mulher no ambiente profissional.',
    descricao: 'Palestra de campanha para o Dia Internacional da Mulher: sobrecarga mental, dupla jornada e síndrome da impostora, com um olhar para o desenvolvimento profissional saudável.',
    temasLabel: 'Temas abordados',
    temas: ['Sobrecarga mental', 'Dupla jornada', 'Síndrome da impostora', 'Desenvolvimento profissional saudável'],
    beneficios: ['Valorização das mulheres na organização', 'Apoio ao desenvolvimento profissional saudável', 'Ambiente mais equânime e consciente'],
    modalidades: ['Palestra', 'Workshop'], duracao: '60 min', youtubeId: '', materiais: [],
  },
];

const FAQ = [
  { q: 'O que mudou na NR-1 em relação aos riscos psicossociais?', a: 'A atualização da NR-1 passou a exigir que as empresas incluam os riscos psicossociais relacionados ao trabalho dentro do Gerenciamento de Riscos Ocupacionais (GRO). Fatores como sobrecarga, assédio, metas abusivas, falhas de comunicação, conflitos e organização inadequada do trabalho precisam ser identificados, avaliados e tratados pela empresa.' },
  { q: 'Uma palestra ou consultoria isenta a empresa da responsabilidade legal?', a: 'Não. Nenhum consultor, palestrante ou profissional externo elimina a responsabilidade legal da organização. O trabalho ajuda a empresa a demonstrar atuação preventiva e a construir um ambiente mais saudável — reduzindo riscos de adoecimento, afastamentos, conflitos e passivos.' },
  { q: 'O que são riscos psicossociais?', a: 'São fatores ligados à organização do trabalho que podem afetar a saúde mental das pessoas — entre eles sobrecarga, assédio, metas abusivas, falhas de comunicação e conflitos. A NR-1 pede que sejam tratados de forma preventiva.' },
  { q: 'Como funciona uma palestra ou treinamento in-company?', a: 'A partir do contexto da sua empresa, o conteúdo é adaptado ao público (RH, SESMT, lideranças ou equipes). Os formatos incluem palestra, workshop ou treinamento, presencial ou online, com duração combinada conforme o objetivo.' },
  { q: 'Vocês atendem campanhas como Setembro Amarelo e Dia da Mulher?', a: 'Sim. Há conteúdos específicos para o calendário corporativo, com foco em valorização da vida, acolhimento, saúde emocional e nos desafios da mulher no mercado de trabalho.' },
  { q: 'Para quem são indicadas as palestras e a consultoria?', a: 'Para áreas que decidem sobre pessoas: RH e gestão de pessoas, SESMT, gestores e lideranças e departamentos de pessoas que buscam prevenção, engajamento e um ambiente de trabalho mais saudável.' },
  { q: 'Como solicitar uma proposta?', a: 'Pelo WhatsApp ou pelo formulário de contato, descrevendo o momento da empresa, o público e o formato desejado. O retorno traz uma proposta adequada à sua necessidade.' },
];

const MATERIAIS = [
  { id: 'ebook-nr1', icon: 'BookOpen', title: 'E-book: NR-1 e riscos psicossociais', desc: 'Visão geral didática das novas exigências e do que RH e SESMT precisam endereçar.', kind: 'pdf', url: '', available: false },
  { id: 'guia-riscos', icon: 'FileText', title: 'Guia de riscos psicossociais', desc: 'Os principais fatores (sobrecarga, assédio, metas abusivas…) e os sinais de atenção.', kind: 'pdf', url: '', available: false },
  { id: 'checklist-rh', icon: 'ListChecks', title: 'Checklist preventivo para o RH', desc: 'Pontos práticos para iniciar ações educativas de prevenção na sua empresa.', kind: 'pdf', url: '', available: false },
  { id: 'calendario-campanhas', icon: 'CalendarHeart', title: 'Calendário de campanhas de saúde emocional', desc: 'Datas e ideias para Setembro Amarelo, Dia da Mulher e outras ações ao longo do ano.', kind: 'pdf', url: '', available: false },
];

const VIDEOS = [
  { id: 'apresentacao', youtubeId: '', title: 'Apresentação — quem é Ana Rabottini', tipo: 'entrevista', featured: true },
  { id: 'palestra-nr1', youtubeId: '', title: 'Trecho — NR-1 e saúde mental nas organizações', tipo: 'palestra' },
  { id: 'palestra-neuro', youtubeId: '', title: 'Trecho — Neurodiversidade nas empresas', tipo: 'palestra' },
];

const HOME_SECTIONS = [
  {
    kind: 'hero', anchor: 'inicio',
    data: {
      eyebrow: 'Saúde mental · Neurodiversidade · NR-1',
      name: 'Ana Rabottini',
      role: SITE.role,
      title: 'Saúde emocional no trabalho como ', titleAccent: 'estratégia de prevenção', titleTail: ' — e de conformidade com a NR-1.',
      intro: SITE.intro,
      primaryCta: { label: 'Solicitar proposta' },
      secondaryCta: { label: 'Ver palestras', href: '#palestras' },
      axes: [
        { title: 'Prevenção', desc: 'Riscos psicossociais (NR-1)' },
        { title: 'Inclusão', desc: 'Neurodiversidade nas equipes' },
        { title: 'Liderança', desc: 'Gestão mais humana e consciente' },
      ],
      floating: [
        { icon: 'ShieldCheck', label: 'Adequação à NR-1' },
        { icon: 'Brain', label: 'Neurodiversidade' },
        { icon: 'HeartPulse', label: 'Saúde emocional' },
      ],
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
      heading: { eyebrow: '', title: 'O que eu ofereço', subtitle: '' },
      layout: 'grid', columns: 3,
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
    data: { eyebrow: 'Sobre Ana Rabottini', heading: 'Desenvolvimento humano com base em neurociência e educação', html: `<p>Especialista em desenvolvimento humano, neurodiversidade e estratégias para promoção da saúde emocional no ambiente de trabalho. ${SITE.intro}</p><p><strong>${SITE.positioning}</strong></p><p>Neuropsicopedagoga · Psicopedagoga Institucional · Palestrante Corporativa.</p>` },
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
      heading: { eyebrow: 'Abordagem', title: 'Princípios que guiam ', titleAccent: 'cada encontro', center: true },
      layout: 'grid', columns: 4, center: true,
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
      categorias: [
        { id: 'todas', label: 'Todas' }, { id: 'nr1', label: 'NR-1' }, { id: 'bem-estar', label: 'Bem-estar' },
        { id: 'neurodiversidade', label: 'Neurodiversidade' }, { id: 'lideranca', label: 'Liderança' }, { id: 'campanha', label: 'Campanhas' },
      ],
      items: PALESTRAS,
    },
  },
  {
    kind: 'video-gallery', anchor: 'midia',
    data: { heading: { eyebrow: 'Mídia', title: 'Veja a Ana ', titleAccent: 'em ação', subtitle: 'Trechos de palestras, entrevistas e depoimentos — para você sentir o tom e a abordagem antes de levar à sua empresa.' }, items: VIDEOS },
  },
  {
    kind: 'materials', anchor: 'materiais',
    data: { heading: { eyebrow: 'Materiais & recursos', title: 'Conteúdos para ', titleAccent: 'apoiar o seu RH', subtitle: 'Guias, e-books e checklists para ajudar a sua empresa a entender e endereçar os riscos psicossociais da NR-1 — gratuitos, à medida que ficam disponíveis.' }, items: MATERIAIS },
  },
  {
    kind: 'card-grid', anchor: 'publico',
    data: {
      heading: { eyebrow: 'Para quem', title: 'Um posicionamento que conversa com quem decide sobre ', titleAccent: 'pessoas', subtitle: 'Profissionais que estão procurando apoio justamente para a prevenção dos riscos psicossociais previstos na norma.', center: true },
      layout: 'grid', columns: 4, center: true,
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
    data: { heading: { eyebrow: 'Perguntas frequentes', title: 'Tudo o que o RH pergunta sobre a ', titleAccent: 'NR-1', subtitle: 'Respostas diretas sobre a norma, os riscos psicossociais e como funcionam as palestras e a consultoria.', center: true }, items: FAQ },
  },
  {
    kind: 'cta',
    data: {
      title: 'Vamos construir um ambiente de trabalho mais ', titleAccent: 'saudável', titleTail: '?',
      text: 'Conte o momento da sua empresa — palestra, campanha temática, treinamento de lideranças ou um programa contínuo de educação corporativa. Eu ajudo a desenhar o caminho.',
      buttons: [ { label: 'Solicitar proposta', kind: 'proposal' }, { label: 'Rever as palestras', kind: 'anchor', href: '#palestras' } ],
    },
  },
];

const CONTATO_SECTIONS = [
  {
    kind: 'section-heading',
    data: { eyebrow: 'Contato', title: 'Vamos falar sobre a ', titleAccent: 'sua empresa', subtitle: 'Palestra, campanha temática (Setembro Amarelo, Dia da Mulher), treinamento de lideranças ou um programa contínuo — me conte o contexto e eu retorno com uma proposta.' },
  },
  { kind: 'lead-form', data: { variant: 'page' } },
];

export async function seedCmsAnarabottini() {
  const { rows } = await query("SELECT id FROM projects WHERE key = 'anarabottini'");
  const projectId = rows[0]?.id;
  if (!projectId) return { cms: 'anarabottini', skipped: 'no-project' };

  const has = await query(
    'SELECT 1 FROM cms_pages p JOIN cms_sections s ON s.page_id = p.id WHERE p.project_id = $1 LIMIT 1',
    [projectId],
  );
  if (has.rowCount) return { cms: 'anarabottini', skipped: 'already-seeded' };

  await withTx(async (client) => {
    await client.query(
      `INSERT INTO cms_site (project_id, data) VALUES ($1, $2)
       ON CONFLICT (project_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [projectId, SITE],
    );

    const insertPage = async (slug, title, pos) => {
      const { rows: pr } = await client.query(
        `INSERT INTO cms_pages (project_id, slug, title, position, status)
         VALUES ($1, $2, $3, $4, 'published')
         ON CONFLICT (project_id, slug) DO UPDATE SET title = EXCLUDED.title, status = 'published'
         RETURNING id`,
        [projectId, slug, title, pos],
      );
      return pr[0].id;
    };
    const insertSections = async (pageId, sections) => {
      let pos = 0;
      for (const s of sections) {
        await client.query(
          `INSERT INTO cms_sections (page_id, kind, anchor, position, data, status, visible)
           VALUES ($1, $2, $3, $4, $5, 'published', true)`,
          [pageId, s.kind, s.anchor ?? null, pos, s.data],
        );
        pos += 1;
      }
    };

    const homeId = await insertPage('home', 'Home', 0);
    await insertSections(homeId, HOME_SECTIONS);
    const contatoId = await insertPage('contato', 'Contato', 1);
    await insertSections(contatoId, CONTATO_SECTIONS);
  });

  return { cms: 'anarabottini', seeded: HOME_SECTIONS.length + CONTATO_SECTIONS.length };
}
