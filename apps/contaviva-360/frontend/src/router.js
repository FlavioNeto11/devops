import DashboardView from './views/DashboardView.vue';
import ResourceListView from './views/ResourceListView.vue';
import ResourceFormView from './views/ResourceFormView.vue';
import ResourceDetailView from './views/ResourceDetailView.vue';
import AiAssistantView from './views/AiAssistantView.vue';
import NotFoundView from './views/NotFoundView.vue';
export const routes = [
  { path: '/', name: 'dashboard', component: DashboardView },
  { path: '/records', name: 'records', component: ResourceListView },
  { path: '/records/new', name: 'record-new', component: ResourceFormView },
  { path: '/records/:id', name: 'record', component: ResourceDetailView, props: true },
  { path: '/records/:id/edit', name: 'record-edit', component: ResourceFormView, props: true },
  { path: '/assistant', name: 'assistant', component: AiAssistantView },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView },
];
