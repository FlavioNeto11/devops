<script setup>
import { onMounted, ref } from 'vue';
import Icon from '../../components/Icon.vue';
import Modal from '../../components/Modal.vue';
import StatusBadge from '../../components/StatusBadge.vue';
import { api } from '../../api';
import { dateTimeBr } from '../../utils/format';

const items = ref([]);
const loading = ref(true);
const showForm = ref(false);
const form = ref({ kind: 'entrada', scheduledAt: '' });
const detail = ref(null);
const uploading = ref(false);
const laudoBusy = ref(false);
const fileInput = ref(null);

async function load() { loading.value = true; try { items.value = (await api.list('vistorias')).data; } finally { loading.value = false; } }
async function create() {
  try { await api.create('vistorias', { ...form.value, scheduledAt: form.value.scheduledAt ? new Date(form.value.scheduledAt).toISOString() : undefined }); showForm.value = false; await load(); }
  catch (e) { alert(e.message); }
}
async function open(id) { const r = await api.get('vistorias', id); detail.value = { ...r.data, timeline: r.timeline }; }
async function onPhoto(e) {
  const file = e.target.files?.[0]; if (!file || !detail.value) return;
  uploading.value = true;
  try { await api.upload(`vistorias/${detail.value.id}/fotos`, file, {}); await open(detail.value.id); }
  catch (err) { alert(err.message); } finally { uploading.value = false; if (fileInput.value) fileInput.value.value = ''; }
}
async function laudo() {
  laudoBusy.value = true;
  try { const r = await api.create(`vistorias/${detail.value.id}/laudo`, {}); if (r.dormant) alert(r.message); await open(detail.value.id); await load(); }
  catch (e) { alert(e.message); } finally { laudoBusy.value = false; }
}
onMounted(load);
</script>

<template>
  <div class="ap-page">
    <div class="ap-page-head ap-head-row">
      <div><h1><Icon name="camera" :size="22" /> Vistorias e Laudos</h1><p>Fotos analisadas por IA (Gemini) e laudo redigido por IA (Claude).</p></div>
      <button class="im-btn-primary" @click="showForm = true"><Icon name="plus" :size="16" /> Nova vistoria</button>
    </div>

    <div v-if="loading" class="im-notice">Carregando…</div>
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
      <template #footer><button class="im-linkbtn" @click="showForm = false">Cancelar</button><button class="im-btn-primary" @click="create">Criar</button></template>
    </Modal>

    <Modal :open="!!detail" :title="detail ? `Vistoria de ${detail.kind}` : ''" @close="detail = null">
      <div v-if="detail">
        <div class="ap-detail-row"><StatusBadge :status="detail.status" />
          <label class="im-linkbtn" :class="{ busy: uploading }" style="margin-left:auto">
            {{ uploading ? 'Analisando…' : '+ Foto (IA)' }}
            <input ref="fileInput" type="file" hidden accept="image/*" :disabled="uploading" @change="onPhoto" />
          </label>
          <button class="im-btn-primary" :disabled="laudoBusy" @click="laudo">{{ laudoBusy ? 'Gerando…' : 'Gerar laudo (IA)' }}</button>
        </div>
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
