import { createRouter, createWebHistory } from 'vue-router';
import { nextTick } from 'vue';
import { useAuthStore } from './stores/auth.js';
import { useNotification } from './composables/useNotification.js';
import {
  describeRequiredPersonas,
  resolveActivePersona,
  routeAllowsPersona
} from './lib/persona-access.js';
import {
  ROUTE_DENIAL_REASONS,
  buildRouteDenialNotice,
  queueRouteDenialNotice,
  takeRouteDenialNotice
} from './lib/route-denial-notice.js';
import { decideStaleBundleRecovery } from './lib/stale-bundle-recovery.js';
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
import NotFoundView from './views/NotFoundView.vue';

// Destino inicial do admin/SRE (persona de sistema) — não exige conta CETESB.
const ADMIN_HOME = '/operacao/dashboard';

// Destino de fallback do operador quando uma rota é negada (permissão ou perfil).
const OPERATOR_HOME = '/dashboard';

// Regras de perfil (persona) por rota: `lib/persona-access.js` — módulo PURO,
// coberto por node:test (o guard abaixo não pode voltar a ficar sem teste).

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
      breadcrumb: ['MTR', 'Relatórios de MTR']
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
      // Emitir MTR é ação do Gerador (espelha config/navigation.js).
      personas: ['generator'],
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
      breadcrumb: ['Resíduos · DMR', 'Declarações de resíduos']
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
      breadcrumb: ['Resíduos · DMR', 'Declarações pendentes']
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
      breadcrumb: ['Resíduos · DMR', 'Nova declaração de resíduos']
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
      breadcrumb: ['Resíduos · DMR', 'Detalhe da declaração']
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
      // MTR provisório (emergência) é fluxo do Gerador (espelha config/navigation.js).
      personas: ['generator'],
      breadcrumb: ['MTR provisório', 'Meus MTRs provisórios']
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
      personas: ['generator'],
      breadcrumb: ['MTR provisório', 'Novo MTR provisório']
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
      personas: ['generator'],
      breadcrumb: ['MTR provisório', 'Detalhe do MTR provisório']
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
      breadcrumb: ['Administração', 'Perfis e acessos']
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
      breadcrumb: ['Sistema', 'Visão geral do sistema']
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
      breadcrumb: ['Sistema', 'Auditoria', 'Linha do tempo da auditoria']
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
      breadcrumb: ['Sistema', 'Relatórios de MTR (SRE)']
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
      // CDF é emitido pelo Destinador (espelha config/navigation.js).
      personas: ['receiver'],
      breadcrumb: ['Certificados · CDF', 'Certificados emitidos']
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
      personas: ['receiver'],
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
      requiresAdminAccess: true,
      audience: 'system',
      breadcrumb: ['Dev', 'Componentes Sicat']
    }
  },
  {
    // Catch-all: URL desconhecida vira 404 DE VERDADE (título próprio,
    // explicação e caminho de volta) em vez de um card genérico do shell.
    // Precisa ser a ÚLTIMA rota. Sem `requiresSicatAuth` para não transformar
    // um endereço errado em "sessão expirada"; quem está logado vê o 404 dentro
    // do shell (com o menu como saída), quem não está vê a versão pública.
    path: '/:pathMatch(.*)*',
    name: 'NaoEncontrado',
    component: NotFoundView,
    meta: {
      requiresSicatAuth: false,
      // A view é o próprio cabeçalho; o header genérico do shell repetiria o
      // título e ainda descreveria a tela como se fosse uma tela de operação.
      hidePageHeader: true,
      breadcrumb: ['Página não encontrada']
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
      // O aviso é genérico de propósito: o path negado não vai para a URL nem
      // para a tela, para não expor o mapa de rotas internas a quem não tem acesso.
      // Ele é ENFILEIRADO aqui e emitido no afterEach (ver lib/route-denial-notice.js):
      // emitir agora fazia o toast nascer e expirar enquanto a tela de destino
      // ainda carregava — o redirect parecia silencioso.
      queueRouteDenialNotice(buildRouteDenialNotice({
        reason: ROUTE_DENIAL_REASONS.ADMIN,
        redirectTo: OPERATOR_HOME
      }));
      next(OPERATOR_HOME);
      return;
    }
  }

  // Perfil da conta CETESB ativa (Gerador/Transportador/Destinador): telas
  // exclusivas de um perfil ficam bloqueadas também por URL direta, e não só
  // ocultas no menu.
  if (!routeAllowsPersona(to, resolveActivePersona(authStore))) {
    queueRouteDenialNotice(buildRouteDenialNotice({
      reason: ROUTE_DENIAL_REASONS.PERSONA,
      requiredPersonas: describeRequiredPersonas(to),
      redirectTo: OPERATOR_HOME
    }));
    next(OPERATOR_HOME);
    return;
  }

  next();
});

// Título da aba do navegador acompanha a rota (derivado do breadcrumb/nome) —
// várias abas do SICAT abertas ficam distinguíveis sem mudar nenhuma rota.
router.afterEach((to) => {
  const crumbs = Array.isArray(to.meta?.breadcrumb) ? to.meta.breadcrumb : null;
  const page = crumbs?.length ? crumbs[crumbs.length - 1] : (typeof to.name === 'string' ? to.name : '');
  document.title = page && page !== 'Início' ? `${page} · SICAT` : 'SICAT — Transporte de Resíduos CETESB-SP';

  // Rota negada: o aviso enfileirado pelo guard só é EMITIDO agora, com a
  // navegação já concluída e o host de notificação montado. Emitir dentro do
  // beforeEach fazia o toast começar a contar o tempo de vida enquanto o
  // destino ainda carregava — e o redirect chegava mudo ao operador.
  const denialNotice = takeRouteDenialNotice(to.path, Date.now());
  if (denialNotice) {
    void nextTick(() => {
      useNotification().warning(denialNotice.message, {
        detail: denialNotice.detail,
        timeout: denialNotice.timeout
      });
    });
  }
});

// ---------------------------------------------------------------------------
// Recuperação de sessão presa em bundle antigo (ver lib/stale-bundle-recovery.js).
// ---------------------------------------------------------------------------

const STALE_BUNDLE_STORAGE_KEY = 'sicat:stale-bundle-reload-at';

function readLastStaleBundleReloadAt() {
  try {
    return Number(globalThis.sessionStorage?.getItem(STALE_BUNDLE_STORAGE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function rememberStaleBundleReload(at) {
  try {
    globalThis.sessionStorage?.setItem(STALE_BUNDLE_STORAGE_KEY, String(at));
  } catch {
    /* sessionStorage indisponível (modo restrito) — segue sem a trava persistida. */
  }
}

/**
 * Alvo do reload: quando a navegação para `to` falhou, a barra de endereço
 * ainda mostra a tela ANTERIOR — recarregar direto levaria o operador de volta
 * ao ponto errado. `router.resolve` devolve o href já com o base `/sicat/`.
 */
function resolveReloadHref(to) {
  try {
    return to ? router.resolve(to).href : '';
  } catch {
    return '';
  }
}

function recoverFromStaleBundle(error, to) {
  const decision = decideStaleBundleRecovery({
    error,
    lastReloadAt: readLastStaleBundleReloadAt(),
    now: Date.now()
  });

  if (decision.action === 'ignore') {
    return false;
  }

  const notify = useNotification();

  if (decision.action === 'reload') {
    rememberStaleBundleReload(Date.now());
    // timeout 0: o aviso precisa estar visível no instante do reload.
    notify.info(decision.message, { detail: decision.detail, timeout: 0 });

    const href = resolveReloadHref(to);
    // Pequeno atraso para o aviso pintar antes de a página ser trocada.
    setTimeout(() => {
      if (href) {
        globalThis.location?.assign(href);
        return;
      }
      globalThis.location?.reload();
    }, 400);

    return true;
  }

  // Já recarregamos há pouco: recarregar de novo viraria laço. Damos a saída
  // manual, explícita, em vez de deixar a tela travada sem explicação.
  notify.error(decision.message, {
    detail: decision.detail,
    actionLabel: decision.actionLabel,
    onAction: () => {
      rememberStaleBundleReload(Date.now());
      globalThis.location?.reload();
    }
  });

  return true;
}

router.onError((error, to) => {
  if (recoverFromStaleBundle(error, to)) {
    return;
  }

  console.error('[router] navegação falhou', error);
});

// Falha de PRELOAD de chunk/CSS não passa pelo router.onError — o Vite emite
// este evento na window. Mesmo tratamento (é o mesmo sintoma).
globalThis.addEventListener?.('vite:preloadError', (event) => {
  const handled = recoverFromStaleBundle(event?.payload || event, null);
  if (handled) {
    event?.preventDefault?.();
  }
});

export default router;
