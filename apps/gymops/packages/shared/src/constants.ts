export const ACTIVITY_STATUS_LABELS: Record<string, string> = {
  novo: 'Novo',
  em_andamento: 'Em andamento',
  aguardando_terceiro: 'Aguardando terceiro',
  aguardando_aprovacao: 'Aguardando aprovação',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

export const ACTIVITY_PRIORITY_LABELS: Record<string, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  critica: 'Crítica',
};

export const USER_ROLE_LABELS: Record<string, string> = {
  owner: 'Proprietário',
  org_manager: 'Gestor da organização',
  unit_manager: 'Gestor de unidade',
  area_leader: 'Líder de área',
  executor: 'Executor',
  viewer: 'Visualizador',
};

export const AREA_COLORS: Record<string, string> = {
  administrativo: '#6366f1',
  marketing: '#f59e0b',
  coordenacao: '#10b981',
  manutencao: '#ef4444',
  lider: '#8b5cf6',
  financeiro: '#0ea5e9',
};

export const TERMINAL_STATUSES = ['concluido', 'cancelado'] as const;

export const VALID_ATTACHMENT_MIMES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'text/csv',
  'application/zip',
  'application/x-zip-compressed',
] as const;

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10MB
