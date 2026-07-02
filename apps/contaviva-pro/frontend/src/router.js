import DashboardView from './views/DashboardView.vue';
import ResourceListView from './views/ResourceListView.vue';
import ResourceFormView from './views/ResourceFormView.vue';
import ResourceDetailView from './views/ResourceDetailView.vue';
import AiAssistantView from './views/AiAssistantView.vue';
import AuthView from './views/AuthView.vue';
import ProfileView from './views/ProfileView.vue';
import AdminUsuariosView from './views/AdminUsuariosView.vue';
import { useAuth } from './composables/useAuth.js';
import NotFoundView from './views/NotFoundView.vue';
export const routes = [
  { path: '/', name: 'dashboard', component: DashboardView, meta: { requiresAuth: true } },
  { path: '/records', name: 'records', component: ResourceListView, meta: { requiresAuth: true } },
  { path: '/records/new', name: 'record-new', component: ResourceFormView, meta: { requiresAuth: true } },
  { path: '/records/:id', name: 'record', component: ResourceDetailView, props: true, meta: { requiresAuth: true } },
  { path: '/records/:id/edit', name: 'record-edit', component: ResourceFormView, props: true, meta: { requiresAuth: true } },
  { path: '/assistant', name: 'assistant', component: AiAssistantView, meta: { requiresAuth: true } },
  { path: '/login', name: 'login', component: AuthView, meta: { public: true } },
  { path: '/profile', name: 'profile', component: ProfileView, meta: { requiresAuth: true } },
  { path: '/admin/users', name: 'admin-users', component: AdminUsuariosView, meta: { requiresAuth: true, requiresAdmin: true } },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView },
];

// Guards: sem sessão -> /login (com redirect de volta); rota admin com papel != admin -> dashboard.
// A sessão é hidratada do token guardado (bootstrap) ANTES da 1ª navegação protegida.
export function installGuards(router) {
  const auth = useAuth();
  router.beforeEach(async (to) => {
    if (!auth.ready.value) await auth.bootstrap();
    if (to.meta && to.meta.requiresAuth && !auth.user.value) return { name: 'login', query: { redirect: to.fullPath } };
    if (to.meta && to.meta.requiresAdmin && !auth.isAdmin.value) return { name: 'dashboard' };
    if (to.name === 'login' && auth.user.value) return { name: 'dashboard' };
    return true;
  });
}
