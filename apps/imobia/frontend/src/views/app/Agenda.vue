<script setup>
import { onMounted, ref } from 'vue';
import Icon from '../../components/Icon.vue';
import Modal from '../../components/Modal.vue';
import StatusBadge from '../../components/StatusBadge.vue';
import { api } from '../../api';
import { dateTimeBr } from '../../utils/format';

const items = ref([]);
const loading = ref(true);
const loadError = ref('');
const showForm = ref(false);
const nlText = ref('');
const nlBusy = ref(false);
const nlMsg = ref('');
const saving = ref(false);
const formError = ref('');
const form = ref({ title: '', kind: 'visita', startAt: '', location: '', notes: '' });

async function load() {
  loading.value = true; loadError.value = '';
  try { items.value = (await api.list('agenda')).data; }
  catch (e) { loadError.value = e.message || 'Falha ao carregar a agenda.'; }
  finally { loading.value = false; }
}
async function save() {
  saving.value = true; formError.value = '';
  try { await api.create('agenda', { ...form.value, startAt: new Date(form.value.startAt).toISOString() }); showForm.value = false; form.value = { title: '', kind: 'visita', startAt: '', location: '', notes: '' }; await load(); }
  catch (e) { formError.value = e.message; } finally { saving.value = false; }
}
async function nlAdd() {
  if (!nlText.value.trim()) return;
  nlBusy.value = true; nlMsg.value = '';
  try {
    const r = await api.create('agenda/parse', { text: nlText.value });
    if (r.dormant) nlMsg.value = r.message; else { nlText.value = ''; await load(); }
  } catch (e) { nlMsg.value = e.message; } finally { nlBusy.value = false; }
}
onMounted(load);
</script>

<template>
  <div class="ap-page">
    <div class="ap-page-head ap-head-row">
      <div><h1><Icon name="calendar" :size="22" /> Agenda e Eventos</h1><p>Visitas, vistorias e renovações. {{ items.length }} compromissos.</p></div>
      <button class="im-btn-primary" @click="showForm = true; formError = ''"><Icon name="plus" :size="16" /> Novo</button>
    </div>

    <div class="ap-nlbar">
      <Icon name="spark" :size="16" />
      <input v-model="nlText" placeholder="IA: “agendar visita com João no Centro amanhã 15h”" @keyup.enter="nlAdd" />
      <button class="im-btn-primary" :disabled="nlBusy || !nlText.trim()" @click="nlAdd">{{ nlBusy ? '…' : 'Agendar com IA' }}</button>
    </div>
    <p v-if="nlMsg" class="im-notice" style="margin-bottom:14px">{{ nlMsg }}</p>

    <div v-if="loading" class="im-notice">Carregando…</div>
    <div v-else-if="loadError" class="im-notice err ap-error"><span>{{ loadError }}</span><button class="im-btn-primary" @click="load">Tentar novamente</button></div>
    <div v-else-if="!items.length" class="ap-empty"><Icon name="calendar" :size="34" /><p>Nenhum compromisso agendado.</p></div>
    <div v-else class="ap-list">
      <div v-for="a in items" :key="a.id" class="ap-listitem">
        <div class="ap-when"><strong>{{ dateTimeBr(a.startAt) }}</strong><StatusBadge :status="a.status" /></div>
        <div class="ap-what"><strong>{{ a.title }}</strong><small>{{ a.kind }}<span v-if="a.location"> · {{ a.location }}</span><span v-if="a.createdByAi"> · 🤖 IA</span></small></div>
      </div>
    </div>

    <Modal :open="showForm" title="Novo compromisso" @close="showForm = false">
      <div class="ap-form">
        <label class="full">Título<input v-model="form.title" placeholder="Ex.: Visita apê Centro" /></label>
        <label>Tipo<select v-model="form.kind"><option>visita</option><option>vistoria</option><option>renovacao</option><option>reuniao</option><option>assinatura</option></select></label>
        <label>Data/hora<input v-model="form.startAt" type="datetime-local" /></label>
        <label class="full">Local<input v-model="form.location" /></label>
        <label class="full">Notas<textarea v-model="form.notes" rows="2" /></label>
      </div>
      <p v-if="formError" class="im-notice err" style="margin-top:12px">{{ formError }}</p>
      <template #footer>
        <button class="im-linkbtn" @click="showForm = false">Cancelar</button>
        <button class="im-btn-primary" :disabled="saving || !form.title || !form.startAt" @click="save">{{ saving ? 'Salvando…' : 'Agendar' }}</button>
      </template>
    </Modal>
  </div>
</template>
