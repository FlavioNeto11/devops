<script setup>
import { onMounted, ref } from 'vue';
import Icon from '../../components/Icon.vue';
import Modal from '../../components/Modal.vue';
import { api } from '../../api';
import { dateTimeBr } from '../../utils/format';

const channels = ref([]);
const gateway = ref(false);
const loading = ref(true);
const loadError = ref('');
const showForm = ref(false);
const creating = ref(false);
const formError = ref('');
const form = ref({ phoneNumber: '', segment: 'captacao' });
const simText = ref('');
const simChannel = ref('');
const simResult = ref(null);
const simBusy = ref(false);
const simMsg = ref('');
const messages = ref([]);

async function load() {
  loading.value = true; loadError.value = '';
  try { const r = await api.list('whatsapp/channels'); channels.value = r.data; gateway.value = r.gateway; if (channels.value[0]) simChannel.value = channels.value[0].id; }
  catch (e) { loadError.value = e.message || 'Falha ao carregar os canais.'; }
  finally { loading.value = false; }
}
async function create() {
  creating.value = true; formError.value = '';
  try { await api.create('whatsapp/channels', form.value); showForm.value = false; form.value = { phoneNumber: '', segment: 'captacao' }; await load(); }
  catch (e) { formError.value = e.message; } finally { creating.value = false; }
}
async function simulate() {
  if (!simText.value.trim() || !simChannel.value) return;
  simBusy.value = true; simResult.value = null; simMsg.value = '';
  try {
    const r = await api.create('whatsapp/simulate', { channelId: simChannel.value, text: simText.value });
    simResult.value = r; simText.value = '';
    messages.value = (await api.list('whatsapp/messages', { channelId: simChannel.value })).data;
  } catch (e) { simMsg.value = e.message; } finally { simBusy.value = false; }
}
onMounted(load);
</script>

<template>
  <div class="ap-page">
    <div class="ap-page-head ap-head-row">
      <div><h1><Icon name="message" :size="22" /> WhatsApp (eixo central)</h1><p>Múltiplos números por segmento. O Cortex tria cada mensagem recebida.</p></div>
      <button class="im-btn-primary" @click="showForm = true; formError = ''"><Icon name="plus" :size="16" /> Novo número</button>
    </div>

    <div v-if="!gateway" class="im-notice" style="margin-bottom:16px">🔌 Gateway WhatsApp dormente (Baileys/Evolution/Z-API não configurado). Você pode registrar números e <b>simular</b> mensagens para ver a triagem do Cortex.</div>

    <div v-if="loading" class="im-notice">Carregando…</div>
    <div v-else-if="loadError" class="im-notice err ap-error"><span>{{ loadError }}</span><button class="im-btn-primary" @click="load">Tentar novamente</button></div>
    <div v-else class="ap-cards" style="margin-bottom:20px">
      <article v-for="c in channels" :key="c.id" class="ap-card" style="cursor:default">
        <div class="ap-card-top"><span class="ap-scope" :class="c.segment === 'financas' ? 'pf' : 'pj'">{{ c.segment }}</span><span class="ap-code">{{ c.status }}</span></div>
        <h3>{{ c.phoneNumber }}</h3>
        <div class="ap-card-meta">{{ c.instanceId }}</div>
      </article>
      <div v-if="!channels.length" class="ap-empty" style="grid-column:1/-1"><Icon name="message" :size="34" /><p>Nenhum número. Registre o primeiro.</p></div>
    </div>

    <div v-if="channels.length" class="ap-simbox">
      <h4 class="ap-tl-title">Simular mensagem recebida → triagem Cortex</h4>
      <div class="ap-inline-form">
        <select v-model="simChannel" class="ap-select"><option v-for="c in channels" :key="c.id" :value="c.id">{{ c.phoneNumber }} ({{ c.segment }})</option></select>
        <input v-model="simText" placeholder="“Tenho interesse no apê de 2 quartos, dá pra visitar?”" @keyup.enter="simulate" />
        <button class="im-btn-primary" :disabled="simBusy || !simText.trim()" @click="simulate">{{ simBusy ? '…' : 'Simular' }}</button>
      </div>
      <p v-if="simMsg" class="im-notice err" style="margin-top:10px">{{ simMsg }}</p>
      <div v-if="simResult" class="im-notice">
        <template v-if="simResult.triage?.dormant">Cortex dormente (sem chave). Mensagem registrada sem triagem.</template>
        <template v-else><b class="tag-cortex">Cortex</b> classificou: <b>{{ simResult.triage.intent }}</b> → especialista <b>{{ simResult.triage.specialist }}</b></template>
      </div>
      <div v-for="m in messages" :key="m.id" class="ap-line"><b>{{ m.contactName }}:</b> {{ m.text }} <small v-if="m.aiIntent">· 🤖 {{ m.aiIntent }}</small><small> · {{ dateTimeBr(m.createdAt) }}</small></div>
    </div>

    <Modal :open="showForm" title="Novo número WhatsApp" @close="showForm = false">
      <div class="ap-form">
        <label class="full">Número<input v-model="form.phoneNumber" placeholder="+55 48 99999-0000" /></label>
        <label class="full">Segmento<select v-model="form.segment"><option value="captacao">Captação</option><option value="vendas">Vendas</option><option value="financas">Finanças</option><option value="geral">Geral</option></select></label>
      </div>
      <p v-if="formError" class="im-notice err" style="margin-top:12px">{{ formError }}</p>
      <template #footer><button class="im-linkbtn" @click="showForm = false">Cancelar</button><button class="im-btn-primary" :disabled="!form.phoneNumber || creating" @click="create">{{ creating ? 'Registrando…' : 'Registrar' }}</button></template>
    </Modal>
  </div>
</template>
