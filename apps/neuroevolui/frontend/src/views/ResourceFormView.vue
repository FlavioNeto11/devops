<template>
  <UiPageLayout :title="isEdit ? 'Editar registro' : 'Novo registro'" width="narrow">
    <UiCard>
      <form @submit.prevent="submit">
        <UiFormSection title="Dados do registro" :columns="1">
          <UiFormField label="Título" :required="true" :error="f.errors.title">
            <template #default="{ id, describedBy }">
              <UiInput :id="id" :described-by="describedBy" :model-value="f.values.title" :error="!!f.errors.title" :required="true" placeholder="Ex.: Meu registro" @update:model-value="f.setField('title', $event)" />
            </template>
          </UiFormField>
        </UiFormSection>
        <div class="form-actions">
          <UiButton variant="ghost" type="button" @click="cancel">Cancelar</UiButton>
          <UiButton type="submit" :loading="f.submitting.value">{{ isEdit ? 'Salvar' : 'Criar' }}</UiButton>
        </div>
      </form>
    </UiCard>
  </UiPageLayout>
</template>
<script setup>
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { UiPageLayout, UiCard, UiFormSection, UiFormField, UiInput, UiButton, useForm, useToast } from '../ui/index.js';
import { validators } from '../ui/index.js';
import { records } from '../api.js';
const props = defineProps({ id: { type: String, default: null } });
const router = useRouter();
const toast = useToast();
const isEdit = computed(() => !!props.id);
const f = useForm({ initial: { title: '' }, rules: { title: [validators.required(), validators.minLen(2)] } });
onMounted(async () => { if (props.id) { try { const rec = await records.get(props.id); f.values.title = rec.title || ''; } catch (e) { toast.error(e.message); } } });
function submit() {
  f.handleSubmit(async (vals) => {
    try {
      if (isEdit.value) await records.update(props.id, vals); else await records.create(vals);
      toast.success(isEdit.value ? 'Registro salvo' : 'Registro criado');
      router.push('/records');
    } catch (e) { toast.error(e.message); }
  });
}
const cancel = () => router.push('/records');
</script>
<style scoped>
.form-actions { display: flex; justify-content: flex-end; gap: var(--ui-space-2); margin-top: var(--ui-space-3); }
</style>
