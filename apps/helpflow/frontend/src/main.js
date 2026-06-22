import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import { routes } from './router.js';
import { loadMe, meKnown, hasAnyRole } from './session.js';
import './tokens.generated.css';
import './ui/ui.css';
import './styles.css';
const router = createRouter({ history: createWebHistory('/helpflow/'), routes });

// Guard RBAC da borda: rotas com meta.roles exigem que o papel do usuário
// (/helpflow/api/me) esteja na lista. Fail-open quando o papel é DESCONHECIDO
// (sem SSO / dev local) — o backend continua sendo a fonte de verdade do RBAC.
router.beforeEach(async (to) => {
  const required = to.meta && to.meta.roles;
  if (!required || !required.length) return true;
  await loadMe();
  if (!meKnown.value) return true; // sem contexto de papel → deixa o backend decidir
  if (hasAnyRole(required)) return true;
  return { name: 'forbidden' };
});

createApp(App).use(router).mount('#app');
