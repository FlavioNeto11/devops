// =============================================================================
// validate-view-contracts.mjs — anti-fabricação de CONTRATO nas VIEWS geradas.
// -----------------------------------------------------------------------------
// Fecha a lacuna provada pelo PR #211 (contaviva-360): o motor generate-ui
// validava REFs, mas o CÓDIGO das views (api client + chamadas + router) saía
// com contratos fabricados (campos errados, rotas inexistentes, multipart
// contra rota JSON-only, CTAs para rotas removidas, view inalcançável).
//
// Varre os artefatos do frontend gerado (frontend/src/api.js + views/*.vue +
// router.js + nav.js) e valida contra o CONTRATO da API (openapi.yaml quando
// existir + tabela EXTRAÍDA do backend real — extract-backend-contract.mjs):
//   (a) toda rota de API chamada (request/fetch/EventSource/resourceFactory/
//       URL BASE+.../wrappers locais) existe na tabela, com o MÉTODO exposto;
//   (b) toda rota de navegação (router.push, <router-link>/:to, to=, hrefs
//       internos, wrappers locais de push) existe no router.js;
//   (c) toda rota registrada no router é alcançável por >=1 call-site de
//       navegação OU marcada como entrada direta (meta: { directEntry: true });
//   (d) payload de mutação: chave enviada que o backend NÃO lê é erro quando o
//       shape do handler é FECHADO (leituras claras) — shape aberto rebaixa
//       para warning `payload-field-unverifiable`; valor literal fora de enum
//       extraído (`ENUM.includes(x)` no handler) é erro;
//   (e) corpo FormData (multipart) contra rota cujo backend não aceita
//       multipart é erro;
//   (f) leitura de campo de RESPOSTA (const x = await fn(); x.campo /
//       ref.value = await fn(); ref.value.campo) que não existe quando o shape
//       de resposta do handler é FECHADO é erro (escopo: janela da função).
//
// DETERMINÍSTICO e fail-closed no que PROVA; o que não dá para rastrear com
// confiança vira warning estruturado ou é pulado — nunca erro fabricado, nunca
// conserto silencioso, nunca sinônimo. Erros saem com arquivo:linha.
//
// Uso:
//   node validate-view-contracts.mjs --product <name> [--app-dir <dir>] [--contract <openapi.yaml>]
//
// Consumidores: motor generate-ui (P4 integração — itera até exit 0) e o gate
// do greenfield-ui (scripts/forge-ui-view-gate.ps1) ANTES do guard/PR.
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseContract } from './validate-refinement-contract.mjs';
import {
  extractBackendContract, scanRegions, matchDelim,
  splitTopLevelArgs, lineOf,
} from './extract-backend-contract.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const RESOURCE_METHODS = {
  list: { method: 'get', suffix: '' },
  get: { method: 'get', suffix: '/{id}' },
  create: { method: 'post', suffix: '' },
  update: { method: 'put', suffix: '/{id}' },
  patch: { method: 'patch', suffix: '/{id}' },
  remove: { method: 'delete', suffix: '/{id}' },
};

// ---------------------------------------------------------------------------
// contrato: match de template — segmento {param} do contrato casa com qualquer
// segmento citado; literal exige igualdade; citado dinâmico (:_dyn) NÃO casa
// com literal. SEM candidatos/normalização: a view chama o path LITERAL.
// ---------------------------------------------------------------------------
export function apiTemplateMatch(template, cited) {
  const ts = String(template).split('/').filter(Boolean);
  const cs = String(cited).split('/').filter(Boolean);
  if (ts.length !== cs.length) return false;
  for (let i = 0; i < ts.length; i++) {
    if (/^\{.+\}$/.test(ts[i])) continue;
    if (cs[i].startsWith(':') || ts[i] !== cs[i]) return false;
  }
  return true;
}

// rota ESTÁTICA tem prioridade sobre {param} (mesma semântica do router real):
// GET /v1/nf/report casa com /v1/nf/report, não com /v1/nf/{id}.
export function findApiRoute(contract, cited) {
  let best = null; let bestScore = -1;
  for (const e of contract.paths) {
    if (!apiTemplateMatch(e.template, cited)) continue;
    const literals = e.template.split('/').filter((s) => s && !/^\{/.test(s)).length;
    const score = (e.template === cited ? 1000 : 0) + literals;
    if (score > bestScore) { best = e; bestScore = score; }
  }
  return best;
}

// rota do vue-router: :param casa com qualquer segmento; literal exige igualdade
export function routerTemplateMatch(routePath, cited) {
  if (routePath === cited) return true;
  const ts = String(routePath).split('/').filter(Boolean);
  const cs = String(cited).split('/').filter(Boolean);
  if (ts.length !== cs.length) return false;
  for (let i = 0; i < ts.length; i++) {
    if (ts[i].startsWith(':')) continue;
    if (cs[i].startsWith(':') || ts[i] !== cs[i]) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// parse de EXPRESSÃO DE PATH (arg de request/fetch/push): literais + concat +
// template strings; BASE/import.meta.env à esquerda é removido; qs(...)/'?...'
// à direita vira query; dinâmico após '/' vira :_dyn; dinâmico no MEIO de
// segmento => segmento :_dyn; dinâmico FINAL sem '/' => trailingDynamic.
// ---------------------------------------------------------------------------
export function parsePathExpr(exprRaw) {
  const expr = String(exprRaw).trim();
  if (!expr) return { ok: false };
  const tokens = [];
  {
    let depth = 0; let s = 0; let q = null;
    for (let i = 0; i < expr.length; i++) {
      const c = expr[i];
      if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
      if (c === "'" || c === '"' || c === '`') { q = c; continue; }
      if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) depth--;
      else if (c === '+' && depth === 0 && expr[i + 1] !== '+' && expr[i - 1] !== '+') { tokens.push(expr.slice(s, i)); s = i + 1; }
    }
    tokens.push(expr.slice(s));
  }
  const parts = []; // { kind: 'lit'|'dyn', text }
  for (const t0 of tokens) {
    const t = t0.trim();
    if (!t) continue;
    let m;
    if ((m = t.match(/^(['"])((?:\\.|(?!\1).)*)\1$/))) { parts.push({ kind: 'lit', text: m[2] }); continue; }
    if (t.startsWith('`') && t.endsWith('`')) {
      const inner = t.slice(1, -1);
      let last = 0; const rx = /\$\{([^}]*)\}/g;
      let mm;
      while ((mm = rx.exec(inner)) !== null) {
        if (mm.index > last) parts.push({ kind: 'lit', text: inner.slice(last, mm.index) });
        parts.push({ kind: 'dyn', text: mm[1].trim() });
        last = mm.index + mm[0].length;
      }
      if (last < inner.length) parts.push({ kind: 'lit', text: inner.slice(last) });
      continue;
    }
    parts.push({ kind: 'dyn', text: t });
  }
  if (parts.length === 0) return { ok: false };
  // base da API à esquerda (BASE, apiBase, import.meta.env...)
  if (parts[0].kind === 'dyn' && /BASE|import\.meta\.env/i.test(parts[0].text)) parts.shift();
  if (parts.length === 0 || parts[0].kind !== 'lit' || !parts[0].text.startsWith('/')) return { ok: false };

  let out = '';
  let trailingDynamic = false;
  let trailingDynText = null;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.kind === 'lit') {
      const cut = p.text.search(/[?#]/);
      if (cut >= 0) { out += p.text.slice(0, cut); return finish(out, false, null); }
      out += p.text;
      continue;
    }
    const d = p.text;
    if (/^qs\s*\(/.test(d) || /^new\s+URLSearchParams/.test(d) || /^\(?\s*['"]\?/.test(d) || d.includes("'?'") || d.includes('"?"')) {
      return finish(out, false, null); // query string
    }
    if (out.endsWith('/')) { out += ':_dyn'; continue; }
    const lastSlash = out.lastIndexOf('/');
    if (lastSlash >= 0 && lastSlash < out.length - 1 && i < parts.length - 1) { out = out.slice(0, lastSlash + 1) + ':_dyn'; continue; }
    trailingDynamic = true;
    trailingDynText = d;
    break;
  }
  return finish(out, trailingDynamic, trailingDynText);

  function finish(p, trailing, dynText) {
    let norm = p.replace(/\/+$/, '') || '/';
    if (!norm.startsWith('/')) return { ok: false };
    return { ok: true, template: norm, trailingDynamic: !!trailing, trailingDynText: dynText };
  }
}

// template resolvido a partir de um IDENT (const local) só vale se sobrar algo
// LITERAL além de /v1 — '/v1/:_dyn' é fábrica genérica (root de resource), não prova.
function identTemplateUsable(template) {
  const segs = template.split('/').filter(Boolean);
  const literals = segs.filter((s) => !s.startsWith(':') && s !== 'v1');
  return literals.length > 0;
}

// extrai as ENTRADAS (chave -> valor com posição ABSOLUTA) de um objeto literal
export function parseObjectEntries(text, inString, openBrace) {
  const close = matchDelim(text, inString, openBrace, '{', '}');
  if (close < 0) return { entries: [], end: openBrace, open: true };
  const entries = []; let open = false;
  let depth = 0; let segStart = openBrace + 1;
  const segs = [];
  for (let i = openBrace + 1; i < close; i++) {
    if (inString[i]) continue;
    const c = text[i];
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === ',' && depth === 0) { segs.push([segStart, i]); segStart = i + 1; }
  }
  segs.push([segStart, close]);
  for (const [s, e] of segs) {
    const seg = text.slice(s, e);
    if (!seg.trim()) continue;
    if (seg.trim().startsWith('...')) { open = true; continue; }
    const m = seg.match(/^\s*(?:async\s+)?(['"]?)([A-Za-z_$][\w$]*)\1\s*(:|\()/);
    if (m) {
      if (m[3] === ':') {
        const rel = seg.indexOf(':') + 1;
        entries.push({ key: m[2], valueText: seg.slice(rel).trim(), valueStart: s + rel + (seg.slice(rel).length - seg.slice(rel).trimStart().length), valueEnd: e, start: s, kind: 'value' });
      } else {
        const rel = seg.indexOf('(');
        entries.push({ key: m[2], valueText: seg.slice(rel), valueStart: s + rel, valueEnd: e, start: s, kind: 'method' });
      }
      continue;
    }
    const sh = seg.match(/^\s*([A-Za-z_$][\w$]*)\s*$/);
    if (sh) { entries.push({ key: sh[1], valueText: sh[1], valueStart: s + seg.indexOf(sh[1]), valueEnd: e, start: s, kind: 'shorthand' }); continue; }
    open = true;
  }
  return { entries, end: close, open };
}

export function bodyKeysFromLiteral(text, inString, openBrace) {
  const { entries, open } = parseObjectEntries(text, inString, openBrace);
  return { keys: entries.map((e) => ({ key: e.key, valueText: e.valueText })), open };
}

// ---------------------------------------------------------------------------
// leitura de um arquivo JS/SFC: para .vue separa <script> (JS real) do
// <template> (analisado por atributo). script.raw/offset dão linhas do ARQUIVO.
// ---------------------------------------------------------------------------
export function loadSourceFile(absPath) {
  const raw = fs.readFileSync(absPath, 'utf8');
  if (!absPath.endsWith('.vue')) {
    const { masked, inString } = scanRegions(raw);
    return { raw, script: { text: raw, masked, inString, offset: 0, raw }, template: null };
  }
  const scriptM = raw.match(/<script[^>]*>([\s\S]*?)<\/script>/);
  const templateM = raw.match(/<template>([\s\S]*?)<\/template>\s*(?:<script|$)/);
  const scriptText = scriptM ? scriptM[1] : '';
  const scriptOffset = scriptM ? scriptM.index + scriptM[0].indexOf(scriptM[1]) : 0;
  const { masked, inString } = scanRegions(scriptText);
  return {
    raw,
    script: { text: scriptText, masked, inString, offset: scriptOffset, raw },
    template: templateM ? { text: templateM[1], offset: templateM.index + '<template>'.length } : null,
  };
}

const scriptLine = (script, idx) => lineOf(script.raw, script.offset + idx);

// ---------------------------------------------------------------------------
// chamadas cruas num bloco de script: request(/fetch(/new EventSource(/
// resourceFactory( + concatenações soltas BASE + '...'.
// ---------------------------------------------------------------------------
export function collectApiCalls(script, file) {
  const { masked, inString } = script;
  const calls = [];
  const covered = [];
  const scan = (rx, kind) => {
    rx.lastIndex = 0; let m;
    while ((m = rx.exec(masked)) !== null) {
      if (inString[m.index]) continue;
      const openParen = m.index + m[0].length - 1;
      const close = matchDelim(masked, inString, openParen, '(', ')');
      if (close < 0) continue;
      const args = splitTopLevelArgs(masked, inString, openParen + 1, close);
      const argText = (i) => (args[i] ? masked.slice(args[i].start, args[i].end).trim() : null);
      calls.push({ kind, args, argText, idx: m.index, line: scriptLine(script, m.index), openParen, close });
      covered.push([m.index, close]);
    }
  };
  scan(/(?<![.\w$])request\s*\(/g, 'request');
  scan(/(?<![.\w$])fetch\s*\(/g, 'fetch');
  scan(/new\s+EventSource\s*\(/g, 'eventsource');
  scan(/(?<![.\w$])resourceFactory\s*\(/g, 'resourceFactory');

  const baseRx = /(?<![.\w$])[A-Za-z_$]*BASE[A-Za-z_$]*\s*\+\s*(['"])(\/[^'"]*)\1/g;
  let m;
  while ((m = baseRx.exec(masked)) !== null) {
    if (inString[m.index]) continue;
    if (covered.some(([s, e]) => m.index >= s && m.index <= e)) continue;
    calls.push({ kind: 'baseurl', idx: m.index, line: scriptLine(script, m.index), pathLiteral: m[2] });
  }
  return calls.map((c) => ({ ...c, file }));
}

function fetchMethod(masked, inString, optsArg) {
  if (!optsArg) return { method: 'get', dynamic: false };
  const t = masked.slice(optsArg.start, optsArg.end);
  const lit = t.match(/method\s*:\s*(['"])([A-Za-z]+)\1/);
  if (lit) return { method: lit[2].toLowerCase(), dynamic: false };
  const dyn = t.match(/method\s*:?\s*([A-Za-z_$][\w$]*)?/);
  if (/method\s*[,:}]/.test(t) || (dyn && /method/.test(t))) return { method: null, dynamic: /method/.test(t) };
  return { method: 'get', dynamic: false };
}

function fetchBody(masked, inString, optsArg) {
  if (!optsArg) return { kind: 'none' };
  const t = masked.slice(optsArg.start, optsArg.end);
  const rel = t.search(/(?<![\w$])body\s*[:,}]/);
  if (rel < 0) return { kind: 'none' };
  const colonRel = t.slice(rel).indexOf(':');
  if (colonRel < 0 || t[rel + colonRel] !== ':') return { kind: 'raw', exprText: 'body', start: optsArg.start + rel }; // shorthand { body }
  const abs = optsArg.start + rel + colonRel + 1;
  let depth = 0; let end = optsArg.end;
  for (let i = abs; i < optsArg.end; i++) {
    if (inString[i]) continue;
    const c = masked[i];
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) { if (depth === 0) { end = i; break; } depth--; }
    else if (c === ',' && depth === 0) { end = i; break; }
  }
  const v = masked.slice(abs, end).trim();
  const js = v.match(/^JSON\.stringify\s*\(([\s\S]*)\)$/);
  if (js) return { kind: 'json', exprText: js[1].trim(), start: abs };
  return { kind: 'raw', exprText: v, start: abs };
}

// resolve `const IDENT = <expr>` no script (1 nível)
function resolveConstExpr(masked, ident) {
  const rx = new RegExp('(?:const|let|var)\\s+' + ident.replace(/\$/g, '\\$') + '\\s*=\\s*([^;\\n]+)');
  const m = masked.match(rx);
  return m ? m[1].trim() : null;
}

// ---------------------------------------------------------------------------
// descreve um wrapper simples: EXATAMENTE 1 request/fetch com rota resolvível.
// Suporta método vindo de PARAM (wrappers locais: req(method, path, body)).
// ---------------------------------------------------------------------------
export function describeWrapper(bodyText, masked, inString, absStart, script, paramsIn) {
  const params = paramsIn || (() => {
    const pm = bodyText.match(/^\s*(?:async\s*)?\(([^)]*)\)/);
    return pm ? pm[1].split(',').map((s) => s.trim().split(/[=:\s]/)[0]).filter(Boolean) : [];
  })();
  const reqRx = /(?<![.\w$])(request|fetch)\s*\(/g;
  const found = [];
  let m;
  while ((m = reqRx.exec(bodyText)) !== null) found.push({ kind: m[1], rel: m.index, len: m[0].length });
  if (found.length !== 1) return null;
  const f = found[0];
  const openParen = absStart + f.rel + f.len - 1;
  const close = matchDelim(masked, inString, openParen, '(', ')');
  if (close < 0) return null;
  const args = splitTopLevelArgs(masked, inString, openParen + 1, close);
  const argText = (i) => (args[i] ? masked.slice(args[i].start, args[i].end).trim() : null);
  let method = 'get'; let methodParamIndex = -1; let pathArg; let bodyExpr = null; let bodyStart = -1; let rawBody = false;
  if (f.kind === 'request') {
    const a0 = argText(0) || '';
    const mm = a0.match(/^(['"])([A-Za-z]+)\1$/);
    if (mm) method = mm[2].toLowerCase();
    else if (params.includes(a0)) { method = null; methodParamIndex = params.indexOf(a0); }
    else return null;
    pathArg = argText(1);
    if (args[2]) { bodyExpr = argText(2); bodyStart = args[2].start; }
  } else {
    pathArg = argText(0);
    const fm = fetchMethod(masked, inString, args[1]);
    method = fm.method;
    if (fm.dynamic) {
      const t = args[1] ? masked.slice(args[1].start, args[1].end) : '';
      const dm = t.match(/method\s*(?::\s*([A-Za-z_$][\w$]*))?\s*[,}]/);
      const ident = dm && dm[1] ? dm[1] : (/(?<![\w$:])method\s*[,}]/.test(t) ? 'method' : null);
      if (ident && params.includes(ident)) { method = null; methodParamIndex = params.indexOf(ident); }
      else return null;
    }
    const fb = fetchBody(masked, inString, args[1]);
    if (fb.kind === 'json') { bodyExpr = fb.exprText; bodyStart = fb.start; }
    else if (fb.kind === 'raw') { bodyExpr = fb.exprText; bodyStart = fb.start; rawBody = true; }
  }
  // path: expressão direta OU ident resolvível a const local
  let parsed = parsePathExpr(pathArg || '');
  if (!parsed.ok && pathArg && /^[A-Za-z_$][\w$]*$/.test(pathArg)) {
    const rhs = resolveConstExpr(masked, pathArg);
    if (rhs) { parsed = parsePathExpr(rhs); if (parsed.ok && !identTemplateUsable(parsed.template)) parsed = { ok: false }; }
  }
  if (!parsed.ok && pathArg) {
    // concat cujo primeiro token é ident local (ex.: BASE local + (path || ''))
    const firstIdent = pathArg.match(/^([A-Za-z_$][\w$]*)\s*\+/);
    if (firstIdent) {
      const rhs = resolveConstExpr(masked, firstIdent[1]);
      if (rhs) {
        // substitui o ident pela expressão declarada (mantendo a estrutura do concat)
        parsed = parsePathExpr(rhs + ' + ' + pathArg.slice(pathArg.indexOf('+') + 1));
        if (parsed.ok && !identTemplateUsable(parsed.template)) parsed = { ok: false };
      }
    }
  }
  if (!parsed.ok) return null;
  // sufixo dinâmico do path vindo de PARAM => call-site pode estender a rota
  let pathParamIndex = -1;
  if (parsed.trailingDynamic && parsed.trailingDynText) {
    const idM = parsed.trailingDynText.match(/^\(?\s*([A-Za-z_$][\w$]*)\s*(?:\|\|\s*['"]{2}\s*)?\)?$/);
    if (idM && params.includes(idM[1])) pathParamIndex = params.indexOf(idM[1]);
  }
  const responseTransformed = /^\s*\.\s*then\b/.test(masked.slice(close + 1));
  const d = {
    kind: 'fn', method, methodParamIndex, template: parsed.template,
    trailingDynamic: parsed.trailingDynamic, pathParamIndex,
    params, bodyKind: 'none', bodyKeys: [], bodyOpen: false, bodyParamIndex: -1, rawBody,
    keyParamBindings: {}, responseTransformed,
    line: scriptLine(script, absStart),
  };
  if (bodyExpr) {
    if (/^\{/.test(bodyExpr)) {
      const openB = masked.indexOf('{', bodyStart);
      const { entries, open } = parseObjectEntries(masked, inString, openB);
      d.bodyKind = 'literal';
      d.bodyKeys = entries.map((k) => k.key);
      d.bodyOpen = open;
      for (const k of entries) {
        const vIdent = (String(k.valueText).match(/^([A-Za-z_$][\w$]*)/) || [])[1];
        const pi = params.indexOf(vIdent);
        if (pi >= 0) d.keyParamBindings[k.key] = pi;
      }
    } else if (/^[A-Za-z_$][\w$]*$/.test(bodyExpr) && params.includes(bodyExpr)) {
      d.bodyKind = 'param';
      d.bodyParamIndex = params.indexOf(bodyExpr);
    } else {
      d.bodyKind = 'unknown';
    }
  }
  return d;
}

// ---------------------------------------------------------------------------
// api.js: mapa de exports -> descritores p/ rastrear call-sites nas views
// ---------------------------------------------------------------------------
export function parseApiClient(script, file) {
  const { masked, inString } = script;
  const exportsMap = new Map();
  const resources = new Map();

  const rfRx = /(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*resourceFactory\(\s*(['"])([^'"]+)\2\s*\)/g;
  let m;
  while ((m = rfRx.exec(masked)) !== null) {
    if (inString[m.index]) continue;
    resources.set(m[1], m[3]);
    exportsMap.set(m[1], { kind: 'resource', resource: m[3] });
  }
  const oaRx = /(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*Object\.assign\(\s*\{\}\s*,\s*([A-Za-z_$][\w$]*)\s*,\s*\{/g;
  while ((m = oaRx.exec(masked)) !== null) {
    if (inString[m.index]) continue;
    const name = m[1]; const baseIdent = m[2];
    const res = resources.get(baseIdent) || null;
    if (res) { resources.set(name, res); exportsMap.set(name, { kind: 'resource', resource: res }); }
    const openBrace = m.index + m[0].length - 1;
    const { entries } = parseObjectEntries(masked, inString, openBrace);
    for (const e of entries) {
      if (e.kind !== 'method' && e.kind !== 'value') continue;
      const d = describeWrapper(masked.slice(e.valueStart, e.valueEnd), masked, inString, e.valueStart, script);
      if (d) exportsMap.set(name + '.' + e.key, d);
    }
  }
  const fnRx = /export\s+(?:async\s+)?(?:const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>|function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\))/g;
  while ((m = fnRx.exec(masked)) !== null) {
    if (inString[m.index]) continue;
    const name = m[1] || m[3];
    const params = (m[2] !== undefined ? m[2] : m[4]).split(',').map((s) => s.trim().split(/[=:\s]/)[0]).filter(Boolean);
    if (exportsMap.has(name)) continue;
    let bodyStart = m.index + m[0].length;
    let bodyEnd = masked.length;
    if (m[3]) {
      let i = bodyStart; while (i < masked.length && masked[i] !== '{') i++;
      const close = matchDelim(masked, inString, i, '{', '}');
      bodyStart = i; bodyEnd = close > 0 ? close : masked.length;
    } else {
      let depth = 0;
      for (let i = bodyStart; i < masked.length; i++) {
        if (inString[i]) continue;
        const c = masked[i];
        if ('([{'.includes(c)) depth++;
        else if (')]}'.includes(c)) { if (depth === 0) { bodyEnd = i; break; } depth--; }
        else if (c === ';' && depth === 0) { bodyEnd = i; break; }
      }
    }
    const d = describeWrapper(masked.slice(bodyStart, bodyEnd), masked, inString, bodyStart, script, params);
    if (d) exportsMap.set(name, d);
  }
  return { exportsMap, resources };
}

// wrappers LOCAIS de um script de view (function req(method, path, body) { fetch... })
export function parseLocalWrappers(script) {
  const { masked, inString } = script;
  const out = new Map();
  const rx = /(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/g;
  let m;
  while ((m = rx.exec(masked)) !== null) {
    if (inString[m.index]) continue;
    const name = m[1];
    const params = m[2].split(',').map((s) => s.trim().split(/[=:\s]/)[0]).filter(Boolean);
    const openBrace = m.index + m[0].length - 1;
    const close = matchDelim(masked, inString, openBrace, '{', '}');
    if (close < 0) continue;
    const d = describeWrapper(masked.slice(openBrace, close), masked, inString, openBrace, script, params);
    if (d) out.set(name, d);
  }
  return out;
}

// ---------------------------------------------------------------------------
// router.js / nav.js
// ---------------------------------------------------------------------------
export function parseRouter(script, file) {
  const { masked, inString } = script;
  const routes = [];
  const arrM = masked.match(/routes\s*=\s*\[/);
  if (!arrM) return { routes, file };
  const openBracket = arrM.index + arrM[0].length - 1;
  const close = matchDelim(masked, inString, openBracket, '[', ']');
  if (close < 0) return { routes, file };
  let i = openBracket + 1;
  while (i < close) {
    if (!inString[i] && masked[i] === '{') {
      const end = matchDelim(masked, inString, i, '{', '}');
      if (end < 0) break;
      const { entries } = parseObjectEntries(masked, inString, i);
      const get = (k) => entries.find((e) => e.key === k);
      const lit = (e) => e && (String(e.valueText).match(/^(['"])((?:\\.|(?!\1).)*)\1$/) || [])[2];
      const pathV = lit(get('path'));
      if (pathV !== undefined) {
        routes.push({
          path: pathV,
          name: lit(get('name')) || null,
          redirect: lit(get('redirect')) || (get('redirect') ? '(dyn)' : null),
          hasComponent: !!get('component'),
          directEntry: /directEntry\s*:\s*true/.test((get('meta') || {}).valueText || ''),
          catchAll: /:pathMatch|\(\.\*\)/.test(pathV),
          line: scriptLine(script, i),
        });
      }
      i = end + 1;
      continue;
    }
    i++;
  }
  return { routes, file };
}

export function parseNavFile(script) {
  const { masked } = script;
  const tos = [...masked.matchAll(/\bto\s*:\s*(['"])((?:\\.|(?!\1).)*)\1/g)].map((m) => m[2]);
  const names = [...masked.matchAll(/\bname\s*:\s*(['"])((?:\\.|(?!\1).)*)\1/g)].map((m) => m[2]);
  return { tos, names };
}

// ---------------------------------------------------------------------------
// navegação num arquivo (script + template)
// ---------------------------------------------------------------------------
export function resolveNavExpr(expr, scriptMasked) {
  const e = String(expr).trim();
  if (!e) return { targets: [], names: [], unresolved: 0 };
  if (e.startsWith('{')) {
    const nameM = e.match(/name\s*:\s*(['"])((?:\\.|(?!\1).)*)\1/);
    if (nameM) return { targets: [], names: [nameM[2]], unresolved: 0 };
    const pathM = e.match(/path\s*:\s*([^,}]+)/);
    if (pathM) return resolveNavExpr(pathM[1], scriptMasked);
    return { targets: [], names: [], unresolved: 1 };
  }
  const parsed = parsePathExpr(e);
  if (parsed.ok) return { targets: [parsed.template], names: [], unresolved: 0 };
  const idM = e.match(/^([A-Za-z_$][\w$]*)(?:\.value)?$/);
  if (idM && scriptMasked) {
    const declRx = new RegExp('const\\s+' + idM[1].replace(/\$/g, '\\$') + '\\s*=\\s*([\\s\\S]*?)(?:;\\n|;$)');
    const dm = scriptMasked.match(declRx);
    if (dm) {
      const lits = [...dm[1].matchAll(/(['"])(\/(?:[^'"\s]*))\1/g)].map((x) => x[2]).filter((s) => s === '/' || !s.endsWith('/'));
      if (lits.length) return { targets: lits, names: [], unresolved: 0 };
    }
    return { targets: [], names: [], unresolved: 1 };
  }
  const lits = [...e.matchAll(/(['"])(\/(?:[^'"\s]*))\1/g)].map((x) => x[2]).filter((s) => s === '/' || !s.endsWith('/'));
  if (lits.length) return { targets: lits, names: [], unresolved: 0 };
  return { targets: [], names: [], unresolved: 1 };
}

export function collectNavTargets(source, file, apiBase) {
  const targets = [];
  let unresolved = 0;
  const push = (res, line, via) => {
    for (const t of res.targets) targets.push({ target: t.split(/[?#]/)[0], file, line, via });
    for (const nm of res.names) targets.push({ name: nm, file, line, via });
    unresolved += res.unresolved;
  };
  const script = source.script;
  const sMasked = script ? script.masked : '';

  const wrapperNames = new Set();
  if (script) {
    for (const m of sMasked.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(\s*([A-Za-z_$][\w$]*)\s*\)\s*\{[^{}]*?(?:router|this\.\$router)\s*\.\s*(?:push|replace)\(\s*\2\s*\)/g)) wrapperNames.add(m[1]);
    for (const m of sMasked.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*\(?\s*([A-Za-z_$][\w$]*)\s*\)?\s*=>\s*(?:\{[^{}]*?)?(?:router|this\.\$router)\s*\.\s*(?:push|replace)\(\s*\2\s*\)/g)) wrapperNames.add(m[1]);
  }
  const isWrapperParamForward = (arg) =>
    /^[A-Za-z_$][\w$]*$/.test(arg) &&
    [...wrapperNames].some((w) => new RegExp('(?:function\\s+' + w + '\\s*\\(\\s*|const\\s+' + w + '\\s*=\\s*\\(?\\s*)' + arg + '\\b').test(sMasked));

  if (script) {
    const { masked, inString } = script;
    const pushRx = /(?:router|\$router)\s*\.\s*(?:push|replace)\s*\(/g;
    let m;
    while ((m = pushRx.exec(masked)) !== null) {
      if (inString[m.index]) continue;
      const openParen = m.index + m[0].length - 1;
      const close = matchDelim(masked, inString, openParen, '(', ')');
      if (close < 0) continue;
      const arg = masked.slice(openParen + 1, close).trim();
      if (isWrapperParamForward(arg)) continue; // repasse do param do wrapper: coberto pelos call-sites
      push(resolveNavExpr(arg, sMasked), scriptLine(script, m.index), 'router.push');
    }
    for (const w of wrapperNames) {
      const wRx = new RegExp('(?<![.\\w$])' + w.replace(/\$/g, '\\$') + '\\s*\\(', 'g');
      let wm;
      while ((wm = wRx.exec(masked)) !== null) {
        if (inString[wm.index]) continue;
        if (/function\s+$/.test(masked.slice(Math.max(0, wm.index - 12), wm.index))) continue;
        const openParen = wm.index + wm[0].length - 1;
        const close = matchDelim(masked, inString, openParen, '(', ')');
        if (close < 0) continue;
        const args = splitTopLevelArgs(masked, inString, openParen + 1, close);
        if (!args.length) continue;
        const arg = masked.slice(args[0].start, args[0].end).trim();
        push(resolveNavExpr(arg, sMasked), scriptLine(script, wm.index), 'nav-wrapper');
      }
    }
  }

  if (source.template) {
    const t = source.template.text;
    const tOffset = source.template.offset;
    const lineAt = (idx) => lineOf(source.raw, tOffset + idx);
    for (const m of t.matchAll(/\s(to|href)=(["'])(\/[^"']*)\2/g)) {
      const val = m[3].split(/[?#]/)[0];
      if (m[1] === 'href' && apiBase && val.startsWith(apiBase)) continue; // URL de API (download)
      targets.push({ target: val, file, line: lineAt(m.index), via: m[1] + '=' });
    }
    for (const m of t.matchAll(/\s(?::to|v-bind:to)=(["'])((?:(?!\1).)*)\1/g)) {
      push(resolveNavExpr(m[2].replace(/&quot;/g, '"').replace(/&amp;/g, '&'), sMasked), lineAt(m.index), ':to');
    }
    for (const m of t.matchAll(/@[a-z]+(?:\.[a-z.]+)?=(["'])((?:(?!\1).)*)\1/g)) {
      const expr = m[2];
      for (const w of wrapperNames) {
        const cRx = new RegExp(w.replace(/\$/g, '\\$') + "\\s*\\(\\s*((?:'[^']*'|[^)])*)\\)", 'g');
        let cm;
        while ((cm = cRx.exec(expr)) !== null) push(resolveNavExpr(cm[1], sMasked), lineAt(m.index), 'nav-wrapper@template');
      }
      const pm = expr.match(/(?:router|\$router)\.(?:push|replace)\(\s*((?:'[^']*'|[^)])*)\)/);
      if (pm) push(resolveNavExpr(pm[1], sMasked), lineAt(m.index), 'router.push@template');
    }
  }
  return { targets, unresolved };
}

// ---------------------------------------------------------------------------
// validação principal
// ---------------------------------------------------------------------------
export function validateViews({ appDir, product, contract, apiBase }) {
  const errors = [];
  const warnings = [];
  const feDir = path.join(appDir, 'frontend', 'src');
  const rel = (f) => path.relative(appDir, f).replace(/\\/g, '/');

  const seenKeys = new Set();
  const err = (o) => {
    const k = [o.code, o.file, o.cited || o.route || '', o.method || '', o.field || o.name || o.value || '', ['nav-route-not-in-router', 'nav-name-not-in-router', 'payload-field-not-in-contract', 'payload-enum-not-in-contract', 'response-field-not-in-contract', 'route-unreachable', 'route-path-includes-base'].includes(o.code) ? o.line : ''].join('|');
    if (seenKeys.has(k)) return;
    seenKeys.add(k);
    errors.push(o);
  };
  const warn = (o) => {
    const k = ['W', o.code, o.file, o.route || '', o.field || '', o.line].join('|');
    if (seenKeys.has(k)) return;
    seenKeys.add(k);
    warnings.push(o);
  };

  const isExtracted = contract.mode !== 'openapi';
  const opOf = (entry, method) => (entry.ops ? entry.ops[method] : null);

  const checkRoute = (cited, method, file, line, note) => {
    const hit = findApiRoute(contract, cited);
    if (!hit) {
      err({
        code: 'view-route-not-in-backend', file, line, method: method ? method.toUpperCase() : '-', cited,
        message: 'rota "' + cited + '" nao existe no backend' + (note ? ' (' + note + ')' : ''),
        hint: 'use uma rota REAL (tabela extraida do backend / openapi) ou crie o endpoint no backend',
      });
      return null;
    }
    if (method && !hit.methods.has(method)) {
      err({
        code: 'view-method-not-in-backend', file, line, method: method.toUpperCase(), cited, route: hit.template,
        message: 'a rota ' + hit.template + ' existe mas NAO expoe o metodo ' + method.toUpperCase(),
        known_methods: [...hit.methods].map((x) => x.toUpperCase()),
      });
      return hit;
    }
    return hit;
  };

  const checkBodyKeys = (keys, open, hit, method, file, line) => {
    if (!hit || !keys || !keys.length) return;
    const op = opOf(hit, method);
    const known = op ? op.bodyFields : hit.fields;
    const shapeOpen = op ? op.bodyOpen : hit.open;
    for (const k of keys) {
      if (known.has(k)) continue;
      if (shapeOpen) {
        warn({
          code: 'payload-field-unverifiable', file, line, field: k, route: hit.template, method: method.toUpperCase(),
          message: 'campo "' + k + '" enviado a ' + method.toUpperCase() + ' ' + hit.template + ' nao consta nas leituras do handler, mas o shape do body e ABERTO — confira no backend',
        });
      } else {
        err({
          code: 'payload-field-not-in-contract', file, line, field: k, route: hit.template, method: method.toUpperCase(),
          message: 'campo "' + k + '" enviado a ' + method.toUpperCase() + ' ' + hit.template + ' NAO e lido pelo backend (shape FECHADO)',
          known_fields: [...known].sort(),
        });
      }
    }
  };

  const checkEnumValue = (key, valueLiteral, hit, method, file, line) => {
    const op = opOf(hit, method);
    if (!op || !op.enums || !op.enums[key]) return;
    if (!op.enums[key].includes(valueLiteral)) {
      err({
        code: 'payload-enum-not-in-contract', file, line, field: key, value: valueLiteral, route: hit.template,
        message: 'valor "' + valueLiteral + '" para o campo "' + key + '" nao existe no enum validado pelo backend',
        known_values: op.enums[key],
      });
    }
  };

  const checkMultipart = (hit, method, file, line) => {
    if (!hit || !isExtracted) return;
    const op = opOf(hit, method);
    const accepts = contract.multipart || (op && op.handlesMultipart);
    if (!accepts) {
      err({
        code: 'multipart-not-accepted', file, line, route: hit.template, method: method.toUpperCase(),
        message: 'corpo FormData (multipart) enviado a ' + method.toUpperCase() + ' ' + hit.template + ', mas o backend nao registra parser multipart nem trata multipart no handler (rota JSON-only)',
        hint: 'envie JSON com os campos que o handler le, ou adicione suporte multipart no backend',
      });
    }
  };

  // ---- arquivos ----
  const apiPath = path.join(feDir, 'api.js');
  let apiExports = { exportsMap: new Map(), resources: new Map() };
  const allFiles = [];
  if (fs.existsSync(apiPath)) allFiles.push(apiPath);
  const viewsDir = path.join(feDir, 'views');
  if (fs.existsSync(viewsDir)) for (const f of fs.readdirSync(viewsDir).sort()) if (f.endsWith('.vue')) allFiles.push(path.join(viewsDir, f));
  const appVue = path.join(feDir, 'App.vue');
  if (fs.existsSync(appVue)) allFiles.push(appVue);

  const sources = new Map();
  for (const f of allFiles) sources.set(f, loadSourceFile(f));
  if (fs.existsSync(apiPath)) apiExports = parseApiClient(sources.get(apiPath).script, rel(apiPath));

  const awaitedReads = []; // { varName, isRef, hit, method, script, file, callIdx }
  const recordAwait = (script, file, callIdx, hit, method) => {
    const before = script.masked.slice(Math.max(0, callIdx - 80), callIdx);
    const am = before.match(/(?:(?:const|let|var)\s+([A-Za-z_$][\w$]*)|([A-Za-z_$][\w$]*)\s*\.\s*value)\s*=\s*await\s*$/);
    if (am) awaitedReads.push({ varName: am[1] || am[2], isRef: !!am[2], hit, method, script, file, callIdx });
  };

  for (const f of allFiles) {
    const source = sources.get(f);
    const script = source.script;
    if (!script || !script.text.trim()) continue;
    const file = rel(f);
    const calls = collectApiCalls(script, file);
    const localWrappers = f === apiPath ? new Map() : parseLocalWrappers(script);

    for (const c of calls) {
      if (c.kind === 'baseurl') { checkRoute(c.pathLiteral.split(/[?#]/)[0].replace(/\/+$/, '') || '/', null, file, c.line, 'URL construida com BASE'); continue; }
      if (c.kind === 'resourceFactory') {
        const nameM = (c.argText(0) || '').match(/^(['"])([^'"]+)\1$/);
        if (!nameM) continue;
        const resName = nameM[2];
        const before = script.masked.slice(Math.max(0, c.idx - 64), c.idx);
        const declM = before.match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*$/);
        if (declM && f !== apiPath) apiExports.resources.set('local:' + file + ':' + declM[1], resName);
        const root = '/v1/' + resName;
        const hit = findApiRoute(contract, root);
        if (!hit || !hit.methods.has('get')) {
          err({
            code: 'resource-route-not-in-backend', file, line: c.line, cited: root,
            message: 'resourceFactory("' + resName + '") exige GET ' + root + ' no backend — rota ' + (hit ? 'existe mas sem GET' : 'inexistente'),
            hint: 'crie o CRUD /v1/' + resName + ' no backend ou aponte para um recurso REAL',
          });
        }
        continue;
      }
      let method = 'get'; let pathArgText = null; let bodyInfo = null;
      if (c.kind === 'request') {
        const mm = (c.argText(0) || '').match(/^(['"])([A-Za-z]+)\1$/);
        if (!mm) continue; // método dinâmico (fábrica/wrapper local — coberto por parseLocalWrappers)
        method = mm[2].toLowerCase();
        pathArgText = c.argText(1);
        if (c.args[2]) bodyInfo = { exprText: c.argText(2), start: c.args[2].start };
      } else if (c.kind === 'fetch') {
        pathArgText = c.argText(0);
        const fm = fetchMethod(script.masked, script.inString, c.args[1]);
        if (fm.method === null) { continue; } // método dinâmico: wrapper local cobre
        method = fm.method;
        const fb = fetchBody(script.masked, script.inString, c.args[1]);
        if (fb.kind !== 'none') bodyInfo = { exprText: fb.exprText, start: fb.start, raw: fb.kind === 'raw' };
      } else { pathArgText = c.argText(0); }

      let viaIdent = false;
      if (pathArgText && /^[A-Za-z_$][\w$]*$/.test(pathArgText)) {
        const rhs = resolveConstExpr(script.masked, pathArgText);
        if (rhs) { pathArgText = rhs; viaIdent = true; }
      }
      const parsed = parsePathExpr(pathArgText || '');
      if (!parsed.ok) continue;
      if (viaIdent && !identTemplateUsable(parsed.template)) continue; // fábrica genérica — sem prova
      const hit = checkRoute(parsed.template, method, file, c.line, parsed.trailingDynamic ? 'sufixo dinamico nao-rastreavel apos o path' : null);
      if (hit && bodyInfo && bodyInfo.exprText && /^\{/.test(bodyInfo.exprText)) {
        const openB = script.masked.indexOf('{', bodyInfo.start);
        const bk = bodyKeysFromLiteral(script.masked, script.inString, openB);
        checkBodyKeys(bk.keys.map((k) => k.key), bk.open, hit, method, file, c.line);
        for (const k of bk.keys) {
          const lit = String(k.valueText).match(/^(['"])((?:\\.|(?!\1).)*)\1$/);
          if (lit) checkEnumValue(k.key, lit[2], hit, method, file, c.line);
        }
      }
      if (hit && bodyInfo && bodyInfo.raw && bodyInfo.exprText && /^[A-Za-z_$][\w$]*$/.test(bodyInfo.exprText)) {
        const fdRx = new RegExp('(?:const|let|var)\\s+' + bodyInfo.exprText.replace(/\$/g, '\\$') + '\\s*=\\s*new\\s+FormData\\s*\\(');
        if (fdRx.test(script.masked)) checkMultipart(hit, method, file, c.line);
      }
      if (hit && method === 'get' && !viaIdent) recordAwait(script, file, c.idx, hit, method);
    }

    // ---- call-sites de wrappers LOCAIS (function req(method, path, body) { fetch... }) ----
    for (const [wName, d] of localWrappers) {
      const callRx = new RegExp('(?<![.\\w$])' + wName.replace(/\$/g, '\\$') + '\\s*\\(', 'g');
      let cm;
      while ((cm = callRx.exec(script.masked)) !== null) {
        if (script.inString[cm.index]) continue;
        if (/function\s+$/.test(script.masked.slice(Math.max(0, cm.index - 12), cm.index))) continue;
        const openParen = cm.index + cm[0].length - 1;
        const close = matchDelim(script.masked, script.inString, openParen, '(', ')');
        if (close < 0) continue;
        const args = splitTopLevelArgs(script.masked, script.inString, openParen + 1, close);
        const line = scriptLine(script, cm.index);
        let method = d.method;
        if (d.methodParamIndex >= 0) {
          const at = args[d.methodParamIndex] ? script.masked.slice(args[d.methodParamIndex].start, args[d.methodParamIndex].end).trim() : '';
          const lm = at.match(/^(['"])([A-Za-z]+)\1$/);
          if (!lm) continue; // método não-literal no call-site: sem prova
          method = lm[2].toLowerCase();
        }
        let template = d.template;
        if (d.pathParamIndex >= 0 && args[d.pathParamIndex]) {
          const at = script.masked.slice(args[d.pathParamIndex].start, args[d.pathParamIndex].end).trim();
          if (at && at !== "''" && at !== '""') {
            const sub = parsePathExpr(at);
            if (sub.ok) template = template + sub.template;
            else if (/^\(?['"]\/'?/.test(at) || at.includes("'/'")) template = template + '/:_dyn';
            else continue; // sufixo não-provável
          }
        }
        checkRoute(template, method, file, line, 'via wrapper local "' + wName + '"');
      }
    }

    // ---- call-sites de wrappers/recursos importados do api.js ----
    if (f !== apiPath && (apiExports.exportsMap.size || apiExports.resources.size)) {
      const imports = new Map();
      for (const im of script.masked.matchAll(/import\s*\{([^}]*)\}\s*from\s*(['"])[^'"]*api(?:\.js)?\2/g)) {
        for (const piece of im[1].split(',')) {
          const pm = piece.trim().match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
          if (pm) imports.set(pm[2] || pm[1], pm[1]);
        }
      }
      const validateWrapperCall = (d, args, line, callIdx) => {
        const hit = findApiRoute(contract, d.template);
        if (!hit) return;
        if (d.bodyKind === 'param' && args[d.bodyParamIndex]) {
          const at = script.masked.slice(args[d.bodyParamIndex].start, args[d.bodyParamIndex].end).trim();
          let openB = -1;
          if (at.startsWith('{')) openB = script.masked.indexOf('{', args[d.bodyParamIndex].start);
          else if (/^[A-Za-z_$][\w$]*$/.test(at)) {
            const dRx = new RegExp('(?:const|let|var)\\s+' + at.replace(/\$/g, '\\$') + '\\s*=\\s*\\{');
            const dm2 = dRx.exec(script.masked);
            if (dm2) openB = dm2.index + dm2[0].length - 1;
            const fdRx = new RegExp('(?:const|let|var)\\s+' + at.replace(/\$/g, '\\$') + '\\s*=\\s*new\\s+FormData\\s*\\(');
            if (d.rawBody && fdRx.test(script.masked)) checkMultipart(hit, d.method, rel(f), line);
          } else if (/^new\s+FormData/.test(at) && d.rawBody) checkMultipart(hit, d.method, rel(f), line);
          if (openB >= 0) {
            const bk = bodyKeysFromLiteral(script.masked, script.inString, openB);
            if (/^[A-Za-z_$][\w$]*$/.test(at)) {
              for (const sm of script.masked.matchAll(new RegExp('(?<![.\\w$])' + at.replace(/\$/g, '\\$') + '\\.([A-Za-z_$][\\w$]*)\\s*=[^=]', 'g'))) bk.keys.push({ key: sm[1], valueText: '' });
            }
            checkBodyKeys([...new Set(bk.keys.map((k) => k.key))], bk.open, hit, d.method, rel(f), line);
            for (const k of bk.keys) {
              const lit = String(k.valueText || '').match(/^(['"])((?:\\.|(?!\1).)*)\1$/);
              if (lit) checkEnumValue(k.key, lit[2], hit, d.method, rel(f), line);
            }
          }
        }
        for (const [key, pi] of Object.entries(d.keyParamBindings || {})) {
          if (!args[pi]) continue;
          const at = script.masked.slice(args[pi].start, args[pi].end).trim();
          const lit = at.match(/^(['"])((?:\\.|(?!\1).)*)\1$/);
          if (lit) checkEnumValue(key, lit[2], hit, d.method, rel(f), line);
        }
        if (d.method === 'get' && !d.responseTransformed) recordAwait(script, rel(f), callIdx, hit, d.method);
      };
      for (const [local, exported] of imports) {
        const resName = apiExports.resources.get(exported);
        if (resName) {
          const mcRx = new RegExp('(?<![.\\w$])' + local.replace(/\$/g, '\\$') + '\\s*\\.\\s*([A-Za-z_$][\\w$]*)\\s*\\(', 'g');
          let mm;
          while ((mm = mcRx.exec(script.masked)) !== null) {
            if (script.inString[mm.index]) continue;
            const methodName = mm[1];
            const openParen = mm.index + mm[0].length - 1;
            const close = matchDelim(script.masked, script.inString, openParen, '(', ')');
            if (close < 0) continue;
            const args = splitTopLevelArgs(script.masked, script.inString, openParen + 1, close);
            const line = scriptLine(script, mm.index);
            const wrapped = apiExports.exportsMap.get(exported + '.' + methodName);
            if (wrapped && wrapped.kind === 'fn') { validateWrapperCall(wrapped, args, line, mm.index); continue; }
            const rm = RESOURCE_METHODS[methodName];
            if (!rm) continue;
            const cited = '/v1/' + resName + rm.suffix;
            const hit = checkRoute(cited, rm.method, rel(f), line, 'via resource "' + resName + '.' + methodName + '"');
            if (hit && (methodName === 'create' || methodName === 'update' || methodName === 'patch')) {
              const bodyArg = args[methodName === 'create' ? 0 : 1];
              if (bodyArg) {
                const at = script.masked.slice(bodyArg.start, bodyArg.end).trim();
                if (at.startsWith('{')) {
                  const openB = script.masked.indexOf('{', bodyArg.start);
                  const bk = bodyKeysFromLiteral(script.masked, script.inString, openB);
                  checkBodyKeys(bk.keys.map((k) => k.key), bk.open, hit, rm.method, rel(f), line);
                }
              }
            }
            if (rm.method === 'get' && methodName === 'get') recordAwait(script, rel(f), mm.index, hit, rm.method);
          }
          continue;
        }
        const d = apiExports.exportsMap.get(exported);
        if (!d || d.kind !== 'fn') continue;
        const callRx = new RegExp('(?<![.\\w$])' + local.replace(/\$/g, '\\$') + '\\s*\\(', 'g');
        let cm;
        while ((cm = callRx.exec(script.masked)) !== null) {
          if (script.inString[cm.index]) continue;
          const openParen = cm.index + cm[0].length - 1;
          const close = matchDelim(script.masked, script.inString, openParen, '(', ')');
          if (close < 0) continue;
          const args = splitTopLevelArgs(script.masked, script.inString, openParen + 1, close);
          validateWrapperCall(d, args, scriptLine(script, cm.index), cm.index);
        }
      }
    }
  }

  // ---- (f) leituras de campos de RESPOSTA — escopo: janela da função do await ----
  for (const r of awaitedReads) {
    const op = opOf(r.hit, r.method);
    const known = op ? op.responseFields : r.hit.fields;
    const shapeOpen = op ? op.responseOpen : r.hit.open;
    if (shapeOpen || !known || known.size === 0) continue;
    const masked = r.script.masked;
    // janela: ref (componente inteiro) | const em função (do await até a próxima
    // statement em coluna 0 — fim da função envolvente) | const top-level (até o fim)
    let winStart = 0; let winEnd = masked.length;
    if (!r.isRef) {
      winStart = r.callIdx;
      const lineStart = masked.lastIndexOf('\n', r.callIdx) + 1;
      const atCol0 = !/\s/.test(masked[lineStart] || ' ');
      if (!atCol0) {
        const after = masked.slice(r.callIdx);
        const nm = after.match(/\n(?=\S)/);
        if (nm) winEnd = r.callIdx + nm.index + 1;
      }
    }
    const base = r.varName.replace(/\$/g, '\\$') + (r.isRef ? '(?:\\s*\\.\\s*value|\\s*\\?\\.\\s*value)' : '');
    const readRx = new RegExp('(?<![.\\w$])' + base + '\\s*\\??\\.\\s*([A-Za-z_$][\\w$]*)', 'g');
    let m;
    while ((m = readRx.exec(masked)) !== null) {
      if (r.script.inString[m.index]) continue;
      if (m.index < winStart || m.index > winEnd) continue;
      const prop = m[1];
      if (r.isRef && prop === 'value') continue;
      if (known.has(prop)) continue;
      // cadeia de fallback (user.role || user.perfil): se a MESMA linha lê um campo
      // CONHECIDO da mesma var, o código funciona pelo fallback — rebaixa p/ warning.
      const ls = masked.lastIndexOf('\n', m.index) + 1;
      const le = masked.indexOf('\n', m.index);
      const lineText = masked.slice(ls, le < 0 ? masked.length : le);
      const siblingKnown = [...lineText.matchAll(new RegExp('(?<![.\\w$])' + base + '\\s*\\??\\.\\s*([A-Za-z_$][\\w$]*)', 'g'))].some((x) => known.has(x[1]));
      if (siblingKnown) {
        warn({
          code: 'response-field-fallback-unverifiable', file: r.file, line: scriptLine(r.script, m.index), field: prop, route: r.hit.template,
          message: 'a view le "' + prop + '" da resposta de ' + r.method.toUpperCase() + ' ' + r.hit.template + ' como FALLBACK de um campo conhecido — o campo nao existe no handler, mas o fallback nao quebra o fluxo',
        });
        continue;
      }
      err({
        code: 'response-field-not-in-contract', file: r.file, line: scriptLine(r.script, m.index), field: prop, route: r.hit.template, method: r.method.toUpperCase(),
        message: 'a view le "' + prop + '" da resposta de ' + r.method.toUpperCase() + ' ' + r.hit.template + ', mas o handler devolve shape FECHADO sem esse campo',
        known_fields: [...known].sort(),
      });
    }
  }

  // ---- (b)/(c) navegação + alcançabilidade ----
  const routerPath = path.join(feDir, 'router.js');
  const navPath = path.join(feDir, 'nav.js');
  let routerInfo = { routes: [], file: rel(routerPath) };
  if (fs.existsSync(routerPath)) routerInfo = parseRouter(loadSourceFile(routerPath).script, rel(routerPath));
  const navInfo = fs.existsSync(navPath) ? parseNavFile(loadSourceFile(navPath).script) : { tos: [], names: [] };

  const allNav = [];
  let unresolvedNav = 0;
  for (const f of allFiles) {
    if (f === apiPath) continue;
    const res = collectNavTargets(sources.get(f), rel(f), apiBase);
    allNav.push(...res.targets);
    unresolvedNav += res.unresolved;
  }
  for (const t of navInfo.tos) allNav.push({ target: t, file: rel(navPath), line: 0, via: 'nav.js' });

  const liveRoutes = routerInfo.routes.filter((r) => !r.catchAll);
  const routeNames = new Set(liveRoutes.map((r) => r.name).filter(Boolean));
  const matchAnyRoute = (cited) => liveRoutes.some((r) => routerTemplateMatch(r.path, cited));

  for (const t of allNav) {
    if (t.name) {
      if (!routeNames.has(t.name)) {
        err({ code: 'nav-name-not-in-router', file: t.file, line: t.line, name: t.name, message: 'navegacao por nome "' + t.name + '" nao existe no router', known_names: [...routeNames].sort() });
      }
      continue;
    }
    if (!matchAnyRoute(t.target)) {
      err({
        code: 'nav-route-not-in-router', file: t.file, line: t.line, cited: t.target, via: t.via,
        message: 'navegacao para "' + t.target + '" nao casa com NENHUMA rota do router (cai no 404)',
        hint: 'aponte para uma rota registrada em router.js ou registre a rota',
      });
    }
  }

  for (const r of routerInfo.routes) if (r.redirect && r.redirect !== '(dyn)') allNav.push({ target: r.redirect, file: routerInfo.file, line: r.line, via: 'redirect' });

  for (const r of liveRoutes) {
    if (!r.hasComponent || r.path === '/' || r.directEntry || r.redirect) continue;
    const reachable =
      navInfo.names.includes(r.name) ||
      allNav.some((t) => (t.name && t.name === r.name) || (t.target && routerTemplateMatch(r.path, t.target)));
    if (!reachable) {
      err({
        code: 'route-unreachable', file: routerInfo.file, line: r.line, route: r.path, name: r.name,
        message: 'rota "' + r.path + '" registrada no router nao e alcancavel por nenhum call-site de navegacao (nav.js, to=, router.push, wrappers)' + (unresolvedNav ? ' — havia ' + unresolvedNav + ' alvo(s) dinamico(s) nao-resolvivel(is); se esta rota e alvo de um deles, marque-a meta: { directEntry: true }' : ''),
        hint: 'ligue um call-site real a esta rota, remova a rota morta, ou marque meta: { directEntry: true } (entrada direta intencional)',
      });
    }
  }

  const mainPath = path.join(feDir, 'main.js');
  if (fs.existsSync(mainPath)) {
    const mainTxt = fs.readFileSync(mainPath, 'utf8');
    const bm = mainTxt.match(/createWeb(?:Hash)?History\(\s*(['"])([^'"]+)\1\s*\)/);
    if (bm && bm[2] !== '/') {
      const base = bm[2].replace(/\/+$/, '');
      for (const r of liveRoutes) {
        if (r.path === base || r.path.startsWith(base + '/')) {
          warn({
            code: 'route-path-includes-base', file: routerInfo.file, line: r.line, route: r.path,
            message: 'rota "' + r.path + '" repete o base path "' + base + '" (createWebHistory ja aplica a base) — a URL final fica ' + base + r.path,
          });
        }
      }
    }
  }

  return { errors, warnings, stats: { files_scanned: allFiles.length, routes_in_router: routerInfo.routes.length, nav_targets: allNav.length, unresolved_dynamic_nav: unresolvedNav, api_calls_awaited: awaitedReads.length } };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--product') a.product = argv[++i];
    else if (argv[i] === '--app-dir') a.appDir = argv[++i];
    else if (argv[i] === '--contract') a.contract = argv[++i];
  }
  return a;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.product && !args.appDir) {
    console.error('uso: node validate-view-contracts.mjs --product <name> [--app-dir <dir>] [--contract <openapi.yaml>]');
    process.exit(2);
  }
  const appDir = path.resolve(args.appDir ? args.appDir : path.join(REPO_ROOT, 'apps', args.product));
  const product = args.product || path.basename(appDir);
  if (!fs.existsSync(path.join(appDir, 'frontend', 'src'))) {
    console.log(JSON.stringify({ ok: true, skipped: 'app sem frontend/src — nada a validar', product }, null, 2));
    process.exit(0);
  }

  // contrato: openapi (contract-first) prioriza; tabela extraída complementa/substitui
  let contract = null; let contractLabel = null;
  const openapiPath = args.contract
    ? path.resolve(args.contract)
    : [
      path.join(appDir, 'api', 'src', 'openapi', 'openapi.yaml'),
      path.join(appDir, 'api', 'openapi', 'openapi.yaml'),
      path.join(appDir, 'api', 'openapi.yaml'),
    ].find((p) => fs.existsSync(p));
  const srcDir = path.join(appDir, 'api', 'src');
  if (openapiPath) {
    contract = parseContract(fs.readFileSync(openapiPath, 'utf8'));
    contract.mode = 'openapi';
    contractLabel = 'openapi:' + path.relative(appDir, openapiPath).replace(/\\/g, '/');
    if (fs.existsSync(srcDir)) {
      // suplementa EXISTÊNCIA com rotas reais do backend (/me, /health fora do openapi);
      // rotas só-extraídas carregam ops (payload/response por método) — as do openapi, fields/open.
      const extra = extractBackendContract(srcDir);
      contract.multipart = extra.multipart;
      const known = contract.paths.map((e) => e.template);
      for (const e of extra.paths) if (!known.some((t) => t === e.template)) contract.paths.push(e);
    }
  } else if (fs.existsSync(srcDir)) {
    contract = extractBackendContract(srcDir);
    contractLabel = 'extracted:' + path.relative(appDir, srcDir).replace(/\\/g, '/') + ' (' + contract.stats.routes + ' rotas de ' + contract.stats.files + ' arquivos)';
    if (contract.paths.length === 0) contract = null;
  }
  if (!contract) {
    console.log(JSON.stringify({ ok: true, skipped: 'sem contrato disponivel (nem openapi nem rotas extraiveis do backend)', product }, null, 2));
    process.exit(0);
  }

  let apiBase = '/' + product + '/api';
  const apiJs = path.join(appDir, 'frontend', 'src', 'api.js');
  if (fs.existsSync(apiJs)) {
    const bm = fs.readFileSync(apiJs, 'utf8').match(/VITE_API_BASE_URL\s*\|\|\s*(['"])([^'"]+)\1/);
    if (bm) apiBase = bm[2];
  }

  const result = validateViews({ appDir, product, contract, apiBase });
  const out = {
    ok: result.errors.length === 0,
    product,
    contract: contractLabel,
    contract_mode: contract.mode,
    errors: result.errors,
    warnings: result.warnings,
    stats: result.stats,
  };
  console.log(JSON.stringify(out, null, 2));
  console.error('[validate-view-contracts] ' + product + ' vs ' + contractLabel + ': '
    + result.errors.length + ' erro(s), ' + result.warnings.length + ' aviso(s) — '
    + JSON.stringify(result.stats));
  process.exit(result.errors.length > 0 ? 1 : 0);
}

if (process.argv[1] && process.argv[1].endsWith('validate-view-contracts.mjs')) main();
