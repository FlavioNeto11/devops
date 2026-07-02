import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { useAuthStore } from './stores/auth';
import './styles.css';

const pinia = createPinia();
const app = createApp(App).use(pinia).use(router);

// A hidratacao da sessao e' aguardada pelo guard do router (ensureReady). Monta apos o router
// ficar pronto para nao renderizar a rota errada por um instante.
useAuthStore(pinia);
router.isReady().finally(() => app.mount('#app'));
