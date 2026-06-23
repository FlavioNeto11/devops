// Client da API (base absoluta sob o subpath). Sem ${} — concatenação. Gerado pela Forge.
const BASE = import.meta.env.VITE_API_BASE_URL || '/helpflow/api';
async function request(method, path, body) {
  const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error((data && data.error && data.error.message) || ('HTTP ' + res.status)); e.status = res.status; throw e; }
  return data;
}
function qs(params) {
  const p = new URLSearchParams();
  for (const k in (params || {})) { const v = params[k]; if (v !== '' && v !== null && v !== undefined) p.append(k, v); }
  const s = p.toString(); return s ? ('?' + s) : '';
}
// fábrica de recurso REST: o backend expõe /v1/<name>. list aceita page/pageSize/sort/dir/filtros.
export function resourceFactory(name) {
  const root = "/v1/" + name;
  return {
    list: (params) => request("GET", root + qs(params)).then((d) => (d && d.data !== undefined ? d : { data: d || [], total: (d || []).length })),
    get: (id) => request("GET", root + "/" + id),
    create: (body) => request("POST", root, body),
    update: (id, body) => request("PUT", root + "/" + id, body),
    remove: (id) => request("DELETE", root + "/" + id),
  };
}
export const health = () => request("GET", "/health");

// Recursos de domínio do HelpFlow — espelham as rotas REST que o backend monta
// em apps/helpflow/api/src/server.js (/v1/<segmento>). O segmento de rota usa
// kebab-case onde há mais de uma palavra (kb-articles, sla-policies).
export const customers = resourceFactory('customers');
export const agents = resourceFactory('agents');
export const teams = resourceFactory('teams');
export const slaPolicies = resourceFactory('sla-policies');
export const comments = resourceFactory('comments');

// integrations — CRUD real em /v1/integrations + ações de domínio do gateway externo
// (capability gateway-externo) que a tela /integrations/:id consome:
//  · integrationTest(id)    → POST /v1/integrations/{id}/test   (ping pelo gateway; a
//      resposta tem os segredos REDIGIDOS server-side: { ok, method, target,
//      status_code, latency_ms, message, response, redacted })
//  · integrationAudit(id,p) → GET  /v1/integrations/{id}/audit  (trilha redigida:
//      { items: [{ id, method, path, status_code, latency_ms, ok, redacted,
//      response, created_at }], total })
// O ping NUNCA sai do navegador — passa exclusivamente pelo gateway, e a redação é
// autoritativa no backend; a tela só faz defesa-em-profundidade.
export const integrations = resourceFactory('integrations');
export const integrationTest = (id) => request('POST', '/v1/integrations/' + id + '/test');
export const integrationAudit = (id, params) => request('GET', '/v1/integrations/' + id + '/audit' + qs(params));

// kb-articles — base de conhecimento. CRUD real em /v1/kb-articles
// (apps/helpflow/api/src/server.js) + ação de domínio:
//  · reindex(id) → POST /v1/kb-articles/{id}/reindex  (refatia e re-embedda o
//    artigo para a busca semântica em pgvector)
// A ação reindex segue o padrão da plataforma; enquanto o backend não a montar,
// a chamada devolve 404/501/503 e a tela degrada graciosamente (fail-closed),
// nunca fabricando dados.
export const kbArticles = {
  ...resourceFactory('kb-articles'),
  reindex: (id) => request('POST', '/v1/kb-articles/' + id + '/reindex'),
};
// Alias de namespace com chave kebab-case: algumas telas acessam o recurso por
// `api['kb-articles']` (espelhando o segmento REST). Export com nome em string
// (ES2022) para que o bundler resolva o acesso sem aviso de "export inexistente".
export { kbArticles as 'kb-articles' };

// tickets — entidade central do service desk. CRUD real em /v1/tickets
// (apps/helpflow/api/src/server.js) + ações de domínio:
//  · messages(id,p) → GET  /v1/tickets/{id}/messages  (thread de interações do chamado)
//  · sla(id)        → GET  /v1/tickets/{id}/sla        (estado atual do SLA: tempo, breach)
//  · submit(id)     → POST /v1/tickets/{id}/submit     (dispara o job de integração externa)
//  · assist(id,b)   → POST /v1/tickets/{id}/assist     (assistente de IA grounded no chamado)
export const tickets = {
  ...resourceFactory('tickets'),
  messages: (id, params) => request('GET', '/v1/tickets/' + id + '/messages' + qs(params)),
  sla: (id) => request('GET', '/v1/tickets/' + id + '/sla'),
  submit: (id) => request('POST', '/v1/tickets/' + id + '/submit'),
  assist: (id, body) => request('POST', '/v1/tickets/' + id + '/assist', body),
};

// Fila transacional (worker). O JobsMonitorView/JobDetailView consomem `jobs`
// (lista/detalhe + ação de reenfileirar) e `jobsHealth` (contadores por status).
// Exportamos os símbolos de domínio EXPLICITAMENTE — sem depender de augmentação
// implícita do integrador, que não acontece.
//  · jobs.list/get/...  → /v1/jobs (REST padrão). Enquanto o backend não montar a
//    rota de listagem, a chamada devolve 404 e a tela degrada (erro + retry),
//    NUNCA fabrica dados.
//  · jobs.requeue(id)   → POST /v1/jobs/{id}/requeue  (recoloca DLQ/pendente na
//    fila; idempotente, zera tentativas e agendamento). Padrão de ação de domínio.
export const jobs = {
  ...resourceFactory('jobs'),
  requeue: (id) => request('POST', '/v1/jobs/' + id + '/requeue'),
};

// Saúde da fila transacional (worker): contadores por status (queued/running/done/dlq).
// Caminho canônico do backend: GET /v1/health/jobs → { status, jobs: {...} }.
// `jobsHealth` é o acessor consumido pelo JobsMonitorView; `healthJobs` é mantido
// como alias para compatibilidade com chamadas já existentes (ex.: TicketDetailView).
export const jobsHealth = () => request('GET', '/v1/health/jobs');
export const healthJobs = jobsHealth;
