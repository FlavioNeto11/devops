<script setup>
import { onMounted, ref } from 'vue';
import Icon from '../../components/Icon.vue';
import Modal from '../../components/Modal.vue';
import StatusBadge from '../../components/StatusBadge.vue';
import { api } from '../../api';
import { brl } from '../../utils/format';

const items = ref([]);
const loading = ref(true);
const showForm = ref(false);
const form = ref({ personName: '', cpf: '', goal: 'limpa_nome', currentScore: null, targetScore: null });
const detail = ref(null);
const sim = ref({ principal: null, installments: 12, interestRate: 2 });
const restr = ref({ creditor: '', amount: null, bureau: 'serasa' });
const busy = ref('');

async function load() { loading.value = true; try { items.value = (await api.list('corbam')).data; } finally { loading.value = false; } }
async function create() {
  try { const b = { ...form.value }; ['currentScore', 'targetScore'].forEach((k) => { if (b[k] == null || b[k] === '') delete b[k]; else b[k] = Number(b[k]); }); if (!b.cpf) delete b.cpf; await api.create('corbam', b); showForm.value = false; await load(); }
  catch (e) { alert(e.message); }
}
async function open(id) { const r = await api.get('corbam', id); detail.value = { ...r.data, timeline: r.timeline }; }
async function addRestr() {
  if (!restr.value.creditor || !restr.value.amount) return;
  await api.create(`corbam/${detail.value.id}/restricoes`, { ...restr.value, amount: Number(restr.value.amount) });
  restr.value = { creditor: '', amount: null, bureau: 'serasa' }; await open(detail.value.id);
}
async function simulate() {
  if (!sim.value.principal) return;
  busy.value = 'sim';
  try { await api.create(`corbam/${detail.value.id}/simular`, { principal: Number(sim.value.principal), installments: Number(sim.value.installments), interestRate: Number(sim.value.interestRate) }); await open(detail.value.id); }
  finally { busy.value = ''; }
}
async function letter(kind) {
  busy.value = 'letter';
  try { const r = await api.create(`corbam/${detail.value.id}/carta`, { kind }); if (r.dormant) alert(r.message); await open(detail.value.id); }
  catch (e) { alert(e.message); } finally { busy.value = ''; }
}
onMounted(load);
</script>

<template>
  <div class="ap-page">
    <div class="ap-page-head ap-head-row">
      <div><h1><Icon name="bank" :size="22" /> Corbam / COBAN</h1><p>Recuperação de crédito: limpa nome, score e rating. GPT simula, Claude redige, Gemini lê Serasa.</p></div>
      <button class="im-btn-primary" @click="showForm = true"><Icon name="plus" :size="16" /> Novo caso</button>
    </div>

    <div v-if="loading" class="im-notice">Carregando…</div>
    <div v-else-if="!items.length" class="ap-empty"><Icon name="bank" :size="34" /><p>Nenhum caso de recuperação de crédito.</p></div>
    <div v-else class="ap-cards">
      <article v-for="c in items" :key="c.id" class="ap-card" role="button" tabindex="0" :aria-label="`Abrir caso de ${c.personName}`" @click="open(c.id)" @keydown.enter="open(c.id)" @keydown.space.prevent="open(c.id)">
        <div class="ap-card-top"><StatusBadge :status="c.status" /><span class="ap-code">{{ c.goal }}</span></div>
        <h3>{{ c.personName }}</h3>
        <div class="ap-card-meta">{{ c.restrictions?.length || 0 }} restrições<span v-if="c.currentScore"> · score {{ c.currentScore }}</span></div>
      </article>
    </div>

    <Modal :open="showForm" title="Novo caso Corbam" @close="showForm = false">
      <div class="ap-form">
        <label class="full">Nome<input v-model="form.personName" /></label>
        <label>CPF<input v-model="form.cpf" /></label>
        <label>Objetivo<select v-model="form.goal"><option value="limpa_nome">Limpa nome</option><option value="score">Aumento de score</option><option value="rating">Rating comercial</option></select></label>
        <label>Score atual<input v-model="form.currentScore" type="number" /></label>
        <label>Score alvo<input v-model="form.targetScore" type="number" /></label>
      </div>
      <template #footer><button class="im-linkbtn" @click="showForm = false">Cancelar</button><button class="im-btn-primary" :disabled="!form.personName" @click="create">Abrir caso</button></template>
    </Modal>

    <Modal :open="!!detail" :title="detail?.personName" @close="detail = null">
      <div v-if="detail">
        <div class="ap-detail-row"><StatusBadge :status="detail.status" /><span>Objetivo <b>{{ detail.goal }}</b></span></div>

        <h4 class="ap-tl-title">Restrições</h4>
        <div v-for="r in detail.restrictions" :key="r.id" class="ap-line">{{ r.creditor }} — {{ brl(r.amount) }} <small>({{ r.bureau }})</small></div>
        <div class="ap-inline-form">
          <input v-model="restr.creditor" placeholder="Credor" /><input v-model="restr.amount" type="number" placeholder="Valor" />
          <button class="im-linkbtn" @click="addRestr">+ add</button>
        </div>

        <h4 class="ap-tl-title">Simulação de parcelas</h4>
        <div class="ap-inline-form">
          <input v-model="sim.principal" type="number" placeholder="Dívida R$" /><input v-model="sim.installments" type="number" placeholder="Parcelas" /><input v-model="sim.interestRate" type="number" step="0.1" placeholder="% a.m." />
          <button class="im-btn-primary" :disabled="busy === 'sim'" @click="simulate">Simular</button>
        </div>
        <div v-for="s in detail.simulations" :key="s.id" class="ap-line">{{ s.installments }}x de <b>{{ brl(s.installmentValue) }}</b> — total {{ brl(s.totalValue) }} <small>({{ s.interestRate }}% a.m.)</small></div>

        <h4 class="ap-tl-title">Cartas (Claude)</h4>
        <div class="ap-btnrow">
          <button class="im-linkbtn" :disabled="busy === 'letter'" @click="letter('contestacao')">Contestação</button>
          <button class="im-linkbtn" :disabled="busy === 'letter'" @click="letter('acordo')">Acordo</button>
        </div>
        <div v-for="l in detail.letters" :key="l.id" class="ap-laudo"><h4>{{ l.kind }}</h4><pre>{{ l.bodyText }}</pre></div>
      </div>
    </Modal>
  </div>
</template>
