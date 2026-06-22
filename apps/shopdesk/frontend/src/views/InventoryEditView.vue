<!-- InventoryEditView — Editar metadados de estoque (REF-SHOPDESK-0014 / REQ-SHOPDESK-0005).
     Edita os campos descritivos do registro: SKU, nome do produto, local e ponto de reposição.
     Ajustes de QUANTIDADE ficam no InventoryAdjustView (/inventory/:id/adjust) para separar
     a mutação auditável do preenchimento de metadados. CSP-safe: só classes + data-* (sem
     style inline / :style / v-html). Todos os estados: loading / empty (not found) / error / normal. -->
<template>
  <UiPageLayout
    eyebrow="Estoque"
    :title="pageTitle"
    subtitle="Atualize os dados descritivos do item. Para ajustar quantidades use o botão Ajustar estoque."
    width="default"
    :loading="loading"
    loading-message="Carregando item de estoque…"
    :error="loadError"
    @retry="reload"
  >
    <template #actions>
      <UiButton variant="ghost" :to="backLink">Voltar ao detalhe</UiButton>
    </template>

    <!-- ESTADO: item não encontrado -->
    <UiCard v-if="notFound">
      <UiEmptyState
        icon="🔍"
        title="Item de estoque não encontrado"
        description="Este item não existe mais ou o link está incorreto. Volte à lista de estoque."
      >
        <template #action>
          <UiButton to="/inventory">Ir para o estoque</UiButton>
        </template>
      </UiEmptyState>
    </UiCard>

    <!-- ESTADO: normal — formulário de edição -->
    <form v-else class="ie-form" novalidate @submit.prevent="onSubmit">
      <UiCard>
        <template #header>
          <div class="ie-head">
            <div>
              <h2 class="ie-head-title">{{ form.values.productName || 'Item de estoque' }}</h2>
              <p class="ie-head-meta">
                <span class="ui-mono">{{ form.values.sku || '—' }}</span>
                <span v-if="form.values.location" class="ie-dot" aria-hidden="true">·</span>
                <span v-if="form.values.location">{{ form.values.location }}</span>
              </p>
            </div>
            <UiStatusBadge v-if="currentStatus" :status="currentStatus" size="lg" />
          </div>
        </template>

        <UiFormSection
          title="Identificação"
          description="Código e nome do produto vinculado a este registro de estoque."
          :columns="2"
        >
          <UiFormField
            label="SKU"
            required
            :error="form.errors.sku"
            hint="Código único do produto (não pode estar em branco)."
          >
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :value="form.values.sku"
                :aria-describedby="describedBy"
                type="text"
                autocomplete="off"
                placeholder="Ex.: CAM-AZ-001"
                @input="onField('sku', $event.target.value)"
              />
            </template>
          </UiFormField>

          <UiFormField
            label="Nome do produto"
            :error="form.errors.productName"
            hint="Nome legível exibido nas listas e relatórios."
          >
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :value="form.values.productName"
                :aria-describedby="describedBy"
                type="text"
                placeholder="Ex.: Camiseta Azul G"
                @input="onField('productName', $event.target.value)"
              />
            </template>
          </UiFormField>
        </UiFormSection>

        <UiFormSection
          title="Localização e reposição"
          description="Onde o item está armazenado e a partir de qual quantidade deve ser reposto."
          :columns="2"
        >
          <UiFormField
            label="Local"
            :error="form.errors.location"
            hint="Prateleira, galpão ou endereço de armazenagem."
          >
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :value="form.values.location"
                :aria-describedby="describedBy"
                type="text"
                placeholder="Ex.: Prateleira A3"
                @input="onField('location', $event.target.value)"
              />
            </template>
          </UiFormField>

          <UiFormField
            label="Ponto de reposição"
            :error="form.errors.reorderPoint"
            hint="Quando o estoque cair até este valor, o item entra em alerta. Deixe em branco para não alertar."
          >
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :value="form.values.reorderPoint"
                :aria-describedby="describedBy"
                type="number"
                min="0"
                step="1"
                inputmode="numeric"
                placeholder="Ex.: 20"
                @input="onField('reorderPoint', $event.target.value)"
              />
            </template>
          </UiFormField>
        </UiFormSection>

        <template #footer>
          <div class="ie-actions">
            <UiButton
              variant="ghost"
              type="button"
              :disabled="saving"
              :to="backLink"
            >Cancelar</UiButton>
            <UiButton
              variant="primary"
              type="submit"
              :loading="saving"
              :disabled="!dirty"
            >Salvar alterações</UiButton>
          </div>
        </template>
      </UiCard>
    </form>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
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
  validators,
} from '../ui/index.js';
import { inventory } from '../api.js';

const route = useRoute();
const router = useRouter();
const toast = useToast();

const itemId = computed(() => route.params.id);
const backLink = computed(() => '/inventory/' + itemId.value);

const loading = ref(true);
const loadError = ref(null);
const notFound = ref(false);
const saving = ref(false);

const pristine = ref({ sku: '', productName: '', location: '', reorderPoint: '' });
const currentStatus = ref('');

const { required, numeric, min } = validators;
const form = useForm({
  initial: { sku: '', productName: '', location: '', reorderPoint: '' },
  rules: {
    sku: [required('O SKU não pode estar em branco.')],
    reorderPoint: [
      numeric('Ponto de reposição deve ser um número.'),
      min(0, 'Não pode ser negativo.'),
    ],
  },
});

function onField(key, value) { form.setField(key, value); }

const dirty = computed(() =>
  form.values.sku !== pristine.value.sku ||
  form.values.productName !== pristine.value.productName ||
  form.values.location !== pristine.value.location ||
  form.values.reorderPoint !== pristine.value.reorderPoint,
);

const pageTitle = computed(() =>
  form.values.productName || form.values.sku || 'Editar item de estoque',
);

function hydrate(p) {
  const rp = p.reorder_point != null ? p.reorder_point : (p.reorderPoint != null ? p.reorderPoint : '');
  const vals = {
    sku: p.sku || '',
    productName: p.product_name || p.productName || '',
    location: p.location || '',
    reorderPoint: rp === '' || rp == null ? '' : String(rp),
  };
  form.setField('sku', vals.sku);
  form.setField('productName', vals.productName);
  form.setField('location', vals.location);
  form.setField('reorderPoint', vals.reorderPoint);
  pristine.value = { ...vals };
  currentStatus.value = p.status || '';
}

async function reload() {
  loading.value = true;
  loadError.value = null;
  notFound.value = false;
  try {
    if (!inventory || typeof inventory.get !== 'function') {
      throw new Error('Recurso de estoque indisponível.');
    }
    const res = await inventory.get(itemId.value);
    const p = res && res.data ? res.data : res;
    if (!p || (typeof p === 'object' && !Object.keys(p).length)) {
      notFound.value = true;
      return;
    }
    hydrate(p);
  } catch (e) {
    if (e && e.status === 404) notFound.value = true;
    else loadError.value = (e && e.message) || 'Falha ao carregar o item de estoque.';
  } finally {
    loading.value = false;
  }
}

onMounted(reload);

async function onSubmit() {
  if (!form.validate()) {
    toast.warning('Revise os campos destacados antes de salvar.');
    return;
  }
  if (!dirty.value) {
    toast.info('Nenhuma alteração para salvar.');
    return;
  }
  if (!inventory || typeof inventory.update !== 'function') {
    toast.error('Recurso de estoque indisponível.');
    return;
  }

  saving.value = true;
  try {
    const rp = form.values.reorderPoint === '' ? null : Number(form.values.reorderPoint);
    await inventory.update(itemId.value, {
      sku: form.values.sku.trim(),
      product_name: form.values.productName.trim(),
      location: form.values.location.trim() || null,
      reorder_point: rp,
    });
    toast.success('Item de estoque atualizado.');
    router.push(backLink.value);
  } catch (e) {
    toast.error('Não foi possível salvar as alterações.', {
      detail: (e && e.message) || '',
    });
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.ie-form { display: block; }

.ie-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ui-space-4);
  width: 100%;
}
.ie-head-title { font-size: var(--ui-text-lg); font-weight: 600; margin: 0; }
.ie-head-meta {
  margin: var(--ui-space-1) 0 0;
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}
.ie-dot { opacity: .6; }

.ie-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--ui-space-2);
}
</style>
