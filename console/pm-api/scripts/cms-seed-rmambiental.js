// =============================================================================
// Seed do CMS para o portal rmambiental. Idempotente: só semeia se o portal ainda
// não tem nenhuma seção. Reflete o conteúdo atual de apps/rmambiental (home).
// =============================================================================
import { query, withTx } from '../src/db/pool.js';

const SITE = {
  name: 'RM Ambiental Brasil',
  shortName: 'RM Ambiental',
  tagline: 'Consultoria ambiental, engenharia e regularização para projetos que exigem precisão.',
  description: 'Unimos conhecimento técnico, visão regulatória e gestão multidisciplinar para apoiar empresas em licenciamento, estudos ambientais, obras, regularizações e soluções sustentáveis em todo o Brasil.',
  contact: { email: 'contatormambiental@gmail.com', whatsapp: '5511975954015', whatsappLabel: '(11) 97595-4015', city: 'São Paulo', state: 'SP', coverage: 'Atuação em todo o território nacional' },
  social: { instagram: '', linkedin: '' },
};

const SERVICES = [
  { icon: 'ShieldCheck', title: 'Licenciamento e Regularização Ambiental', desc: 'Conformidade e segurança jurídica perante os órgãos reguladores.', bullets: ['Licenciamento Ambiental (LP, LI e LO)', 'CETESB — Licença Prévia, de Instalação e de Operação', 'IBAMA — licenciamento federal', 'SEMAD e órgãos estaduais', 'SP Regula / SIGOR', 'Alvarás e Habite-se'] },
  { icon: 'Building2', title: 'Engenharia e Projetos Técnicos', desc: 'Projeto e execução multidisciplinar com responsabilidade técnica.', bullets: ['Engenharia Ambiental', 'Engenharia Civil', 'Engenharia Elétrica', 'Engenharia de Minas', 'Agrimensura e topografia', 'Execução e gerenciamento de obras'] },
  { icon: 'FlaskConical', title: 'Estudos, Diagnósticos e Impacto', desc: 'Base técnica sólida para decisões e aprovações.', bullets: ['EIA — Estudo de Impacto Ambiental', 'RIMA — Relatório de Impacto', 'EVA — Estudo de Viabilidade Ambiental', 'EIV — Estudo de Impacto de Vizinhança', 'Gerenciamento de áreas contaminadas'] },
  { icon: 'Recycle', title: 'Gestão Ambiental e Operações', desc: 'Operação contínua, conformidade e eficiência ambiental.', bullets: ['Gerenciamento de Resíduos (PGRS / MTR)', 'Água — projetos e outorgas', 'Condomínios e Loteamentos', 'Consultoria Jurídica Ambiental', 'Tecnologia aplicada à gestão ambiental'] },
];

const SECTORS = [
  { icon: 'Factory', title: 'Indústrias', desc: 'Licenciamento, resíduos e conformidade operacional.' },
  { icon: 'Home', title: 'Loteamentos e Condomínios', desc: 'Aprovação, GRAPROHAB e regularização.' },
  { icon: 'HardHat', title: 'Construção Civil', desc: 'Projetos, alvarás, Habite-se e obras.' },
  { icon: 'Mountain', title: 'Mineração', desc: 'Engenharia de minas e licenciamento.' },
  { icon: 'Wheat', title: 'Agronegócio', desc: 'Outorgas, estudos e adequação ambiental.' },
  { icon: 'Zap', title: 'Energia', desc: 'Estudos de impacto e licenciamento.' },
  { icon: 'Droplets', title: 'Saneamento', desc: 'Recursos hídricos, outorgas e projetos.' },
  { icon: 'Building', title: 'Imobiliário', desc: 'Viabilidade, regularização e due diligence.' },
  { icon: 'TrainFront', title: 'Infraestrutura', desc: 'Projetos complexos e relacionamento regulatório.' },
  { icon: 'Landmark', title: 'Órgãos Públicos e Privados', desc: 'Consultoria técnica e assessoria especializada.' },
];

const PROCESS = [
  { icon: 'Search', title: 'Diagnóstico inicial', desc: 'Entendemos o projeto, os riscos e os objetivos para definir a estratégia.' },
  { icon: 'FileSearch', title: 'Levantamento técnico e documental', desc: 'Reunimos dados, estudos, documentação e o enquadramento legal aplicável.' },
  { icon: 'Map', title: 'Planejamento da estratégia ambiental', desc: 'Desenhamos o caminho regulatório, os marcos e os responsáveis técnicos.' },
  { icon: 'FileCheck2', title: 'Execução, estudos e protocolos', desc: 'Elaboramos estudos, projetos e conduzimos protocolos junto aos órgãos.' },
  { icon: 'BadgeCheck', title: 'Acompanhamento até a aprovação', desc: 'Tratamos exigências e acompanhamos até a aprovação ou a entrega final.' },
];

const POSITIONING = [
  { icon: 'ShieldCheck', title: 'Segurança técnica', desc: 'Responsabilidade técnica formal e decisões embasadas em dados, normas e engenharia.' },
  { icon: 'BadgeCheck', title: 'Conformidade ambiental', desc: 'Aderência integral à legislação e às exigências dos órgãos reguladores.' },
  { icon: 'Gauge', title: 'Agilidade regulatória', desc: 'Condução eficiente dos processos para reduzir prazos e destravar projetos.' },
  { icon: 'Workflow', title: 'Gestão completa do projeto', desc: 'Coordenação multidisciplinar do diagnóstico à aprovação ou entrega final.' },
];

const ESG = [
  { icon: 'Leaf', title: 'Responsabilidade ambiental', desc: 'Compromisso com a preservação em cada decisão de projeto.' },
  { icon: 'Sprout', title: 'Desenvolvimento sustentável', desc: 'Equilíbrio entre crescimento econômico e meio ambiente.' },
  { icon: 'ShieldAlert', title: 'Redução de riscos', desc: 'Antecipação de passivos e mitigação de impactos.' },
  { icon: 'ScrollText', title: 'Conformidade', desc: 'Aderência integral à legislação e às boas práticas.' },
  { icon: 'Recycle', title: 'Impacto positivo', desc: 'Soluções que geram valor ambiental e social duradouro.' },
  { icon: 'Scale', title: 'Integração estratégica', desc: 'Crescimento e preservação caminhando juntos.' },
];

const STATS = [
  { to: 250, prefix: '+', label: 'Projetos analisados' },
  { to: 15, prefix: '+', label: 'Anos de experiência' },
  { to: 12, prefix: '', label: 'Estados atendidos' },
  { to: 30, prefix: '+', label: 'Especialistas multidisciplinares' },
];
const DIFFERENTIALS = [
  'Atuação em todo o território nacional',
  'Especialistas multidisciplinares em uma só equipe',
  'Experiência em projetos técnicos complexos',
  'Relacionamento próximo com órgãos ambientais',
  'Soluções integradas: engenharia, meio ambiente e regularização',
];

const GALLERY_CATEGORIES = ['Todos', 'Obras & Terraplanagem', 'Supressão & Vegetação', 'Britagem & Mineração', 'Monitoramento', 'Serviços técnicos'];
const GALLERY = [
  ['gallery/g01.jpg', 'Obras & Terraplanagem', 'Escavadeira e caminhão na limpeza de terreno urbano'],
  ['gallery/g12.jpg', 'Obras & Terraplanagem', 'Demolição e terraplanagem com escavadeira'],
  ['gallery/g17.jpg', 'Obras & Terraplanagem', 'Terraplanagem com escavadeira de esteira'],
  ['gallery/g19.jpg', 'Obras & Terraplanagem', 'Carregamento de caminhão durante terraplanagem'],
  ['gallery/g21.jpg', 'Obras & Terraplanagem', 'Escavadeira e caminhão em obra urbana'],
  ['gallery/g11.jpg', 'Obras & Terraplanagem', 'Remoção de tocos e escavação de terreno'],
  ['gallery/g02.jpg', 'Supressão & Vegetação', 'Supressão de árvore com escavadeira'],
  ['gallery/g18.jpg', 'Supressão & Vegetação', 'Supressão de árvore em área urbana'],
  ['gallery/g05.jpg', 'Supressão & Vegetação', 'Toras de madeira após supressão vegetal'],
  ['gallery/g14.jpg', 'Supressão & Vegetação', 'Transporte de resíduos vegetais'],
  ['gallery/g22.jpg', 'Supressão & Vegetação', 'Corte e carregamento de madeira'],
  ['gallery/g10.jpg', 'Supressão & Vegetação', 'Remoção de vegetação e limpeza de terreno urbano'],
  ['gallery/g03.jpg', 'Britagem & Mineração', 'Esteiras transportadoras de agregados em pedreira'],
  ['gallery/g20.jpg', 'Britagem & Mineração', 'Britador de mandíbulas em operação'],
  ['gallery/g09.jpg', 'Britagem & Mineração', 'Beneficiamento de agregados em pedreira'],
  ['gallery/g23.jpg', 'Britagem & Mineração', 'Pilhas de agregados e esteiras em pedreira'],
  ['gallery/g06.jpg', 'Monitoramento', 'Coleta de amostras ambientais em campo'],
  ['gallery/g15.jpg', 'Monitoramento', 'Coleta de água próxima à rede de drenagem'],
  ['gallery/g13.jpg', 'Monitoramento', 'Vistoria técnica em área de vegetação'],
  ['gallery/g04.jpg', 'Monitoramento', 'Instalação de equipamento técnico em campo'],
  ['gallery/g07.jpg', 'Serviços técnicos', 'Serviço técnico especializado em campo'],
  ['gallery/g08.jpg', 'Serviços técnicos', 'Serviço técnico em via pública'],
  ['gallery/g24.jpg', 'Obras & Terraplanagem', 'Escavadeira e caçamba na movimentação de material em área rural'],
  ['gallery/g25.jpg', 'Obras & Terraplanagem', 'Terraplanagem e limpeza de lote urbano'],
].map(([file, category, alt]) => ({ file, category, alt }));

const HOME_SECTIONS = [
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
    data: { heading: { eyebrow: 'Posicionamento', title: 'Soluções ambientais com visão ', titleAccent: 'técnica, jurídica e estratégica', subtitle: 'Somos um grupo multidisciplinar de especialistas focado em soluções eficazes para problemas complexos. Atuamos em todo o território nacional, unindo precisão de engenharia, segurança jurídica e gestão ambiental de ponta a ponta.' }, layout: 'grid', columns: 4, cards: POSITIONING },
  },
  {
    kind: 'card-grid', anchor: 'solucoes',
    data: { heading: { eyebrow: 'Soluções', title: 'Quatro frentes integradas para o seu ', titleAccent: 'projeto ambiental', subtitle: 'Do licenciamento à operação — encontre rapidamente a solução certa.' }, layout: 'grid', columns: 2, cards: SERVICES },
  },
  {
    kind: 'timeline', anchor: 'processo',
    data: { heading: { eyebrow: 'Como trabalhamos', title: 'Um método claro, do ', titleAccent: 'diagnóstico à aprovação', subtitle: 'Conduzimos cada projeto por etapas bem definidas, com responsáveis e marcos transparentes.', center: true }, steps: PROCESS },
  },
  {
    kind: 'stats',
    data: { heading: { eyebrow: 'Autoridade', title: 'Sólida, técnica e ', titleAccent: 'confiável', subtitle: 'Reunimos engenharia, ciência ambiental e visão regulatória para conduzir projetos que exigem responsabilidade e precisão.' }, stats: STATS, differentials: DIFFERENTIALS, note: '* Indicadores ilustrativos — substituir pelos dados oficiais da RM Ambiental Brasil.' },
  },
  {
    kind: 'card-grid', anchor: 'setores',
    data: { heading: { eyebrow: 'Setores atendidos', title: 'Experiência aplicada a ', titleAccent: 'cada segmento', subtitle: 'Adaptamos a abordagem técnica e regulatória à realidade de cada setor.', center: true }, layout: 'grid', columns: 5, center: true, cards: SECTORS },
  },
  {
    kind: 'gallery', anchor: 'projetos',
    data: { heading: { eyebrow: 'Projetos', title: 'Trabalhos que ', titleAccent: 'falam por nós', subtitle: 'Registros reais de obras, supressão, britagem, monitoramento e serviços técnicos.', center: true }, categories: GALLERY_CATEGORIES, photos: GALLERY },
  },
  {
    kind: 'card-grid', anchor: 'esg',
    data: { heading: { eyebrow: 'ESG & Sustentabilidade', title: 'Crescimento com ', titleAccent: 'responsabilidade', subtitle: 'Projetos sólidos nascem da integração entre desenvolvimento, conformidade e preservação. A sustentabilidade é parte da engenharia.' }, layout: 'grid', columns: 3, cards: ESG },
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

const CONTATO_SECTIONS = [
  { kind: 'section-heading', data: { eyebrow: 'Contato', title: 'Vamos conversar sobre o seu ', titleAccent: 'projeto', subtitle: 'Conte o contexto, o setor e o objetivo — nossa equipe retorna com os próximos passos.' } },
];

export async function seedCmsRmambiental() {
  const { rows } = await query("SELECT id FROM projects WHERE key = 'rmambiental'");
  const projectId = rows[0]?.id;
  if (!projectId) return { cms: 'rmambiental', skipped: 'no-project' };

  const has = await query('SELECT 1 FROM cms_pages p JOIN cms_sections s ON s.page_id = p.id WHERE p.project_id = $1 LIMIT 1', [projectId]);
  if (has.rowCount) return { cms: 'rmambiental', skipped: 'already-seeded' };

  await withTx(async (client) => {
    await client.query(
      `INSERT INTO cms_site (project_id, data) VALUES ($1, $2)
       ON CONFLICT (project_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [projectId, SITE],
    );
    const insertPage = async (slug, title, pos) => {
      const { rows: pr } = await client.query(
        `INSERT INTO cms_pages (project_id, slug, title, position, status) VALUES ($1,$2,$3,$4,'published')
         ON CONFLICT (project_id, slug) DO UPDATE SET title = EXCLUDED.title, status = 'published' RETURNING id`,
        [projectId, slug, title, pos],
      );
      return pr[0].id;
    };
    const insertSections = async (pageId, sections) => {
      let pos = 0;
      for (const s of sections) {
        await client.query(
          `INSERT INTO cms_sections (page_id, kind, anchor, position, data, status, visible) VALUES ($1,$2,$3,$4,$5,'published',true)`,
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

  return { cms: 'rmambiental', seeded: HOME_SECTIONS.length + CONTATO_SECTIONS.length };
}
