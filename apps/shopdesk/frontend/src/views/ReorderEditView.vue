<!--
  ReorderEditView — Editar ordem de reposição (REF-SHOPDESK-0018).
  Atualiza nome do produto, quantidade, fornecedor e situação.
  SKU é exibido somente-leitura (identifica a reposição — não pode ser trocado).
  100% sobre o kit ui-vue · só tokens --ui-* · CSP-safe (sem style inline / v-html) · a11y · responsivo.
-->
<template>
  <UiPageLayout
    eyebrow="Reposição"
    :title="pageTitle"
    subtitle="Atualize os dados da ordem de reposição. O SKU não pode ser alterado."
    width="default"
    :loading="loading"
    loading-message="Carregando ordem…"
    :error="loadError"
    :retryable="true"
    @retry="reload"
  >
    <!-- ações de topo -->
    <template #actions>
      <UiButton variant="ghost" :to="backTo">Voltar à reposição</UiButton>
      <UiButton
        variant="primary"
        :loading="form.submitting.value"
        :disabled="!isDirty"
        @click="save"
      >Salvar alterações</UiButton>
    </template>

    <!-- banner de mudanças não salvas -->
    <template #banner>
      <p v-if="isDirty && !loading && !loadError" class="re-dirty" role="status">
        <span class="re-dirty-dot" aria-hidden="true" />
        Há alterações não salvas nesta ordem.
      </p>
    </template>

    <!-- ESTADO: ordem inexistente / vazio -->
    <UiEmptyState
      v-if="!reorder"
      title="Ordem de reposição não encontrada"
      description="Esta ordem não existe mais ou o identificador está incorreto."
      icon="search"
    >
      <template #action>
        <UiButton variant="primary" to="/reorders">Ver reposições</UiButton>
      </template>
    </UiEmptyState>

    <!-- ESTADO NORMAL: formulário de edição -->
    <form v-else class="re-form" novalidate @submit.prevent="save">
      <!-- resumo somente-leitura (código + SKU + data) -->
      <UiCard>
        <template #header>
          <div class="re-summary-head">
            <p class="re-summary-code ui-mono">{{ reorder.code || ('#' + reorderId) }}</p>
            <UiStatusBadge :status="reorder.status" size="sm" />
          </div>
        </template>
        <dl class="re-kv">
          <div class="re-kv-row">
            <dt>SKU</dt>
            <dd class="ui-mono">{{ reorder.sku || '—' }}</dd>
          </div>
          <div class="re-kv-row">
            <dt>Criada em</dt>
            <dd>{{ format.formatDateTime(reorder.createdAt || reorder.created_at) }}</dd>
          </div>
        </dl>
        <template #footer>
          <p class="re-lock">
            <span aria-hidden="true">🔒</span>
            O SKU identifica a reposição e não pode ser alterado aqui.
          </p>
        </template>
      </UiCard>

      <!-- campos editáveis -->
      <UiCard>
        <UiFormSection
          title="Dados da ordem"
          description="Atualize o nome do produto, a quantidade, o fornecedor e a situação."
          :columns="2"
        >
          <UiFormField
            label="Nome do produto"
            :error="form.errors.productName"
            v-slot="{ id, describedBy, hasError }"
          >
            <input
              :id="id"
              type="text"
              autocomplete="off"
              placeholder="Ex.: Caneca Cerâmica"
              :aria-invalid="hasError || null"
              :aria-describedby="describedBy"
              :value="form.values.productName"
              @input="form.setField('productName', $event.target.value)"
            />
          </UiFormField>

          <UiFormField
            label="Fornecedor"
            :error="form.errors.supplier"
            hint="Quem vai fornecer a reposição."
            v-slot="{ id, describedBy, hasError }"
          >
            <input
              :id="id"
              type="text"
              autocomplete="organization"
              placeholder="Ex.: Cerâmica Vale"
              :aria-invalid="hasError || null"
              :aria-describedby="describedBy"
              :value="form.values.supplier"
              @input="form.setField('supplier', $event.target.value)"
            />
          </UiFormField>

          <UiFormField
            label="Quantidade"
            required
            :error="form.errors.quantity"
            hint="Unidades a repor."
            v-slot="{ id, describedBy, hasError }"
          >
            <input
              :id="id"
              type="number"
              inputmode="numeric"
              min="1"
              step="1"
              placeholder="0"
              :aria-invalid="hasError || null"
              :aria-describedby="describedBy"
              :value="form.values.quantity"
              @input="form.setField('quantity', $event.target.value)"
            />
          </UiFormField>

          <UiFormField
            label="Situação"
            required
            :error="form.errors.status"
            hint="Estado atual desta ordem."
            v-slot="{ id, describedBy, hasError }"
          >
            <select
              :id="id"
              :aria-invalid="hasError || null"
              :aria-describedby="describedBy"
              :value="form.values.status"
              @change="form.setField('status', $event.target.value)"
            >
              <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </UiFormField>
        </UiFormSection>
      </UiCard>

      <!-- FormActions sticky -->
      <div class="re-actions">
        <p class="re-actions-hint ui-muted">
          {{ isDirty ? 'Revise e salve para aplicar as mudanças.' : 'Nenhuma alteração pendente.' }}
        </p>
        <div class="re-actions-btns">
          <UiButton type="button" variant="ghost" :disabled="form.submitting.value" @click="cancel">
            Cancelar
          </UiButton>
          <UiButton
            type="button"
            variant="subtle"
            :disabled="!isDirty || form.submitting.value"
            @click="reset"
          >Descartar alterações</UiButton>
          <UiButton
            type="submit"
            variant="primary"
            :loading="form.submitting.value"
            :disabled="!isDirty"
          >Salvar alterações</UiButton>
        </div>
      </div>
    </form>
  </UiPageLayout>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiButton,
  UiFormField,
  UiFormSection,
  UiStatusBadge,
  UiEmptyState,
  useForm,
  useToast,
  useConfirm,
  validators,
  format,
} from '../ui/index.js';
import * as api from '../api.js';

const props = defineProps({ id: { type: [String, Number], default: '' } });

const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

const reorderId = computed(() => String(props.id ?? '').trim());
const backTo = computed(() => '/reorders/' + reorderId.value);
const pageTitle = computed(() => {
  if (!reorder.value) return 'Editar reposição';
  return 'Editar reposição ' + (reorder.value.code || '#' + reorderId.value);
});

const loading = ref(true);
const loadError = ref(null);
const reorder = ref(null);
const snapshot = reactive({});

const statusOptions = [
  { value: 'rascunho', label: 'Rascunho' },
  { value: 'solicitada', label: 'Solicitada' },
  { value: 'recebida', label: 'Recebida' },
  { value: 'cancelada', label: 'Cancelada' },
];

const form = useForm({
  initial: { productName: '', quantity: '', supplier: '', status: '' },
  rules: {
    quantity: [
      validators.required('Informe a quantidade'),
      validators.numeric('Quantidade deve ser um número'),
      validators.min(1, 'Quantidade mínima é 1'),
    ],
    status: [validators.required('Selecione a situação')],
  },
});

const isDirty = computed(() => {
  for (const k of Object.keys(snapshot)) {
    if (String(form.values[k] ?? '') !== String(snapshot[k] ?? '')) return true;
  }
  return false;
});

async function load() {
  loading.value = true;
  loadError.value = null;
  reorder.value = null;
  if (!reorderId.value) {
    loading.value = false;
    return;
  }
  if (!api.reorders || typeof api.reorders.get !== 'function') {
    loadError.value = new Error('Recurso de reposições indisponível.');
    loading.value = false;
    return;
  }
  try {
    const r = await api.reorders.get(reorderId.value);
    const data = r && r.data ? r.data : r;
    reorder.value = data;
    hydrate(data);
  } catch (e) {
    if (e && e.status === 404) {
      reorder.value = null;
    } else {
      loadError.value = e;
    }
  } finally {
    loading.value = false;
  }
}
const reload = load;

function hydrate(data) {
  const next = {
    productName: data.productName || data.product_name || '',
    quantity: data.quantity != null ? String(data.quantity) : '',
    supplier: data.supplier || '',
    status: data.status || '',
  };
  for (const [k, v] of Object.entries(next)) {
    form.setField(k, v);
    snapshot[k] = v;
  }
  for (const k of Object.keys(form.errors)) delete form.errors[k];
  for (const k of Object.keys(form.touched)) delete form.touched[k];
}

async function save() {
  if (!isDirty.value) {
    toast.info('Nada para salvar — não há alterações.');
    return;
  }
  await form.handleSubmit(async (values) => {
    try {
      const payload = {
        productName: (values.productName || '').trim() || null,
        quantity: Number(values.quantity),
        supplier: (values.supplier || '').trim() || null,
        status: values.status,
      };
      if (!api.reorders || typeof api.reorders.update !== 'function') {
        throw new Error('Recurso de reposições indisponível.');
      }
      const r = await api.reorders.update(reorderId.value, payload);
      const updated = r && r.data ? r.data : r;
      reorder.value = { ...reorder.value, ...(updated && typeof updated === 'object' ? updated : payload) };
      for (const k of Object.keys(snapshot)) snapshot[k] = form.values[k];
      toast.success('Ordem de reposição atualizada.');
    } catch (e) {
      toast.error('Não foi possível salvar a ordem.', {
        detail: (e && e.message) || '',
        code: e && e.status ? 'HTTP ' + e.status : '',
      });
      throw e;
    }
  });
}

async function reset() {
  if (!isDirty.value) return;
  const ok = await confirm({
    title: 'Descartar alterações?',
    message: 'As mudanças não salvas serão perdidas e o formulário volta aos dados originais.',
    confirmLabel: 'Descartar',
    cancelLabel: 'Continuar editando',
    danger: true,
  });
  if (!ok) return;
  for (const [k, v] of Object.entries(snapshot)) form.setField(k, v);
  for (const k of Object.keys(form.errors)) delete form.errors[k];
  toast.info('Alterações descartadas.');
}

async function cancel() {
  if (isDirty.value) {
    const ok = await confirm({
      title: 'Sair sem salvar?',
      message: 'Você tem alterações não salvas nesta ordem. Deseja sair mesmo assim?',
      confirmLabel: 'Sair sem salvar',
      cancelLabel: 'Continuar editando',
      danger: true,
    });
    if (!ok) return;
  }
  router.push(backTo.value);
}

onMounted(load);
</script>

<style scoped>
/* banner de mudanças não salvas */
.re-dirty {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  margin: 0;
  padding: var(--ui-space-2) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-warn) / 0.4);
  background: rgb(var(--ui-warn) / 0.1);
  color: rgb(var(--ui-warn));
  border-radius: var(--ui-radius-md);
  font-size: var(--ui-text-sm);
  font-weight: 600;
}
.re-dirty-dot {
  width: var(--ui-space-2);
  height: var(--ui-space-2);
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}

/* formulário */
.re-form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

/* resumo somente-leitura */
.re-summary-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
  width: 100%;
}
.re-summary-code {
  font-size: var(--ui-text-lg);
  font-weight: 700;
  color: rgb(var(--ui-fg));
  margin: 0;
}
.re-kv {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--ui-space-4);
  margin: 0;
}
.re-kv-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.re-kv dt {
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgb(var(--ui-muted));
  font-weight: 600;
}
.re-kv dd {
  margin: 0;
  font-size: var(--ui-text-md);
  color: rgb(var(--ui-fg));
}
.re-lock {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  margin: 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

/* barra de ações sticky */
.re-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
  padding: var(--ui-space-4) var(--ui-space-5);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-lg);
  background: rgb(var(--ui-surface-2));
  position: sticky;
  bottom: var(--ui-space-4);
  box-shadow: var(--ui-shadow-sm);
}
.re-actions-hint {
  margin: 0;
  font-size: var(--ui-text-sm);
}
.re-actions-btns {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}

@media (max-width: 860px) {
  .re-kv {
    grid-template-columns: 1fr;
  }
  .re-actions {
    flex-direction: column;
    align-items: stretch;
    position: static;
  }
  .re-actions-btns {
    justify-content: flex-end;
  }
}
</style>
