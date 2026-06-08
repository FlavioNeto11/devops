/**
 * GALERIA / PROJETOS — fotos REAIS da RM Ambiental Brasil (importadas do site atual,
 * seção "fotos que fazem parte da história da empresa"). Os títulos descrevem a frente
 * de atuação mostrada na foto; ajuste para nomes de cases específicos quando quiser.
 * Imagens em public/images (servidas em /rmambiental/images/...).
 */
export type Project = {
  id: string;
  title: string;
  category: 'Licenciamento' | 'Engenharia' | 'Estudos' | 'Gestão';
  location: string;
  service: string;
  image: string; // arquivo em public/images
  summary: string;
};

export const projectCategories = ['Todos', 'Licenciamento', 'Engenharia', 'Estudos', 'Gestão'] as const;

export const projects: Project[] = [
  {
    id: 'p1',
    title: 'Movimentação e transporte em área rural',
    category: 'Gestão',
    location: 'Interior · SP',
    service: 'Gerenciamento de resíduos · Transporte',
    image: 'obra-rural.jpg',
    summary: 'Frente de campo com movimentação de materiais e logística em área rural, com controle operacional e ambiental.',
  },
  {
    id: 'p2',
    title: 'Terraplanagem e preparação de lote urbano',
    category: 'Engenharia',
    location: 'São Paulo · SP',
    service: 'Terraplanagem · Execução de obras',
    image: 'obra-urbana.jpg',
    summary: 'Limpeza, terraplanagem e preparação de terreno em ambiente urbano, integrando engenharia e licenciamento.',
  },
  {
    id: 'p3',
    title: 'Operação em mineração a céu aberto',
    category: 'Engenharia',
    location: 'Brasil',
    service: 'Engenharia de Minas · Licenciamento',
    image: 'mineracao.jpg',
    summary: 'Suporte técnico e regulatório integrado à atividade minerária, da viabilidade à operação.',
  },
  {
    id: 'p4',
    title: 'Implantação de energia solar',
    category: 'Gestão',
    location: 'Brasil',
    service: 'Projetos · Sustentabilidade',
    image: 'energia.jpg',
    summary: 'Soluções de energia limpa integradas à gestão ambiental e à eficiência operacional.',
  },
  {
    id: 'p5',
    title: 'Diagnóstico ambiental em área natural',
    category: 'Estudos',
    location: 'Brasil',
    service: 'Estudos de impacto · ADA',
    image: 'hero.jpg',
    summary: 'Levantamentos e estudos em áreas de relevância ambiental para fundamentar decisões e aprovações.',
  },
  {
    id: 'p6',
    title: 'Estudos em área de mata',
    category: 'Estudos',
    location: 'Brasil',
    service: 'Biologia · Geologia',
    image: 'floresta.jpg',
    summary: 'Caracterização de fauna, flora e meio físico para subsidiar o licenciamento e a tomada de decisão.',
  },
  {
    id: 'p7',
    title: 'Avaliação ambiental em área costeira',
    category: 'Estudos',
    location: 'Litoral',
    service: 'Estudos de impacto · EVA',
    image: 'costa.jpg',
    summary: 'Avaliação de viabilidade e impacto em ambiente costeiro sensível, com rigor técnico e científico.',
  },
  {
    id: 'p8',
    title: 'Consultoria técnica e documental',
    category: 'Licenciamento',
    location: 'São Paulo · SP',
    service: 'Licenciamento · Consultoria',
    image: 'consultoria.jpg',
    summary: 'Instrução técnica e documental de processos de licenciamento e regularização junto aos órgãos.',
  },
];
