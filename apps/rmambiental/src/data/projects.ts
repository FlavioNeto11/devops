/**
 * PROJETOS / CASES — PLACEHOLDERS PROFISSIONAIS.
 * ⚠️ Conteúdo fictício de estrutura. Substitua por cases REAIS (não inventar clientes,
 * números ou resultados). As "imagens" são geradas por gradiente/SVG no componente —
 * troque por fotos reais (com direitos) quando disponíveis.
 */
export type Project = {
  id: string;
  title: string;
  category: 'Licenciamento' | 'Engenharia' | 'Estudos' | 'Gestão';
  location: string;
  service: string;
  summary: string;
};

export const projectCategories = ['Todos', 'Licenciamento', 'Engenharia', 'Estudos', 'Gestão'] as const;

export const projects: Project[] = [
  {
    id: 'p1',
    title: 'Licenciamento de complexo industrial',
    category: 'Licenciamento',
    location: 'Interior de São Paulo · SP',
    service: 'CETESB — LP, LI e LO',
    summary:
      'Condução completa do licenciamento de unidade industrial, do enquadramento à licença de operação. [PLACEHOLDER]',
  },
  {
    id: 'p2',
    title: 'Estudo de impacto para loteamento',
    category: 'Estudos',
    location: 'Região Metropolitana · SP',
    service: 'EIA / RIMA · GRAPROHAB',
    summary:
      'Estudos ambientais e de viabilidade para aprovação de empreendimento urbano. [PLACEHOLDER]',
  },
  {
    id: 'p3',
    title: 'Projeto e execução de terraplanagem',
    category: 'Engenharia',
    location: 'Campinas · SP',
    service: 'Topografia · Terraplanagem',
    summary:
      'Levantamento topográfico, projeto de movimentação de terra e acompanhamento de obra. [PLACEHOLDER]',
  },
  {
    id: 'p4',
    title: 'Gerenciamento de área contaminada',
    category: 'Estudos',
    location: 'Grande São Paulo · SP',
    service: 'Investigação e remediação',
    summary:
      'Investigação detalhada e plano de intervenção em passivo ambiental industrial. [PLACEHOLDER]',
  },
  {
    id: 'p5',
    title: 'Outorga de uso de recursos hídricos',
    category: 'Gestão',
    location: 'Vale do Paraíba · SP',
    service: 'Água — projetos e outorgas',
    summary:
      'Regularização de captação e lançamento com projeto hidráulico e outorga. [PLACEHOLDER]',
  },
  {
    id: 'p6',
    title: 'Regularização fundiária urbana (REURB)',
    category: 'Licenciamento',
    location: 'Litoral · SP',
    service: 'REURB · Habite-se',
    summary:
      'Regularização de núcleo urbano com integração entre engenharia e meio ambiente. [PLACEHOLDER]',
  },
  {
    id: 'p7',
    title: 'Gestão de resíduos para operação industrial',
    category: 'Gestão',
    location: 'Sorocaba · SP',
    service: 'PGRS · SIGOR / MTR',
    summary:
      'Plano de gerenciamento de resíduos e rastreabilidade no SIGOR. [PLACEHOLDER]',
  },
  {
    id: 'p8',
    title: 'Licenciamento de empreendimento minerário',
    category: 'Engenharia',
    location: 'Minas Gerais · MG',
    service: 'Engenharia de Minas · Licenciamento',
    summary:
      'Suporte técnico e regulatório integrado para atividade minerária. [PLACEHOLDER]',
  },
];
