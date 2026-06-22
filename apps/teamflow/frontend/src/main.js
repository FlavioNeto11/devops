import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import { routes } from './router.js';
import './tokens.generated.css';
import './styles.css';
const router = createRouter({ history: createWebHistory('/teamflow/'), routes });
createApp(App).use(router).mount('#app');
