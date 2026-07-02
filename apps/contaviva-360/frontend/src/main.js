import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import { routes } from './router.js';
import './tokens.generated.css';
import './ui/ui.css';
import './styles.css';
const router = createRouter({ history: createWebHistory('/contaviva-360/'), routes });
createApp(App).use(router).mount('#app');
