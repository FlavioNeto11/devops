import {
  ShieldCheck,
  HeartPulse,
  Infinity as InfinityIcon,
  Users,
  LifeBuoy,
  HandHeart,
  type LucideIcon,
} from 'lucide-react';

export type Palestra = {
  id: string;
  icon: LucideIcon;
  title: string;
  /** Subtítulo opcional — usado para o nome da palestra em datas temáticas. */
  subtitle?: string;
  objetivo: string;
  /** Rótulo do bloco de tópicos ("Temas abordados" ou "Conteúdo"). */
  temasLabel: string;
  temas: string[];
  beneficios: string[];
  /** Marca datas/campanhas (Setembro Amarelo, Dia da Mulher). */
  tag?: string;
};

/**
 * Portfólio corporativo de Ana Rabottini — 6 palestras.
 * Conteúdo fiel ao material fornecido; nenhuma estatística ou cliente inventado.
 */
export const palestras: Palestra[] = [
  {
    id: 'nr1-saude-mental',
    icon: ShieldCheck,
    title: 'NR-1 e Saúde Mental nas Organizações',
    objetivo:
      'Capacitar gestores e equipes para compreender os fatores de risco psicossociais e construir ambientes de trabalho mais saudáveis.',
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
  },
  {
    id: 'bem-estar',
    icon: HeartPulse,
    title: 'Saúde Mental e Bem-Estar no Trabalho',
    objetivo:
      'Promover saúde emocional preventiva e dar às equipes ferramentas práticas para lidar com a pressão do dia a dia.',
    temasLabel: 'Temas abordados',
    temas: [
      'Estresse ocupacional',
      'Burnout',
      'Autorregulação emocional',
      'Equilíbrio entre vida pessoal e profissional',
      'Saúde emocional preventiva',
    ],
    beneficios: ['Redução do absenteísmo', 'Aumento do engajamento', 'Melhora da produtividade'],
  },
  {
    id: 'neurodiversidade',
    icon: InfinityIcon,
    title: 'Neurodiversidade nas Empresas',
    objetivo:
      'Apoiar a inclusão de profissionais neurodivergentes e a potencialização de talentos em equipes diversas.',
    temasLabel: 'Temas abordados',
    temas: [
      'TDAH no ambiente corporativo',
      'Inclusão de profissionais neurodivergentes',
      'Comunicação e gestão de equipes diversas',
      'Potencialização de talentos',
    ],
    beneficios: ['Ambientes mais inclusivos', 'Retenção de talentos', 'Maior inovação'],
  },
  {
    id: 'lideranca-humanizada',
    icon: Users,
    title: 'Liderança Humanizada',
    objetivo:
      'Desenvolver líderes mais preparados para conduzir pessoas com escuta, comunicação e gestão emocional.',
    temasLabel: 'Temas abordados',
    temas: ['Comunicação assertiva', 'Escuta ativa', 'Gestão emocional', 'Prevenção de conflitos'],
    beneficios: ['Líderes mais preparados', 'Equipes mais engajadas', 'Menor rotatividade'],
  },
  {
    id: 'setembro-amarelo',
    icon: LifeBuoy,
    tag: 'Setembro Amarelo',
    title: 'Setembro Amarelo',
    subtitle: '“Cuidar da saúde emocional é cuidar da vida”',
    objetivo:
      'Sensibilizar a organização para a valorização da vida e a identificação precoce do sofrimento psicológico.',
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
  },
  {
    id: 'dia-da-mulher',
    icon: HandHeart,
    tag: 'Dia Internacional da Mulher',
    title: 'Dia Internacional da Mulher',
    subtitle: '“Saúde emocional feminina e os desafios da mulher no mercado de trabalho”',
    objetivo:
      'Abordar a saúde emocional feminina e os desafios específicos da mulher no ambiente profissional.',
    temasLabel: 'Temas abordados',
    temas: ['Sobrecarga mental', 'Dupla jornada', 'Síndrome da impostora', 'Desenvolvimento profissional saudável'],
    beneficios: [
      'Valorização das mulheres na organização',
      'Apoio ao desenvolvimento profissional saudável',
      'Ambiente mais equânime e consciente',
    ],
  },
];
