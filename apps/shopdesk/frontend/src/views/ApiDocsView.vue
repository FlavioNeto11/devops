<!--
  ApiDocsView — Documentação da API (REQ-SHOPDESK-0008)
  Explorador do contrato OpenAPI canônico da API ShopDesk, para integradores explorarem
  endpoints, schemas (corpo de request/response) e o modelo de erro padronizado. Rota: /settings/api-docs.

  Por que NÃO um <iframe>/Swagger UI externo: o contrato de UI proíbe libs externas, style inline
  e v-html (CSP). Construímos um explorador BESPOKE sobre o kit ui-vue. A FONTE de dados é o contrato
  já PARSEADO pela própria API: GET /shopdesk/api/v1/openapi.json (a API lê o openapi.yaml uma vez no
  boot, resolve $ref e serve JSON) — então AQUI não há parser de YAML: fazemos res.json() e navegamos o
  objeto. O download oferece o YAML cru (GET /v1/openapi.yaml).

  Contrato de UI: SÓ componentes do kit + tokens --ui-*; sem style inline / :style / v-html;
  todos os estados (loading/empty/error/normal); endpoint REAL (mesma BASE do api.js); a11y + responsivo.
-->
<template>
  <UiPageLayout
    eyebrow="ShopDesk · Integradores"
    title="Documentação da API"
    subtitle="Explore os endpoints, schemas de corpo e o modelo de erro padronizado da API ShopDesk. O contrato é o OpenAPI canônico servido pela própria API."
    width="wide"
    :loading="loading"
    loading-message="Carregando o contrato OpenAPI…"
    :error="fatalError"
    @retry="load"
  >
    <!-- ===================== AÇÕES DO CABEÇALHO ===================== -->
    <template #actions>
      <UiStatusBadge
        v-if="spec"
        :tone="specBadge.tone"
        :label="specBadge.label"
        size="sm"
      />
      <UiButton variant="ghost" size="sm" :loading="loading" @click="load">
        <template #icon-left><span aria-hidden="true">↻</span></template>
        Recarregar
      </UiButton>
      <UiButton
        variant="ghost"
        size="sm"
        :href="yamlUrl"
        target="_blank"
        rel="noopener"
      >
        <template #icon-left><span aria-hidden="true">⤓</span></template>
        Baixar openapi.yaml
      </UiButton>
    </template>

    <!-- ===================== BANNER (resumo do contrato) ===================== -->
    <template #banner>
      <div class="adv-banner" role="note">
        <span class="adv-banner-icon" aria-hidden="true">⚙</span>
        <p class="adv-banner-text">
          Base de URL: <code class="ui-mono">{{ apiBase }}</code> · Spec:
          <code class="ui-mono">{{ jsonPath }}</code> · Versão OpenAPI
          <code class="ui-mono">{{ spec ? spec.openapi : '—' }}</code>. Toda chamada exige o header
          <code class="ui-mono">X-Tenant-Id</code>. As respostas de erro seguem o formato canônico abaixo.
        </p>
      </div>
    </template>

    <!-- ===================== NORMAL ===================== -->
    <template v-if="spec">
      <!-- KPIs do contrato -->
      <section class="adv-metrics" aria-label="Resumo do contrato">
        <UiMetricCard label="Endpoints" :value="totalOps" tone="primary" hint="operações documentadas" />
        <UiMetricCard label="Caminhos" :value="totalPaths" hint="rotas distintas" />
        <UiMetricCard label="Grupos" :value="groups.length" hint="recursos da API" />
        <UiMetricCard label="Versão da API" :value="apiVersion" tone="success" :hint="apiTitle" />
      </section>

      <!-- Busca + filtro de método -->
      <UiCard class="adv-toolbar-card" padded>
        <form class="adv-toolbar" role="search" @submit.prevent>
          <UiFormField label="Buscar endpoint" hint="por caminho, operação (operationId) ou grupo" class="adv-search">
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                v-model="query"
                type="search"
                class="adv-input"
                :aria-describedby="describedBy"
                placeholder="ex.: checkout, /v1/orders, createProduct"
                autocomplete="off"
              />
            </template>
          </UiFormField>

          <div class="adv-method-filter" role="group" aria-label="Filtrar por método HTTP">
            <button
              v-for="m in methodFilters"
              :key="m"
              type="button"
              class="adv-method-chip"
              :data-method="m === 'ALL' ? null : m"
              :data-active="activeMethod === m ? 'true' : null"
              :aria-pressed="activeMethod === m ? 'true' : 'false'"
              @click="activeMethod = m"
            >{{ m === 'ALL' ? 'Todos' : m }}</button>
          </div>
        </form>
      </UiCard>

      <!-- empty: nenhum endpoint bate com o filtro -->
      <UiCard v-if="!visibleGroups.length">
        <UiEmptyState
          icon="🔍"
          title="Nenhum endpoint encontrado"
          :description="'Nada corresponde a “' + query + '”' + (activeMethod !== 'ALL' ? ' com o método ' + activeMethod : '') + '. Ajuste a busca ou o filtro.'"
        >
          <template #action>
            <UiButton variant="ghost" @click="clearFilters">Limpar filtros</UiButton>
          </template>
        </UiEmptyState>
      </UiCard>

      <!-- grupos de endpoints -->
      <template v-else>
        <UiCard
          v-for="g in visibleGroups"
          :key="g.name"
          class="adv-group"
          :title="g.title"
          :subtitle="g.count + ' ' + (g.count === 1 ? 'operação' : 'operações')"
        >
          <template #actions>
            <UiButton
              variant="ghost"
              size="sm"
              :aria-expanded="g.open ? 'true' : 'false'"
              @click="toggleGroup(g.name)"
            >{{ g.open ? 'Recolher' : 'Expandir' }}</UiButton>
          </template>

          <ul v-show="g.open" class="adv-ops" role="list">
            <li
              v-for="op in g.ops"
              :key="op.key"
              class="adv-op"
            >
              <button
                type="button"
                class="adv-op-head"
                :aria-expanded="op.open ? 'true' : 'false'"
                :aria-controls="'op-' + op.key"
                @click="toggleOp(op)"
              >
                <span class="adv-op-method" :data-method="op.method">{{ op.method }}</span>
                <span class="adv-op-path ui-mono">{{ op.path }}</span>
                <span v-if="op.operationId" class="adv-op-id">{{ op.operationId }}</span>
                <span class="adv-op-caret" aria-hidden="true" :data-open="op.open ? 'true' : null">›</span>
              </button>

              <div v-show="op.open" :id="'op-' + op.key" class="adv-op-detail">
                <p v-if="op.summary" class="adv-op-summary">{{ op.summary }}</p>

                <!-- parâmetros (path / query / header) -->
                <div v-if="op.params.length" class="adv-block">
                  <h4 class="adv-block-title">Parâmetros</h4>
                  <UiDataTable
                    :columns="paramColumns"
                    :rows="op.params"
                    row-key="rowKey"
                    density="compact"
                    :empty="{ title: 'Sem parâmetros' }"
                  >
                    <template #cell-type="{ value }">
                      <code class="ui-mono adv-inline-code">{{ value }}</code>
                    </template>
                    <template #cell-required="{ value }">
                      <UiStatusBadge :tone="value ? 'warning' : 'neutral'" :label="value ? 'obrigatório' : 'opcional'" size="sm" />
                    </template>
                  </UiDataTable>
                </div>

                <!-- schema do corpo (request) -->
                <div v-if="op.bodyFields.length" class="adv-block">
                  <h4 class="adv-block-title">Schema do corpo</h4>
                  <UiDataTable
                    :columns="bodyColumns"
                    :rows="op.bodyFields"
                    row-key="name"
                    density="compact"
                    :empty="{ title: 'Sem corpo' }"
                  >
                    <template #cell-type="{ value }">
                      <code class="ui-mono adv-inline-code">{{ value }}</code>
                    </template>
                    <template #cell-required="{ value }">
                      <UiStatusBadge :tone="value ? 'warning' : 'neutral'" :label="value ? 'obrigatório' : 'opcional'" size="sm" />
                    </template>
                  </UiDataTable>
                </div>

                <!-- respostas -->
                <div class="adv-block">
                  <h4 class="adv-block-title">Respostas</h4>
                  <ul class="adv-resps" role="list">
                    <li v-for="r in op.responses" :key="r.code" class="adv-resp">
                      <span class="adv-resp-code" :data-tone="statusTone(r.code)">{{ r.code }}</span>
                      <span class="adv-resp-desc">{{ r.description }}</span>
                    </li>
                  </ul>
                </div>

                <!-- exemplo de chamada (curl derivado do schema da operação) -->
                <div class="adv-block">
                  <h4 class="adv-block-title">Exemplo</h4>
                  <pre class="adv-code ui-mono"><code>{{ op.curl }}</code></pre>
                  <UiButton variant="subtle" size="sm" @click="copy(op.curl, 'Exemplo copiado.')">Copiar curl</UiButton>
                </div>
              </div>
            </li>
          </ul>
        </UiCard>
      </template>

      <!-- modelo de erro padronizado -->
      <UiCard
        class="adv-errcard"
        title="Modelo de erro padronizado"
        subtitle="Toda falha responde com este envelope JSON. O código HTTP indica a categoria; a mensagem é legível."
      >
        <div class="adv-err-grid">
          <div class="adv-err-shape">
            <h4 class="adv-block-title">Formato do corpo</h4>
            <pre class="adv-code ui-mono"><code>{{ errorShape }}</code></pre>
            <UiButton variant="subtle" size="sm" @click="copy(errorShape, 'Formato copiado.')">Copiar JSON</UiButton>
          </div>
          <div class="adv-err-codes">
            <h4 class="adv-block-title">Códigos comuns</h4>
            <ul class="adv-resps" role="list">
              <li v-for="e in errorCatalog" :key="e.code" class="adv-resp">
                <span class="adv-resp-code" :data-tone="statusTone(e.code)">{{ e.code }}</span>
                <span class="adv-resp-desc">{{ e.description }}</span>
              </li>
            </ul>
          </div>
        </div>
      </UiCard>
    </template>

    <!-- ===================== EMPTY (spec sem caminhos) ===================== -->
    <UiCard v-else-if="!loading && !fatalError">
      <UiEmptyState
        icon="📄"
        title="Contrato sem endpoints"
        description="O OpenAPI foi carregado, mas não declara nenhum caminho. Verifique a publicação do contrato pela API."
      >
        <template #action>
          <UiButton variant="ghost" @click="load">Recarregar contrato</UiButton>
        </template>
      </UiEmptyState>
    </UiCard>

    <template #footer>
      <p>Este contrato é a fonte canônica da API ShopDesk. Endpoints e schemas são validados contra o servidor (anti-drift) a cada build.</p>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import {
  UiPageLayout,
  UiCard,
  UiButton,
  UiMetricCard,
  UiStatusBadge,
  UiDataTable,
  UiEmptyState,
  UiFormField,
  format,
  useToast,
} from '../ui/index.js';

const toast = useToast();

// ---------------------------------------------------------------------------
// Endpoints REAIS — mesma BASE que ../api.js usa (concatenação, sem template literal).
// A API serve o contrato JÁ PARSEADO em JSON (/v1/openapi.json) — consumimos com res.json(),
// sem nenhum parser de YAML no frontend. O download oferece o YAML cru (/v1/openapi.yaml).
// ---------------------------------------------------------------------------
const apiBase = (import.meta.env.VITE_API_BASE_URL || '/shopdesk/api');
const jsonPath = '/v1/openapi.json';
const yamlPath = '/v1/openapi.yaml';
const jsonUrl = apiBase + jsonPath;
const yamlUrl = apiBase + yamlPath;

// ---------------------------------------------------------------------------
// Estado da tela
// ---------------------------------------------------------------------------
const loading = ref(true);
const fatalError = ref(null);
const spec = ref(null); // objeto OpenAPI completo (info, paths, components — $ref resolvidos pela API)
const query = ref('');
const activeMethod = ref('ALL');

const methodFilters = ['ALL', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const paramColumns = [
  { key: 'name', label: 'Nome' },
  { key: 'in', label: 'Em' },
  { key: 'type', label: 'Tipo' },
  { key: 'required', label: 'Exigência' },
];
const bodyColumns = [
  { key: 'name', label: 'Campo' },
  { key: 'type', label: 'Tipo' },
  { key: 'required', label: 'Exigência' },
  { key: 'description', label: 'Descrição' },
];

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

// modelo de erro canônico (espelha o wrap() da API: { error: { message } } + status HTTP)
const errorShape = '{\n  "error": {\n    "message": "descrição legível do problema"\n  }\n}';
const errorCatalog = [
  { code: '400', description: 'Requisição inválida — campos obrigatórios ausentes ou malformados.' },
  { code: '401', description: 'Não autenticado — credencial ausente ou inválida.' },
  { code: '403', description: 'Sem permissão para a operação no tenant atual.' },
  { code: '404', description: 'Recurso não encontrado.' },
  { code: '409', description: 'Conflito — violação de unicidade ou estado.' },
  { code: '422', description: 'Entidade não processável — validação de negócio falhou.' },
  { code: '429', description: 'Limite de requisições atingido.' },
  { code: '500', description: 'Erro interno do servidor.' },
];

// ---------------------------------------------------------------------------
// Carregamento — busca o JSON já parseado pela API.
// ---------------------------------------------------------------------------
async function load() {
  loading.value = true;
  fatalError.value = null;
  try {
    const res = await fetch(jsonUrl, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      let detail = 'HTTP ' + res.status;
      try {
        const j = await res.clone().json();
        if (j && j.error && j.error.message) detail = j.error.message;
      } catch { /* corpo não-JSON: mantém HTTP <status> */ }
      const e = new Error(
        res.status === 404
          ? 'O contrato OpenAPI não está publicado neste ambiente (' + jsonPath + ' retornou 404).'
          : 'Não foi possível carregar o contrato OpenAPI (' + detail + ').',
      );
      e.status = res.status;
      throw e;
    }
    let doc;
    try {
      doc = await res.json();
    } catch {
      throw new Error('O contrato OpenAPI recebido não é um JSON válido.');
    }
    if (!doc || typeof doc !== 'object' || (!doc.openapi && !doc.paths)) {
      throw new Error('Não foi possível interpretar o contrato OpenAPI recebido.');
    }
    // normaliza o shape mínimo esperado
    spec.value = {
      openapi: doc.openapi || '',
      info: doc.info && typeof doc.info === 'object' ? doc.info : { title: '', version: '' },
      paths: doc.paths && typeof doc.paths === 'object' ? doc.paths : {},
    };
    // se não há paths, cai no estado empty (não é erro fatal)
    if (!Object.keys(spec.value.paths).length) spec.value = null;
  } catch (e) {
    spec.value = null;
    fatalError.value = e && e.message ? e.message : 'Falha ao carregar a documentação da API.';
  } finally {
    loading.value = false;
  }
}

// ---------------------------------------------------------------------------
// Derivações (grupos, busca, métricas)
// ---------------------------------------------------------------------------
function groupName(path) {
  // /v1/orders/{id}/submit -> "orders"; / e /health -> "geral"
  const parts = String(path).split('/').filter(Boolean);
  if (!parts.length) return 'geral';
  const v = parts[0] === 'v1' ? parts.slice(1) : parts;
  const head = v.find((p) => !p.startsWith('{'));
  return head || 'geral';
}

const opOpenState = ref({}); // key -> bool
const groupOpenState = ref({}); // name -> bool

// resolve o schema do corpo (request) de uma operação -> { type, properties, required }
function bodySchemaOf(op) {
  const rb = op && op.requestBody;
  const content = rb && rb.content;
  if (!content || typeof content !== 'object') return null;
  const json = content['application/json'] || content[Object.keys(content)[0]];
  return json && json.schema && typeof json.schema === 'object' ? json.schema : null;
}

// achata properties do schema do corpo em linhas para a tabela
function bodyFieldsOf(schema) {
  if (!schema || !schema.properties || typeof schema.properties !== 'object') return [];
  const required = Array.isArray(schema.required) ? schema.required : [];
  return Object.entries(schema.properties).map(([name, prop]) => ({
    name,
    type: schemaType(prop),
    required: required.includes(name),
    description: (prop && prop.description) || '—',
  }));
}

// representação textual de um tipo de schema (cobre array/object/$ref já resolvido)
function schemaType(prop) {
  if (!prop || typeof prop !== 'object') return 'string';
  if (prop.type === 'array') return 'array<' + schemaType(prop.items) + '>';
  if (prop.enum && Array.isArray(prop.enum)) return 'enum(' + prop.enum.join(' | ') + ')';
  return prop.type || (prop.properties ? 'object' : 'string');
}

// lista de parâmetros declarados (path/query/header) -> linhas para a tabela
function paramsOf(op) {
  const declared = Array.isArray(op && op.parameters) ? op.parameters : [];
  return declared
    .filter((p) => p && p.name)
    .map((p) => ({
      rowKey: (p.in || 'param') + ':' + p.name,
      name: p.name,
      in: p.in || 'query',
      type: schemaType(p.schema),
      required: !!p.required,
    }));
}

// valor de exemplo para um campo do schema (para montar o corpo do curl)
function exampleFor(prop) {
  if (!prop || typeof prop !== 'object') return '';
  if (prop.example !== undefined) return prop.example;
  if (prop.enum && Array.isArray(prop.enum) && prop.enum.length) return prop.enum[0];
  switch (prop.type) {
    case 'integer':
    case 'number': return 0;
    case 'boolean': return true;
    case 'array': return [];
    case 'object': return {};
    default: return 'string';
  }
}

// corpo de exemplo derivado do schema (objeto JS), ou null se a operação não tem corpo
function exampleBody(schema) {
  if (!schema || !schema.properties || typeof schema.properties !== 'object') return null;
  const out = {};
  for (const [name, prop] of Object.entries(schema.properties)) out[name] = exampleFor(prop);
  return out;
}

// monta o curl a partir dos parâmetros e do schema reais da operação
function buildCurl(op, method, path, bodySchema) {
  const url = apiBase + path.replace(/\{([^}]+)\}/g, ':$1');
  let cmd = 'curl -X ' + method + " '" + url + "'";
  const headers = paramsOf(op).filter((p) => p.in === 'header');
  // garante o X-Tenant-Id mesmo que o spec não declare na operação (contrato global)
  const hasTenant = headers.some((h) => h.name.toLowerCase() === 'x-tenant-id');
  if (!hasTenant) cmd += " \\\n  -H 'X-Tenant-Id: 1'";
  for (const h of headers) {
    const v = h.name.toLowerCase() === 'x-tenant-id' ? '1' : exampleHeader(h.name);
    cmd += " \\\n  -H '" + h.name + ': ' + v + "'";
  }
  const body = exampleBody(bodySchema);
  if (body) {
    cmd += " \\\n  -H 'Content-Type: application/json'";
    cmd += " \\\n  -d '" + JSON.stringify(body) + "'";
  }
  return cmd;
}

function exampleHeader(name) {
  const n = name.toLowerCase();
  if (n === 'idempotency-key') return 'chk-2026-0001';
  return 'valor';
}

function autoSummary(method, path) {
  const g = groupName(path);
  const label = format.humanize(g);
  const hasId = /\{[^}]+\}/.test(path);
  const map = {
    GET: hasId ? 'Obter ' + label + ' por identificador' : 'Listar ' + label,
    POST: /submit/.test(path) ? 'Submeter ' + label : 'Criar ' + label,
    PUT: 'Atualizar ' + label,
    PATCH: 'Atualizar parcialmente ' + label,
    DELETE: 'Remover ' + label,
  };
  return map[method] || (method + ' ' + path);
}

function responsesOf(op) {
  const r = op && op.responses;
  if (!r || typeof r !== 'object') return [{ code: '200', description: 'OK' }];
  const out = Object.entries(r).map(([code, val]) => ({
    code: String(code),
    description: (val && typeof val === 'object' && val.description) || codeDefault(String(code)),
  }));
  out.sort((a, b) => Number(a.code) - Number(b.code));
  return out.length ? out : [{ code: '200', description: 'OK' }];
}

function codeDefault(code) {
  const map = {
    '200': 'OK', '201': 'Criado', '202': 'Aceito', '204': 'Sem conteúdo',
    '400': 'Requisição inválida', '404': 'Não encontrado', '500': 'Erro interno',
  };
  return map[code] || 'Resposta ' + code;
}

// monta a lista bruta de operações a partir do spec já parseado
const allOps = computed(() => {
  if (!spec.value) return [];
  const out = [];
  for (const [path, methods] of Object.entries(spec.value.paths)) {
    if (!methods || typeof methods !== 'object') continue;
    for (const method of HTTP_METHODS) {
      const op = methods[method];
      if (!op || typeof op !== 'object') continue;
      const upper = method.toUpperCase();
      const bodySchema = bodySchemaOf(op);
      out.push({
        key: upper + ' ' + path,
        method: upper,
        path,
        operationId: op.operationId || '',
        summary: op.summary || autoSummary(upper, path),
        params: paramsOf(op),
        bodyFields: bodyFieldsOf(bodySchema),
        responses: responsesOf(op),
        curl: buildCurl(op, upper, path, bodySchema),
        group: groupName(path),
      });
    }
  }
  // ordem estável: por caminho, depois método
  const order = { GET: 0, POST: 1, PUT: 2, PATCH: 3, DELETE: 4 };
  out.sort((a, b) => (a.path === b.path ? (order[a.method] - order[b.method]) : a.path.localeCompare(b.path)));
  return out;
});

const totalOps = computed(() => allOps.value.length);
const totalPaths = computed(() => (spec.value ? Object.keys(spec.value.paths).length : 0));
const apiTitle = computed(() => (spec.value && spec.value.info && spec.value.info.title) || 'ShopDesk API');
const apiVersion = computed(() => (spec.value && spec.value.info && spec.value.info.version) || '—');

const specBadge = computed(() => ({
  tone: 'success',
  label: 'OpenAPI ' + ((spec.value && spec.value.openapi) || '3.x'),
}));

// grupos (sem filtro)
const groups = computed(() => {
  const by = new Map();
  for (const op of allOps.value) {
    if (!by.has(op.group)) by.set(op.group, []);
    by.get(op.group).push(op);
  }
  return [...by.entries()].map(([name, ops]) => ({ name, ops })).sort((a, b) => a.name.localeCompare(b.name));
});

// grupos com filtro de busca/método aplicado
const visibleGroups = computed(() => {
  const q = query.value.trim().toLowerCase();
  const meth = activeMethod.value;
  const result = [];
  for (const g of groups.value) {
    const ops = g.ops.filter((op) => {
      if (meth !== 'ALL' && op.method !== meth) return false;
      if (!q) return true;
      return (
        op.path.toLowerCase().includes(q) ||
        (op.operationId && op.operationId.toLowerCase().includes(q)) ||
        op.group.toLowerCase().includes(q) ||
        op.summary.toLowerCase().includes(q)
      );
    });
    if (!ops.length) continue;
    const open = groupOpenState.value[g.name] !== false; // default aberto
    result.push({
      name: g.name,
      title: format.humanize(g.name),
      count: ops.length,
      open,
      ops: ops.map((op) => ({ ...op, open: !!opOpenState.value[op.key] })),
    });
  }
  return result;
});

// ---------------------------------------------------------------------------
// Interações
// ---------------------------------------------------------------------------
function toggleGroup(name) {
  const cur = groupOpenState.value[name];
  groupOpenState.value = { ...groupOpenState.value, [name]: cur === false ? true : false };
}

function toggleOp(op) {
  const cur = !!opOpenState.value[op.key];
  opOpenState.value = { ...opOpenState.value, [op.key]: !cur };
}

function clearFilters() {
  query.value = '';
  activeMethod.value = 'ALL';
}

function statusTone(code) {
  const n = Number(code);
  if (n >= 200 && n < 300) return 'success';
  if (n >= 300 && n < 400) return 'neutral';
  if (n >= 400 && n < 500) return 'warning';
  return 'error';
}

async function copy(textToCopy, okMessage) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(textToCopy);
      toast.success(okMessage || 'Copiado.');
    } else {
      throw new Error('clipboard indisponível');
    }
  } catch {
    toast.error('Não foi possível copiar.', { detail: 'Selecione o texto e copie manualmente.' });
  }
}

onMounted(load);
</script>

<style scoped>
/* ===================== Banner ===================== */
.adv-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  border: 1px solid rgb(var(--ui-border));
  background: rgb(var(--ui-surface));
  font-size: var(--ui-text-sm);
}
.adv-banner-icon {
  flex-shrink: 0;
  width: 28px; height: 28px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: var(--ui-radius-sm);
  background: rgb(var(--ui-accent) / 0.12);
  color: rgb(var(--ui-accent-strong));
}
.adv-banner-text { margin: 0; color: rgb(var(--ui-muted)); }
.adv-banner-text code { color: rgb(var(--ui-fg)); }

/* ===================== Métricas ===================== */
.adv-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--ui-space-4);
}

/* ===================== Toolbar (busca + filtro) ===================== */
.adv-toolbar-card :deep(.ui-card-body) { padding: var(--ui-space-4) var(--ui-space-5); }
.adv-toolbar {
  display: flex;
  align-items: flex-end;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
}
.adv-search { flex: 1 1 320px; min-width: 0; }
.adv-input {
  width: 100%;
  background: rgb(var(--ui-bg));
  color: rgb(var(--ui-fg));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm);
  padding: 8px 12px;
  font: inherit;
}
.adv-input::placeholder { color: rgb(var(--ui-muted)); }

.adv-method-filter { display: flex; gap: 6px; flex-wrap: wrap; }
.adv-method-chip {
  font: inherit;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  letter-spacing: .03em;
  padding: 6px 12px;
  border-radius: var(--ui-radius-pill);
  border: 1px solid rgb(var(--ui-border-strong));
  background: rgb(var(--ui-surface));
  color: rgb(var(--ui-muted));
  cursor: pointer;
}
.adv-method-chip:hover { background: rgb(var(--ui-surface-2)); color: rgb(var(--ui-fg)); }
.adv-method-chip[data-active="true"] {
  background: rgb(var(--ui-accent));
  border-color: rgb(var(--ui-accent));
  color: rgb(var(--ui-accent-fg));
}
.adv-method-chip[data-method="GET"][data-active="true"] { background: rgb(var(--ui-ok)); border-color: rgb(var(--ui-ok)); color: rgb(var(--ui-accent-fg)); }
.adv-method-chip[data-method="DELETE"][data-active="true"] { background: rgb(var(--ui-danger)); border-color: rgb(var(--ui-danger)); color: rgb(var(--ui-accent-fg)); }

/* ===================== Grupos / operações ===================== */
.adv-group :deep(.ui-card-body) { padding: 0; }
.adv-ops { list-style: none; margin: 0; padding: 0; }
.adv-op { border-bottom: 1px solid rgb(var(--ui-border)); }
.adv-op:last-child { border-bottom: none; }

.adv-op-head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-5);
  background: transparent;
  border: none;
  font: inherit;
  color: rgb(var(--ui-fg));
  cursor: pointer;
  text-align: left;
}
.adv-op-head:hover { background: rgb(var(--ui-surface-2)); }

.adv-op-method {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 62px;
  font-size: var(--ui-text-xs);
  font-weight: 800;
  letter-spacing: .04em;
  padding: 4px 8px;
  border-radius: var(--ui-radius-sm);
  border: 1px solid transparent;
}
.adv-op-method[data-method="GET"] { background: rgb(var(--ui-ok) / 0.14); color: rgb(var(--ui-ok)); }
.adv-op-method[data-method="POST"] { background: rgb(var(--ui-accent) / 0.16); color: rgb(var(--ui-accent-strong)); }
.adv-op-method[data-method="PUT"] { background: rgb(var(--ui-warn) / 0.18); color: rgb(var(--ui-warn)); }
.adv-op-method[data-method="PATCH"] { background: rgb(var(--ui-warn) / 0.18); color: rgb(var(--ui-warn)); }
.adv-op-method[data-method="DELETE"] { background: rgb(var(--ui-danger) / 0.14); color: rgb(var(--ui-danger)); }

.adv-op-path { flex: 1 1 auto; min-width: 0; font-size: var(--ui-text-sm); overflow-wrap: anywhere; }
.adv-op-id {
  flex-shrink: 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  background: rgb(var(--ui-surface-2));
  padding: 2px 8px;
  border-radius: var(--ui-radius-pill);
}
.adv-op-caret { flex-shrink: 0; color: rgb(var(--ui-muted)); transition: transform .15s ease; }
.adv-op-caret[data-open="true"] { transform: rotate(90deg); }

.adv-op-detail {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
  padding: var(--ui-space-4) var(--ui-space-5) var(--ui-space-5);
  background: rgb(var(--ui-surface-2));
  border-top: 1px solid rgb(var(--ui-border));
}
.adv-op-summary { margin: 0; color: rgb(var(--ui-fg)); }

.adv-block { display: flex; flex-direction: column; gap: var(--ui-space-2); align-items: flex-start; }
.adv-block-title {
  font-size: var(--ui-text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: rgb(var(--ui-muted));
}
.adv-block > * { width: 100%; }
.adv-block > .ui-btn { width: auto; }
.adv-inline-code {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-accent-strong));
  background: rgb(var(--ui-accent) / 0.10);
  padding: 1px 6px;
  border-radius: var(--ui-radius-sm);
}

/* ===================== Respostas ===================== */
.adv-resps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.adv-resp { display: flex; align-items: center; gap: var(--ui-space-3); font-size: var(--ui-text-sm); }
.adv-resp-code {
  flex-shrink: 0;
  min-width: 46px;
  text-align: center;
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  padding: 3px 8px;
  border-radius: var(--ui-radius-sm);
}
.adv-resp-code[data-tone="success"] { background: rgb(var(--ui-ok) / 0.16); color: rgb(var(--ui-ok)); }
.adv-resp-code[data-tone="neutral"] { background: rgb(var(--ui-muted) / 0.16); color: rgb(var(--ui-muted)); }
.adv-resp-code[data-tone="warning"] { background: rgb(var(--ui-warn) / 0.18); color: rgb(var(--ui-warn)); }
.adv-resp-code[data-tone="error"] { background: rgb(var(--ui-danger) / 0.16); color: rgb(var(--ui-danger)); }
.adv-resp-desc { color: rgb(var(--ui-fg)); }

/* ===================== Bloco de código ===================== */
.adv-code {
  width: 100%;
  margin: 0;
  background: rgb(var(--ui-bg));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm);
  padding: var(--ui-space-3) var(--ui-space-4);
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-fg));
  overflow-x: auto;
  white-space: pre;
  line-height: 1.6;
}

/* ===================== Modelo de erro ===================== */
.adv-err-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--ui-space-5);
  align-items: start;
}
.adv-err-shape, .adv-err-codes { display: flex; flex-direction: column; gap: var(--ui-space-2); align-items: flex-start; }
.adv-err-shape > .adv-code, .adv-err-codes > .adv-resps { width: 100%; }

/* ===================== Responsivo ===================== */
@media (max-width: 980px) {
  .adv-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .adv-err-grid { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 620px) {
  .adv-metrics { grid-template-columns: minmax(0, 1fr); }
  .adv-toolbar { align-items: stretch; }
  .adv-op-head { flex-wrap: wrap; }
  .adv-op-id { order: 3; }
}
</style>
