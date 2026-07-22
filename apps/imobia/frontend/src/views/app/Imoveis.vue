<script setup>
import { onMounted, ref } from 'vue';
import Icon from '../../components/Icon.vue';
import Modal from '../../components/Modal.vue';
import StatusBadge from '../../components/StatusBadge.vue';
import { api } from '../../api';
import { brl, dateTimeBr } from '../../utils/format';

const items = ref([]);
const total = ref(0);
const loading = ref(true);
const loadError = ref('');
const semantic = ref(false);
const search = ref('');
const searchMode = ref('');
const showForm = ref(false);
const saving = ref(false);
const formError = ref('');
const editingId = ref(null);
const owners = ref([]);
const detail = ref(null);
const detailTimeline = ref([]);
const detailOpen = ref(false);
const detailLoading = ref(false);
const detailError = ref('');
const detailId = ref(null);
const confirmDel = ref(false);
const removing = ref(false);
const actionError = ref('');

const empty = () => ({ title: '', type: 'apartamento', purpose: 'venda', status: 'captacao', description: '', priceSale: null, priceRent: null, bedrooms: 0, bathrooms: 0, parking: 0, areaUsable: null, ownerId: '', address: { city: '', district: '', state: '' } });
// Mapeia um imovel carregado para o shape do formulario (reuso do form de criacao na edicao).
const toForm = (d) => ({
  title: d.title || '', type: d.type || 'apartamento', purpose: d.purpose || 'venda', status: d.status || 'captacao',
  description: d.description || '', priceSale: d.priceSale ?? null, priceRent: d.priceRent ?? null,
  bedrooms: d.bedrooms ?? 0, bathrooms: d.bathrooms ?? 0, parking: d.parking ?? 0, areaUsable: d.areaUsable ?? null,
  ownerId: d.ownerId || '', address: { city: d.address?.city || '', district: d.address?.district || '', state: d.address?.state || '' },
});
const form = ref(empty());

async function load() {
  loading.value = true; loadError.value = '';
  try {
    const r = await api.list('imoveis');
    items.value = r.data; total.value = r.total; semantic.value = r.semantic;
  } catch (e) { loadError.value = e.message || 'Falha ao carregar os imóveis.'; }
  finally { loading.value = false; }
}
async function doSearch() {
  if (!search.value.trim()) return load();
  loading.value = true; loadError.value = '';
  try {
    const r = await api.create('imoveis/search', { query: search.value });
    items.value = r.data; total.value = r.data.length; searchMode.value = r.mode;
  } catch (e) { loadError.value = e.message || 'Falha ao buscar imóveis.'; }
  finally { loading.value = false; }
}
async function openForm() {
  editingId.value = null;
  form.value = empty(); formError.value = '';
  try { owners.value = (await api.list('owners')).data; } catch { owners.value = []; }
  showForm.value = true;
}
async function openEdit() {
  if (!detail.value) return;
  editingId.value = detail.value.id;
  form.value = toForm(detail.value); formError.value = '';
  try { owners.value = (await api.list('owners')).data; } catch { owners.value = []; }
  detailOpen.value = false;
  showForm.value = true;
}
async function save() {
  saving.value = true; formError.value = '';
  try {
    const body = { ...form.value };
    if (!body.ownerId) delete body.ownerId;
    ['priceSale', 'priceRent', 'areaUsable', 'bedrooms', 'bathrooms', 'parking'].forEach((k) => { if (body[k] === '' || body[k] == null) delete body[k]; else body[k] = Number(body[k]); });
    if (!body.address.city && !body.address.district) delete body.address;
    if (editingId.value) await api.update('imoveis', editingId.value, body);
    else await api.create('imoveis', body);
    showForm.value = false;
    editingId.value = null;
    await load();
  } catch (e) { formError.value = e.message; } finally { saving.value = false; }
}
async function openDetail(id) {
  detailId.value = id; detailOpen.value = true; detailLoading.value = true; detailError.value = '';
  confirmDel.value = false; actionError.value = '';
  detail.value = null; detailTimeline.value = [];
  try {
    const r = await api.get('imoveis', id);
    detail.value = r.data; detailTimeline.value = r.timeline || [];
  } catch (e) { detailError.value = e.message || 'Falha ao abrir o imóvel.'; }
  finally { detailLoading.value = false; }
}
function closeDetail() { detailOpen.value = false; detail.value = null; detailError.value = ''; confirmDel.value = false; actionError.value = ''; }
function askDelete() { confirmDel.value = true; actionError.value = ''; }
function cancelDelete() { confirmDel.value = false; }
async function doDelete() {
  if (!detail.value) return;
  removing.value = true; actionError.value = '';
  try {
    await api.remove('imoveis', detail.value.id);
    confirmDel.value = false;
    closeDetail();
    await load();
  } catch (e) { actionError.value = e.message || 'Falha ao excluir o imóvel.'; }
  finally { removing.value = false; }
}
onMounted(load);
</script>

<template>
  <div class="ap-page">
    <div class="ap-page-head ap-head-row">
      <div>
        <h1><Icon name="building" :size="22" /> Imóveis</h1>
        <p>Captação e carteira. {{ total }} imóveis{{ semantic ? ' · busca semântica ativa' : '' }}.</p>
      </div>
      <button class="im-btn-primary" @click="openForm"><Icon name="plus" :size="16" /> Novo imóvel</button>
    </div>

    <div class="ap-toolbar">
      <form class="ap-searchbox" @submit.prevent="doSearch">
        <Icon name="search" :size="16" />
        <input v-model="search" :placeholder="semantic ? 'Busca inteligente: “apê 2 quartos com varanda”…' : 'Buscar por título/código…'" />
      </form>
      <button v-if="search" class="im-linkbtn" @click="search = ''; searchMode = ''; load()">limpar</button>
    </div>

    <div v-if="loading" class="im-notice">Carregando…</div>
    <div v-else-if="loadError" class="im-notice err ap-error">
      <span>{{ loadError }}</span>
      <button class="im-btn-primary" @click="load">Tentar novamente</button>
    </div>
    <div v-else-if="!items.length" class="ap-empty">
      <Icon name="building" :size="34" />
      <p>Nenhum imóvel ainda. Comece captando o primeiro.</p>
      <button class="im-btn-primary" @click="openForm"><Icon name="plus" :size="16" /> Novo imóvel</button>
    </div>
    <div v-else class="ap-cards">
      <article v-for="p in items" :key="p.id" class="ap-card" role="button" tabindex="0" :aria-label="`Abrir detalhes do imóvel ${p.title}`" @click="openDetail(p.id)" @keydown.enter="openDetail(p.id)" @keydown.space.prevent="openDetail(p.id)">
        <div class="ap-card-top">
          <StatusBadge :status="p.status" />
          <span v-if="p.similarity != null" class="ap-sim">{{ Math.round(p.similarity * 100) }}% match</span>
          <span class="ap-code">{{ p.code }}</span>
        </div>
        <h3>{{ p.title }}</h3>
        <div class="ap-card-meta">{{ p.type }} · {{ p.bedrooms }}q · {{ p.bathrooms }}b · {{ p.parking }}vg<span v-if="p.address?.city"> · {{ p.address.city }}</span></div>
        <div class="ap-card-price">
          <span v-if="p.priceSale">{{ brl(p.priceSale) }}</span>
          <span v-if="p.priceRent" class="rent">{{ brl(p.priceRent) }}/mês</span>
        </div>
      </article>
    </div>
    <p v-if="!loading && !loadError && items.length && items.length < total" class="im-notice" style="margin-top:14px">
      Mostrando os {{ items.length }} imóveis mais recentes de {{ total }}. Refine a busca para alcançar os demais.
    </p>

    <!-- Form novo/editar imóvel -->
    <Modal :open="showForm" :title="editingId ? 'Editar imóvel' : 'Novo imóvel'" @close="showForm = false">
      <div class="ap-form">
        <label class="full">Título<input v-model="form.title" placeholder="Ex.: Apartamento 2 quartos, Centro" /></label>
        <label v-if="editingId">Status<select v-model="form.status"><option value="captacao">Captação</option><option value="disponivel">Disponível</option><option value="reservado">Reservado</option><option value="vendido">Vendido</option><option value="locado">Locado</option><option value="inativo">Inativo</option></select></label>
        <label>Finalidade<select v-model="form.purpose"><option value="venda">Venda</option><option value="locacao">Locação</option><option value="ambos">Ambos</option></select></label>
        <label>Tipo<select v-model="form.type"><option>apartamento</option><option>casa</option><option>terreno</option><option>comercial</option><option>rural</option><option>sala</option><option>galpao</option></select></label>
        <label>Preço venda<input v-model="form.priceSale" type="number" placeholder="R$" /></label>
        <label>Preço locação<input v-model="form.priceRent" type="number" placeholder="R$/mês" /></label>
        <label>Quartos<input v-model="form.bedrooms" type="number" min="0" /></label>
        <label>Banheiros<input v-model="form.bathrooms" type="number" min="0" /></label>
        <label>Vagas<input v-model="form.parking" type="number" min="0" /></label>
        <label>Área útil (m²)<input v-model="form.areaUsable" type="number" /></label>
        <label>Cidade<input v-model="form.address.city" /></label>
        <label>Bairro<input v-model="form.address.district" /></label>
        <label>Proprietário<select v-model="form.ownerId"><option value="">—</option><option v-for="o in owners" :key="o.id" :value="o.id">{{ o.name }}</option></select></label>
        <label class="full">Descrição<textarea v-model="form.description" rows="3" placeholder="Características, diferenciais…" /></label>
      </div>
      <p v-if="formError" class="im-notice err" style="margin-top:12px">{{ formError }}</p>
      <template #footer>
        <button class="im-linkbtn" @click="showForm = false">Cancelar</button>
        <button class="im-btn-primary" :disabled="saving || !form.title" @click="save">{{ saving ? 'Salvando…' : (editingId ? 'Salvar alterações' : 'Captar imóvel') }}</button>
      </template>
    </Modal>

    <!-- Detalhe -->
    <Modal :open="detailOpen" :title="detail?.title || 'Imóvel'" @close="closeDetail">
      <div v-if="detailLoading" class="im-notice">Carregando…</div>
      <div v-else-if="detailError" class="im-notice err ap-error">
        <span>{{ detailError }}</span>
        <button class="im-btn-primary" @click="openDetail(detailId)">Tentar novamente</button>
      </div>
      <div v-else-if="detail">
        <div class="ap-detail-row"><StatusBadge :status="detail.status" /> <span class="ap-code">{{ detail.code }}</span></div>
        <div class="ap-detail-grid">
          <div><small>Finalidade</small><b>{{ detail.purpose }}</b></div>
          <div><small>Tipo</small><b>{{ detail.type }}</b></div>
          <div><small>Venda</small><b>{{ brl(detail.priceSale) }}</b></div>
          <div><small>Locação</small><b>{{ detail.priceRent ? brl(detail.priceRent) + '/mês' : '—' }}</b></div>
          <div><small>Config.</small><b>{{ detail.bedrooms }}q · {{ detail.bathrooms }}b · {{ detail.parking }}vg</b></div>
          <div><small>Local</small><b>{{ detail.address?.city || '—' }}{{ detail.address?.district ? ' / ' + detail.address.district : '' }}</b></div>
        </div>
        <p v-if="detail.description" class="ap-detail-desc">{{ detail.description }}</p>
        <h4 class="ap-tl-title">Linha do tempo</h4>
        <div class="ap-timeline">
          <div v-for="t in detailTimeline" :key="t.id" class="ap-tl-item">
            <span class="ap-tl-actor" :class="`tag-${t.actorType}`">{{ t.actorType }}</span>
            <div><strong>{{ t.title }}</strong><small v-if="t.summary"> — {{ t.summary }}</small><em>{{ dateTimeBr(t.createdAt) }}</em></div>
          </div>
          <p v-if="!detailTimeline.length" class="im-notice">Sem eventos ainda.</p>
        </div>
        <p v-if="actionError" class="im-notice err" style="margin-top:14px">{{ actionError }}</p>
        <div class="ap-detail-actions">
          <template v-if="!confirmDel">
            <button class="im-linkbtn danger" @click="askDelete"><Icon name="trash" :size="15" /> Excluir</button>
            <button class="im-btn-primary" @click="openEdit"><Icon name="edit" :size="15" /> Editar</button>
          </template>
          <template v-else>
            <span class="ap-confirm-msg">Excluir “{{ detail.title }}” permanentemente?</span>
            <button class="im-linkbtn" :disabled="removing" @click="cancelDelete">Cancelar</button>
            <button class="im-btn-danger" :disabled="removing" @click="doDelete">{{ removing ? 'Excluindo…' : 'Confirmar exclusão' }}</button>
          </template>
        </div>
      </div>
    </Modal>
  </div>
</template>
