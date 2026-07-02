import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import { routes, installGuards } from './router.js';
import './tokens.generated.css';
import './ui/ui.css';
import './styles.css';
const router = createRouter({ history: createWebHistory('/contaviva-pro/'), routes });
installGuards(router); // guards de sessão/papel (bloco contas-acesso)
createApp(App).use(router).mount('#app');
