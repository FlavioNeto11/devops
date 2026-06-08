import {
  ShieldCheck,
  Building2,
  FlaskConical,
  Recycle,
  type LucideIcon,
} from 'lucide-react';

export type ServiceGroup = {
  id: string;
  slug: string;
  icon: LucideIcon;
  title: string;
  tagline: string;
  summary: string;
  items: string[];
  whenToHire: string;
  deliverables: string[];
  orgaos: string[];
  benefits: string[];
  steps: { title: string; desc: string }[];
};

/**
 * As 4 grandes frentes da RM Ambiental Brasil. Reorganização da lista extensa do site
 * atual em grupos coerentes, cada um com conteúdo para a página /solucoes.
 * Conteúdo técnico-corporativo; ajuste números/cases reais quando disponíveis.
 */
export const serviceGroups: ServiceGroup[] = [
  {
    id: 'licenciamento',
    slug: 'licenciamento-e-regularizacao',
    icon: ShieldCheck,
    title: 'Licenciamento e Regularização Ambiental',
    tagline: 'Conformidade e segurança jurídica perante os órgãos reguladores.',
    summary:
      'Conduzimos o licenciamento e a regularização de empreendimentos do início ao fim — da viabilidade à operação — com domínio dos ritos de CETESB, IBAMA e órgãos estaduais e municipais, reduzindo prazos, riscos e retrabalho.',
    items: [
      'Licenciamento Ambiental (LP, LI e LO)',
      'CETESB — Licença Prévia, de Instalação e de Operação',
      'IBAMA — licenciamento federal',
      'SEMAD e órgãos estaduais',
      'SP Regula / SIGOR',
      'Alvarás e Habite-se',
      'GRAPROHAB',
      'REURB — Regularização Fundiária',
    ],
    whenToHire:
      'Ao iniciar, ampliar, regularizar ou renovar a operação de um empreendimento sujeito a controle ambiental — antes de comprometer cronograma e investimento com pendências regulatórias.',
    deliverables: [
      'Diagnóstico de exigências e enquadramento legal',
      'Protocolo e condução do processo junto aos órgãos',
      'Atendimento a exigências técnicas e complementações',
      'Obtenção e renovação de licenças e autorizações',
    ],
    orgaos: ['CETESB', 'IBAMA', 'SEMAD', 'Prefeituras', 'GRAPROHAB', 'Cartórios / SP Regula'],
    benefits: [
      'Previsibilidade de prazos e custos regulatórios',
      'Redução do risco de embargos e autuações',
      'Interlocução técnica qualificada com os órgãos',
      'Conformidade documental auditável',
    ],
    steps: [
      { title: 'Enquadramento', desc: 'Identificamos o rito, o órgão competente e as exigências aplicáveis.' },
      { title: 'Instrução', desc: 'Reunimos estudos, projetos e documentos exigidos para o protocolo.' },
      { title: 'Protocolo e tratativas', desc: 'Conduzimos o processo e respondemos às exigências técnicas.' },
      { title: 'Emissão', desc: 'Obtemos a licença e organizamos o calendário de renovações.' },
    ],
  },
  {
    id: 'engenharia',
    slug: 'engenharia-e-projetos',
    icon: Building2,
    title: 'Engenharia e Projetos Técnicos',
    tagline: 'Projeto e execução multidisciplinar com responsabilidade técnica.',
    summary:
      'Integramos engenharia ambiental, civil, elétrica, química e de minas, arquitetura e agrimensura para projetar e executar obras com rastreabilidade técnica, segurança e aderência às normas e ao licenciamento.',
    items: [
      'Engenharia Ambiental',
      'Engenharia Civil',
      'Engenharia Elétrica',
      'Engenharia Química',
      'Engenharia de Minas',
      'Arquitetura',
      'Agrimensura e topografia',
      'IGC — cartografia e georreferenciamento',
      'Terraplanagem',
      'Execução e gerenciamento de obras',
    ],
    whenToHire:
      'Quando o projeto exige integração entre disciplinas técnicas, responsável técnico (ART/RRT) e compatibilização entre engenharia, meio ambiente e regularização.',
    deliverables: [
      'Projetos técnicos e memoriais com ART/RRT',
      'Levantamentos topográficos e georreferenciamento',
      'Compatibilização entre disciplinas e licenciamento',
      'Planejamento e acompanhamento de obra',
    ],
    orgaos: ['CREA / CAU', 'Prefeituras', 'Concessionárias', 'Órgãos ambientais'],
    benefits: [
      'Responsabilidade técnica formal e rastreável',
      'Menos incompatibilidades entre projeto e obra',
      'Otimização de custos e prazos de execução',
      'Equipe multidisciplinar sob coordenação única',
    ],
    steps: [
      { title: 'Levantamento', desc: 'Topografia, condicionantes e premissas técnicas do terreno.' },
      { title: 'Projeto', desc: 'Desenvolvimento e compatibilização entre disciplinas.' },
      { title: 'Aprovação', desc: 'Aderência a normas, órgãos e ao licenciamento.' },
      { title: 'Execução', desc: 'Planejamento, mobilização e acompanhamento da obra.' },
    ],
  },
  {
    id: 'estudos',
    slug: 'estudos-e-impacto',
    icon: FlaskConical,
    title: 'Estudos, Diagnósticos e Impacto',
    tagline: 'Base técnica sólida para decisões e aprovações.',
    summary:
      'Elaboramos estudos ambientais e diagnósticos com rigor científico — EIA/RIMA, EVA, RIT, EIV, ADA — além de investigação e gerenciamento de áreas contaminadas, fundamentando aprovações e a tomada de decisão.',
    items: [
      'EIA — Estudo de Impacto Ambiental',
      'RIMA — Relatório de Impacto',
      'EVA — Estudo de Viabilidade Ambiental',
      'RIT — Relatório de Impacto de Trânsito',
      'EIV — Estudo de Impacto de Vizinhança',
      'ADA — Área Diretamente Afetada',
      'Geologia, Biologia e Arqueologia',
      'Gerenciamento de áreas contaminadas',
    ],
    whenToHire:
      'Quando o empreendimento exige estudos para licenciamento, comprovação de viabilidade, avaliação de impacto ou investigação de passivos ambientais.',
    deliverables: [
      'Estudos e relatórios técnicos fundamentados',
      'Investigação ambiental (preliminar, confirmatória e detalhada)',
      'Planos de monitoramento e de intervenção',
      'Pareceres técnicos para órgãos e tomada de decisão',
    ],
    orgaos: ['CETESB', 'IBAMA', 'IPHAN', 'Órgãos estaduais e municipais'],
    benefits: [
      'Decisões embasadas em dados técnicos',
      'Antecipação de riscos e passivos',
      'Maior aderência nas aprovações',
      'Documentação científica defensável',
    ],
    steps: [
      { title: 'Escopo', desc: 'Definição dos estudos exigidos e da metodologia aplicável.' },
      { title: 'Campo e coleta', desc: 'Levantamentos, amostragens e investigação técnica.' },
      { title: 'Análise', desc: 'Interpretação multidisciplinar e modelagem de impacto.' },
      { title: 'Relatório', desc: 'Entrega documental e suporte na defesa junto aos órgãos.' },
    ],
  },
  {
    id: 'gestao',
    slug: 'gestao-ambiental-e-operacoes',
    icon: Recycle,
    title: 'Gestão Ambiental e Operações',
    tagline: 'Operação contínua, conformidade e eficiência ambiental.',
    summary:
      'Estruturamos a gestão ambiental no dia a dia da operação — resíduos, recursos hídricos, áreas de conservação, loteamentos e condomínios — com suporte jurídico ambiental e tecnologia aplicada ao controle e ao monitoramento.',
    items: [
      'Gerenciamento de Resíduos (PGRS / MTR)',
      'Água — projetos e outorgas',
      'Criação de Unidade de Conservação',
      'Condomínios e Loteamentos',
      'Consultoria Jurídica Ambiental',
      'Bombeiro / Segurança (AVCB)',
      'Tecnologia aplicada à gestão ambiental',
    ],
    whenToHire:
      'Quando a operação precisa manter conformidade contínua, gerenciar resíduos e recursos, atender condicionantes e reduzir riscos ao longo do tempo.',
    deliverables: [
      'Planos de gerenciamento e procedimentos operacionais',
      'Outorgas e regularização de uso de recursos hídricos',
      'Gestão de condicionantes e prazos',
      'Indicadores e relatórios de conformidade',
    ],
    orgaos: ['CETESB', 'SIGOR / SP Regula', 'DAEE / ANA', 'Corpo de Bombeiros'],
    benefits: [
      'Conformidade contínua e auditável',
      'Redução de multas e interrupções operacionais',
      'Rastreabilidade de resíduos e recursos',
      'Visão integrada de risco ambiental',
    ],
    steps: [
      { title: 'Diagnóstico operacional', desc: 'Mapeamento de obrigações, resíduos e recursos.' },
      { title: 'Estruturação', desc: 'Planos, procedimentos e outorgas necessárias.' },
      { title: 'Operação', desc: 'Execução, registro e gestão de condicionantes.' },
      { title: 'Monitoramento', desc: 'Indicadores, auditoria e melhoria contínua.' },
    ],
  },
];

export function getServiceBySlug(slug: string): ServiceGroup | undefined {
  return serviceGroups.find((g) => g.slug === slug);
}
