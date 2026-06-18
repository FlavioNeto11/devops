import { createRouter, createWebHistory } from 'vue-router'
import CompaniesView from './views/CompaniesView.vue'
import CompanyDetailView from './views/CompanyDetailView.vue'

const routes = [
  { path: '/', redirect: '/empresas' },
  { path: '/empresas', component: CompaniesView },
  { path: '/empresas/:id', component: CompanyDetailView },
]

export const router = createRouter({
  history: createWebHistory('/crm/'),
  routes,
})
