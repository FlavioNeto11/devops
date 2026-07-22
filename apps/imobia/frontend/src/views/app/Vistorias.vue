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
const creating = ref(false);
const formError = ref('');
const form = ref({ kind: 'entrada', scheduledAt: '' });
const detail = ref(null);
const detailOpen = ref(false);
const detailLoading = ref(false);
const detailError = ref('');
const detailId = ref(null);
const detailMsg = ref('');
const detailMsgErr = ref(false);
const uploading = ref(false);
const laudoBusy = ref(false);
const fileInput = ref(null);

async function load() {
  loading.value = true; loadError.value = '';
  try { items.value = (await api.list('vistorias')).data; }
  catch (e) { loadError.value = e.message || 'Falha ao carregar as vistorias.'; }
  finally { loading.value = false; }
}
async function create() {
  creating.value = true; formError.value = '';
  try { await api.create('vistorias', { ...form.value, scheduledAt: form.value.scheduledAt ? new Date(form.value.scheduledAt).toISOString() : undefined }); showForm.value = false; await load(); }
  catch (e) { formError.value = e.message; } finally { creating.value = false; }
}
async function open(id) {
  detailId.value = id; detailOpen.value = true; detailLoading.value = true; detailError.value = '';
  detail.value = null; detailMsg.value = ''; detailMsgErr.value = false;
  try { const r = await api.get('vistorias', id); detail.value = { ...r.data, timeline: r.timeline }; }
  catch (e) { detailError.value = e.message || 'Falha ao abrir a vistoria.'; }
  finally { detailLoading.value = false; }
}
async function refreshDetail() {
  try { const r = await api.get('vistorias', detailId.value); detail.value = { ...r.data, timeline: r.timeline }; }
  catch { /* mantem o detalhe atual */ }
}
function closeDetail() { detailOpen.value = false; detail.value = null; detailError.value = ''; detailMsg.value = ''; }
async function onPhoto(e) {
  const file = e.target.files?.[0]; if (!file || !detail.value) return;
  uploading.value = true; detailMsg.value = ''; detailMsgErr.value = false;
  try { await api.upload(`vistorias/${detail.value.id}/fotos`, file, {}); await refreshDetail(); }
  catch (err) { detailMsg.value = err.message; detailMsgErr.value = true; } finally { uploading.value = false; if (fileInput.value) fileInput.value.value = ''; }
}
async function laudo() {
  laudoBusy.value = true; detailMsg.value = ''; detailMsgErr.value = false;
  try { const r = await api.create(`vistorias/${detail.value.id}/laudo`, {}); if (r.dormant) { detailMsg.value = r.message; detailMsgErr.value = false; } await refreshDetail(); await load(); }
  catch (e) { detailMsg.value = e.message; detailMsgErr.value = true; } finally { laudoBusy.value = false; }
}
onMounted(load);
</script>

<template>
  <div class="ap-page">
    <div class="ap-page-head ap-head-row">
      <div><h1><Icon name="camera" :size="22" /> Vistorias e Laudos</h1><p>Fotos analisadas por IA (Gemini) e laudo redigido por IA (Claude).</p></div>
      <button class="im-btn-primary" @click="showForm = true; formError = ''"><Icon name="plus" :size="16" /> Nova vistoria</button>
    </div>

    <div v-if="loading" class="im-notice">Carregando…</div>
    <div v-else-if="loadError" class="im-notice err ap-error"><span>{{ loadError }}</span><button class="im-btn-primary" @click="load">Tentar novamente</button></div>
    <div v-else-if="!items.length" class="ap-empty"><Icon name="camera" :size="34" /><p>Nenhuma vistoria ainda.</p></div>
    <div v-else class="ap-cards">
      <article v-for="v in items" :key="v.id" class="ap-card" role="button" tabindex="0" :aria-label="`Abrir vistoria de ${v.kind}`" @click="open(v.id)" @keydown.enter="open(v.id)" @keydown.space.prevent="open(v.id)">
        <div class="ap-card-top"><StatusBadge :status="v.status" /><span class="ap-code">{{ v.photos?.length || 0 }} fotos</span></div>
        <h3>Vistoria de {{ v.kind }}</h3>
        <div class="ap-card-meta">{{ v.laudoText ? 'Laudo gerado' : 'Aguardando laudo' }} · {{ dateTimeBr(v.createdAt) }}</div>
      </article>
    </div>

    <Modal :open="showForm" title="Nova vistoria" @close="showForm = false">
      <div class="ap-form">
        <label>Tipo<select v-model="form.kind"><option>entrada</option><option>saida</option><option>periodica</option></select></label>
        <label>Agendada para<input v-model="form.scheduledAt" type="datetime-local" /></label>
      </div>
      <p v-if="formError" class="im-notice err" style="margin-top:12px">{{ formError }}</p>
      <template #footer><button class="im-linkbtn" @click="showForm = false">Cancelar</button><button class="im-btn-primary" :disabled="creating" @click="create">{{ creating ? 'Criando…' : 'Criar' }}</button></template>
    </Modal>

    <Modal :open="detailOpen" :title="detail ? `Vistoria de ${detail.kind}` : 'Vistoria'" @close="closeDetail">
      <div v-if="detailLoading" class="im-notice">Carregando…</div>
      <div v-else-if="detailError" class="im-notice err ap-error">
        <span>{{ detailError }}</span>
        <button class="im-btn-primary" @click="open(detailId)">Tentar novamente</button>
      </div>
      <div v-else-if="detail">
        <div class="ap-detail-row"><StatusBadge :status="detail.status" />
          <label class="im-linkbtn" :class="{ busy: uploading }" style="margin-left:auto">
            {{ uploading ? 'Analisando…' : '+ Foto (IA)' }}
            <input ref="fileInput" type="file" hidden accept="image/*" :disabled="uploading" @change="onPhoto" />
          </label>
          <button class="im-btn-primary" :disabled="laudoBusy" @click="laudo">{{ laudoBusy ? 'Gerando…' : 'Gerar laudo (IA)' }}</button>
        </div>
        <p v-if="detailMsg" class="im-notice" :class="{ err: detailMsgErr }" style="margin-bottom:14px">{{ detailMsg }}</p>
        <div v-if="detail.photos?.length" class="ap-photos">
          <div v-for="ph in detail.photos" :key="ph.id" class="ap-photo">
            <img :src="api.fileUrl(ph.storageKey)" alt="foto" />
            <p v-if="ph.aiDescription"><b class="tag-gemini">Gemini:</b> {{ ph.aiDescription }}</p>
            <p v-else><small>análise dormente (sem GOOGLE_API_KEY)</small></p>
          </div>
        </div>
        <p v-else class="im-notice">Envie fotos para a IA analisar o estado do imóvel.</p>
        <div v-if="detail.laudoText" class="ap-laudo"><h4>Laudo (Claude)</h4><pre>{{ detail.laudoText }}</pre></div>
      </div>
    </Modal>
  </div>
</template>
