<template>
  <UiPageLayout
    :title="pageTitle"
    eyebrow="Nota Fiscal"
    :subtitle="nf ? ('NF-e ' + (nf.serie ? nf.serie + ' · ' : '') + (nf.numero_nf || '')) : ''"
    width="wide"
    :loading="loading"
    :error="loadError"
    @retry="loadNf"
  >
    <template #actions>
      <UiButton variant="ghost" to="/nf">Voltar</UiButton>
      <UiButton
        v-if="nf && isDownloadableXml"
        variant="ghost"
        :loading="downloadingXml"
        @click="downloadXml"
      >
        XML
      </UiButton>
      <UiButton
        v-if="nf"
        variant="ghost"
        :loading="downloadingPdf"
        @click="downloadPdf"
      >
        PDF
      </UiButton>
      <UiButton
        v-if="nf && isCancelable"
        variant="danger"
        :loading="canceling"
        @click="cancelNf"
      >
        Cancelar NF
      </UiButton>
    </template>

    <!-- estado vazio: loadNf completou sem erro mas sem dado (204, 404 silencioso, body vazio) -->
    <template v-if="!loading && !loadError && !nf">
      <UiEmptyState
        title="Nota fiscal não encontrada"
        description="O registro solicitado não existe ou foi removido."
      />
    </template>

    <!-- conteúdo normal -->
    <template v-if="nf">
      <!-- Banner de status SEFAZ -->
      <div
        class="nf-sefaz-banner"
        :data-tone="sefazTone"
        role="region"
        aria-label="Status SEFAZ"
      >
        <div class="nf-sefaz-left">
          <UiStatusBadge
            :status="nf.status"
            size="lg"
            :label="statusDisplayLabel(nf.status)"
            with-dot
          />
          <span v-if="nf.protocolo" class="nf-sefaz-proto">
            Protocolo <strong>{{ nf.protocolo }}</strong>
          </span>
          <span v-if="nf.data_autorizacao" class="nf-sefaz-date">
            Autorizada em {{ fmt.formatDateTime(nf.data_autorizacao) }}
          </span>
        </div>
        <div v-if="nf.motivo_sefaz" class="nf-sefaz-motivo">
          <span class="nf-sefaz-motivo-label">Retorno SEFAZ:</span>
          {{ nf.motivo_sefaz }}
        </div>
      </div>

      <!-- Chave de Acesso -->
      <UiCard v-if="nf.chave_acesso" title="Chave de Acesso">
        <div class="nf-chave-wrap">
          <code class="nf-chave">{{ formatChave(nf.chave_acesso) }}</code>
          <UiButton
            variant="subtle"
            size="sm"
            :data-copied="copied ? 'true' : undefined"
            :aria-label="copied ? 'Chave copiada para a área de transferência' : 'Copiar chave de acesso'"
            @click="copyChave"
          >
            {{ copied ? 'Copiado!' : 'Copiar' }}
          </UiButton>
          <!-- Anúncio a11y para leitores de tela: aria-live polite anuncia a mudança de estado -->
          <span class="nf-sr-only" aria-live="polite" aria-atomic="true">
            {{ copied ? 'Chave copiada!' : '' }}
          </span>
        </div>
      </UiCard>

      <!-- Métricas principais -->
      <div class="nf-metrics-row">
        <UiMetricCard
          label="Valor Total NF"
          :value="fmt.formatCurrency(nf.total_nf ?? 0)"
          tone="primary"
        />
        <UiMetricCard
          label="Total de Impostos"
          :value="fmt.formatCurrency(nf.total_impostos ?? 0)"
          tone="neutral"
          hint="ICMS + PIS + COFINS + IPI"
        />
        <UiMetricCard
          label="Data de Emissão"
          :value="nf.data_emissao ? fmt.formatDate(nf.data_emissao) : '—'"
          tone="neutral"
        />
        <UiMetricCard
          label="Série / Número"
          :value="(nf.serie ? nf.serie + ' / ' : '') + (nf.numero_nf || '—')"
          tone="neutral"
        />
      </div>

      <!-- Grid: emitente + destinatário -->
      <div class="nf-parties-grid">
        <!-- Emitente -->
        <UiCard title="Emitente">
          <dl class="nf-dl">
            <div class="nf-dl-row">
              <dt class="nf-dl-label">Razão Social / Nome</dt>
              <dd class="nf-dl-value">{{ nf.emitente?.razao_social || nf.emitente?.nome || '—' }}</dd>
            </div>
            <div class="nf-dl-row">
              <dt class="nf-dl-label">CNPJ / CPF</dt>
              <dd class="nf-dl-value">{{ nf.emitente?.cnpj || nf.emitente?.cpf || '—' }}</dd>
            </div>
            <div v-if="nf.emitente?.ie" class="nf-dl-row">
              <dt class="nf-dl-label">Inscrição Estadual</dt>
              <dd class="nf-dl-value">{{ nf.emitente.ie }}</dd>
            </div>
            <div v-if="nf.emitente?.logradouro" class="nf-dl-row">
              <dt class="nf-dl-label">Endereço</dt>
              <dd class="nf-dl-value">{{ enderecoStr(nf.emitente) }}</dd>
            </div>
            <div v-if="nf.emitente?.municipio" class="nf-dl-row">
              <dt class="nf-dl-label">Município / UF</dt>
              <dd class="nf-dl-value">{{ nf.emitente.municipio }}{{ nf.emitente.uf ? ' / ' + nf.emitente.uf : '' }}</dd>
            </div>
            <div v-if="nf.emitente?.regime_tributario" class="nf-dl-row">
              <dt class="nf-dl-label">Regime Tributário</dt>
              <dd class="nf-dl-value">
                <UiStatusBadge :status="nf.emitente.regime_tributario" :label="regimeLabel(nf.emitente.regime_tributario)" />
              </dd>
            </div>
          </dl>
        </UiCard>

        <!-- Destinatário -->
        <UiCard title="Destinatário">
          <dl class="nf-dl">
            <div class="nf-dl-row">
              <dt class="nf-dl-label">Razão Social / Nome</dt>
              <dd class="nf-dl-value">{{ nf.destinatario?.razao_social || nf.destinatario?.nome || '—' }}</dd>
            </div>
            <div class="nf-dl-row">
              <dt class="nf-dl-label">CNPJ / CPF</dt>
              <dd class="nf-dl-value">{{ nf.destinatario?.cnpj || nf.destinatario?.cpf || '—' }}</dd>
            </div>
            <div v-if="nf.destinatario?.ie" class="nf-dl-row">
              <dt class="nf-dl-label">Inscrição Estadual</dt>
              <dd class="nf-dl-value">{{ nf.destinatario.ie }}</dd>
            </div>
            <div v-if="nf.destinatario?.logradouro" class="nf-dl-row">
              <dt class="nf-dl-label">Endereço</dt>
              <dd class="nf-dl-value">{{ enderecoStr(nf.destinatario) }}</dd>
            </div>
            <div v-if="nf.destinatario?.municipio" class="nf-dl-row">
              <dt class="nf-dl-label">Município / UF</dt>
              <dd class="nf-dl-value">{{ nf.destinatario.municipio }}{{ nf.destinatario.uf ? ' / ' + nf.destinatario.uf : '' }}</dd>
            </div>
            <div v-if="nf.destinatario?.email" class="nf-dl-row">
              <dt class="nf-dl-label">E-mail</dt>
              <dd class="nf-dl-value">{{ nf.destinatario.email }}</dd>
            </div>
          </dl>
        </UiCard>
      </div>

      <!-- Itens da NF -->
      <UiCard title="Itens da Nota Fiscal" :subtitle="nf.itens?.length ? nf.itens.length + ' ite' + (nf.itens.length === 1 ? 'm' : 'ns') : ''">
        <UiDataTable
          :columns="itensCols"
          :rows="nf.itens || []"
          row-key="numero_item"
          density="compact"
          :empty="{ title: 'Nenhum item', description: 'Esta NF não possui itens registrados.' }"
        >
          <template #cell-valor_unitario="{ value }">
            {{ fmt.formatCurrency(value) }}
          </template>
          <template #cell-valor_total="{ value }">
            {{ fmt.formatCurrency(value) }}
          </template>
          <template #cell-quantidade="{ value }">
            {{ fmt.formatNumber(value) }}
          </template>
        </UiDataTable>
      </UiCard>

      <!-- Impostos discriminados -->
      <UiCard title="Impostos Discriminados">
        <UiDataTable
          :columns="impostosCols"
          :rows="impostosRows"
          row-key="tipo"
          density="compact"
          :empty="{ title: 'Sem impostos registrados', description: 'Nenhum imposto discriminado para esta NF.' }"
        >
          <template #cell-base_calculo="{ value }">
            {{ value != null ? fmt.formatCurrency(value) : '—' }}
          </template>
          <template #cell-aliquota="{ value }">
            {{ value != null ? value + '%' : '—' }}
          </template>
          <template #cell-valor="{ value }">
            <strong>{{ value != null ? fmt.formatCurrency(value) : '—' }}</strong>
          </template>
        </UiDataTable>

        <!-- Rodapé: total impostos -->
        <template #footer>
          <div class="nf-impostos-total">
            <span class="nf-impostos-total-label">Total de Impostos</span>
            <span class="nf-impostos-total-value">{{ fmt.formatCurrency(nf.total_impostos ?? 0) }}</span>
          </div>
        </template>
      </UiCard>

      <!-- Observações -->
      <UiCard v-if="nf.observacoes" title="Observações / Informações Complementares">
        <p class="nf-obs">{{ nf.observacoes }}</p>
      </UiCard>

      <!-- Dados adicionais -->
      <UiCard title="Dados Adicionais">
        <dl class="nf-dl">
          <div class="nf-dl-row">
            <dt class="nf-dl-label">Natureza da Operação</dt>
            <dd class="nf-dl-value">{{ nf.natureza_operacao || '—' }}</dd>
          </div>
          <div class="nf-dl-row">
            <dt class="nf-dl-label">Finalidade</dt>
            <dd class="nf-dl-value">{{ finalidadeLabel(nf.finalidade) }}</dd>
          </div>
          <div v-if="nf.cfop" class="nf-dl-row">
            <dt class="nf-dl-label">CFOP</dt>
            <dd class="nf-dl-value">{{ nf.cfop }}</dd>
          </div>
          <div v-if="nf.forma_pagamento" class="nf-dl-row">
            <dt class="nf-dl-label">Forma de Pagamento</dt>
            <dd class="nf-dl-value">{{ nf.forma_pagamento }}</dd>
          </div>
          <div v-if="nf.valor_desconto != null && nf.valor_desconto > 0" class="nf-dl-row">
            <dt class="nf-dl-label">Desconto</dt>
            <dd class="nf-dl-value">{{ fmt.formatCurrency(nf.valor_desconto) }}</dd>
          </div>
          <div v-if="nf.valor_frete != null && nf.valor_frete > 0" class="nf-dl-row">
            <dt class="nf-dl-label">Frete</dt>
            <dd class="nf-dl-value">{{ fmt.formatCurrency(nf.valor_frete) }}</dd>
          </div>
          <div class="nf-dl-row">
            <dt class="nf-dl-label">Criada em</dt>
            <dd class="nf-dl-value">{{ nf.created_at ? fmt.formatDateTime(nf.created_at) : '—' }}</dd>
          </div>
          <div v-if="nf.updated_at" class="nf-dl-row">
            <dt class="nf-dl-label">Atualizada em</dt>
            <dd class="nf-dl-value">{{ fmt.formatDateTime(nf.updated_at) }}</dd>
          </div>
        </dl>
      </UiCard>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import {
  UiPageLayout, UiCard, UiMetricCard, UiDataTable, UiButton,
  UiStatusBadge, UiEmptyState,
  useToast, useConfirm,
  format as fmt,
  resolveTone,
} from '../ui/index.js';
import { resourceFactory, nfCancel, nfDownloadPdfUrl, nfDownloadXmlUrl } from '../api.js';

// ── rota ────────────────────────────────────────────────────────────────────
const route = useRoute();
const nfId = computed(() => route.params.id);

// ── APIs ─────────────────────────────────────────────────────────────────────
const apiNf = resourceFactory('nf');

// ── composables ──────────────────────────────────────────────────────────────
const toast = useToast();
const confirm = useConfirm();

// ── estado ───────────────────────────────────────────────────────────────────
const nf = ref(null);
const loading = ref(true);
const loadError = ref(null);
const canceling = ref(false);
const downloadingPdf = ref(false);
const downloadingXml = ref(false);
const copied = ref(false);

// ── computeds ─────────────────────────────────────────────────────────────
const pageTitle = computed(() => {
  if (!nf.value) return 'Detalhe da Nota Fiscal';
  const n = nf.value.numero_nf;
  return n ? ('Nota Fiscal nº ' + n) : 'Detalhe da Nota Fiscal';
});

// 'enviado' removido: status que já chegou à SEFAZ pode não ser mais cancelável (backend retorna 422).
const CANCELABLE_STATUSES = ['emitida', 'processando', 'authorized', 'autorizado'];
const isCancelable = computed(() => {
  if (!nf.value?.status) return false;
  const s = String(nf.value.status).toLowerCase();
  return CANCELABLE_STATUSES.some(st => s === st || s.includes(st));
});

const isDownloadableXml = computed(() => {
  if (!nf.value?.status) return false;
  const s = String(nf.value.status).toLowerCase();
  // XML autorizado só existe após protocolo SEFAZ; 'emitida' não tem XML disponível ainda.
  return !!(nf.value.chave_acesso || ['autorizado', 'authorized', 'enviado'].some(st => s === st || s.includes(st)));
});

const sefazTone = computed(() => {
  if (!nf.value?.status) return 'neutral';
  return resolveTone(nf.value.status);
});

// Monta linhas de impostos a partir do objeto ou array de impostos da NF
const impostosRows = computed(() => {
  if (!nf.value) return [];
  // se backend já devolve array de impostos discriminados
  if (Array.isArray(nf.value.impostos)) return nf.value.impostos;
  // senão monta a partir dos campos do objeto impostos
  const imp = nf.value.impostos_totais || nf.value.impostos_detalhe || {};
  const rows = [];
  const tipos = [
    { tipo: 'ICMS',   valor: imp.valor_icms,   base: imp.base_icms,   aliquota: imp.aliquota_icms },
    { tipo: 'PIS',    valor: imp.valor_pis,    base: imp.base_pis,    aliquota: imp.aliquota_pis },
    { tipo: 'COFINS', valor: imp.valor_cofins, base: imp.base_cofins, aliquota: imp.aliquota_cofins },
    { tipo: 'IPI',    valor: imp.valor_ipi,    base: imp.base_ipi,    aliquota: imp.aliquota_ipi },
    { tipo: 'ISS',    valor: imp.valor_iss,    base: imp.base_iss,    aliquota: imp.aliquota_iss },
    { tipo: 'CSLL',   valor: imp.valor_csll,   base: imp.base_csll,   aliquota: imp.aliquota_csll },
    { tipo: 'IRPJ',   valor: imp.valor_irpj,   base: imp.base_irpj,   aliquota: imp.aliquota_irpj },
  ];
  for (const t of tipos) {
    if (t.valor != null || t.base != null) {
      rows.push({ tipo: t.tipo, base_calculo: t.base ?? null, aliquota: t.aliquota ?? null, valor: t.valor ?? null });
    }
  }
  return rows;
});

// ── colunas das tabelas ──────────────────────────────────────────────────────
// Coluna 'status' removida: itens de NF não possuem status próprio no schema do backend;
// renderizar UiStatusBadge com valor undefined causaria célula vazia/erro visual.
const itensCols = [
  { key: 'numero_item', label: 'Item',      align: 'center' },
  { key: 'codigo',      label: 'Código' },
  { key: 'descricao',   label: 'Descrição', sortable: true },
  { key: 'ncm',         label: 'NCM' },
  { key: 'cfop',        label: 'CFOP' },
  { key: 'unidade',     label: 'Un.' },
  { key: 'quantidade',  label: 'Qtd.',      align: 'right' },
  { key: 'valor_unitario', label: 'V. Unit.',  align: 'right' },
  { key: 'valor_total', label: 'V. Total',  align: 'right' },
];

const impostosCols = [
  { key: 'tipo',         label: 'Imposto' },
  { key: 'base_calculo', label: 'Base de Cálculo', align: 'right' },
  { key: 'aliquota',     label: 'Alíquota',         align: 'right' },
  { key: 'valor',        label: 'Valor',             align: 'right' },
];

// ── carregamento ─────────────────────────────────────────────────────────────
async function loadNf() {
  loading.value = true;
  loadError.value = null;
  try {
    nf.value = await apiNf.get(nfId.value);
  } catch (e) {
    loadError.value = e?.message || 'Erro ao carregar nota fiscal.';
  } finally {
    loading.value = false;
  }
}

// ── ações ─────────────────────────────────────────────────────────────────────
async function cancelNf() {
  const ok = await confirm({
    title: 'Cancelar Nota Fiscal',
    message: `Tem certeza que deseja cancelar a Nota Fiscal${nf.value?.numero_nf ? ' nº ' + nf.value.numero_nf : ''}? Esta ação é irreversível e será enviada à SEFAZ.`,
    danger: true,
    confirmLabel: 'Cancelar NF',
  });
  if (!ok) return;
  canceling.value = true;
  try {
    await nfCancel(nfId.value);
    toast.success('Nota Fiscal cancelada com sucesso.');
    await loadNf();
  } catch (e) {
    toast.error(e?.message || 'Erro ao cancelar nota fiscal.');
  } finally {
    canceling.value = false;
  }
}

async function downloadPdf() {
  downloadingPdf.value = true;
  try {
    const res = await fetch(nfDownloadPdfUrl(nfId.value));
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error?.message || ('HTTP ' + res.status));
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nf-' + nfId.value + '.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('PDF baixado com sucesso.');
  } catch (e) {
    toast.error(e?.message || 'Erro ao baixar o PDF.');
  } finally {
    downloadingPdf.value = false;
  }
}

async function downloadXml() {
  downloadingXml.value = true;
  try {
    const res = await fetch(nfDownloadXmlUrl(nfId.value));
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error?.message || ('HTTP ' + res.status));
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nfe-' + (nf.value?.chave_acesso || nfId.value) + '.xml';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('XML baixado com sucesso.');
  } catch (e) {
    toast.error(e?.message || 'Erro ao baixar o XML.');
  } finally {
    downloadingXml.value = false;
  }
}

async function copyChave() {
  try {
    await navigator.clipboard.writeText(nf.value?.chave_acesso || '');
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 2500);
  } catch {
    toast.warning('Não foi possível copiar automaticamente.');
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────
function formatChave(chave) {
  if (!chave) return '—';
  // formata a chave de acesso em grupos de 4 dígitos para legibilidade
  return String(chave).replace(/(.{4})(?=.)/g, '$1 ');
}

function enderecoStr(parte) {
  if (!parte) return '—';
  const parts = [parte.logradouro, parte.numero, parte.complemento, parte.bairro].filter(Boolean);
  return parts.join(', ') || '—';
}

function statusDisplayLabel(status) {
  const map = {
    emitida:     'Emitida',
    processando: 'Processando',
    autorizado:  'Autorizada',
    authorized:  'Autorizada',
    enviado:     'Enviada',
    cancelado:   'Cancelada',
    cancelada:   'Cancelada',
    rejeitado:   'Rejeitada',
    erro:        'Erro',
    pendente:    'Pendente',
    aguardando:  'Aguardando',
  };
  if (!status) return '—';
  const s = String(status).toLowerCase();
  return map[s] || fmt.humanize(status);
}

function regimeLabel(r) {
  const map = {
    simples:         'Simples Nacional',
    lucro_presumido: 'Lucro Presumido',
    lucro_real:      'Lucro Real',
  };
  return map[r] || fmt.humanize(r) || '—';
}

function finalidadeLabel(f) {
  const map = {
    1: 'NF-e Normal',
    2: 'NF-e Complementar',
    3: 'NF-e de Ajuste',
    4: 'Devolução / Retorno',
    normal:       'NF-e Normal',
    complementar: 'NF-e Complementar',
    ajuste:       'NF-e de Ajuste',
    devolucao:    'Devolução / Retorno',
  };
  return (f != null ? (map[f] || fmt.humanize(String(f))) : '—');
}

// ── inicialização ─────────────────────────────────────────────────────────────
onMounted(loadNf);
</script>

<style scoped>
/* ── Banner SEFAZ ──────────────────────────────────────────────────────────── */
.nf-sefaz-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ui-space-3);
  padding: var(--ui-space-4) var(--ui-space-5);
  border-radius: var(--ui-radius-lg);
  border: 1px solid rgb(var(--ui-border));
  background: rgb(var(--ui-surface));
  box-shadow: var(--ui-shadow-sm);
}
.nf-sefaz-banner[data-tone="success"] {
  background: rgb(var(--ui-ok) / 0.06);
  border-color: rgb(var(--ui-ok) / 0.3);
}
.nf-sefaz-banner[data-tone="error"] {
  background: rgb(var(--ui-danger) / 0.06);
  border-color: rgb(var(--ui-danger) / 0.3);
}
.nf-sefaz-banner[data-tone="warning"] {
  background: rgb(var(--ui-warn) / 0.06);
  border-color: rgb(var(--ui-warn) / 0.3);
}
.nf-sefaz-banner[data-tone="running"] {
  background: rgb(var(--ui-accent) / 0.06);
  border-color: rgb(var(--ui-accent) / 0.3);
}
.nf-sefaz-left {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ui-space-3);
}
.nf-sefaz-proto {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}
.nf-sefaz-proto strong { color: rgb(var(--ui-fg)); font-weight: 600; }
.nf-sefaz-date {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}
.nf-sefaz-motivo {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  max-width: 480px;
  line-height: 1.5;
}
.nf-sefaz-motivo-label {
  font-weight: 600;
  color: rgb(var(--ui-fg));
  margin-right: var(--ui-space-1);
}

/* ── Chave de Acesso ──────────────────────────────────────────────────────── */
.nf-chave-wrap {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
}
.nf-chave {
  font-family: ui-monospace, 'Cascadia Code', 'Fira Mono', 'Courier New', monospace;
  font-size: var(--ui-text-sm);
  letter-spacing: .05em;
  color: rgb(var(--ui-fg));
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-sm);
  padding: var(--ui-space-2) var(--ui-space-3);
  word-break: break-all;
  line-height: 1.6;
  flex: 1;
  min-width: 0;
}

/* ── Métricas ─────────────────────────────────────────────────────────────── */
.nf-metrics-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--ui-space-4);
}

/* ── Grid emitente / destinatário ─────────────────────────────────────────── */
.nf-parties-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--ui-space-4);
}
@media (max-width: 860px) {
  .nf-parties-grid { grid-template-columns: 1fr; }
}

/* ── Definition list ──────────────────────────────────────────────────────── */
.nf-dl {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}
.nf-dl-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--ui-space-4);
  padding: var(--ui-space-3) 0;
  border-bottom: 1px solid rgb(var(--ui-border));
}
.nf-dl-row:last-child { border-bottom: none; }
.nf-dl-label {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  font-weight: 500;
  flex-shrink: 0;
}
.nf-dl-value {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  text-align: right;
  word-break: break-word;
}

/* ── Totais de impostos ─────────────────────────────────────────────────────── */
.nf-impostos-total {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--ui-space-4);
}
.nf-impostos-total-label {
  font-size: var(--ui-text-sm);
  font-weight: 600;
  color: rgb(var(--ui-muted));
}
.nf-impostos-total-value {
  font-size: var(--ui-text-md, 1rem);
  font-weight: 700;
  color: rgb(var(--ui-fg));
}

/* ── Acessibilidade ──────────────────────────────────────────────────────── */
.nf-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* ── Observações ─────────────────────────────────────────────────────────── */
.nf-obs {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  line-height: 1.7;
  white-space: pre-wrap;
}
</style>
