<template>
  <component :is="view" v-if="view" />
  <UiPageLayout v-else title="Painel" eyebrow="ContaViva 360" :loading="!roleError">
    <UiErrorState v-if="roleError" :error="roleError" @retry="detectRole" />
  </UiPageLayout>
</template>

<script setup>
import { ref, shallowRef, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { UiPageLayout, UiErrorState, useToast } from '../ui/index.js';
import { me } from '../api.js';
import DashboardClientePfView from './DashboardClientePfView.vue';
import DashboardClientePjView from './DashboardClientePjView.vue';
import DashboardContadorView from './DashboardContadorView.vue';
import DashboardAdminView from './DashboardAdminView.vue';

const ROLE_MAP = {
  admin: DashboardAdminView,
  manager: DashboardContadorView,
  contador: DashboardContadorView,
  member: DashboardClientePfView,
  cliente_pf: DashboardClientePfView,
  cliente_pj: DashboardClientePjView,
};

const view = shallowRef(null);
const roleError = ref(null);
const route = useRoute();
const router = useRouter();
const toast = useToast();

async function detectRole() {
  roleError.value = null;
  try {
    const meData = await me();
    view.value = ROLE_MAP[meData.role] || DashboardClientePfView;
  } catch (e) {
    roleError.value = e;
    view.value = DashboardClientePfView;
  }
}

onMounted(() => {
  detectRole();
  // Chegou aqui redirecionado de uma rota /dashboard/<papel> órfã (router.js): explica a troca de
  // contexto e limpa o parâmetro para não repetir o aviso ao recarregar (UX-CV360-010).
  if (route.query.painel === 'auto') {
    toast.info('Abrimos o seu painel de acordo com o seu perfil.');
    router.replace({ path: '/', query: {} });
  }
});
</script>
