<script setup>
import { onMounted, ref } from 'vue';
import Icon from '../../components/Icon.vue';
import Modal from '../../components/Modal.vue';
import StatusBadge from '../../components/StatusBadge.vue';
import { api } from '../../api';
import { brl, dateBr } from '../../utils/format';

const runs = ref([]);
const ptams = ref([]);
const scraper = ref(false);
const loading = ref(true);
const loadError = ref('');
const detail = ref(null);
const detailOpen = ref(false);
const detailLoading = ref(false);
const detailError = ref('');
const detailId = ref(null);
const detailMsg = ref('');
const detailMsgErr = ref(false);
const ptamDetail = ref(null);
const comp = ref({ portal: 'manual', price: null, areaM2: null, type: 'apartamento' });
const busy = ref('');
const notice = ref('');
const noticeErr = ref(false);

async function load() {
  loading.value = true; loadError.value = '';
  try { const r = await api.list('acm'); runs.value = r.data; scraper.value = r.scraper; ptams.value = (await api.list('ptam')).data; }
  catch (e) { loadError.value = e.message || 'Falha ao carregar as análises.'; }
  finally { loading.value = false; }
}
async function create() {
  if (busy.value === 'create') return;
  busy.value = 'create'; notice.value = ''; noticeErr.value = false;
  try { await api.create('acm', {}); await load(); }
  catch (e) { notice.value = e.message; noticeErr.value = true; } finally { busy.value = ''; }
}
async function open(id) {
  detailId.value = id; detailOpen.value = true; detailLoading.value = true; detailError.value = '';
  detail.value = null; detailMsg.value = ''; detailMsgErr.value = false;
  try { detail.value = (await api.get('acm', id)).data; }
  catch (e) { detailError.value = e.message || 'Falha ao abrir a análise.'; }
  finally { detailLoading.value = false; }
}
async function refreshDetail() {
  try { detail.value = (await api.get('acm', detailId.value)).data; } catch { /* mantem o detalhe atual */ }
}
function closeDetail() { detailOpen.value = false; detail.value = null; detailError.value = ''; detailMsg.value = ''; }
async function addComp() {
  if (!comp.value.price || !comp.value.areaM2 || busy.value === 'comp') return;
  busy.value = 'comp';
  try {
    await api.create(`acm/${detail.value.id}/comparaveis`, { ...comp.value, price: Number(comp.value.price), areaM2: Number(comp.value.areaM2) });
    comp.value = { portal: 'manual', price: null, areaM2: null, type: 'apartamento' }; await refreshDetail();
  } catch (e) { detailMsg.value = e.message; detailMsgErr.value = true; } finally { busy.value = ''; }
}
async function compute() {
  busy.value = 'compute'; detailMsg.value = ''; detailMsgErr.value = false;
  try { await api.create(`acm/${detail.value.id}/compute`, {}); await refreshDetail(); await load(); }
  catch (e) { detailMsg.value = e.message; detailMsgErr.value = true; } finally { busy.value = ''; }
}
async function genPtam() {
  busy.value = 'ptam'; detailMsg.value = ''; detailMsgErr.value = false;
  try {
    const r = await api.create('ptam', { propertyId: detail.value.propertyId || undefined, acmRunId: detail.value.id });
    await load(); ptamDetail.value = r.data;
  } catch (e) { detailMsg.value = e.message; detailMsgErr.value = true; } finally { busy.value = ''; }
}
onMounted(load);
</script>

<template>
  <div class="ap-page">
    <div class="ap-page-head ap-head-row">
      <div><h1><Icon name="chart" :size="22" /> ACM / PTAM</h1><p>Análise de Mercado Comparativa (m² médio) e Parecer Técnico (ABNT NBR 14653) por IA.</p></div>
      <button class="im-btn-primary" :disabled="busy === 'create'" @click="create"><Icon name="plus" :size="16" /> {{ busy === 'create' ? 'Criando…' : 'Nova ACM' }}</button>
    </div>

    <p v-if="notice" class="im-notice" :class="{ err: noticeErr }" style="margin-bottom:16px">{{ notice }}</p>

    <div v-if="!scraper" class="im-notice" style="margin-bottom:16px">🔌 Scraper de portais dormente. Adicione comparáveis manualmente e calcule a média do m²; depois gere o PTAM.</div>

    <div v-if="loading" class="im-notice">Carregando…</div>
    <div v-else-if="loadError" class="im-notice err ap-error"><span>{{ loadError }}</span><button class="im-btn-primary" @click="load">Tentar novamente</button></div>
    <template v-else>
      <h2 class="im-section-title">Análises (ACM)</h2>
      <div v-if="!runs.length" class="ap-empty"><Icon name="chart" :size="34" /><p>Nenhuma análise ainda.</p></div>
      <div v-else class="ap-cards">
        <article v-for="r in runs" :key="r.id" class="ap-card" role="button" tabindex="0" :aria-label="`Abrir análise de mercado ${r.avgPricePerM2 ? brl(r.avgPricePerM2) + ' por m²' : 'em aberto'}`" @click="open(r.id)" @keydown.enter="open(r.id)" @keydown.space.prevent="open(r.id)">
          <div class="ap-card-top"><StatusBadge :status="r.status" /><span class="ap-code">{{ r.comparables?.length || 0 }} comp.</span></div>
          <h3>{{ r.avgPricePerM2 ? brl(r.avgPricePerM2) + '/m²' : 'ACM em aberto' }}</h3>
          <div class="ap-card-meta">{{ r.sampleSize }} amostras</div>
        </article>
      </div>

      <h2 class="im-section-title">Pareceres (PTAM)</h2>
      <div v-if="!ptams.length" class="im-notice">Nenhum PTAM gerado. Abra uma ACM e clique em “Gerar PTAM”.</div>
      <div v-else class="ap-table-wrap">
        <table class="ap-table">
          <thead><tr><th>Metodologia</th><th>Valor estimado</th><th>Grau</th><th>Status</th><th>Data</th></tr></thead>
          <tbody>
            <tr v-for="pt in ptams" :key="pt.id" class="is-clickable" role="button" tabindex="0" :aria-label="`Abrir parecer ${pt.methodology}`" @click="ptamDetail = pt" @keydown.enter="ptamDetail = pt" @keydown.space.prevent="ptamDetail = pt">
              <td>{{ pt.methodology }}</td><td>{{ pt.estimatedValue ? brl(pt.estimatedValue) : '—' }}</td>
              <td>{{ pt.confidenceGrade }}</td><td><StatusBadge :status="pt.status === 'generated' ? 'concluido' : 'aberto'" /></td>
              <td><small>{{ dateBr(pt.createdAt) }}</small></td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <Modal :open="detailOpen" title="Análise de Mercado Comparativa" @close="closeDetail">
      <div v-if="detailLoading" class="im-notice">Carregando…</div>
      <div v-else-if="detailError" class="im-notice err ap-error">
        <span>{{ detailError }}</span>
        <button class="im-btn-primary" @click="open(detailId)">Tentar novamente</button>
      </div>
      <div v-else-if="detail">
        <div class="ap-detail-row"><StatusBadge :status="detail.status" />
          <span v-if="detail.avgPricePerM2">m² médio <b>{{ brl(detail.avgPricePerM2) }}</b> · mediana {{ brl(detail.medianPricePerM2) }}</span>
          <button class="im-linkbtn" style="margin-left:auto" :disabled="busy === 'compute' || !detail.comparables?.length" @click="compute">{{ busy === 'compute' ? '…' : 'Calcular m²' }}</button>
          <button class="im-btn-primary" :disabled="busy === 'ptam'" @click="genPtam">{{ busy === 'ptam' ? '…' : 'Gerar PTAM (Claude)' }}</button>
        </div>
        <p v-if="detailMsg" class="im-notice" :class="{ err: detailMsgErr }" style="margin-bottom:14px">{{ detailMsg }}</p>
        <p v-if="detail.summary" class="ap-detail-desc">{{ detail.summary }}</p>
        <h4 class="ap-tl-title">Comparáveis</h4>
        <div v-for="c in detail.comparables" :key="c.id" class="ap-line">{{ c.type || 'imóvel' }} — {{ brl(c.price) }} / {{ c.areaM2 }}m² = <b>{{ brl(c.pricePerM2) }}/m²</b> <small>({{ c.portal }})</small></div>
        <div class="ap-inline-form">
          <input v-model="comp.price" type="number" placeholder="Preço R$" /><input v-model="comp.areaM2" type="number" placeholder="Área m²" />
          <button class="im-linkbtn" :disabled="busy === 'comp'" @click="addComp">+ comparável</button>
        </div>
      </div>
    </Modal>

    <Modal :open="!!ptamDetail" title="PTAM — Parecer Técnico" @close="ptamDetail = null">
      <div v-if="ptamDetail">
        <div class="ap-detail-row"><b>{{ ptamDetail.methodology }}</b><span v-if="ptamDetail.estimatedValue">· valor {{ brl(ptamDetail.estimatedValue) }}</span><span>· grau {{ ptamDetail.confidenceGrade }}</span></div>
        <div v-if="ptamDetail.narrativeText" class="ap-laudo"><pre>{{ ptamDetail.narrativeText }}</pre></div>
        <p v-else class="im-notice">Parecer em rascunho — IA dormente (configure ANTHROPIC_API_KEY). Valor estimado calculado.</p>
      </div>
    </Modal>
  </div>
</template>
