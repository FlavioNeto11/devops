import { Users2, ClipboardList, Search, Route, type LucideIcon } from 'lucide-react';

/** Etapas do Diagnóstico Educativo Organizacional. */
export type DiagnosticoEtapa = { icon: LucideIcon; title: string; desc: string };

export const diagnostico: DiagnosticoEtapa[] = [
  {
    icon: Users2,
    title: 'Entrevistas com equipes',
    desc: 'Escuta estruturada de times e lideranças para entender o contexto real do ambiente de trabalho.',
  },
  {
    icon: ClipboardList,
    title: 'Levantamento de necessidades',
    desc: 'Mapeamento das demandas educativas e dos pontos de atenção de cada área.',
  },
  {
    icon: Search,
    title: 'Identificação de fatores de atenção',
    desc: 'Reconhecimento de fatores psicossociais e situações que merecem ação preventiva.',
  },
  {
    icon: Route,
    title: 'Plano de ações educativas',
    desc: 'Recomendações práticas e priorizadas, conectando diagnóstico a um caminho de desenvolvimento.',
  },
];

/** Trilhas de Desenvolvimento (educação corporativa contínua). */
export const trilhas: string[] = [
  'Saúde emocional',
  'Neurodiversidade',
  'Comunicação',
  'Liderança',
  'Relações interpessoais',
];
