import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router.js';
import '@fontsource/public-sans/300.css';
import '@fontsource/public-sans/400.css';
import '@fontsource/public-sans/500.css';
import '@fontsource/public-sans/600.css';
import '@fontsource/public-sans/700.css';
import '@fontsource/public-sans/800.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/manrope/800.css';
import '@fontsource/material-symbols-outlined';
import vuetify from './plugins/vuetify.js';
import { bootstrapDocumentTheme } from './composables/useAppTheme.js';
import { startVersionWatch } from './lib/version-watch.js';
import './styles/base.css';

bootstrapDocumentTheme();

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(vuetify);
app.mount('#app');

// Aba presa na versão antiga pelo cache do navegador é INVISÍVEL (nenhum asset
// dá 404). A checagem de versão pergunta pela rede, ignorando o cache HTTP —
// ver src/lib/version-check.js.
startVersionWatch({ router });
