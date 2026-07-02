<script setup>
import { onMounted, ref } from 'vue';
import Icon from '../../components/Icon.vue';
import StatusBadge from '../../components/StatusBadge.vue';
import { api } from '../../api';
import { dateTimeBr } from '../../utils/format';

const items = ref([]);
const loading = ref(true);
const uploading = ref(false);
const docType = ref('rg');
const msg = ref('');
const fileInput = ref(null);

async function load() { loading.value = true; try { items.value = (await api.list('documentos')).data; } finally { loading.value = false; } }
async function onFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  uploading.value = true; msg.value = '';
  try {
    const r = await api.upload('documentos', file, { type: docType.value });
    msg.value = r.ai?.dormant ? 'Enviado. Validação por IA dormente (configure GOOGLE_API_KEY).' : `Enviado e validado: ${r.data.validation}.`;
    await load();
  } catch (err) { msg.value = err.message; } finally { uploading.value = false; if (fileInput.value) fileInput.value.value = ''; }
}
async function revalidate(id) { try { await api.create(`documentos/${id}/validate`, {}); await load(); } catch (e) { alert(e.message); } }
onMounted(load);
</script>

<template>
  <div class="ap-page">
    <div class="ap-page-head"><h1><Icon name="folder" :size="22" /> Documentos</h1><p>Validação automática de RG/CNH/holerite/certidões e trilha por etapa (Gemini).</p></div>

    <div class="ap-upload">
      <select v-model="docType" class="ap-select">
        <option value="rg">RG</option><option value="cnh">CNH</option><option value="holerite">Holerite</option>
        <option value="comprovante_renda">Comprovante de renda</option><option value="certidao">Certidão</option>
        <option value="contrato">Contrato</option><option value="serasa">Serasa</option><option value="extrato_bancario">Extrato</option>
        <option value="matricula">Matrícula</option><option value="outro">Outro</option>
      </select>
      <label class="im-btn-primary" :class="{ busy: uploading }">
        <Icon name="plus" :size="16" /> {{ uploading ? 'Enviando…' : 'Enviar documento' }}
        <input ref="fileInput" type="file" hidden :disabled="uploading" @change="onFile" accept="image/*,application/pdf" />
      </label>
    </div>
    <p v-if="msg" class="im-notice" style="margin-bottom:14px">{{ msg }}</p>

    <div v-if="loading" class="im-notice">Carregando…</div>
    <div v-else-if="!items.length" class="ap-empty"><Icon name="folder" :size="34" /><p>Nenhum documento enviado.</p></div>
    <table v-else class="ap-table">
      <thead><tr><th>Arquivo</th><th>Tipo</th><th>Validação</th><th>Enviado</th><th></th></tr></thead>
      <tbody>
        <tr v-for="d in items" :key="d.id">
          <td><a :href="api.fileUrl(d.storageKey)" target="_blank">{{ d.filename }}</a><br /><small v-if="d.validationReason">{{ d.validationReason }}</small></td>
          <td>{{ d.type }}</td>
          <td><StatusBadge :status="d.validation" /></td>
          <td><small>{{ dateTimeBr(d.createdAt) }}</small></td>
          <td><button class="im-linkbtn" @click="revalidate(d.id)">revalidar</button></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
