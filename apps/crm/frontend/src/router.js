import { createRouter, createWebHistory } from 'vue-router'
import CompaniesView from './views/CompaniesView.vue'
import CompanyDetailView from './views/CompanyDetailView.vue'
import ContactsView from './views/ContactsView.vue'

const routes = [
  { path: '/', redirect: '/empresas' },
  { path: '/empresas', component: CompaniesView },
  { path: '/empresas/:id', component: CompanyDetailView },
  { path: '/contatos', component: ContactsView },
]

export const router = createRouter({
  history: createWebHistory('/crm/'),
  routes,
})
