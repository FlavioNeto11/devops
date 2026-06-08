import {
  Factory,
  Home,
  HardHat,
  Mountain,
  Wheat,
  Zap,
  Droplets,
  Building,
  TrainFront,
  Landmark,
  type LucideIcon,
} from 'lucide-react';

export type Sector = { icon: LucideIcon; label: string; desc: string };

export const sectors: Sector[] = [
  { icon: Factory, label: 'Indústrias', desc: 'Licenciamento, resíduos e conformidade operacional.' },
  { icon: Home, label: 'Loteamentos e Condomínios', desc: 'Aprovação, GRAPROHAB e regularização.' },
  { icon: HardHat, label: 'Construção Civil', desc: 'Projetos, alvarás, Habite-se e obras.' },
  { icon: Mountain, label: 'Mineração', desc: 'Engenharia de minas e licenciamento.' },
  { icon: Wheat, label: 'Agronegócio', desc: 'Outorgas, estudos e adequação ambiental.' },
  { icon: Zap, label: 'Energia', desc: 'Estudos de impacto e licenciamento.' },
  { icon: Droplets, label: 'Saneamento', desc: 'Recursos hídricos, outorgas e projetos.' },
  { icon: Building, label: 'Imobiliário', desc: 'Viabilidade, regularização e due diligence.' },
  { icon: TrainFront, label: 'Infraestrutura', desc: 'Projetos complexos e relacionamento regulatório.' },
  { icon: Landmark, label: 'Órgãos Públicos e Privados', desc: 'Consultoria técnica e assessoria especializada.' },
];
