// core.js — contexto COMPARTILHADO entre a camada de DOM do workbench (app.js) e o Product
// Studio (studio.js). Extraído na A1b da Forja 4.0 para quebrar o monólito sem import circular:
// app.js e studio.js importam DAQUI; studio.js chama de volta funções de navegação do app.js via
// o registry `nav` (late-binding — app.js registra em init()). Sem DOM aqui além dos helpers.
import { productGrounding, systemContext, filterCitations } from './lib.js?v=42';

export const SVGNS = 'http://www.w3.org/2000/svg';
export const state = { view: 'explorer', filters: {}, q: '', selectedId: null, impactFilter: { type: '', product: '', focus: false }, editId: null, editor: null, devFilter: { status: '', product: '' }, reproFilter: { reason: '' }, forge: { product: null, step: null, filter: 'all' }, me: null, aiUsage: { window: '30d', es: null, liveState: 'off', reconnectMs: 1000, reconnectTimer: null, lastBreakdown: null } };
export const DATA = { baseline: null, impact: null, retrieval: null, history: null, registry: null, embeddings: null, implStatus: null, coverage: null, products: null, blueprints: null, buildPlans: {} };

// Registry de NAVEGAÇÃO (late-binding): app.js faz Object.assign(nav, {...}) em init(), antes do
// primeiro render. studio.js chama nav.switchView/nav.openReq/nav.overviewBriefing sem importar
// o app.js (evita ciclo ESM). Toda função aqui é dona do app.js — o Studio só consome.
export const nav = {};

/* ---------- DOM helpers (seguros) ---------- */
export function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'html') throw new Error('innerHTML proibido');
    else e.setAttribute(k, v);
  }
  for (const kid of kids.flat()) { if (kid == null) continue; e.append(kid.nodeType ? kid : document.createTextNode(String(kid))); }
  return e;
}
export function svg(tag, attrs = {}) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v);
  return e;
}
export const byId = (id) => DATA.baseline.requirements.find((r) => r.id === id);
export function badge(text, cls) { return h('span', { class: 'b ' + (cls || ''), text }); }
export function dt(t) { return h('dt', { text: t }); }
export function dd(c) { return h('dd', {}, c); }
// Estado do viewport do grafo (zoom/pan), aplicado via transform no <g> raiz.
export function applyTransform(root, vp) {
  root.setAttribute('transform', `translate(${vp.x} ${vp.y}) scale(${vp.k})`);
}

/* ---------- cliente da IA de autoria (reqhub-api, mesmo origin /reqs/api) ----------
   Opcional e fail-closed: sem servidor/sem key/sem token, a UI degrada com mensagem
   clara. O token do operador fica no localStorage (ferramenta de operador). A UI
   NUNCA escreve no git — a IA so preenche/analisa; "salvar" continua sendo abrir o PR. */
export const AI = {
  BASE: '/reqs/api',
  tokenKey: 'reqhub_ai_token',
  getToken() { try { return localStorage.getItem(this.tokenKey) || ''; } catch { return ''; } },
  setToken(t) { try { localStorage.setItem(this.tokenKey, t); } catch { /* ignore */ } },
  async health() {
    const r = await fetch(this.BASE + '/health');
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data };
  },
  async post(path, body) {
    const tok = this.getToken();
    const r = await fetch(this.BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) },
      body: JSON.stringify(body || {}),
    });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data };
  },
  // Variante MULTIPART para quando há ARQUIVOS junto do texto (IA multimodal). Monta um
  // FormData: campos de texto (objeto `fields`) viram strings; cada File entra no campo `files`.
  // NÃO definimos Content-Type — o browser põe o boundary do multipart. Mesma lógica de auth e
  // de tratamento de erro do post() JSON. Use só quando houver arquivos; caso contrário, post().
  async postMultipart(path, { fields = {}, files = [] } = {}) {
    const tok = this.getToken();
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields || {})) {
      if (v == null) continue;
      fd.append(k, typeof v === 'string' ? v : JSON.stringify(v));
    }
    for (const file of (files || [])) { if (file) fd.append('files', file, file.name); }
    const r = await fetch(this.BASE + path, {
      method: 'POST',
      headers: { ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, // sem Content-Type: o browser define o boundary
      body: fd,
    });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data };
  },
  async get(path) {
    const tok = this.getToken();
    const r = await fetch(this.BASE + path, { headers: { Accept: 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) } });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data };
  },
  // SSE same-origin (CSP connect-src 'self' permite). EventSource não manda Authorization:
  // o /stream autentica pelo SSO de borda (X-Auth-Request-*), igual a /v1/me.
  stream(path) { return new EventSource(this.BASE + path); },
  // SSE sobre POST (EventSource não faz POST nem envia corpo/Authorization): fetch-reader que
  // chama onEvent(event, data) por frame e resolve com o payload de `done`. Mesma técnica do CMS
  // (console pmCmsGenerateStream): split por '\n\n', parse de event:/data:, guarda de stream
  // truncado (encerrou sem `done`/`error` => erro, nunca falso-sucesso). `signal` cancela.
  async stream2(path, body, { onEvent, signal } = {}) {
    const tok = this.getToken();
    // body pode ser JSON (objeto) OU FormData (multipart, quando há ARQUIVOS junto — IA multimodal
    // sobre SSE). Com FormData NÃO definimos Content-Type: o browser põe o boundary do multipart.
    const isForm = (typeof FormData !== 'undefined') && body instanceof FormData;
    let res;
    try {
      res = await fetch(this.BASE + path, {
        method: 'POST',
        headers: { Accept: 'text/event-stream', ...(isForm ? {} : { 'Content-Type': 'application/json' }), ...(tok ? { Authorization: 'Bearer ' + tok } : {}) },
        body: isForm ? body : JSON.stringify(body || {}),
        signal,
      });
    } catch (e) { throw new Error('Falha de rede: ' + (e && e.message ? e.message : e)); }
    const ct = res.headers.get('content-type') || '';
    if (!res.ok || !res.body || !ct.includes('text/event-stream')) {
      const j = await res.json().catch(() => ({}));
      throw Object.assign(new Error((j && j.error && j.error.message) || ('Erro ' + res.status + ' ao iniciar')), { code: j && j.error ? j.error.code : ('HTTP ' + res.status) });
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = ''; let result = null; let failed = null;
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, idx); buf = buf.slice(idx + 2);
        let event = 'message'; const dataLines = [];
        for (const line of frame.split('\n')) {
          if (!line || line.startsWith(':')) continue;          // keep-alive/comentário
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
        }
        if (!dataLines.length) continue;
        let data = {}; try { data = JSON.parse(dataLines.join('\n')); } catch { /* frame não-JSON */ }
        try { onEvent && onEvent(event, data); } catch { /* handler do consumidor não derruba o stream */ }
        if (event === 'done') result = data;
        else if (event === 'error') failed = data;
      }
    }
    if (failed) throw Object.assign(new Error(failed.message || 'falhou'), { stage: failed.stage, code: failed.code });
    // encerrou SEM `done`/`error` (idle-timeout/queda): NÃO concluiu — erro, não falso-sucesso.
    if (!result) throw new Error('A geração foi interrompida antes de concluir (conexão encerrada sem confirmação). Tente de novo.');
    return result;
  },
  assist(body) { return this.post('/v1/authoring/assist', body); },
  chat(body) { return this.post('/v1/authoring/chat', body); },
  // Primitiva grounded reutilizável fora do funil do Editor (copiloto, Workspace, etc.).
  // Pergunta à base no contexto de UM produto (grounding ≤60). Degrada fail-closed.
  async ask({ question, product, history }) {
    const reqs = (DATA.baseline && DATA.baseline.requirements) || [];
    const r = await this.chat({ product: product || null, message: question, history: history || [], grounding: productGrounding(reqs, product), arch_summary: systemContext(DATA.products, product) || undefined });
    const d = r.ok ? (r.data || {}) : {};
    return { ok: r.ok, status: r.status, reply: d.reply || '', citations: filterCitations(d.citations || [], reqs), grounded: d.grounded !== false, intent: d.intent, draft: d.draft || null, next_question: d.next_question || '', error: r.ok ? null : (r.data && r.data.error) };
  },
  // health cacheado por sessão (vários pontos do app consultam — Overview, copiloto, ações).
  _aiUp: null,
  async aiAvailable() {
    if (this._aiUp !== null) return this._aiUp;
    try { const r = await this.health(); this._aiUp = !!(r.ok && r.data && r.data.ai); } catch { this._aiUp = false; }
    return this._aiUp;
  },
};

/* ---------- seletor de ARQUIVOS (IA multimodal) ----------
   A IA da plataforma aceita arquivos além de texto (file-ingest-kit no backend). Aqui só a UI:
   um <input type=file multiple> NATIVO + a lista dos escolhidos, tudo CSP-safe (createElement +
   addEventListener; sem onclick/onchange inline e sem style inline). Retorna { el, files(), clear,
   hasFiles }. O chamador decide o transporte: havendo arquivos, usa AI.postMultipart; senão, mantém
   o caminho JSON (retrocompat). Os tipos aceitos espelham o que o kit extrai (doc/planilha/pdf/zip/imagem). */
export const FILE_ACCEPT = '.md,.txt,.csv,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,image/*';
export function humanBytes(n) { if (!n && n !== 0) return ''; if (n < 1024) return n + ' B'; if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'; return (n / (1024 * 1024)).toFixed(1) + ' MB'; }
// Resolve uma URL contra a origem atual e só a aceita se for same-origin (http/https). Usada para o
// src do iframe de preview e o href "abrir em nova aba" — nunca aponta para fora da plataforma.
export function sameOriginUrl(u) {
  if (!u || typeof u !== 'string') return '';
  try { const url = new URL(u, location.origin + '/reqs/'); return (url.origin === location.origin && /^https?:$/.test(url.protocol)) ? url.href : ''; }
  catch { return ''; }
}
export function filePicker(opts) {
  const o = opts || {};
  let files = [];
  const wrap = h('div', { class: 'file-picker' });
  const input = h('input', { type: 'file', multiple: 'multiple', accept: FILE_ACCEPT, class: 'file-picker-input', 'aria-label': o.label || 'Anexar arquivos para a IA' });
  const trigger = h('button', { class: 'btn file-picker-btn', type: 'button' }, '📎 ', o.buttonLabel || 'Anexar arquivos');
  const list = h('ul', { class: 'file-picker-list', 'aria-label': 'Arquivos selecionados' });
  function repaint() {
    list.replaceChildren();
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const idx = i;
      const rm = h('button', { class: 'btn-link file-picker-rm', type: 'button', 'aria-label': 'Remover ' + f.name, text: '✕' });
      rm.addEventListener('click', () => { files.splice(idx, 1); repaint(); });
      list.append(h('li', { class: 'file-picker-item' },
        h('span', { class: 'file-picker-name', text: f.name }),
        h('span', { class: 'file-picker-size muted', text: humanBytes(f.size) }), rm));
    }
    list.hidden = files.length === 0;
  }
  trigger.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    // acumula (não substitui) para o usuário poder anexar em várias etapas; depois zera o input
    // para permitir re-selecionar o MESMO arquivo se ele o removeu.
    for (const f of Array.from(input.files || [])) files.push(f);
    input.value = '';
    repaint();
  });
  repaint();
  wrap.append(input, trigger, list);
  return { el: wrap, files: () => files.slice(), clear() { files = []; repaint(); }, hasFiles: () => files.length > 0 };
}
