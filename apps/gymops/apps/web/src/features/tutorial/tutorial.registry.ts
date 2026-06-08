import type { UserRole } from '@/store/auth';
import type { TutorialCategory, TutorialDefinition } from './tutorial.types';

/**
 * Registro central de tutoriais. Cada tutorial pode ser exibido na Central
 * de Ajuda (/help) ou iniciado contextualmente via TutorialTrigger.
 *
 * Convenções:
 * - `target` deve casar com um `data-tutorial="..."` no DOM.
 * - Use `skipIfTargetMissing: true` quando o passo só fizer sentido em
 *   variações da tela (ex: card de Trello que pode não existir).
 * - `route` no passo é uma dica: o overlay sugere navegar; o usuário decide.
 */
export const TUTORIAL_REGISTRY: TutorialDefinition[] = [
  // ── A. Primeiros passos ───────────────────────────────────────────────────
  {
    id: 'first-steps',
    title: 'Primeiros passos',
    description: 'Conheça o GymOps em poucos minutos: estrutura, navegação e papéis.',
    category: 'first-steps',
    rolesAllowed: ['owner', 'org_manager', 'unit_manager', 'area_leader', 'executor', 'viewer'],
    estimatedMinutes: 3,
    isOnboarding: true,
    steps: [
      {
        id: 'welcome',
        title: 'Bem-vindo ao GymOps',
        body: 'O GymOps organiza a rotina operacional da sua rede em um lugar só: atividades, checklists, prazos, responsáveis e histórico.',
        placement: 'center',
      },
      {
        id: 'structure',
        title: 'Organização → Unidade → Área → Atividade',
        body: 'A Organização é a rede inteira. Cada Unidade é uma academia. Cada Área separa rotinas (Administrativo, Marketing, Manutenção). Atividades são o que precisa ser executado.',
        placement: 'center',
      },
      {
        id: 'sidebar',
        title: 'Navegação principal',
        body: 'A barra lateral mostra o Painel Geral, suas Atividades e as Unidades da rede. Toque em uma unidade para abrir o quadro dela.',
        target: 'app-sidebar',
        placement: 'right',
        required: true,
        fallbackTitle: 'Navegação principal',
        fallbackBody: 'A barra lateral mostra o Painel Geral, suas Atividades e as Unidades da rede. Toque em uma unidade para abrir o quadro dela.',
      },
      {
        id: 'help-button',
        title: 'Onde pedir ajuda',
        body: 'O botão de ajuda fica sempre por perto. Por ele você reabre tutoriais ou pesquisa por tópico.',
        target: 'app-help-button',
        placement: 'right',
        required: true,
        fallbackTitle: 'Onde pedir ajuda',
        fallbackBody: 'O botão de ajuda fica sempre visível na interface. Por ele você reabre qualquer tutorial ou pesquisa por tópico de ajuda.',
      },
      {
        id: 'roles',
        title: 'Papéis e permissões',
        body: 'O que você vê depende do seu papel. Owner administra tudo; Gestor de organização cuida do macro; Gerente de unidade opera uma academia; Líder de área foca em uma rotina; Executor cumpre atividades; Visualizador apenas acompanha.',
        placement: 'center',
      },
    ],
  },

  // ── B. Painel Geral ───────────────────────────────────────────────────────
  {
    id: 'dashboard-overview',
    title: 'Painel Geral',
    description: 'Como ler os indicadores da rede inteira.',
    category: 'daily-operation',
    rolesAllowed: ['owner', 'org_manager', 'unit_manager'],
    routePatterns: ['/dashboard'],
    startRoute: '/dashboard',
    estimatedMinutes: 2,
    steps: [
      {
        id: 'open',
        title: 'Painel Geral',
        body: 'Esta tela resume a saúde operacional da rede em tempo real.',
        route: '/dashboard',
        placement: 'center',
      },
      {
        id: 'kpis',
        title: 'KPIs principais',
        body: 'Aqui você vê total de atividades, atrasadas, em andamento e concluídas. Use estes números como termômetro do dia.',
        target: 'dashboard-kpis',
        placement: 'bottom',
        required: true,
        fallbackTitle: 'KPIs principais',
        fallbackBody: 'No painel você vê total de atividades, quantas estão atrasadas, em andamento e concluídas. Use esses números como termômetro do dia da rede.',
      },
      {
        id: 'units-table',
        title: 'Visão por unidade',
        body: 'Compare unidades lado a lado: quem está atrasada, quem está em dia. Clique no nome para abrir a unidade.',
        target: 'dashboard-unit-table',
        placement: 'top',
        required: true,
        fallbackTitle: 'Visão por unidade',
        fallbackBody: 'A tabela de unidades compara cada academia lado a lado: quem está atrasada, quem está em dia. Clique no nome de uma unidade para abri-la diretamente.',
      },
      {
        id: 'overdue-activities',
        title: 'Atividades atrasadas',
        body: 'Este bloco prioriza o que está vencido. Use o botão Analisar para abrir um diagnóstico rápido das causas de atraso.',
        target: 'dashboard-overdue-activities',
        placement: 'top',
        required: true,
        fallbackTitle: 'Atividades atrasadas',
        fallbackBody: 'O bloco de atividades atrasadas prioriza o que está vencido em toda a rede. Use o botão Analisar para abrir um diagnóstico rápido das causas de atraso.',
      },
    ],
  },

  // ── C. Minhas Atividades ──────────────────────────────────────────────────
  {
    id: 'my-activities',
    title: 'Minhas Atividades',
    description: 'Organize seu dia: hoje, atrasadas, semana e aguardando retorno.',
    category: 'daily-operation',
    rolesAllowed: ['owner', 'org_manager', 'unit_manager', 'area_leader', 'executor', 'viewer'],
    routePatterns: ['/me'],
    startRoute: '/me',
    estimatedMinutes: 2,
    steps: [
      {
        id: 'open',
        title: 'Suas atividades',
        body: 'Aqui ficam as atividades que dependem de você.',
        route: '/me',
        placement: 'center',
      },
      {
        id: 'tabs',
        title: 'Filtros por contexto',
        body: 'Use as abas para alternar entre Hoje, Atrasadas, Esta semana e Aguardando meu retorno. Cada aba filtra automaticamente o que precisa de atenção naquele contexto.',
        target: 'me-tabs',
        placement: 'bottom',
        required: true,
        fallbackTitle: 'Filtros por contexto',
        fallbackBody: 'No topo da tela há abas: Hoje, Atrasadas, Esta semana e Aguardando meu retorno. Cada uma filtra automaticamente o que precisa da sua atenção naquele contexto.',
      },
      {
        id: 'list',
        title: 'Atualizar uma atividade',
        body: 'Clique em uma atividade para abrir os detalhes, marcar checklist, comentar ou trocar o status.',
        target: 'me-activity-list',
        placement: 'top',
        required: true,
        fallbackTitle: 'Lista de atividades',
        fallbackBody: 'Suas atividades aparecem aqui assim que forem atribuídas a você. Clique em qualquer uma para abrir os detalhes, marcar itens do checklist, comentar ou trocar o status.',
      },
    ],
  },

  // ── D. Central de Atividades ─────────────────────────────────────────────
  {
    id: 'activities-center',
    title: 'Central de Atividades',
    description: 'Acompanhe a operação inteira com filtros, indicadores e lista consolidada.',
    category: 'daily-operation',
    rolesAllowed: ['owner', 'org_manager', 'unit_manager'],
    routePatterns: ['/activities'],
    startRoute: '/activities',
    estimatedMinutes: 2,
    steps: [
      {
        id: 'open',
        title: 'Visão global da operação',
        body: 'A Central reúne atividades de toda a organização para monitorar atrasos, prioridades e andamento.',
        route: '/activities',
        placement: 'center',
      },
      {
        id: 'filters',
        title: 'Filtros e busca',
        body: 'Refine por status, prioridade, unidade e área para focar no que precisa de ação imediata.',
        target: 'global-activities-filters',
        placement: 'top',
        required: true,
        fallbackTitle: 'Filtros e busca',
        fallbackBody: 'Os filtros permitem refinar a lista por status, prioridade, unidade e área. Use-os para focar rapidamente no que precisa de ação imediata.',
      },
      {
        id: 'list',
        title: 'Lista consolidada',
        body: 'A tabela mostra o contexto completo de cada atividade. Clique em uma linha para abrir detalhes e avançar o trabalho.',
        target: 'global-activities-table',
        placement: 'top',
        required: true,
        fallbackTitle: 'Lista consolidada',
        fallbackBody: 'A tabela reúne todas as atividades da organização com contexto completo: unidade, área, status, prazo e responsável. Clique em qualquer linha para abrir detalhes e avançar o trabalho.',
      },
    ],
  },

  // ── E. Unidade ────────────────────────────────────────────────────────────
  {
    id: 'unit-operation',
    title: 'Operar uma unidade',
    description: 'Como acompanhar e atuar na rotina diária de uma unidade.',
    category: 'daily-operation',
    rolesAllowed: ['owner', 'org_manager', 'unit_manager', 'area_leader', 'executor'],
    routePatterns: ['/units/'],
    estimatedMinutes: 3,
    steps: [
      {
        id: 'summary',
        title: 'Resumo da unidade',
        body: 'O topo mostra a saúde da unidade: pendentes, atrasadas, concluídas.',
        target: 'unit-summary',
        placement: 'bottom',
        required: true,
        fallbackTitle: 'Resumo da unidade',
        fallbackBody: 'O topo de cada unidade mostra a saúde operacional: total de atividades pendentes, atrasadas e concluídas. É o termômetro rápido para gerentes e líderes de área.',
      },
      {
        id: 'filters',
        title: 'Filtros',
        body: 'Refine por área, status, prioridade ou prazo para focar no que importa agora.',
        target: 'unit-filters',
        placement: 'bottom',
        required: true,
        fallbackTitle: 'Filtros da unidade',
        fallbackBody: 'Os filtros da unidade permitem refinar por área, status, prioridade ou prazo. Use-os para focar no que realmente importa naquele momento.',
      },
      {
        id: 'board',
        title: 'Quadro por área',
        body: 'Cada coluna é uma área. Cards são as atividades. Arraste o foco para identificar atrasos.',
        target: 'unit-area-board',
        placement: 'top',
        required: true,
        fallbackTitle: 'Quadro por área',
        fallbackBody: 'O quadro organiza as atividades em colunas por área (Administrativo, Marketing, Manutenção...). Cada card é uma atividade. Percorra as colunas para identificar atrasos por setor.',
      },
      {
        id: 'card',
        title: 'Card de atividade',
        body: 'Cada card mostra título, responsáveis, progresso de checklist e prazo. Clique para abrir.',
        target: 'activity-card',
        placement: 'top',
        required: true,
        fallbackTitle: 'Card de atividade',
        fallbackBody: 'Cada card exibe título, responsáveis, progresso do checklist e prazo. Clique no card para abrir todos os detalhes, atualizar status, comentar e anexar arquivos.',
      },
    ],
  },

  // ── F. Atividade ──────────────────────────────────────────────────────────
  {
    id: 'activity-detail',
    title: 'Trabalhando em uma atividade',
    description: 'Status, checklist, comentários, anexos e histórico de uma atividade.',
    category: 'daily-operation',
    rolesAllowed: ['owner', 'org_manager', 'unit_manager', 'area_leader', 'executor', 'viewer'],
    estimatedMinutes: 4,
    steps: [
      {
        id: 'status',
        title: 'Status, prioridade e prazo',
        body: 'O topo da atividade resume status, prioridade e prazo. Atualize o status conforme a execução avança.',
        target: 'activity-drawer-status',
        placement: 'bottom',
        required: true,
        fallbackTitle: 'Status, prioridade e prazo',
        fallbackBody: 'No topo da atividade você encontra o status atual, a prioridade e o prazo previsto. Atualize o status de Pendente → Em andamento → Concluído conforme a execução avança.',
      },
      {
        id: 'checklist',
        title: 'Checklist',
        body: 'Marque itens conforme conclui. O sistema atualiza o progresso automaticamente para os responsáveis.',
        target: 'activity-drawer-checklist',
        placement: 'left',
        required: true,
        fallbackTitle: 'Checklist',
        fallbackBody: 'O checklist divide a atividade em etapas menores. Marque cada item conforme conclui — o progresso é atualizado automaticamente para todos os responsáveis.',
      },
      {
        id: 'comments',
        title: 'Comentários',
        body: 'Use comentários para alinhar com a equipe, registrar dúvidas ou reportar bloqueios.',
        target: 'activity-drawer-comments',
        placement: 'left',
        required: true,
        fallbackTitle: 'Comentários',
        fallbackBody: 'A seção de comentários é o espaço de alinhamento da equipe: registre dúvidas, reportar bloqueios ou atualizar o andamento. Todos os responsáveis recebem notificação.',
      },
      {
        id: 'attachments',
        title: 'Anexos',
        body: 'Anexe fotos, PDFs e documentos. Tudo fica versionado e auditável.',
        target: 'activity-drawer-attachments',
        placement: 'left',
        required: true,
        fallbackTitle: 'Anexos',
        fallbackBody: 'Anexe fotos, PDFs e documentos diretamente na atividade. Tudo fica armazenado com versão, data e autor — fácil de auditar depois.',
      },
      {
        id: 'history',
        title: 'Histórico',
        body: 'O histórico registra cada mudança: quem alterou, quando e o quê. Use para investigar atrasos.',
        target: 'activity-drawer-history',
        placement: 'left',
        required: true,
        fallbackTitle: 'Histórico',
        fallbackBody: 'O histórico da atividade registra cada mudança em ordem cronológica: quem alterou, quando e o quê. Indispensável para investigar atrasos ou entender o contexto.',
      },
    ],
  },

  // ── G. Templates ──────────────────────────────────────────────────────────
  {
    id: 'templates',
    title: 'Templates',
    description: 'Modelos padronizados que economizam tempo na criação de atividades.',
    category: 'administration',
    rolesAllowed: ['owner', 'org_manager', 'unit_manager'],
    routePatterns: ['/settings/templates'],
    estimatedMinutes: 2,
    steps: [
      {
        id: 'intro',
        title: 'O que são templates',
        body: 'Templates padronizam tarefas recorrentes com checklist, prioridade e SLA sugeridos. Use para evitar retrabalho.',
        route: '/settings/templates',
        placement: 'center',
      },
      {
        id: 'list',
        title: 'Lista de templates',
        body: 'Filtre por área, edite, duplique ou arquive templates. Templates do sistema ficam marcados.',
        target: 'templates-list',
        placement: 'top',
        required: true,
        fallbackTitle: 'Lista de templates',
        fallbackBody: 'A lista de templates exibe todos os modelos disponíveis. Filtre por área, edite, duplique ou arquive. Templates criados pelo sistema vêm com uma marcação especial.',
      },
    ],
  },

  // ── H. Perfil e WhatsApp ──────────────────────────────────────────────────
  {
    id: 'profile-whatsapp',
    title: 'Perfil e WhatsApp',
    description: 'Como configurar seu perfil e ativar notificações por WhatsApp.',
    category: 'first-steps',
    rolesAllowed: ['owner', 'org_manager', 'unit_manager', 'area_leader', 'executor', 'viewer'],
    routePatterns: ['/profile', '/settings'],
    startRoute: '/profile',
    estimatedMinutes: 2,
    steps: [
      {
        id: 'profile',
        title: 'Seu perfil',
        body: 'Mantenha nome, foto e telefone atualizados. O telefone é usado para enviar alertas críticos por WhatsApp.',
        target: 'settings-profile',
        route: '/profile',
        placement: 'top',
        required: true,
        fallbackTitle: 'Seu perfil',
        fallbackBody: 'Em Perfil você atualiza nome, foto e telefone. O telefone é essencial para receber alertas críticos por WhatsApp. Acesse a rota /profile para ver e editar seus dados.',
      },
      {
        id: 'notifications',
        title: 'Canais de notificação',
        body: 'Em Configurações você liga ou desliga e-mail, push e WhatsApp. Cada canal é independente.',
        target: 'settings-notifications',
        route: '/settings',
        placement: 'top',
        required: true,
        fallbackTitle: 'Canais de notificação',
        fallbackBody: 'Em Configurações você controla cada canal separadamente: e-mail, push do navegador e WhatsApp. Acesse /settings para ajustar suas preferências de notificação.',
        nextRoute: '/settings',
      },
    ],
  },

  // ── I. Organização ────────────────────────────────────────────────────────
  {
    id: 'organization-admin',
    title: 'Administrar a organização',
    description: 'Dados, políticas e auditoria da organização.',
    category: 'administration',
    rolesAllowed: ['owner'],
    routePatterns: ['/settings/organization'],
    startRoute: '/settings/organization',
    estimatedMinutes: 2,
    steps: [
      {
        id: 'data',
        title: 'Dados da organização',
        body: 'Aqui você ajusta o nome da rede. O slug não muda — é a identidade única da sua organização.',
        route: '/settings/organization',
        placement: 'center',
      },
      {
        id: 'audit',
        title: 'Auditoria',
        body: 'A trilha de auditoria registra alterações administrativas: quem mudou o quê e quando.',
        placement: 'center',
      },
    ],
  },

  // ── J. Unidades e Áreas ───────────────────────────────────────────────────
  {
    id: 'units-areas-admin',
    title: 'Unidades e Áreas',
    description: 'Como cadastrar e manter a estrutura física e funcional da rede.',
    category: 'administration',
    rolesAllowed: ['owner', 'org_manager'],
    routePatterns: ['/settings/units', '/settings/areas'],
    startRoute: '/settings/units',
    estimatedMinutes: 3,
    steps: [
      {
        id: 'units',
        title: 'Unidades',
        body: 'Cada unidade é uma academia física. Crie, edite ou arquive. Arquivar não apaga o histórico.',
        target: 'units-admin-list',
        route: '/settings/units',
        placement: 'top',
        required: true,
        fallbackTitle: 'Lista de unidades',
        fallbackBody: 'Cada unidade representa uma academia física da rede. Aqui você cria, edita ou arquiva unidades. Arquivar nunca apaga o histórico operacional — ele fica preservado.',
      },
      {
        id: 'areas',
        title: 'Áreas',
        body: 'Áreas são recortes funcionais (Administrativo, Marketing, Manutenção). Cada uma tem cor e chave única.',
        target: 'areas-admin-list',
        route: '/settings/areas',
        placement: 'top',
        required: true,
        fallbackTitle: 'Lista de áreas',
        fallbackBody: 'Áreas são recortes funcionais da operação: Administrativo, Marketing, Manutenção, entre outros. Cada área tem uma cor e uma chave única usada em todo o sistema.',
      },
    ],
  },

  // ── K. Equipe e Permissões ────────────────────────────────────────────────
  {
    id: 'team-permissions',
    title: 'Equipe e Permissões',
    description: 'Convide pessoas, atribua papéis e gerencie acessos.',
    category: 'administration',
    rolesAllowed: ['owner', 'org_manager'],
    routePatterns: ['/settings/team'],
    startRoute: '/settings/team',
    estimatedMinutes: 3,
    steps: [
      {
        id: 'list',
        title: 'Membros e convites',
        body: 'Veja quem está na organização e quem foi convidado mas ainda não aceitou.',
        target: 'team-list',
        route: '/settings/team',
        placement: 'top',
        required: true,
        fallbackTitle: 'Membros e convites',
        fallbackBody: 'A lista de equipe mostra todos os membros ativos e convites pendentes. Gerencie papéis, reenvie convites ou remova acessos diretamente por aqui.',
      },
      {
        id: 'roles',
        title: 'Como funcionam os papéis',
        body: 'Owner administra tudo. Gestor de organização cuida do macro. Gerente de unidade opera uma academia. Líder de área foca em uma rotina. Executor cumpre. Visualizador apenas acompanha.',
        placement: 'center',
      },
    ],
  },

  // ── L. Integrações ────────────────────────────────────────────────────────
  {
    id: 'integrations',
    title: 'Integrações',
    description: 'Conecte Trello, WhatsApp, e-mail e storage.',
    category: 'integrations',
    rolesAllowed: ['owner', 'org_manager'],
    routePatterns: ['/settings/integrations'],
    startRoute: '/settings/integrations',
    estimatedMinutes: 2,
    steps: [
      {
        id: 'open',
        title: 'Integrações',
        body: 'Aqui você conecta serviços externos. Cada cartão mostra o status atual.',
        route: '/settings/integrations',
        target: 'settings-integrations',
        placement: 'top',
        required: true,
        fallbackTitle: 'Integrações disponíveis',
        fallbackBody: 'A tela de integrações lista todos os serviços que você pode conectar: Trello, WhatsApp, e-mail e armazenamento. Cada cartão mostra o status atual da conexão.',
      },
      {
        id: 'trello-connect',
        title: 'Trello',
        body: 'Conecte sua conta Trello para depois importar quadros. Você pode desconectar a qualquer momento.',
        target: 'trello-connect-card',
        placement: 'top',
        required: true,
        fallbackTitle: 'Conectar Trello',
        fallbackBody: 'O cartão do Trello permite autenticar sua conta e selecionar quais quadros serão importados. Você pode desconectar a qualquer momento sem perder dados já importados.',
      },
    ],
  },

  // ── M. Importação Trello ──────────────────────────────────────────────────
  {
    id: 'trello-import',
    title: 'Importar do Trello',
    description: 'Migre seus boards do Trello em 4 etapas: preview, mapeamento, commit, relatório.',
    category: 'import',
    rolesAllowed: ['owner', 'org_manager'],
    routePatterns: ['/settings/import', '/settings/imports'],
    startRoute: '/settings/import',
    estimatedMinutes: 4,
    steps: [
      {
        id: 'wizard',
        title: 'Assistente de importação',
        body: 'Use JSON exportado ou a integração via API. Sempre passa por preview antes de commit.',
        route: '/settings/import',
        target: 'trello-import-wizard',
        placement: 'top',
        required: true,
        fallbackTitle: 'Assistente de importação',
        fallbackBody: 'O assistente guia a importação em 4 etapas: escolha do board, preview dos dados, mapeamento de áreas e commit final. Use o JSON exportado do Trello ou conecte via API.',
      },
      {
        id: 'history',
        title: 'Histórico de importações',
        body: 'Acompanhe imports passados, refaça em caso de falha ou cancele os pendentes.',
        route: '/settings/imports',
        target: 'imports-history',
        placement: 'top',
        required: true,
        fallbackTitle: 'Histórico de importações',
        fallbackBody: 'O histórico lista todas as importações realizadas com status, data e contadores. Em caso de falha você pode revisar o log detalhado ou realizar uma nova tentativa.',
      },
    ],
  },

  // ── N. Notificações e logs ────────────────────────────────────────────────
  {
    id: 'notifications-logs',
    title: 'Notificações e logs',
    description: 'Preferências de canal e histórico de entregas.',
    category: 'notifications',
    rolesAllowed: ['owner', 'org_manager', 'unit_manager', 'area_leader', 'executor', 'viewer'],
    routePatterns: ['/settings'],
    startRoute: '/settings',
    estimatedMinutes: 2,
    steps: [
      {
        id: 'prefs',
        title: 'Preferências de canal',
        body: 'Decida onde quer ser notificado: e-mail, push do navegador ou WhatsApp.',
        route: '/settings',
        target: 'settings-notifications',
        placement: 'top',
        required: true,
        fallbackTitle: 'Preferências de notificação',
        fallbackBody: 'Em Configurações você controla cada canal de notificação de forma independente: e-mail, push do navegador e WhatsApp. Ative apenas os canais que preferir.',
      },
      {
        id: 'log',
        title: 'Log de entregas',
        body: 'Administradores enxergam o log de tudo que foi enviado, com status e mensagens de erro amigáveis.',
        placement: 'center',
      },
    ],
  },

  // ── O. Recorrências ───────────────────────────────────────────────────────
  {
    id: 'recurrences',
    title: 'Recorrências',
    description: 'Atividades que se repetem automaticamente.',
    category: 'administration',
    rolesAllowed: ['owner', 'org_manager', 'unit_manager'],
    routePatterns: ['/settings/recurrences'],
    startRoute: '/settings/recurrences',
    estimatedMinutes: 2,
    steps: [
      {
        id: 'intro',
        title: 'O que é recorrência',
        body: 'Uma recorrência gera atividades automaticamente em intervalos configurados (diária, semanal, mensal).',
        placement: 'center',
        route: '/settings/recurrences',
      },
      {
        id: 'list',
        title: 'Gerenciar recorrências',
        body: 'Pause, retome ou ajuste a frequência. A próxima execução fica visível em cada linha.',
        target: 'recurrence-list',
        placement: 'top',
        required: true,
        fallbackTitle: 'Lista de recorrências',
        fallbackBody: 'Cada recorrência aparece aqui com frequência, próxima execução e status ativo/pausado. Você pode pausar, retomar ou editar a frequência a qualquer momento.',
      },
    ],
  },

  // ── P. Auditoria ──────────────────────────────────────────────────────────
  {
    id: 'audit',
    title: 'Auditoria',
    description: 'Trilha de tudo que muda na organização.',
    category: 'audit',
    rolesAllowed: ['owner'],
    routePatterns: ['/settings/audit'],
    startRoute: '/settings/audit',
    estimatedMinutes: 2,
    steps: [
      {
        id: 'open',
        title: 'Auditoria',
        body: 'Registra ações administrativas: criação, edição, arquivamento, convites, imports.',
        route: '/settings/audit',
        placement: 'center',
      },
      {
        id: 'list',
        title: 'Filtrar e investigar',
        body: 'Filtre por ação ou período. Use a auditoria quando precisar entender por que algo mudou.',
        target: 'audit-list',
        placement: 'top',
        required: true,
        fallbackTitle: 'Trilha de auditoria',
        fallbackBody: 'A auditoria registra cada ação administrativa com ator, alvo e horário. Filtre por tipo de ação ou período para investigar o que mudou e quem alterou.',
      },
    ],
  },
];

export function getTutorialById(id: string): TutorialDefinition | undefined {
  return TUTORIAL_REGISTRY.find((t) => t.id === id);
}

export function getTutorialsForRole(role: NonNullable<UserRole>): TutorialDefinition[] {
  return TUTORIAL_REGISTRY.filter((t) => t.rolesAllowed.includes(role));
}

export const TUTORIAL_CATEGORY_LABELS: Record<TutorialCategory, string> = {
  'first-steps': 'Primeiros passos',
  'daily-operation': 'Operação diária',
  administration: 'Administração',
  integrations: 'Integrações',
  import: 'Importação',
  notifications: 'Notificações',
  audit: 'Auditoria',
};
