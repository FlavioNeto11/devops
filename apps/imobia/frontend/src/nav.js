// Config de navegacao dos modulos (sidebar do painel). `ready` marca os ja construidos;
// os demais abrem um placeholder ate a fase respectiva entregar a tela.
export const MODULES = [
  { key: 'dashboard', label: 'Painel', icon: 'dashboard', to: '/app/dashboard', phase: 'F2', ready: true },
  { key: 'imoveis', label: 'Imóveis', icon: 'building', to: '/app/imoveis', phase: 'F3', ready: true },
  { key: 'leads', label: 'Clientes / Leads', icon: 'users', to: '/app/leads', phase: 'F3', ready: true },
  { key: 'agenda', label: 'Agenda', icon: 'calendar', to: '/app/agenda', phase: 'F4', ready: true },
  { key: 'vistorias', label: 'Vistorias', icon: 'camera', to: '/app/vistorias', phase: 'F4', ready: true },
  { key: 'documentos', label: 'Documentos', icon: 'folder', to: '/app/documentos', phase: 'F4', ready: true },
  { key: 'financeiro', label: 'Financeiro PJ/PF', icon: 'wallet', to: '/app/financeiro', phase: 'F5', ready: true },
  { key: 'corbam', label: 'Corbam / COBAN', icon: 'bank', to: '/app/corbam', phase: 'F5', ready: true },
  { key: 'mercado', label: 'ACM / PTAM', icon: 'chart', to: '/app/mercado', phase: 'F6', ready: true },
  { key: 'whatsapp', label: 'WhatsApp', icon: 'message', to: '/app/whatsapp', phase: 'F6', ready: true },
  { key: 'assistente', label: 'Assistente IA', icon: 'spark', to: '/app/assistente', phase: 'F2', ready: true },
];
