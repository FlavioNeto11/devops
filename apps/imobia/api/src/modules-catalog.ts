// Catalogo declarativo dos modulos do imobia (do diagrama + documentacao).
// Fonte unica consumida por /meta e pela home do frontend. `ai` lista os papeis
// dos 4 modelos (cortex/gpt/claude/gemini) fieis ao documento de concepcao.

export type ModuleAi = 'cortex' | 'gpt' | 'claude' | 'gemini';

export interface ModuleDef {
  key: string;
  name: string;
  icon: string;
  summary: string;
  ai: ModuleAi[];
  phase: string; // fase de entrega
}

export const MODULES: ModuleDef[] = [
  {
    key: 'imoveis',
    name: 'Captacao / Imoveis',
    icon: 'building',
    summary: 'Captacao de imoveis (venda/locacao), proprietarios, caracteristicas e busca semantica.',
    ai: ['cortex', 'gpt', 'gemini'],
    phase: 'F3',
  },
  {
    key: 'leads',
    name: 'Clientes / Leads',
    icon: 'users',
    summary: 'Coleta e qualificacao de clientes, lead scoring e perfil financeiro.',
    ai: ['gpt', 'gemini'],
    phase: 'F3',
  },
  {
    key: 'financeiro',
    name: 'Financeiro PJ/PF',
    icon: 'wallet',
    summary: 'Lancamentos empresariais e pessoais, categorizacao automatica e fluxo de caixa.',
    ai: ['cortex', 'gpt', 'claude', 'gemini'],
    phase: 'F5',
  },
  {
    key: 'agenda',
    name: 'Agenda e Eventos',
    icon: 'calendar',
    summary: 'Visitas, vistorias e renovacoes a partir de linguagem natural + lembretes.',
    ai: ['gpt', 'claude'],
    phase: 'F4',
  },
  {
    key: 'whatsapp',
    name: 'WhatsApp (eixo central)',
    icon: 'message',
    summary: 'Multiplos numeros por segmento (captacao/vendas/financas) com triagem por IA.',
    ai: ['cortex', 'claude'],
    phase: 'F6',
  },
  {
    key: 'acm',
    name: 'ACM',
    icon: 'chart',
    summary: 'Analise de Mercado Comparativa via varredura de portais e media do m2.',
    ai: ['cortex', 'gpt'],
    phase: 'F6',
  },
  {
    key: 'ptam',
    name: 'PTAM',
    icon: 'document',
    summary: 'Parecer Tecnico de Avaliacao Mercadologica (ABNT NBR 14653) em PDF.',
    ai: ['claude'],
    phase: 'F7',
  },
  {
    key: 'corbam',
    name: 'Corbam / COBAN',
    icon: 'bank',
    summary: 'Correspondente bancario: recuperacao de credito (limpa nome), score e rating.',
    ai: ['cortex', 'gpt', 'claude', 'gemini'],
    phase: 'F5',
  },
  {
    key: 'vistoria',
    name: 'Vistoria e Laudos',
    icon: 'camera',
    summary: 'Vistoria de imoveis: analise de fotos por IA e laudo oficial.',
    ai: ['claude', 'gemini'],
    phase: 'F4',
  },
  {
    key: 'documentos',
    name: 'Documentos (cada etapa)',
    icon: 'folder',
    summary: 'Validacao de RG/CNH/holerite/certidoes e trilha de auditoria por etapa.',
    ai: ['gemini'],
    phase: 'F4',
  },
];
