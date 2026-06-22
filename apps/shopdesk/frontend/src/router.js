import DashboardView from './views/DashboardView.vue';
import RecordListView from './views/RecordListView.vue';
import RecordDetailView from './views/RecordDetailView.vue';
export const routes = [
  { path: '/', name: 'dashboard', component: DashboardView },
  { path: '/records', name: 'records', component: RecordListView },
  { path: '/records/:id', name: 'record', component: RecordDetailView, props: true },
];
