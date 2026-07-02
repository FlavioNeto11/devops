// =============================================================================
// smoke-contract.mjs — smoke FUNCIONAL pós-deploy de um produto da Forja.
// -----------------------------------------------------------------------------
// Vai além do liveness (que o readinessProbe e o smoke antigo já cobriam): valida o
// CONTRATO mínimo que todo produto da Forja honra depois de publicado:
//   (a) GET <base>/health      -> 200 + JSON                          (crítico)
//   (b) GET <--metrics url>    -> 200                                 (crítico quando --metrics
//       é passado; sem --metrics vira ::warning:: de cobertura parcial — o chamador só passa
//       a URL quando o produto expõe a porta de métricas, ex.: port-forward da :9464)
//   (c) GET <base><listPath>   -> 200 + JSON  — lista da ENTIDADE PRINCIPAL. A rota é
//       inferida das rotas do app (apps/<p>/api/src/server.js) com preferência pela rota
//       canônica do scaffold (/v1/records); ambígua/não inferível => aceita --list-path
//       explícito ou degrada para health+metrics com ::warning:: de cobertura parcial.
//       401/403 na lista = rota protegida (a camada de auth RESPONDE) => warning, não falha.
//   (d) --crud (SÓ para ambiente dev — NUNCA em produção; recusado quando --base não é
//       localhost, salvo SMOKE_CRUD_ALLOW_REMOTE=1): cria -> lê -> atualiza -> apaga um
//       registro `smoke-<runid>` na entidade principal, com limpeza garantida (try/finally).
//       Decisão de revisão adversarial: CRUD em produção polui dados reais — default READ-ONLY.
//
// Saída: uma linha por check (+ anotações ::error::/::warning:: p/ o Actions) e exit 0/1.
// Funções puras exportadas (node:test) separadas do executor HTTP (fetch nativo, Node >= 20).
// Zero dependências externas.
//
// Uso:
//   node smoke-contract.mjs --product <p> --base <url> [--app-dir apps/<p>]
//     [--list-path /v1/xyz] [--metrics <url>] [--crud] [--auth-token <bearer>]
//     [--crud-field title] [--run-id <id>] [--timeout-ms 8000]
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';

// Rotas GET /v1/<nome> que NÃO são a entidade principal (infra/plataforma dos scaffolds).
const NON_ENTITY = new Set([
  'health', 'metrics', 'auth', 'sso', 'me', 'users', 'sessions', 'jobs', 'audit',
  'dashboard', 'notifications', 'assistant', 'ai', 'search', 'config', 'state',
  'usage', 'uploads', 'files', 'webhooks', 'events', 'version', 'info', 'status',
]);

/** Pura. Parseia a CLI; `errors` acumula problemas (main decide sair com uso). */
export function parseArgs(argv) {
  const opts = {
    product: null, base: null, listPath: null, metrics: null, appDir: null,
    crud: false, authToken: null, crudField: 'title', runId: null, timeoutMs: 8000,
    errors: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--product') opts.product = next();
    else if (a === '--base') opts.base = String(next() || '').replace(/\/+$/, '');
    else if (a === '--list-path') opts.listPath = next();
    else if (a === '--metrics') opts.metrics = next();
    else if (a === '--app-dir') opts.appDir = next();
    else if (a === '--crud') opts.crud = true;
    else if (a === '--auth-token') opts.authToken = next();
    else if (a === '--crud-field') opts.crudField = next();
    else if (a === '--run-id') opts.runId = next();
    else if (a === '--timeout-ms') opts.timeoutMs = Number(next()) || 8000;
    else opts.errors.push(`flag desconhecida: ${a}`);
  }
  if (!opts.product || !/^[a-z][a-z0-9-]{1,30}$/.test(opts.product)) {
    opts.errors.push('--product <slug> é obrigatório (minúsculo, [a-z0-9-])');
  }
  if (!opts.base || !/^https?:\/\//.test(opts.base)) {
    opts.errors.push('--base <url> é obrigatório (http(s)://...)');
  }
  if (opts.listPath && !String(opts.listPath).startsWith('/')) {
    opts.errors.push('--list-path deve começar com /');
  }
  return opts;
}

/** Pura. true quando a base aponta para localhost (port-forward) — pré-condição do --crud. */
export function isLocalBase(base) {
  try {
    const h = new URL(base).hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]';
  } catch {
    return false;
  }
}

/**
 * Pura. Infere a rota de LISTA da entidade principal a partir do fonte do server.js:
 * captura `app.get('/v1/<nome>')` (sem :params), descarta rotas de infra (NON_ENTITY),
 * prefere a rota canônica do scaffold da Forja (/v1/records); se sobrar exatamente UMA
 * candidata usa-a; ambíguo/nada => null (o chamador degrada com warning de cobertura).
 */
export function inferListPath(source) {
  if (!source || typeof source !== 'string') return null;
  const re = /\bapp\.get\(\s*['"`](\/v1\/[a-z0-9_-]+)['"`]/g;
  const found = [];
  for (const m of source.matchAll(re)) {
    const p = m[1];
    if (NON_ENTITY.has(p.slice('/v1/'.length))) continue;
    if (!found.includes(p)) found.push(p);
  }
  if (found.includes('/v1/records')) return '/v1/records';
  return found.length === 1 ? found[0] : null;
}

/** Pura. Extrai o id do corpo de um create (formatos comuns dos scaffolds da Forja). */
export function extractId(body) {
  if (!body || typeof body !== 'object') return null;
  const candidates = [body.id, body.data && body.data.id, body.record && body.record.id, body.item && body.item.id];
  for (const c of candidates) {
    if (c !== undefined && c !== null && (typeof c === 'number' || typeof c === 'string')) return c;
  }
  return null;
}

/** Pura. Resumo por nível; ok = nenhuma falha (warnings não reprovam). */
export function summarize(results) {
  const fails = results.filter((r) => r.level === 'fail');
  const warns = results.filter((r) => r.level === 'warn');
  const mark = (l) => (l === 'ok' ? '✓' : l === 'warn' ? '⚠' : '✗');
  const lines = results.map((r) => `${mark(r.level)} ${r.name} — ${r.detail}`);
  lines.push(`resumo: ${results.length} check(s) — ${results.length - fails.length - warns.length} ok, ${warns.length} warning(s), ${fails.length} falha(s)`);
  return { ok: fails.length === 0, lines };
}

/**
 * Executor. Roda os checks contra a base; retorna { ok, results } sem process.exit
 * (testável com um servidor http efêmero). deps: { fetchImpl, readFile } injetáveis.
 */
export async function runSmoke(opts, deps = {}) {
  const f = deps.fetchImpl || globalThis.fetch;
  const readFile = deps.readFile || ((p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } });
  const timeoutMs = opts.timeoutMs || 8000;
  const results = [];
  const push = (name, level, detail) => results.push({ name, level, detail });
  const baseHeaders = { accept: 'application/json' };
  if (opts.authToken) baseHeaders.authorization = `Bearer ${opts.authToken}`;

  const http = async (method, url, body) => {
    const init = { method, headers: { ...baseHeaders }, signal: AbortSignal.timeout(timeoutMs) };
    if (body !== undefined) {
      init.headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    try {
      const res = await f(url, init);
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch { /* corpo não-JSON — json fica null */ }
      return { status: res.status, text, json };
    } catch (e) {
      return { status: -1, text: '', json: null, error: (e && e.message) || String(e) };
    }
  };

  // (a) /health — crítico: 200 + corpo JSON.
  const h = await http('GET', `${opts.base}/health`);
  if (h.status === 200 && h.json && typeof h.json === 'object') {
    push('health', 'ok', `GET /health => 200 JSON (${JSON.stringify(h.json).slice(0, 120)})`);
  } else {
    push('health', 'fail', `GET /health => ${h.status}${h.error ? ` (${h.error})` : ''} — esperado 200 + JSON`);
  }

  // (b) métricas — crítico quando o endpoint foi passado; sem --metrics = cobertura parcial.
  if (opts.metrics) {
    const m = await http('GET', opts.metrics);
    if (m.status === 200 && m.text.length > 0) push('metrics', 'ok', `GET ${opts.metrics} => 200 (${m.text.length} bytes)`);
    else push('metrics', 'fail', `GET ${opts.metrics} => ${m.status}${m.error ? ` (${m.error})` : ''} — esperado 200`);
  } else {
    push('metrics', 'warn', 'métricas não verificadas (sem --metrics) — cobertura parcial');
  }

  // (c) lista da entidade principal — explícita (--list-path) ou inferida do fonte do app.
  let listPath = opts.listPath || null;
  let origin = 'explícita (--list-path)';
  if (!listPath && opts.appDir) {
    listPath = inferListPath(readFile(path.join(opts.appDir, 'api', 'src', 'server.js')));
    origin = 'inferida das rotas do app';
  }
  if (!listPath) {
    push('list', 'warn', 'entidade principal não inferida com segurança — cobertura parcial (health+metrics). Passe --list-path para cobrir.');
  } else {
    const l = await http('GET', `${opts.base}${listPath}`);
    if (l.status === 200 && l.json && typeof l.json === 'object') {
      const n = Array.isArray(l.json) ? l.json.length : Array.isArray(l.json.data) ? l.json.data.length : null;
      push('list', 'ok', `GET ${listPath} => 200 JSON${n === null ? '' : ` (${n} item(ns))`} [${origin}]`);
    } else if (l.status === 401 || l.status === 403) {
      push('list', 'warn', `GET ${listPath} => ${l.status} — rota protegida (a camada de auth responde); cobertura parcial sem --auth-token`);
    } else {
      push('list', 'fail', `GET ${listPath} => ${l.status}${l.error ? ` (${l.error})` : ''} — esperado 200 + JSON [${origin}]`);
    }
  }

  // (d) --crud — SÓ dev (localhost/port-forward). Limpeza garantida no finally.
  if (opts.crud) {
    if (!listPath) {
      push('crud', 'fail', 'CRUD pedido mas a entidade principal não foi determinada — passe --list-path');
    } else if (!isLocalBase(opts.base) && process.env.SMOKE_CRUD_ALLOW_REMOTE !== '1') {
      push('crud', 'fail', `CRUD recusado: --base não é localhost (${opts.base}). O CRUD é SÓ para ambiente dev (port-forward) — NUNCA em produção.`);
    } else {
      const marker = `smoke-${opts.runId || Date.now()}`;
      const field = opts.crudField || 'title';
      let id = null;
      try {
        const c = await http('POST', `${opts.base}${listPath}`, { [field]: marker });
        if (c.status === 401 || c.status === 403) {
          push('crud-create', 'fail', `POST ${listPath} => ${c.status} — CRUD bloqueado por auth; passe --auth-token`);
        } else if ((c.status === 200 || c.status === 201) && (id = extractId(c.json)) !== null) {
          push('crud-create', 'ok', `POST ${listPath} => ${c.status} (id=${id})`);
        } else {
          push('crud-create', 'fail', `POST ${listPath} => ${c.status} — esperado 200/201 com id no corpo`);
        }
        if (id !== null) {
          const r = await http('GET', `${opts.base}${listPath}/${id}`);
          if (r.status === 200 && r.json) push('crud-read', 'ok', `GET ${listPath}/${id} => 200`);
          else push('crud-read', 'fail', `GET ${listPath}/${id} => ${r.status} — esperado 200`);

          let u = await http('PUT', `${opts.base}${listPath}/${id}`, { [field]: `${marker}-upd` });
          if (u.status === 404 || u.status === 405) u = await http('PATCH', `${opts.base}${listPath}/${id}`, { [field]: `${marker}-upd` });
          if (u.status >= 200 && u.status < 300) push('crud-update', 'ok', `update ${listPath}/${id} => ${u.status}`);
          else if (u.status === 404 || u.status === 405) push('crud-update', 'warn', `entidade sem PUT/PATCH (${u.status}) — update pulado`);
          else push('crud-update', 'fail', `update ${listPath}/${id} => ${u.status} — esperado 2xx`);
        }
      } finally {
        if (id !== null) {
          const d = await http('DELETE', `${opts.base}${listPath}/${id}`);
          if (d.status >= 200 && d.status < 300) push('crud-cleanup', 'ok', `DELETE ${listPath}/${id} => ${d.status} (registro '${marker}' removido)`);
          else push('crud-cleanup', 'warn', `DELETE ${listPath}/${id} => ${d.status} — o registro de smoke '${marker}' pode ter permanecido; remova manualmente`);
        }
      }
    }
  }

  return { ok: summarize(results).ok, results };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.errors.length) {
    console.error('uso: node smoke-contract.mjs --product <p> --base <url> [--app-dir apps/<p>] [--list-path /v1/xyz] [--metrics <url>] [--crud] [--auth-token <t>] [--crud-field title] [--run-id <id>] [--timeout-ms 8000]');
    for (const e of opts.errors) console.error(`  ✗ ${e}`);
    process.exit(2);
  }
  if (!opts.runId) opts.runId = String(Date.now());
  runSmoke(opts)
    .then(({ ok, results }) => {
      console.log(`[smoke-contract] produto=${opts.product} base=${opts.base}${opts.crud ? ' (com CRUD)' : ' (read-only)'}`);
      for (const r of results) {
        const mark = r.level === 'ok' ? '✓' : r.level === 'warn' ? '⚠' : '✗';
        console.log(`[smoke-contract] ${mark} ${r.name} — ${r.detail}`);
        if (r.level === 'fail') console.log(`::error::smoke-contract ${opts.product}: ${r.name} — ${r.detail}`);
        else if (r.level === 'warn') console.log(`::warning::smoke-contract ${opts.product}: ${r.name} — ${r.detail}`);
      }
      const { lines } = summarize(results);
      console.log(`[smoke-contract] ${lines[lines.length - 1]}`);
      process.exit(ok ? 0 : 1);
    })
    .catch((e) => {
      console.error(`::error::smoke-contract ${opts.product}: erro inesperado — ${e && e.stack ? e.stack : e}`);
      process.exit(1);
    });
}

if (process.argv[1] && process.argv[1].endsWith('smoke-contract.mjs')) main();
