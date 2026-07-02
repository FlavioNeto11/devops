import { createRouter, createWebHistory } from 'vue-router';
import PublicLayout from './layouts/PublicLayout.vue';
import AppShell from './layouts/AppShell.vue';
import Home from './views/Home.vue';
import Arquitetura from './views/Arquitetura.vue';
import Login from './views/Login.vue';
import Dashboard from './views/app/Dashboard.vue';
import Assistente from './views/app/Assistente.vue';
import Imoveis from './views/app/Imoveis.vue';
import Leads from './views/app/Leads.vue';
import Agenda from './views/app/Agenda.vue';
import Documentos from './views/app/Documentos.vue';
import Vistorias from './views/app/Vistorias.vue';
import Financeiro from './views/app/Financeiro.vue';
import Corbam from './views/app/Corbam.vue';
import WhatsApp from './views/app/WhatsApp.vue';
import Mercado from './views/app/Mercado.vue';
import ModulePlaceholder from './views/app/ModulePlaceholder.vue';
import { useAuthStore } from './stores/auth';

// Módulos ainda não construídos usam ModulePlaceholder; troque o component ao entregar a fase.
const moduleRoutes = [
  { path: 'imoveis', component: Imoveis },
  { path: 'leads', component: Leads },
  { path: 'agenda', component: Agenda },
  { path: 'vistorias', component: Vistorias },
  { path: 'documentos', component: Documentos },
  { path: 'financeiro', component: Financeiro },
  { path: 'corbam', component: Corbam },
  { path: 'mercado', component: Mercado },
  { path: 'whatsapp', component: WhatsApp },
];

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: PublicLayout,
      children: [
        { path: '', name: 'home', component: Home },
        { path: 'arquitetura', name: 'arquitetura', component: Arquitetura },
        { path: 'login', name: 'login', component: Login, meta: { public: true } },
      ],
    },
    {
      path: '/app',
      component: AppShell,
      meta: { requiresAuth: true },
      children: [
        { path: '', redirect: '/app/dashboard' },
        { path: 'dashboard', name: 'dashboard', component: Dashboard },
        { path: 'assistente', name: 'assistente', component: Assistente },
        ...moduleRoutes,
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  await auth.ensureReady(); // aguarda a hidratacao (evita derrubar logado no refresh/deep-link)
  if (to.matched.some((r) => r.meta?.requiresAuth)) {
    if (!auth.isAuthenticated) return { name: 'login', query: { redirect: to.fullPath } };
  }
  // ja logado indo p/ login -> manda pro painel
  if (to.name === 'login' && auth.isAuthenticated) return { path: '/app/dashboard' };
  return true;
});
