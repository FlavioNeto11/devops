<script setup>
import { onMounted, ref } from 'vue';
import Icon from '../../components/Icon.vue';
import Modal from '../../components/Modal.vue';
import StatusBadge from '../../components/StatusBadge.vue';
import { api } from '../../api';
import { brl, dateTimeBr } from '../../utils/format';

const items = ref([]);
const loading = ref(true);
const showForm = ref(false);
const saving = ref(false);
const formError = ref('');
const scoring = ref('');
const detail = ref(null);
const detailTimeline = ref([]);
const aiStatus = ref(null);

const empty = () => ({ name: '', phone: '', email: '', interest: 'compra', budgetMin: null, budgetMax: null, sourceChannel: '', notes: '' });
const form = ref(empty());

async function load() {
  loading.value = true;
  try { items.value = (await api.list('leads')).data; } finally { loading.value = false; }
}
async function save() {
  saving.value = true; formError.value = '';
  try {
    const body = { ...form.value };
    ['budgetMin', 'budgetMax'].forEach((k) => { if (body[k] === '' || body[k] == null) delete body[k]; else body[k] = Number(body[k]); });
    ['phone', 'email', 'sourceChannel', 'notes'].forEach((k) => { if (!body[k]) delete body[k]; });
    await api.create('leads', body);
    showForm.value = false; form.value = empty();
    await load();
  } catch (e) { formError.value = e.message; } finally { saving.value = false; }
}
async function score(id) {
  scoring.value = id;
  try {
    const r = await api.create(`leads/${id}/score`, {});
    if (r.dormant) alert(r.message);
    await load();
    if (detail.value?.id === id) await openDetail(id);
  } catch (e) { alert(e.message); } finally { scoring.value = ''; }
}
async function openDetail(id) {
  const r = await api.get('leads', id);
  detail.value = r.data; detailTimeline.value = r.timeline || [];
}
// Só abre o detalhe quando o teclado age sobre a própria linha (ignora o botão de score aninhado).
function onRowKey(e, id) {
  if (e.target !== e.currentTarget) return;
  e.preventDefault();
  openDetail(id);
}
onMounted(async () => { await load(); try { aiStatus.value = await api.aiStatus(); } catch { /* noop */ } });
</script>

<template>
  <div class="ap-page">
    <div class="ap-page-head ap-head-row">
      <div>
        <h1><Icon name="users" :size="22" /> Clientes / Leads</h1>
        <p>Coleta e qualificação. {{ items.length }} leads · scoring por IA {{ aiStatus && !aiStatus.dormant ? 'ativo' : 'dormente' }}.</p>
      </div>
      <button class="im-btn-primary" @click="showForm = true; form = empty()"><Icon name="plus" :size="16" /> Novo lead</button>
    </div>

    <div v-if="loading" class="im-notice">Carregando…</div>
    <div v-else-if="!items.length" class="ap-empty">
      <Icon name="users" :size="34" />
      <p>Nenhum lead ainda. Cadastre o primeiro cliente.</p>
      <button class="im-btn-primary" @click="showForm = true"><Icon name="plus" :size="16" /> Novo lead</button>
    </div>
    <table v-else class="ap-table">
      <thead><tr><th>Nome</th><th>Interesse</th><th>Estágio</th><th>Orçamento</th><th>Score</th><th></th></tr></thead>
      <tbody>
        <tr v-for="l in items" :key="l.id" role="button" tabindex="0" :aria-label="`Abrir lead ${l.name}`" @click="openDetail(l.id)" @keydown.enter="onRowKey($event, l.id)" @keydown.space="onRowKey($event, l.id)">
          <td><strong>{{ l.name }}</strong><br /><small>{{ l.email || l.phone || '—' }}</small></td>
          <td>{{ l.interest }}</td>
          <td><StatusBadge :status="l.stage" /></td>
          <td>{{ l.budgetMax ? brl(l.budgetMax) : '—' }}</td>
          <td><div class="ap-score"><div class="ap-score-bar" :style="{ width: l.score + '%' }" /></div><small>{{ l.score }}</small></td>
          <td @click.stop><button class="im-linkbtn" :disabled="scoring === l.id" @click="score(l.id)">{{ scoring === l.id ? '…' : 'IA ⚡' }}</button></td>
        </tr>
      </tbody>
    </table>

    <Modal :open="showForm" title="Novo lead" @close="showForm = false">
      <div class="ap-form">
        <label class="full">Nome<input v-model="form.name" placeholder="Nome do cliente" /></label>
        <label>Telefone<input v-model="form.phone" /></label>
        <label>E-mail<input v-model="form.email" type="email" /></label>
        <label>Interesse<select v-model="form.interest"><option value="compra">Compra</option><option value="locacao">Locação</option><option value="ambos">Ambos</option></select></label>
        <label>Canal<input v-model="form.sourceChannel" placeholder="WhatsApp, indicação…" /></label>
        <label>Orçamento mín.<input v-model="form.budgetMin" type="number" placeholder="R$" /></label>
        <label>Orçamento máx.<input v-model="form.budgetMax" type="number" placeholder="R$" /></label>
        <label class="full">Notas<textarea v-model="form.notes" rows="2" placeholder="Perfil, preferências…" /></label>
      </div>
      <p v-if="formError" class="im-notice err" style="margin-top:12px">{{ formError }}</p>
      <template #footer>
        <button class="im-linkbtn" @click="showForm = false">Cancelar</button>
        <button class="im-btn-primary" :disabled="saving || !form.name" @click="save">{{ saving ? 'Salvando…' : 'Cadastrar lead' }}</button>
      </template>
    </Modal>

    <Modal :open="!!detail" :title="detail?.name" @close="detail = null">
      <div v-if="detail">
        <div class="ap-detail-row"><StatusBadge :status="detail.stage" /> <span>Score <b>{{ detail.score }}/100</b></span>
          <button class="im-linkbtn" style="margin-left:auto" :disabled="scoring === detail.id" @click="score(detail.id)">{{ scoring === detail.id ? '…' : 'Pontuar com IA ⚡' }}</button>
        </div>
        <p v-if="detail.scoreReason" class="ap-detail-desc"><b>IA:</b> {{ detail.scoreReason }}</p>
        <div class="ap-detail-grid">
          <div><small>Interesse</small><b>{{ detail.interest }}</b></div>
          <div><small>Orçamento</small><b>{{ detail.budgetMin ? brl(detail.budgetMin) : '?' }}–{{ detail.budgetMax ? brl(detail.budgetMax) : '?' }}</b></div>
          <div><small>Canal</small><b>{{ detail.sourceChannel || '—' }}</b></div>
          <div><small>Contato</small><b>{{ detail.email || detail.phone || '—' }}</b></div>
        </div>
        <p v-if="detail.notes" class="ap-detail-desc">{{ detail.notes }}</p>
        <h4 class="ap-tl-title">Linha do tempo</h4>
        <div class="ap-timeline">
          <div v-for="t in detailTimeline" :key="t.id" class="ap-tl-item">
            <span class="ap-tl-actor" :class="`tag-${t.actorType}`">{{ t.actorType }}</span>
            <div><strong>{{ t.title }}</strong><small v-if="t.summary"> — {{ t.summary }}</small><em>{{ dateTimeBr(t.createdAt) }}</em></div>
          </div>
          <p v-if="!detailTimeline.length" class="im-notice">Sem eventos ainda.</p>
        </div>
      </div>
    </Modal>
  </div>
</template>
