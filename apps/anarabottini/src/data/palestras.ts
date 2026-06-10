import {
  ShieldCheck,
  HeartPulse,
  Infinity as InfinityIcon,
  Users,
  LifeBuoy,
  HandHeart,
  type LucideIcon,
} from 'lucide-react';

export type PalestraCategoria = 'nr1' | 'bem-estar' | 'neurodiversidade' | 'lideranca' | 'campanha';
export type PalestraModalidade = 'Palestra' | 'Workshop' | 'Treinamento in-company';
export type Material = { label: string; url: string; kind: 'pdf' | 'link' | 'form' };

export type Palestra = {
  id: string;
  icon: LucideIcon;
  categoria: PalestraCategoria;
  title: string;
  /** Subtítulo opcional — usado para o nome da palestra em datas temáticas. */
  subtitle?: string;
  objetivo: string;
  /** Parágrafo mais longo, exibido no modal de detalhe. */
  descricao?: string;
  /** Rótulo do bloco de tópicos ("Temas abordados" ou "Conteúdo"). */
  temasLabel: string;
  temas: string[];
  beneficios: string[];
  /** Formatos oferecidos (chips no modal). */
  modalidades?: PalestraModalidade[];
  /** Duração aproximada, ex.: "60–90 min". */
  duracao?: string;
  /** Id do vídeo do YouTube (placeholder — vazio mostra "vídeo em breve"). */
  videoId?: string;
  /** Materiais relacionados (placeholder). */
  materiais?: Material[];
  /** Marca datas/campanhas (Setembro Amarelo, Dia da Mulher). */
  tag?: string;
};

/** Categorias para o filtro de palestras (a primeira, "todas", não filtra). */
export const palestraCategorias = [
  { id: 'todas', label: 'Todas' },
  { id: 'nr1', label: 'NR-1' },
  { id: 'bem-estar', label: 'Bem-estar' },
  { id: 'neurodiversidade', label: 'Neurodiversidade' },
  { id: 'lideranca', label: 'Liderança' },
  { id: 'campanha', label: 'Campanhas' },
] as const;

export type PalestraFiltro = (typeof palestraCategorias)[number]['id'];

const MODALIDADES_PADRAO: PalestraModalidade[] = ['Palestra', 'Workshop', 'Treinamento in-company'];

/**
 * Portfólio corporativo de Ana Rabottini — 6 palestras.
 * Conteúdo fiel ao material fornecido; nenhuma estatística ou cliente inventado.
 * Campos `videoId`/`materiais` são placeholders — preencher quando houver mídia real.
 */
export const palestras: Palestra[] = [
  {
    id: 'nr1-saude-mental',
    icon: ShieldCheck,
    categoria: 'nr1',
    title: 'NR-1 e Saúde Mental nas Organizações',
    objetivo:
      'Capacitar gestores e equipes para compreender os fatores de risco psicossociais e construir ambientes de trabalho mais saudáveis.',
    descricao:
      'Uma leitura prática das novas exigências da NR-1 sobre riscos psicossociais e do papel das lideranças na prevenção. A empresa entende o que precisa identificar, avaliar e tratar — e como demonstrar atuação preventiva no dia a dia.',
    temasLabel: 'Temas abordados',
    temas: [
      'Fatores de risco psicossociais',
      'Exigências da NR-1 e o GRO',
      'Construção de ambientes saudáveis',
      'Papel das lideranças na prevenção',
    ],
    beneficios: [
      'Maior conscientização das lideranças',
      'Fortalecimento da cultura preventiva',
      'Redução de conflitos internos',
      'Apoio às exigências da NR-1',
      'Melhoria do clima organizacional',
    ],
    modalidades: MODALIDADES_PADRAO,
    duracao: '60–90 min',
    videoId: '',
    materiais: [],
  },
  {
    id: 'bem-estar',
    icon: HeartPulse,
    categoria: 'bem-estar',
    title: 'Saúde Mental e Bem-Estar no Trabalho',
    objetivo:
      'Promover saúde emocional preventiva e dar às equipes ferramentas práticas para lidar com a pressão do dia a dia.',
    descricao:
      'Conteúdo voltado ao cuidado emocional cotidiano: como reconhecer o estresse ocupacional, prevenir o burnout e cultivar equilíbrio — com impacto direto em engajamento e produtividade.',
    temasLabel: 'Temas abordados',
    temas: [
      'Estresse ocupacional',
      'Burnout',
      'Autorregulação emocional',
      'Equilíbrio entre vida pessoal e profissional',
      'Saúde emocional preventiva',
    ],
    beneficios: ['Redução do absenteísmo', 'Aumento do engajamento', 'Melhora da produtividade'],
    modalidades: MODALIDADES_PADRAO,
    duracao: '60–90 min',
    videoId: '',
    materiais: [],
  },
  {
    id: 'neurodiversidade',
    icon: InfinityIcon,
    categoria: 'neurodiversidade',
    title: 'Neurodiversidade nas Empresas',
    objetivo:
      'Apoiar a inclusão de profissionais neurodivergentes e a potencialização de talentos em equipes diversas.',
    descricao:
      'Como criar ambientes que acolhem e potencializam profissionais neurodivergentes — do entendimento do TDAH no trabalho à comunicação e gestão de equipes diversas, transformando diversidade em inovação.',
    temasLabel: 'Temas abordados',
    temas: [
      'TDAH no ambiente corporativo',
      'Inclusão de profissionais neurodivergentes',
      'Comunicação e gestão de equipes diversas',
      'Potencialização de talentos',
    ],
    beneficios: ['Ambientes mais inclusivos', 'Retenção de talentos', 'Maior inovação'],
    modalidades: MODALIDADES_PADRAO,
    duracao: '60–90 min',
    videoId: '',
    materiais: [],
  },
  {
    id: 'lideranca-humanizada',
    icon: Users,
    categoria: 'lideranca',
    title: 'Liderança Humanizada',
    objetivo:
      'Desenvolver líderes mais preparados para conduzir pessoas com escuta, comunicação e gestão emocional.',
    descricao:
      'Desenvolvimento de lideranças que conduzem pessoas com escuta ativa, comunicação assertiva e inteligência emocional — base para equipes mais engajadas e menor rotatividade.',
    temasLabel: 'Temas abordados',
    temas: ['Comunicação assertiva', 'Escuta ativa', 'Gestão emocional', 'Prevenção de conflitos'],
    beneficios: ['Líderes mais preparados', 'Equipes mais engajadas', 'Menor rotatividade'],
    modalidades: MODALIDADES_PADRAO,
    duracao: '60–90 min',
    videoId: '',
    materiais: [],
  },
  {
    id: 'setembro-amarelo',
    icon: LifeBuoy,
    categoria: 'campanha',
    tag: 'Setembro Amarelo',
    title: 'Setembro Amarelo',
    subtitle: '“Cuidar da saúde emocional é cuidar da vida”',
    objetivo:
      'Sensibilizar a organização para a valorização da vida e a identificação precoce do sofrimento psicológico.',
    descricao:
      'Palestra de campanha para o Setembro Amarelo: acolhimento, rede de apoio e identificação precoce do sofrimento psicológico — com linguagem cuidadosa e foco na valorização da vida.',
    temasLabel: 'Conteúdo',
    temas: [
      'Rede de apoio',
      'Autoconhecimento',
      'Saúde emocional',
      'Identificação precoce de sofrimento psicológico',
    ],
    beneficios: [
      'Ambiente de acolhimento e escuta',
      'Cultura de cuidado e prevenção',
      'Quebra de estigmas sobre saúde mental',
    ],
    modalidades: ['Palestra', 'Workshop'],
    duracao: '60 min',
    videoId: '',
    materiais: [],
  },
  {
    id: 'dia-da-mulher',
    icon: HandHeart,
    categoria: 'campanha',
    tag: 'Dia Internacional da Mulher',
    title: 'Dia Internacional da Mulher',
    subtitle: '“Saúde emocional feminina e os desafios da mulher no mercado de trabalho”',
    objetivo:
      'Abordar a saúde emocional feminina e os desafios específicos da mulher no ambiente profissional.',
    descricao:
      'Palestra de campanha para o Dia Internacional da Mulher: sobrecarga mental, dupla jornada e síndrome da impostora, com um olhar para o desenvolvimento profissional saudável.',
    temasLabel: 'Temas abordados',
    temas: ['Sobrecarga mental', 'Dupla jornada', 'Síndrome da impostora', 'Desenvolvimento profissional saudável'],
    beneficios: [
      'Valorização das mulheres na organização',
      'Apoio ao desenvolvimento profissional saudável',
      'Ambiente mais equânime e consciente',
    ],
    modalidades: ['Palestra', 'Workshop'],
    duracao: '60 min',
    videoId: '',
    materiais: [],
  },
];
