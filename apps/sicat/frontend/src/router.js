import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from './stores/auth.js';
import HomeLandingView from './views/HomeLandingView.vue';
import LoginView from './views/LoginView.vue';
import LoginKeycloakCallbackView from './views/LoginKeycloakCallbackView.vue';
import CetesbAccountSelectionView from './views/CetesbAccountSelectionView.vue';
import DashboardView from './features/dashboard/DashboardView.vue';
import ManifestsView from './views/ManifestsView.vue';
import ManifestReportView from './views/ManifestReportView.vue';
import ManifestCreateView from './views/ManifestCreateView.vue';
import ManifestDetailView from './views/ManifestDetailView.vue';
import JobsView from './views/JobsView.vue';
import SessionAccountView from './views/SessionAccountView.vue';
import AccessAdminView from './views/AccessAdminView.vue';
import ConversationalChatAppView from './views/ConversationalChatAppView.vue';
import DmrListView from './views/dmr/DmrListView.vue';
import DmrPendentesView from './views/dmr/DmrPendentesView.vue';
import DmrCreateView from './views/dmr/DmrCreateView.vue';
import DmrDetailView from './views/dmr/DmrDetailView.vue';
import MtrProvisorioListView from './views/mtr-provisorio/MtrProvisorioListView.vue';
import MtrProvisorioCreateView from './views/mtr-provisorio/MtrProvisorioCreateView.vue';
import MtrProvisorioDetailView from './views/mtr-provisorio/MtrProvisorioDetailView.vue';
import OperationsDashboardView from './modules/operations-dashboard/OperationsDashboardView.vue';
import AuditExplorerView from './modules/audit-explorer/AuditExplorerView.vue';
import CetesbAccountsHealthView from './modules/cetesb-accounts-health/CetesbAccountsHealthView.vue';
import MtrReportsView from './modules/mtr-reports/MtrReportsView.vue';
import CommandCenterView from './modules/command-center/CommandCenterView.vue';
import CdfListView from './views/CdfListView.vue';
import CdfCreateView from './views/CdfCreateView.vue';

// Destino inicial do admin/SRE (persona de sistema) — não exige conta CETESB.
const ADMIN_HOME = '/operacao/dashboard';

const routes = [
  {
    path: '/',
    name: 'Home',
    component: HomeLandingView,
    meta: { requiresSicatAuth: false, hideShell: true, fullBleed: true }
  },
  {
    path: '/login',
    name: 'Login',
    component: LoginView,
    meta: { requiresSicatAuth: false, hideShell: true }
  },
  {
    path: '/login/keycloak/callback',
    name: 'LoginKeycloakCallback',
    component: LoginKeycloakCallbackView,
    meta: { requiresSicatAuth: false, hideShell: true }
  },
  {
    path: '/login/cetesb',
    name: 'LoginCetesb',
    component: CetesbAccountSelectionView,
    meta: { requiresSicatAuth: true, hideShell: true }
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: DashboardView,
    meta: {
      requiresSicatAuth: true,
      requiresActiveCetesbAccount: true,
      audience: 'operator',
      breadcrumb: ['Início']
    }
  },
  {
    path: '/manifestos',
    name: 'Manifestos',
    component: ManifestsView,
    meta: {
      requiresSicatAuth: true,
      requiresActiveCetesbAccount: true,
      audience: 'operator',
      breadcrumb: ['MTR', 'Manifestos']
    }
  },
  {
    path: '/relatorios/mtrs',
    name: 'RelatorioMtrs',
    component: ManifestReportView,
    meta: {
      requiresSicatAuth: true,
      requiresActiveCetesbAccount: true,
      audience: 'operator',
      breadcrumb: ['MTR', 'Relatórios']
    }
  },
  {
    path: '/manifestos/novo',
    name: 'ManifestoNovo',
    component: ManifestCreateView,
    meta: {
      requiresSicatAuth: true,
      requiresActiveCetesbAccount: true,
      audience: 'operator',
      breadcrumb: ['MTR', 'Emitir MTR']
    }
  },
  {
    path: '/manifestos/:id',
    name: 'ManifestoDetalhe',
    component: ManifestDetailView,
    meta: {
      requiresSicatAuth: true,
      requiresActiveCetesbAccount: true,
      audience: 'operator',
      breadcrumb: ['MTR', 'Detalhe do manifesto']
    }
  },
  {
    path: '/jobs',
    redirect: '/sistema/jobs'
  },
  {
    path: '/dmr',
    name: 'DmrList',
    component: DmrListView,
    meta: {
      requiresSicatAuth: true,
      requiresActiveCetesbAccount: true,
      audience: 'operator',
      breadcrumb: ['Resíduos · DMR', 'Declarações']
    }
  },
  {
    path: '/dmr/pendentes',
    name: 'DmrPendentes',
    component: DmrPendentesView,
    meta: {
      requiresSicatAuth: true,
      requiresActiveCetesbAccount: true,
      audience: 'operator',
      breadcrumb: ['Resíduos · DMR', 'Pendentes']
    }
  },
  {
    path: '/dmr/novo',
    name: 'DmrNovo',
    component: DmrCreateView,
    meta: {
      requiresSicatAuth: true,
      requiresActiveCetesbAccount: true,
      audience: 'operator',
      breadcrumb: ['Resíduos · DMR', 'Nova declaração']
    }
  },
  {
    path: '/dmr/:dmrId',
    name: 'DmrDetalhe',
    component: DmrDetailView,
    meta: {
      requiresSicatAuth: true,
      requiresActiveCetesbAccount: true,
      audience: 'operator',
      breadcrumb: ['Resíduos · DMR', 'Detalhe']
    }
  },
  {
    path: '/mtr-provisorio',
    name: 'MtrProvisorioList',
    component: MtrProvisorioListView,
    meta: {
      requiresSicatAuth: true,
      requiresActiveCetesbAccount: true,
      audience: 'operator',
      breadcrumb: ['MTR Provisório', 'Lista']
    }
  },
  {
    path: '/mtr-provisorio/novo',
    name: 'MtrProvisorioNovo',
    component: MtrProvisorioCreateView,
    meta: {
      requiresSicatAuth: true,
      requiresActiveCetesbAccount: true,
      audience: 'operator',
      breadcrumb: ['MTR Provisório', 'Novo']
    }
  },
  {
    path: '/mtr-provisorio/:id',
    name: 'MtrProvisorioDetalhe',
    component: MtrProvisorioDetailView,
    meta: {
      requiresSicatAuth: true,
      requiresActiveCetesbAccount: true,
      audience: 'operator',
      breadcrumb: ['MTR Provisório', 'Detalhe']
    }
  },
  {
    path: '/sessao',
    name: 'SessaoConta',
    component: SessionAccountView,
    meta: {
      requiresSicatAuth: true,
      requiresActiveCetesbAccount: true,
      audience: 'operator',
      breadcrumb: ['Minha sessão', 'Conta CETESB']
    }
  },
  {
    path: '/conversacional/chat',
    name: 'ChatOperacional',
    component: ConversationalChatAppView,
    meta: {
      requiresSicatAuth: true,
      requiresActiveCetesbAccount: true,
      audience: 'operator',
      breadcrumb: ['Assistente']
    }
  },
  {
    path: '/admin/acessos',
    name: 'AdminAcessos',
    component: AccessAdminView,
    meta: {
      requiresSicatAuth: true,
      requiresActiveCetesbAccount: true,
      requiresAdminAccess: true,
      audience: 'admin',
      breadcrumb: ['Administração', 'Acessos']
    }
  },
  {
    path: '/operacao/dashboard',
    name: 'CentroOperacionalDashboard',
    component: OperationsDashboardView,
    meta: {
      requiresSicatAuth: true,
      requiresActiveCetesbAccount: true,
      requiresAdminAccess: true,
      audience: 'system',
      breadcrumb: ['Sistema', 'Visão geral']
    }
  },
  {
    path: '/operacao/jobs',
    redirect: '/sistema/jobs'
  },
  {
    path: '/operacao/auditoria',
    name: 'CentroOperacionalAuditoria',
    component: AuditExplorerView,
    meta: {
      requiresSicatAuth: true,
      requiresActiveCetesbAccount: true,
      requiresAdminAccess: true,
      audience: 'system',
      breadcrumb: ['Sistema', 'Auditoria']
    }
  },
  {
    path: '/operacao/auditoria/:correlationId',
    name: 'CentroOperacionalAuditoriaDetalhe',
    component: AuditExplorerView,
    meta: {
      requiresSicatAuth: true,
      requiresActiveCetesbAccount: true,
      requiresAdminAccess: true,
      audience: 'system',
      breadcrumb: ['Sistema', 'Auditoria', 'Timeline']
    }
  },
  {
    path: '/operacao/cetesb-health',
    name: 'CentroOperacionalCetesbHealth',
    component: CetesbAccountsHealthView,
    meta: {
      requiresSicatAuth: true,
      requiresActiveCetesbAccount: true,
      requiresAdminAccess: true,
      audience: 'system',
      breadcrumb: ['Sistema', 'Saúde CETESB']
    }
  },
  {
    path: '/operacao/relatorios/mtr',
    name: 'CentroOperacionalRelatoriosMtr',
    component: MtrReportsView,
    meta: {
      requiresSicatAuth: true,
      requiresActiveCetesbAccount: true,
      requiresAdminAccess: true,
      audience: 'system',
      breadcrumb: ['Sistema', 'Relatório MTR']
    }
  },
  {
    path: '/operacao/command-center',
    name: 'CentroOperacionalCommandCenter',
    component: CommandCenterView,
    meta: {
      requiresSicatAuth: true,
      requiresActiveCetesbAccount: true,
      requiresAdminAccess: true,
      audience: 'system',
      breadcrumb: ['Sistema', 'Command Center']
    }
  },
  {
    path: '/sistema/jobs',
    name: 'SistemaJobs',
    component: JobsView,
    meta: {
      requiresSicatAuth: true,
      requiresActiveCetesbAccount: true,
      requiresAdminAccess: true,
      audience: 'system',
      breadcrumb: ['Sistema', 'Jobs']
    }
  },
  {
    path: '/sistema/ai-control',
    name: 'SistemaAiControlCenter',
    component: () => import('./views/ai-control/AiControlCenterView.vue'),
    meta: {
      requiresSicatAuth: true,
      requiresActiveCetesbAccount: false,
      requiresAdminAccess: true,
      audience: 'system',
      // A view já renderiza seu próprio SicatPageHeader (com status ao vivo);
      // ocultamos o header genérico do shell para não duplicar.
      hidePageHeader: true,
      breadcrumb: ['Sistema', 'AI Control Center']
    }
  },
  {
    path: '/cdf',
    name: 'CdfList',
    component: CdfListView,
    meta: {
      requiresSicatAuth: true,
      requiresActiveCetesbAccount: true,
      audience: 'operator',
      breadcrumb: ['Certificados · CDF', 'Emitidos']
    }
  },
  {
    path: '/cdf/novo',
    name: 'CdfNovo',
    component: CdfCreateView,
    meta: {
      requiresSicatAuth: true,
      requiresActiveCetesbAccount: true,
      audience: 'operator',
      breadcrumb: ['Certificados · CDF', 'Gerar CDF']
    }
  },
  {
    path: '/dev/components',
    name: 'DevComponentsPlayground',
    component: () => import('./views/dev/SicatComponentsPlayground.vue'),
    meta: {
      requiresSicatAuth: true,
      requiresActiveCetesbAccount: false,
      audience: 'system',
      breadcrumb: ['Dev', 'Componentes Sicat']
    }
  }
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition;
    }

    if (to.hash) {
      return {
        el: to.hash,
        behavior: 'smooth'
      };
    }

    return {
      top: 0,
      left: 0,
      behavior: from.path === to.path ? 'auto' : 'smooth'
    };
  }
});

async function ensureAdminRouteAccess(authStore) {
  try {
    await authStore.syncSicatSession({ throwOnError: true });
  } catch {
    return false;
  }

  return authStore.canAccessAdmin.value;
}

function handlePublicEntryNavigation(to, hasSicatAuth, hasActiveCetesbAccount, isAdmin, next) {
  const wantsPublicHome = to.path === '/' && (to.query?.public === '1' || to.query?.public === 'true');
  if (wantsPublicHome) {
    next();
    return true;
  }

  if (to.path !== '/' && to.path !== '/login') {
    return false;
  }

  if (!hasSicatAuth) {
    next();
    return true;
  }

  // Admin/SRE entra direto na área de Sistema, sem a segunda etapa (conta CETESB).
  if (isAdmin) {
    next(ADMIN_HOME);
    return true;
  }

  next(hasActiveCetesbAccount ? '/dashboard' : '/login/cetesb');
  return true;
}

router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore();
  const hasSicatAuth = await Promise.resolve(authStore.checkAuth());
  const hasActiveCetesbAccount = authStore.hasActiveCetesbAccount.value;
  const isAdmin = Boolean(authStore.canAccessAdmin.value);
  if (handlePublicEntryNavigation(to, hasSicatAuth, hasActiveCetesbAccount, isAdmin, next)) {
    return;
  }

  if (to.meta.requiresSicatAuth && !hasSicatAuth) {
    authStore.logout();
    next({ path: '/login', query: { reason: 'expired' } });
    return;
  }

  // Admin/SRE é persona de sistema: nunca passa pela seleção de conta CETESB e
  // não acessa telas de operador (audience 'operator') — é redirecionado ao Sistema.
  if (hasSicatAuth && isAdmin) {
    if (to.path === '/login/cetesb' || to.meta.audience === 'operator') {
      next(ADMIN_HOME);
      return;
    }
  }

  if (to.path === '/login/cetesb' && hasSicatAuth && hasActiveCetesbAccount) {
    next('/dashboard');
    return;
  }

  if (to.meta.requiresActiveCetesbAccount && !hasActiveCetesbAccount && !isAdmin) {
    next('/login/cetesb');
    return;
  }

  if (to.meta.requiresAdminAccess) {
    const hasAdminAccess = await ensureAdminRouteAccess(authStore);
    if (!hasAdminAccess) {
      next({
        path: '/dashboard',
        query: {
          notice: 'admin-access-denied',
          deniedRoute: String(to.fullPath || to.path || '/admin/acessos')
        }
      });
      return;
    }
  }

  next();
});

// Título da aba do navegador acompanha a rota (derivado do breadcrumb/nome) —
// várias abas do SICAT abertas ficam distinguíveis sem mudar nenhuma rota.
router.afterEach((to) => {
  const crumbs = Array.isArray(to.meta?.breadcrumb) ? to.meta.breadcrumb : null;
  const page = crumbs?.length ? crumbs[crumbs.length - 1] : (typeof to.name === 'string' ? to.name : '');
  document.title = page && page !== 'Início' ? `${page} · SICAT` : 'SICAT — Transporte de Resíduos CETESB-SP';
});

export default router;
