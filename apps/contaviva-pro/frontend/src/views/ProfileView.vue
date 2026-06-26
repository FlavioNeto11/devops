<!-- ProfileView — o usuário edita o próprio nome e/ou senha (bloco contas-acesso). PATCH /me. -->
<template>
  <UiPageLayout title="Perfil" eyebrow="Sua conta" subtitle="Atualize seus dados de acesso." width="narrow">
    <UiCard v-if="account.user.value">
      <dl class="prof-id">
        <div><dt>E-mail</dt><dd>{{ account.user.value.email }}</dd></div>
        <div><dt>Papel</dt><dd><UiStatusBadge :tone="account.isAdmin.value ? 'success' : 'neutral'" :label="account.user.value.role" size="sm" /></dd></div>
      </dl>
      <form @submit.prevent="submit">
        <UiFormSection title="Dados" :columns="1">
          <UiFormField label="Nome" :error="f.errors.name">
            <template #default="{ id, describedBy }">
              <UiInput :id="id" :described-by="describedBy" :model-value="f.values.name" autocomplete="name" @update:model-value="f.setField('name', $event)" />
            </template>
          </UiFormField>
          <UiFormField label="Senha atual" :error="f.errors.currentPassword" hint="Obrigatória apenas para trocar a senha.">
            <template #default="{ id, describedBy }">
              <UiInput :id="id" :described-by="describedBy" type="password" :model-value="f.values.currentPassword" autocomplete="current-password" placeholder="••••••••" @update:model-value="f.setField('currentPassword', $event)" />
            </template>
          </UiFormField>
          <UiFormField label="Nova senha" :error="f.errors.password" hint="Deixe em branco para manter a senha atual (mínimo 8 caracteres).">
            <template #default="{ id, describedBy }">
              <UiInput :id="id" :described-by="describedBy" type="password" :model-value="f.values.password" autocomplete="new-password" placeholder="••••••••" @update:model-value="f.setField('password', $event)" />
            </template>
          </UiFormField>
        </UiFormSection>
        <div class="prof-actions">
          <UiButton type="submit" :loading="f.submitting.value">Salvar</UiButton>
        </div>
      </form>
    </UiCard>
    <UiLoadingState v-else title="Carregando perfil…" />
  </UiPageLayout>
</template>
<script setup>
import { onMounted } from 'vue';
import { UiPageLayout, UiCard, UiStatusBadge, UiFormSection, UiFormField, UiInput, UiButton, UiLoadingState, useForm, validators, useToast } from '../ui/index.js';
import { useAuth } from '../composables/useAuth.js';
const toast = useToast();
const account = useAuth();
// minLen(8) já ignora valor vazio (senha em branco = manter atual); validamos manualmente no submit também.
const f = useForm({ initial: { name: '', currentPassword: '', password: '' }, rules: { password: [validators.minLen(8)] } });
f.values.name = (account.user.value && account.user.value.name) || '';
onMounted(async () => { if (!account.user.value) await account.fetchMe(); f.values.name = (account.user.value && account.user.value.name) || ''; });
function submit() {
  f.errors.password = ''; f.errors.currentPassword = '';
  if (f.values.password && f.values.password.length < 8) { f.errors.password = 'A senha precisa de ao menos 8 caracteres.'; return; }
  // troca de senha exige a senha atual (o backend reverifica e revoga as sessões).
  if (f.values.password && !f.values.currentPassword) { f.errors.currentPassword = 'Informe a senha atual para trocá-la.'; return; }
  const payload = {};
  if (f.values.name && f.values.name.trim()) payload.name = f.values.name.trim();
  if (f.values.password) { payload.password = f.values.password; payload.currentPassword = f.values.currentPassword; }
  if (!Object.keys(payload).length) { toast.info('Nada para salvar.'); return; }
  f.handleSubmit(async () => {
    try {
      await account.updateMe(payload);
      f.values.password = ''; f.values.currentPassword = '';
      toast.success('Perfil atualizado.');
    } catch (e) {
      if (e.status === 403) { f.errors.currentPassword = 'Senha atual inválida.'; toast.error('Senha atual inválida.'); }
      else toast.error(e.status === 400 ? (e.message || 'Verifique os dados.') : 'Não foi possível salvar.');
    }
  });
}
</script>
<style scoped>
.prof-id { display: grid; gap: var(--ui-space-3); margin: 0 0 var(--ui-space-4); padding-bottom: var(--ui-space-4); border-bottom: 1px solid rgb(var(--ui-border)); }
.prof-id dt { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.prof-id dd { margin: 2px 0 0; }
.prof-actions { display: flex; justify-content: flex-end; margin-top: var(--ui-space-3); }
</style>
