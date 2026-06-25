<template>
  <UiPageLayout
    eyebrow="Cadastro clínico"
    title="Pacientes"
    subtitle="Pessoas em acompanhamento no seu tenant. Clique numa linha para abrir o prontuário."
    width="wide"
  >
    <template #actions>
      <UiButton variant="ghost" :loading="r.loading.value" @click="reload">Atualizar</UiButton>
      <UiButton to="/patients/new" variant="primary">Novo paciente</UiButton>
    </template>

    <!-- Resumo: total global do servidor + contagens situacionais da PÁGINA atual.
         Os 3 cards parciais levam o prefixo "Nesta página:" no rótulo para não serem
         confundidos com totais do tenant (só "Total cadastrados" é global). -->
    <div class="pl-metrics" role="group" aria-label="Resumo de pacientes">
      <UiMetricCard
        label="Total cadastrados"
        :value="r.loading.value ? null : formatNumber(r.total.value)"
        :loading="r.loading.value"
        tone="primary"
        hint="No tenant atual"
      />
      <UiMetricCard
        label="Nesta página: em acompanhamento"
        :value="r.loading.value ? null : formatNumber(counts.active)"
        :loading="r.loading.value"
        tone="success"
        hint="Situação ativa entre os carregados"
      />
      <UiMetricCard
        label="Nesta página: em pausa"
        :value="r.loading.value ? null : formatNumber(counts.on_hold)"
        :loading="r.loading.value"
        tone="warning"
        hint="Atendimento suspenso entre os carregados"
      />
      <UiMetricCard
        label="Nesta página: altas / arquivados"
        :value="r.loading.value ? null : formatNumber(counts.discharged_archived)"
        :loading="r.loading.value"
        tone="neutral"
        hint="Encerrados entre os carregados"
      />
    </div>

    <!-- Filtros -->
    <template #filters>
      <UiFiltersPanel
        v-model="filters"
        :fields="filterFields"
        @apply="applyFilters"
        @clear="clearFilters"
      />
    </template>

    <!-- Tabela: cobre loading (skeleton), error (retry), empty (CTA) e normal -->
    <UiDataTable
      :columns="columns"
      :rows="r.items.value"
      row-key="id"
      :loading="r.loading.value"
      :error="errorMessage"
      density="comfortable"
      clickable-rows
      server-mode
      :sort="r.sort.value"
      :page="r.page.value"
      :page-size="r.pageSize.value"
      :total="r.total.value"
      paginated
      :empty="emptyState"
      @row-click="open"
      @update:sort="r.setSort"
      @update:page="r.setPage"
      @update:page-size="onPageSize"
      @retry="reload"
    >
      <!-- Paciente: nome + identificadores secundários -->
      <template #cell-full_name="{ row }">
        <div class="pl-patient">
          <span class="pl-avatar" aria-hidden="true">{{ initials(row.full_name) }}</span>
          <span class="pl-patient-text">
            <span class="pl-name">{{ row.full_name || '—' }}</span>
            <span class="pl-sub">{{ secondaryLine(row) }}</span>
          </span>
        </div>
      </template>

      <!-- Contato: telefone/whatsapp + e-mail -->
      <template #cell-contact="{ row }">
        <div class="pl-contact">
          <span class="pl-contact-main">{{ row.phone || '—' }}</span>
          <span v-if="row.email" class="pl-sub">{{ row.email }}</span>
        </div>
      </template>

      <!-- Profissional responsável: resolve id→nome; "Não atribuído" quando vazio. -->
      <template #cell-assigned_professional_id="{ value }">
        <span v-if="value" class="pl-prof">{{ professionalName(value) }}</span>
        <span v-else class="pl-sub">Não atribuído</span>
      </template>

      <!-- Situação com rótulo amigável -->
      <template #cell-status="{ value }">
        <UiStatusBadge :status="value" :label="statusText(value)" :tone="statusToneFor(value)" />
      </template>

      <!-- Cadastro -->
      <template #cell-created_at="{ value }">
        <span class="pl-sub">{{ formatDate(value) }}</span>
      </template>

      <!-- Ações inline: editar e desativar/reativar o paciente -->
      <template #cell-actions="{ row }">
        <div class="pl-row-actions" @click.stop>
          <UiButton
            variant="ghost"
            size="sm"
            :to="'/patients/' + row.id + '/edit'"
            :aria-label="'Editar ' + (row.full_name || 'paciente')"
          >Editar</UiButton>
          <UiButton
            variant="ghost"
            size="sm"
            :aria-label="(row.status === 'archived' ? 'Reativar' : 'Desativar') + ' ' + (row.full_name || 'paciente')"
            @click="toggleStatus(row)"
          >{{ row.status === 'archived' ? 'Reativar' : 'Desativar' }}</UiButton>
        </div>
      </template>

      <template #empty-action>
        <UiButton to="/patients/new" variant="primary">Cadastrar primeiro paciente</UiButton>
      </template>
    </UiDataTable>
  </UiPageLayout>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiDataTable,
  UiFiltersPanel,
  UiMetricCard,
  UiStatusBadge,
  UiButton,
  useResource,
  useToast,
  useConfirm,
  format,
} from '../ui/index.js';
import { patients, professionals as professionalsApi } from '../api.js';

const router = useRouter();
const toast = useToast();
const confirm = useConfirm();
const { formatNumber, formatDate, humanize } = format;

// Rótulos canônicos das situações do paciente (domínio neuroevolui).
const STATUS_LABELS = {
  active: 'Em acompanhamento',
  on_hold: 'Em pausa',
  discharged: 'Alta',
  archived: 'Arquivado',
};
const statusText = (s) => STATUS_LABELS[String(s || '').toLowerCase()] || humanize(s);
// discharged/archived são fins de fluxo: tom neutro (sem alarme); on_hold = atenção; active = sucesso.
const statusToneFor = (s) => {
  const k = String(s || '').toLowerCase();
  if (k === 'active') return 'success';
  if (k === 'on_hold') return 'warning';
  if (k === 'discharged' || k === 'archived') return 'neutral';
  return null; // deixa o kit resolver
};

const columns = [
  { key: 'full_name', label: 'Paciente', sortable: true },
  { key: 'contact', label: 'Contato' },
  { key: 'assigned_professional_id', label: 'Profissional' },
  { key: 'status', label: 'Situação', sortable: true },
  { key: 'created_at', label: 'Cadastrado em', sortable: true, align: 'right' },
  { key: 'actions', label: '', sortable: false, align: 'right' },
];

// Catálogo de profissionais para o filtro (select) e para resolver id→nome na tabela.
// Carregado uma vez no onMounted; fail-soft (se faltar, o filtro fica sem opções e a
// célula cai para o id como último recurso).
const professionals = ref([]); // [{ id, full_name }]

const nameOf = (p) => (p && (p.full_name || p.name)) || ('#' + (p && p.id));

// id → nome do profissional responsável (fallback: "Não atribuído" tratado no template; id cru por último).
function professionalName(id) {
  const hit = professionals.value.find((p) => String(p.id) === String(id));
  return hit ? nameOf(hit) : '#' + id;
}

// Filtro por profissional usa SELECT (não pedir UUID ao operador) — opções do catálogo carregado.
const filterFields = computed(() => [
  { key: 'q', label: 'Buscar (nome ou documento)', type: 'text', placeholder: 'Ex.: Maria, 123.456...' },
  {
    key: 'status',
    label: 'Situação',
    type: 'select',
    options: [
      { value: 'active', label: 'Em acompanhamento' },
      { value: 'on_hold', label: 'Em pausa' },
      { value: 'discharged', label: 'Alta' },
      { value: 'archived', label: 'Arquivado' },
    ],
  },
  {
    key: 'assigned_professional_id',
    label: 'Profissional responsável',
    type: 'select',
    options: professionals.value.map((p) => ({ value: String(p.id), label: nameOf(p) })),
  },
]);

const filters = reactive({ q: '', status: '', assigned_professional_id: '' });

const r = useResource(patients, {
  pageSize: 25,
  sort: { key: 'created_at', dir: 'desc' },
  filters: { q: '', status: '', assigned_professional_id: '' },
});

// Mensagem de erro normalizada para o DataTable/estado de erro.
const errorMessage = computed(() => {
  const e = r.error.value;
  if (!e) return null;
  return (e && e.message) || 'Não foi possível carregar os pacientes.';
});

// Contagem situacional da PÁGINA corrente (não substitui o total do servidor).
// As chaves canônicas do domínio (discharged/archived) são a fonte de verdade; aqui
// elas são somadas num bucket de UI nomeado a partir do domínio (não inventamos "closed").
const counts = computed(() => {
  const acc = { active: 0, on_hold: 0, discharged_archived: 0 };
  for (const p of r.items.value || []) {
    const k = String(p.status || '').toLowerCase();
    if (k === 'active') acc.active += 1;
    else if (k === 'on_hold') acc.on_hold += 1;
    else if (k === 'discharged' || k === 'archived') acc.discharged_archived += 1;
  }
  return acc;
});

const emptyState = computed(() => {
  const filtering = !!(filters.q || filters.status || filters.assigned_professional_id);
  return filtering
    ? {
        title: 'Nenhum paciente encontrado',
        description: 'Nenhum cadastro corresponde aos filtros atuais. Ajuste a busca ou limpe os filtros.',
        icon: '◎',
      }
    : {
        title: 'Nenhum paciente cadastrado',
        description: 'Comece adicionando o primeiro paciente do tenant para acompanhar a evolução.',
        icon: '＋',
      };
});

const initials = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0][0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] || '' : '';
  return (first + last).toUpperCase();
};

const secondaryLine = (row) => {
  const bits = [];
  if (row.document) bits.push(row.document);
  if (row.guardian_name) bits.push('Resp.: ' + row.guardian_name);
  return bits.join('  ·  ') || 'Sem documento';
};

function open(row) {
  router.push('/patients/' + row.id);
}

function applyFilters(values) {
  r.setFilters({
    q: (values && values.q) || '',
    status: (values && values.status) || '',
    assigned_professional_id: (values && values.assigned_professional_id) || '',
  });
}

function clearFilters() {
  filters.q = '';
  filters.status = '';
  filters.assigned_professional_id = '';
  r.setFilters({ q: '', status: '', assigned_professional_id: '' });
}

function onPageSize(size) {
  r.pageSize.value = size;
  r.setPage(1);
}

// Catálogo de profissionais (rótulos do filtro + resolução id→nome). Fail-soft:
// uma falha aqui não derruba a lista de pacientes, só deixa os nomes sem resolver.
async function loadProfessionals() {
  try {
    const res = await professionalsApi.list({ pageSize: 200, sort: 'full_name', dir: 'asc' });
    professionals.value = Array.isArray(res) ? res : res.data || res.items || [];
  } catch (e) {
    professionals.value = [];
  }
}

async function reload() {
  await Promise.allSettled([r.load(), loadProfessionals()]);
  if (!r.error.value) toast.success('Lista atualizada.');
}

// Desativa (arquiva) ou reativa (active) um paciente com confirmação.
// Ação destrutiva (desativar) exige confirmação via useConfirm; reativação também confirma por segurança.
async function toggleStatus(row) {
  const isArchived = row.status === 'archived';
  const targetStatus = isArchived ? 'active' : 'archived';
  const actionLabel = isArchived ? 'Reativar' : 'Desativar';
  const confirmed = await confirm.ask({
    title: actionLabel + ' paciente',
    message: isArchived
      ? `Deseja reativar "${row.full_name || 'este paciente'}"? O status voltará para "Em acompanhamento".`
      : `Deseja desativar "${row.full_name || 'este paciente'}"? O registro ficará arquivado e inativo.`,
    danger: !isArchived,
  });
  if (!confirmed) return;
  try {
    await patients.update(row.id, { status: targetStatus });
    toast.success(
      isArchived
        ? `"${row.full_name || 'Paciente'}" reativado com sucesso.`
        : `"${row.full_name || 'Paciente'}" desativado com sucesso.`
    );
    await r.load();
  } catch (e) {
    toast.error((e && e.message) || `Não foi possível ${actionLabel.toLowerCase()} o paciente.`);
  }
}

// Avisa por toast quando uma carga falha (além do estado de erro na tabela).
watch(
  () => r.error.value,
  (e) => {
    if (e) toast.error(errorMessage.value);
  }
);

onMounted(() => {
  r.load();
  loadProfessionals();
});
</script>

<style scoped>
.pl-metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--ui-space-3);
}

.pl-patient {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  min-width: 0;
}

.pl-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-accent) / 0.14);
  color: rgb(var(--ui-accent-strong));
  font-size: var(--ui-text-xs);
  font-weight: 700;
  letter-spacing: 0.02em;
}

.pl-patient-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.pl-name {
  font-weight: 600;
  color: rgb(var(--ui-fg));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pl-contact {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
}

.pl-row-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ui-space-1);
}

.pl-contact-main {
  color: rgb(var(--ui-fg));
}

.pl-prof {
  color: rgb(var(--ui-fg));
}

.pl-sub {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
}

@media (max-width: 860px) {
  .pl-metrics {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 520px) {
  .pl-metrics {
    grid-template-columns: 1fr;
  }
}
</style>
