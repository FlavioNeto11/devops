import DashboardView from './views/DashboardView.vue';
import RecordListView from './views/RecordListView.vue';
import RecordDetailView from './views/RecordDetailView.vue';
import LojaView from './views/LojaView.vue';
export const routes = [
  { path: '/', name: 'dashboard', component: DashboardView },
  { path: '/loja', name: 'loja', component: LojaView },
  { path: '/records', name: 'records', component: RecordListView },
  { path: '/records/:id', name: 'record', component: RecordDetailView, props: true },
];
