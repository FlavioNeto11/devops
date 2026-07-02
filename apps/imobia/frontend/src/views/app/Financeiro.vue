<script setup>
import { computed, onMounted, ref } from 'vue';
import Icon from '../../components/Icon.vue';
import Modal from '../../components/Modal.vue';
import { api } from '../../api';
import { brl, dateBr } from '../../utils/format';

const scope = ref('');
const items = ref([]);
const cash = ref(null);
const loading = ref(true);
const showForm = ref(false);
const form = ref({ scope: 'pj', kind: 'despesa', category: 'outros', amount: null, description: '' });
const aiText = ref('');
const aiBusy = ref(false);
const report = ref('');
const reportBusy = ref(false);

async function load() {
  loading.value = true;
  try {
    const params = scope.value ? { scope: scope.value } : undefined;
    items.value = (await api.list('financeiro', params)).data;
    cash.value = await api.list('financeiro/cashflow', params);
  } finally { loading.value = false; }
}
async function save() {
  try { await api.create('financeiro', { ...form.value, amount: Number(form.value.amount) }); showForm.value = false; form.value = { scope: 'pj', kind: 'despesa', category: 'outros', amount: null, description: '' }; await load(); }
  catch (e) { alert(e.message); }
}
async function aiCategorize() {
  const m = aiText.value.match(/(\d[\d.,]*)/);
  const amount = m ? Number(m[1].replace(/\./g, '').replace(',', '.')) : 0;
  if (!aiText.value.trim()) return;
  aiBusy.value = true;
  try {
    const r = await api.create('financeiro/categorize', { description: aiText.value, amount });
    if (r.dormant) alert(r.message); else { aiText.value = ''; await load(); }
  } catch (e) { alert(e.message); } finally { aiBusy.value = false; }
}
async function genReport() {
  reportBusy.value = true; report.value = '';
  try { const r = await api.create('financeiro/report', {}); report.value = r.dormant ? r.message : r.report; }
  catch (e) { report.value = e.message; } finally { reportBusy.value = false; }
}
onMounted(load);
</script>

<template>
  <div class="ap-page">
    <div class="ap-page-head ap-head-row">
      <div><h1><Icon name="wallet" :size="22" /> Financeiro PJ/PF</h1><p>Empresarial x pessoal, categorização por IA e fluxo de caixa.</p></div>
      <button class="im-btn-primary" @click="showForm = true"><Icon name="plus" :size="16" /> Lançamento</button>
    </div>

    <div class="ap-tabs">
      <button :class="{ on: scope === '' }" @click="scope = ''; load()">Todos</button>
      <button :class="{ on: scope === 'pj' }" @click="scope = 'pj'; load()">PJ (empresa)</button>
      <button :class="{ on: scope === 'pf' }" @click="scope = 'pf'; load()">PF (pessoal)</button>
    </div>

    <div v-if="cash" class="ap-stats">
      <div class="ap-stat"><small>Receitas</small><b class="pos">{{ brl(cash.receita) }}</b></div>
      <div class="ap-stat"><small>Despesas</small><b class="neg">{{ brl(cash.despesa) }}</b></div>
      <div class="ap-stat"><small>Saldo</small><b :class="cash.saldo >= 0 ? 'pos' : 'neg'">{{ brl(cash.saldo) }}</b></div>
      <button class="im-linkbtn" :disabled="reportBusy" @click="genReport">{{ reportBusy ? '…' : 'Relatório IA (Claude)' }}</button>
    </div>
    <p v-if="report" class="ap-detail-desc" style="white-space:pre-wrap">{{ report }}</p>

    <div class="ap-nlbar">
      <Icon name="spark" :size="16" />
      <input v-model="aiText" placeholder="IA: “paguei R$ 350 de anúncios no Instagram”" @keyup.enter="aiCategorize" />
      <button class="im-btn-primary" :disabled="aiBusy || !aiText.trim()" @click="aiCategorize">{{ aiBusy ? '…' : 'Categorizar (GPT)' }}</button>
    </div>

    <div v-if="loading" class="im-notice">Carregando…</div>
    <div v-else-if="!items.length" class="ap-empty"><Icon name="wallet" :size="34" /><p>Nenhum lançamento ainda.</p></div>
    <table v-else class="ap-table">
      <thead><tr><th>Descrição</th><th>Escopo</th><th>Categoria</th><th>Tipo</th><th>Valor</th><th>Data</th></tr></thead>
      <tbody>
        <tr v-for="t in items" :key="t.id">
          <td>{{ t.description }}<span v-if="t.aiCategorized" title="categorizado por IA"> 🤖</span></td>
          <td><span class="ap-scope" :class="t.scope">{{ t.scope.toUpperCase() }}</span></td>
          <td>{{ t.category }}</td>
          <td>{{ t.kind }}</td>
          <td :class="t.kind === 'receita' ? 'pos' : 'neg'">{{ brl(t.amount) }}</td>
          <td><small>{{ dateBr(t.date) }}</small></td>
        </tr>
      </tbody>
    </table>

    <Modal :open="showForm" title="Novo lançamento" @close="showForm = false">
      <div class="ap-form">
        <label class="full">Descrição<input v-model="form.description" /></label>
        <label>Escopo<select v-model="form.scope"><option value="pj">PJ (empresa)</option><option value="pf">PF (pessoal)</option></select></label>
        <label>Tipo<select v-model="form.kind"><option value="despesa">Despesa</option><option value="receita">Receita</option></select></label>
        <label>Categoria<input v-model="form.category" /></label>
        <label>Valor<input v-model="form.amount" type="number" /></label>
      </div>
      <template #footer><button class="im-linkbtn" @click="showForm = false">Cancelar</button><button class="im-btn-primary" :disabled="!form.description || !form.amount" @click="save">Lançar</button></template>
    </Modal>
  </div>
</template>
