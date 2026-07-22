// =============================================================================
// route-integrity.mjs — guarda estático de NAVEGAÇÃO MORTA (rotas inexistentes).
// -----------------------------------------------------------------------------
// Classe do bug: UX-NEURO-002 (18 links mortos) — telas vivas navegam para paths
// que o router NÃO declara, caindo no catch-all/404 (beco sem saída). Este guarda
// roda SEM SERVIDOR: extrai os paths REGISTRADOS no `router.js` de cada app Vue e
// confere todos os alvos de navegação das views contra eles.
//
// O QUE ELE PEGA
//   - `<router-link to="/x">` e `to="/x"` (atributo não-bindado)
//   - `:to="'/x'"`, `:to="{ path: '/x' }"`, `:to="{ name: 'rota' }"` (bindado)
//   - `to: '/x'` / `to: { name: 'rota' }` (config de menu/nav em JS)
//   - `router.push('/x')`, `router.replace(...)`, `$router.push(...)`, `.go('/x')`
//     nas formas string e objeto ({ path } / { name }).
//
// COMO CASA
//   - Extrai os paths registrados percorrendo o array de rotas do router,
//     resolvendo `children` (junta com o path do pai, semântica vue-router),
//     `alias` e spreads de const locais (`...moduleRoutes` do imobia).
//   - Normaliza params: `/patients/:id` casa `/patients/123`; `${id}` -> segmento.
//   - Também coleta os `name` das rotas; alvos por `name` são validados contra eles.
//   - O catch-all (`/:pathMatch(.*)*`) é EXCLUÍDO do conjunto válido — é o 404;
//     se um alvo só casa nele, é justamente uma navegação morta.
//
// O QUE ELE IGNORA (baixo falso-positivo)
//   - Strings de API (`/v1/...`, `/api/...`, `/auth`, `/oauth2`, assets, health…)
//   - Âncoras (`#...`), URLs externas (`http://`, `//host`), alvos com espaço.
//   - Alvos que não começam com `/` (relativos/dinâmicos não resolvíveis estático).
//
// USO
//   node scripts/qa/route-integrity.mjs            # relatório (exit 0)
//   node scripts/qa/route-integrity.mjs --check    # falha (1) só em regressão vs baseline
//   node scripts/qa/route-integrity.mjs --update   # (re)grava o baseline atual
// =============================================================================

import fs from 'node:fs';
import path from 'node:path';
import {
  REPO_ROOT, walk, readText, relPath, lineAt, sanitizeSource,
  parseArgs, loadBaseline, saveBaseline,
} from './lib/common.mjs';

const BASELINE_FILE = path.join(REPO_ROOT, 'scripts', 'qa', 'route-integrity.baseline.json');

// ---------------------------------------------------------------------------
// Parse leve de literais JS (varredura de char ciente de strings)
// ---------------------------------------------------------------------------

// Casa o fechamento do delimitador aberto em `openIdx` (respeitando strings).
function matchBracket(src, openIdx, open, close) {
  let depth = 0;
  let str = null;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (str) {
      if (c === '\\') { i++; continue; }
      if (c === str) str = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { str = c; continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return i; }
  }
  return -1;
}

// Divide o corpo de um array (sem os colchetes) em segmentos de topo (objetos
// `{...}` e spreads `...IDENT`), separados por vírgulas de nível 0.
function splitTopLevel(body) {
  const items = [];
  let depth = 0;
  let str = null;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (str) {
      if (c === '\\') { i++; continue; }
      if (c === str) str = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { str = c; continue; }
    if (c === '[' || c === '{' || c === '(') depth++;
    else if (c === ']' || c === '}' || c === ')') depth--;
    else if (c === ',' && depth === 0) { items.push(body.slice(start, i)); start = i + 1; }
  }
  items.push(body.slice(start));
  return items.map((s) => s.trim()).filter(Boolean);
}

// Extrai as propriedades de nível 0 de um objeto literal `{...}` -> { key: rawValueText }.
function topLevelProps(objText) {
  const open = objText.indexOf('{');
  const close = objText.lastIndexOf('}');
  if (open === -1 || close === -1) return {};
  const inner = objText.slice(open + 1, close);
  const props = {};
  for (const seg of splitTopLevel(inner)) {
    // acha o primeiro `:` de nível 0
    let colon = -1;
    let d = 0;
    let str = null;
    for (let j = 0; j < seg.length; j++) {
      const c = seg[j];
      if (str) { if (c === '\\') j++; else if (c === str) str = null; continue; }
      if (c === '"' || c === "'" || c === '`') { str = c; continue; }
      if (c === '{' || c === '[' || c === '(') d++;
      else if (c === '}' || c === ']' || c === ')') d--;
      else if (c === ':' && d === 0) { colon = j; break; }
    }
    if (colon === -1) continue; // shorthand/spread — irrelevante aqui
    const key = seg.slice(0, colon).trim().replace(/^['"]|['"]$/g, '');
    props[key] = seg.slice(colon + 1).trim();
  }
  return props;
}

// Se `v` é um literal string simples, devolve seu conteúdo; senão null.
function strLit(v) {
  if (v == null) return null;
  const m = v.match(/^(['"`])([^'"`]*)\1\s*$/);
  return m ? m[2] : null;
}

// Todos os literais string dentro de `v` (para `alias: ['/a','/b']`).
function strLitAll(v) {
  const out = [];
  const re = /(['"])([^'"]+)\1/g;
  let m;
  while ((m = re.exec(v)) !== null) out.push(m[2]);
  return out;
}

// ---------------------------------------------------------------------------
// Semântica de paths do vue-router
// ---------------------------------------------------------------------------

function normalizePath(p) {
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p || '/';
}

function joinPaths(parent, child) {
  if (child.startsWith('/')) return normalizePath(child); // absoluto
  if (child === '') return parent === '' ? '/' : normalizePath(parent);
  const base = (parent === '/' || parent === '') ? '' : parent;
  return normalizePath(base + '/' + child);
}

function isCatchAll(p) {
  return p.includes('pathMatch') || /\(\.\*\)/.test(p);
}

// Percorre um corpo de array de rotas, empilhando full-paths e names.
function collectRoutes(arrayBody, parentPath, ctx) {
  for (const item of splitTopLevel(arrayBody)) {
    if (item.startsWith('...')) {
      const m = item.match(/^\.\.\.\s*([A-Za-z_$][\w$]*)/);
      if (m && ctx.constArrays[m[1]] != null) {
        collectRoutes(ctx.constArrays[m[1]], parentPath, ctx);
      }
      continue;
    }
    if (!item.startsWith('{')) continue;
    const props = topLevelProps(item);
    const pathLit = props.path != null ? strLit(props.path) : null;
    if (pathLit == null) continue; // rota sem path estático — ignora
    const full = joinPaths(parentPath, pathLit);
    ctx.paths.push(full);
    if (props.name != null) {
      const nm = strLit(props.name);
      if (nm) ctx.names.add(nm);
    }
    if (props.alias != null) {
      for (const a of strLitAll(props.alias)) ctx.paths.push(joinPaths(parentPath, a));
    }
    if (props.children != null && props.children.includes('[')) {
      const open = props.children.indexOf('[');
      const close = props.children.lastIndexOf(']');
      if (open !== -1 && close > open) {
        collectRoutes(props.children.slice(open + 1, close), full, ctx);
      }
    }
  }
}

// Extrai { paths, names } registrados de um router.js já sanitizado.
function parseRouter(sanitized) {
  const ctx = { paths: [], names: new Set(), constArrays: {} };

  // 1) Mapeia consts array de topo (para resolver spreads tipo ...moduleRoutes).
  const constRe = /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*\[/g;
  let cm;
  while ((cm = constRe.exec(sanitized)) !== null) {
    const openIdx = sanitized.indexOf('[', cm.index);
    const closeIdx = matchBracket(sanitized, openIdx, '[', ']');
    if (closeIdx !== -1) ctx.constArrays[cm[1]] = sanitized.slice(openIdx + 1, closeIdx);
  }

  // 2) Acha o array de rotas: `routes = [` OU `routes: [`.
  const routesRe = /\broutes\s*[:=]\s*\[/g;
  let rm;
  let found = false;
  while ((rm = routesRe.exec(sanitized)) !== null) {
    const openIdx = sanitized.indexOf('[', rm.index);
    const closeIdx = matchBracket(sanitized, openIdx, '[', ']');
    if (closeIdx === -1) continue;
    collectRoutes(sanitized.slice(openIdx + 1, closeIdx), '', ctx);
    found = true;
    break; // o primeiro `routes = [` / `routes: [` é o array real
  }
  return { paths: ctx.paths, names: ctx.names, found };
}

// ---------------------------------------------------------------------------
// Matchers (path registrado -> regex de alvo concreto)
// ---------------------------------------------------------------------------

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pathToRegex(p) {
  const parts = p.split('/').map((seg) => {
    if (seg === '') return '';
    if (seg.startsWith(':')) return '[^/]+'; // param (com/sem regex custom) -> um segmento
    return escapeRegex(seg);
  });
  return new RegExp('^' + parts.join('/') + '/?$');
}

function buildMatchers(paths) {
  const statics = new Set();
  const dynamics = [];
  for (const p of paths) {
    if (isCatchAll(p)) continue;
    if (p.includes('/:')) dynamics.push(pathToRegex(p));
    else statics.add(normalizePath(p));
  }
  return { statics, dynamics };
}

function pathMatches(target, m) {
  if (m.statics.has(target)) return true;
  return m.dynamics.some((re) => re.test(target));
}

// ---------------------------------------------------------------------------
// Extração de alvos de navegação das views
// ---------------------------------------------------------------------------

const IGNORE_PREFIX = /^\/(api|v1|v2|v3|auth|oauth2|assets|static|img|images|icons|fonts|media|public|files|download|downloads|health|metrics|ws|socket|_)(\/|$)/;

function normalizeTarget(raw) {
  let s = raw.trim();
  s = s.replace(/\$\{[^}]*\}/g, '1'); // interpolação -> segmento concreto
  s = s.split('#')[0].split('?')[0];
  if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1);
  return s;
}

function isIgnoredPathTarget(raw) {
  if (!raw.startsWith('/')) return true;      // relativo/dinâmico
  if (raw.startsWith('//')) return true;      // protocol-relative
  if (raw.startsWith('/#')) return true;      // âncora
  if (/\s/.test(raw)) return true;            // provável não-rota
  if (IGNORE_PREFIX.test(raw)) return true;   // API/assets/auth
  return false;
}

// Extrai alvos { kind:'path'|'name', value, index } de um arquivo sanitizado.
function extractTargets(src) {
  const found = [];
  const push = (kind, value, index) => { if (value) found.push({ kind, value, index }); };

  // De uma expressão de `:to`/objeto de push, extrai path/name.
  const fromExpr = (expr, index) => {
    const nameM = expr.match(/\bname\s*:\s*['"]([^'"]+)['"]/);
    if (nameM) { push('name', nameM[1], index); return; }
    const pathM = expr.match(/\bpath\s*:\s*['"]([^'"]+)['"]/);
    if (pathM) { push('path', pathM[1], index); return; }
    const bare = expr.match(/^\s*['"]([^'"]+)['"]\s*$/);
    if (bare) push('path', bare[1], index);
  };

  let m;

  // A) `to="/x"` não-bindado (dupla e simples aspa). Exclui `:to` / `v-bind:to`.
  const toAttr = /(?<![:\w.-])to\s*=\s*(["'])([^"']*)\1/g;
  while ((m = toAttr.exec(src)) !== null) push('path', m[2], m.index);

  // B) `:to="..."` / `v-bind:to="..."` bindado — a expr fica entre aspas duplas
  //    (usa aspas simples dentro) ou simples (aspas duplas dentro).
  const toBindD = /(?::|v-bind:)to\s*=\s*"([^"]*)"/g;
  while ((m = toBindD.exec(src)) !== null) fromExpr(m[1], m.index);
  const toBindS = /(?::|v-bind:)to\s*=\s*'([^']*)'/g;
  while ((m = toBindS.exec(src)) !== null) fromExpr(m[1], m.index);

  // C) `to: '/x'` / `to: { name/path: ... }` em config JS (menus/nav arrays).
  const toProp = /\bto\s*:\s*(\{[^}]*\}|['"][^'"]+['"])/g;
  while ((m = toProp.exec(src)) !== null) fromExpr(m[1], m.index);

  // D) router.push/replace / $router.push / .go — string e objeto.
  const pushStr = /\$?router\.(?:push|replace)\s*\(\s*['"]([^'"]+)['"]/g;
  while ((m = pushStr.exec(src)) !== null) push('path', m[1], m.index);
  const pushObj = /\$?router\.(?:push|replace)\s*\(\s*\{([^}]*)\}/g;
  while ((m = pushObj.exec(src)) !== null) fromExpr('{' + m[1] + '}', m.index);
  const goStr = /(?<![\w.$])go\s*\(\s*['"](\/[^'"]+)['"]/g;
  while ((m = goStr.exec(src)) !== null) push('path', m[1], m.index);

  return found;
}

// ---------------------------------------------------------------------------
// Motor
// ---------------------------------------------------------------------------

function discoverApps() {
  const appsDir = path.join(REPO_ROOT, 'apps');
  const apps = [];
  let names;
  try { names = fs.readdirSync(appsDir); } catch { return apps; }
  for (const name of names.sort()) {
    const routerJs = path.join(appsDir, name, 'frontend', 'src', 'router.js');
    const routerTs = path.join(appsDir, name, 'frontend', 'src', 'router.ts');
    const routerFile = fs.existsSync(routerJs) ? routerJs : (fs.existsSync(routerTs) ? routerTs : null);
    if (!routerFile) continue;
    const raw = readText(routerFile);
    if (!/\bpath\s*:/.test(raw)) continue; // só routers com rotas em array
    apps.push({ name, routerFile, frontendDir: path.join(appsDir, name, 'frontend', 'src') });
  }
  return apps;
}

function analyze() {
  const results = [];
  for (const app of discoverApps()) {
    const routerSan = sanitizeSource(readText(app.routerFile), path.extname(app.routerFile));
    const { paths, names, found } = parseRouter(routerSan);
    const matchers = buildMatchers(paths);
    const nameSet = names;

    const violations = [];
    const viewFiles = walk(app.frontendDir, ['.vue', '.jsx', '.tsx', '.js', '.ts'])
      .filter((f) => f !== app.routerFile); // não escaneia o próprio router
    for (const file of viewFiles) {
      const ext = path.extname(file);
      const src = sanitizeSource(readText(file), ext);
      for (const t of extractTargets(src)) {
        if (t.kind === 'name') {
          if (t.value.includes('${')) continue;
          if (!nameSet.has(t.value)) {
            violations.push({ kind: 'name', target: t.value, file: relPath(file), line: lineAt(src, t.index) });
          }
          continue;
        }
        // path
        if (isIgnoredPathTarget(t.value)) continue;
        const norm = normalizeTarget(t.value);
        if (!norm || norm === '') continue;
        if (!pathMatches(norm, matchers)) {
          violations.push({ kind: 'path', target: norm, file: relPath(file), line: lineAt(src, t.index) });
        }
      }
    }
    results.push({
      app: app.name,
      routerFound: found,
      registeredCount: new Set(paths.map(normalizePath)).size,
      nameCount: nameSet.size,
      violations,
    });
  }
  return results;
}

// Chave estável de baseline (independe de linha/arquivo p/ baixa rotatividade).
function keyOf(app, v) {
  return `${app}|${v.kind}|${v.target}`;
}

function flattenViolations(results) {
  const map = new Map();
  for (const r of results) {
    for (const v of r.violations) {
      const k = keyOf(r.app, v);
      if (!map.has(k)) map.set(k, { app: r.app, kind: v.kind, target: v.target, examples: [] });
      const e = map.get(k);
      if (e.examples.length < 5) e.examples.push(`${v.file}:${v.line}`);
    }
  }
  return [...map.values()].sort((a, b) => keyOf(a.app, a).localeCompare(keyOf(b.app, b)));
}

function printReport(results) {
  console.log('route-integrity — navegação morta (rotas não registradas)\n');
  let total = 0;
  for (const r of results) {
    const n = r.violations.length;
    total += n;
    const flag = r.routerFound ? '' : '  [!] array de rotas NÃO encontrado';
    console.log(`  ${r.app.padEnd(18)} rotas=${String(r.registeredCount).padStart(3)} names=${String(r.nameCount).padStart(3)}  →  navegações mortas: ${n}${flag}`);
    const grouped = flattenViolations([r]);
    for (const v of grouped) {
      console.log(`      ✗ [${v.kind}] ${v.target}   (${v.examples[0]}${v.examples.length > 1 ? ` +${v.examples.length - 1}` : ''})`);
    }
  }
  console.log(`\n  TOTAL de navegações mortas (chaves únicas): ${flattenViolations(results).length}  |  ocorrências: ${total}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const { check, update } = parseArgs(process.argv);
  const results = analyze();
  const current = flattenViolations(results);

  if (update) {
    const counts = {};
    for (const r of results) counts[r.app] = r.violations.length;
    saveBaseline(BASELINE_FILE, {
      $guard: 'route-integrity',
      $comment: 'Navegações mortas PRÉ-EXISTENTES toleradas. --check falha só em chaves NOVAS. Ao corrigir, rode --update para reduzir o baseline.',
      generatedAt: new Date().toISOString().slice(0, 10),
      counts,
      violations: current,
    });
    console.log(`baseline gravado: ${relPath(BASELINE_FILE)} (${current.length} chaves)`);
    printReport(results);
    return;
  }

  if (check) {
    const baseline = loadBaseline(BASELINE_FILE);
    if (!baseline) {
      console.error(`[route-integrity] baseline ausente (${relPath(BASELINE_FILE)}). Rode: node scripts/qa/route-integrity.mjs --update`);
      process.exit(2);
    }
    const known = new Set(baseline.violations.map((v) => keyOf(v.app, v)));
    const regressions = current.filter((v) => !known.has(keyOf(v.app, v)));
    if (regressions.length) {
      console.error(`[route-integrity] ${regressions.length} navegação(ões) morta(s) NOVA(s) (regressão):\n`);
      for (const v of regressions) {
        console.error(`  ✗ ${v.app}  [${v.kind}] ${v.target}   (${v.examples.join(', ')})`);
      }
      console.error('\nCorrija a navegação OU, se for intencional, atualize o baseline com --update.');
      process.exit(1);
    }
    console.log(`[route-integrity] OK — 0 regressões (${current.length} navegações mortas conhecidas no baseline).`);
    return;
  }

  printReport(results);
}

main();
