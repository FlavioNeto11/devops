<template>
  <component :is="view" v-if="view" />
  <UiPageLayout v-else title="Painel" eyebrow="ContaViva 360" :loading="!roleError">
    <UiErrorState v-if="roleError" :error="roleError" @retry="detectRole" />
  </UiPageLayout>
</template>

<script setup>
import { ref, shallowRef, onMounted } from 'vue';
import { UiPageLayout, UiErrorState } from '../ui/index.js';
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

onMounted(detectRole);
</script>
