import { createRouter, createWebHistory } from 'vue-router'
import DashboardView from './views/DashboardView.vue'
import CompaniesView from './views/CompaniesView.vue'
import CompanyDetailView from './views/CompanyDetailView.vue'
import ContactsView from './views/ContactsView.vue'
import DealsView from './views/DealsView.vue'

const routes = [
  { path: '/', component: DashboardView },
  { path: '/negocios', component: DealsView },
  { path: '/empresas', component: CompaniesView },
  { path: '/empresas/:id', component: CompanyDetailView },
  { path: '/contatos', component: ContactsView },
]

export const router = createRouter({
  history: createWebHistory('/crm/'),
  routes,
})
