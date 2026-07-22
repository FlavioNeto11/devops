// =============================================================================
// a11y-static.mjs — guarda estático do anti-padrão CLICÁVEL-SEM-TECLADO.
// -----------------------------------------------------------------------------
// Classe do bug: UX-A11Y-001 (P0 sistêmico, WCAG 2.1.1 "Keyboard"). Um elemento
// NÃO-interativo (div/span/li/tr/td/article/section) recebe handler de clique mas
// não vira um controle acessível: sem `role`, sem handler de teclado e sem
// `tabindex`, quem navega por teclado/leitor de tela não alcança nem aciona a ação.
//
// REGRA (violação) — para os elementos-alvo abaixo:
//   TEM handler de clique  E  NÃO tem, no MESMO elemento, os TRÊS:
//     (1) role=            (papel ARIA explícito)
//     (2) handler de teclado  (@keydown/@keyup/@keypress | onKeyDown/onKeyUp/onKeyPress)
//     (3) tabindex/tabIndex   (entra na ordem de foco)
//   => a ausência de QUALQUER um dos três é violação (o trio é o mínimo para um
//      `<div role="button" tabindex="0" @keydown.enter>` acessível).
//
// ELEMENTOS-ALVO (não-interativos): div, span, li, tr, td, article, section.
// NÃO contam (já acessíveis por natureza ou terceirizam o teclado):
//   - nativos interativos: button, a, input, select, textarea (fora da lista-alvo);
//   - COMPONENTES (Tag PascalCase: <UiButton>, <Link>, <RouterLink>…) — como só
//     varremos as 7 tags minúsculas-alvo, componentes ficam de fora por construção.
//
// HEURÍSTICAS p/ BAIXO FALSO-POSITIVO (documentadas de propósito):
//   - Só as 7 tags-alvo acima; qualquer componente/nativo interativo é ignorado.
//   - O elemento é lido do `<` até o `>` de fechamento da TAG DE ABERTURA, cruzando
//     linhas e ignorando `>` dentro de strings e de `{...}`/`(...)` (ex.: `() =>`).
//   - Comentários (HTML e JS) são apagados antes — código comentado não conta.
//   - Vue: `@click`/`v-on:click` (com modificadores); React: `onClick={` em tag minúscula.
//
// USO
//   node scripts/qa/a11y-static.mjs            # relatório (exit 0)
//   node scripts/qa/a11y-static.mjs --check    # falha (1) só em regressão vs baseline
//   node scripts/qa/a11y-static.mjs --update   # (re)grava o baseline atual
//
// TODO (evolução, se der p/ manter baixo ruído): checar `<input>` de formulário
// sem label associado (id<->for / aria-label / aria-labelledby / wrapping <label>).
// Deixado de fora agora porque associação por `<label>` que envolve o input e por
// `v-model`+label em componente exige seguir referência entre arquivos — alto risco
// de falso-positivo num scanner puramente textual. Entra quando houver o harness H3
// (axe em runtime, §16 do docs/plans/ux-design-master-plan.md), que mede isso certo.
// =============================================================================

import path from 'node:path';
import {
  REPO_ROOT, walk, readText, relPath, lineAt, sanitizeSource,
  parseArgs, loadBaseline, saveBaseline,
} from './lib/common.mjs';

const BASELINE_FILE = path.join(REPO_ROOT, 'scripts', 'qa', 'a11y-static.baseline.json');

// Raízes de frontend a varrer (apps + console + portal). node_modules/dist são
// ignorados pelo walk. portal é nginx estático (sem .vue/.jsx) — entra por
// completude do path-filter, sem custo se vazio.
const SCAN_ROOTS = ['apps', 'console', 'portal'];
const EXTS = ['.vue', '.jsx', '.tsx'];

const TARGET_TAGS = ['div', 'span', 'li', 'tr', 'td', 'article', 'section'];
const TAG_OPEN_RE = new RegExp(`<(${TARGET_TAGS.join('|')})(?=[\\s/>])`, 'g');

// Lê a tag de abertura a partir de `<` (em startIdx), cruzando linhas e ignorando
// `>` dentro de strings e de chaves/parênteses (expr. JSX / bindings Vue).
function readOpeningTag(src, startIdx) {
  let str = null;
  let nest = 0;
  for (let i = startIdx + 1; i < src.length; i++) {
    const c = src[i];
    if (str) {
      if (c === '\\') { i++; continue; }
      if (c === str) str = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { str = c; continue; }
    if (c === '{' || c === '(') { nest++; continue; }
    if (c === '}' || c === ')') { if (nest > 0) nest--; continue; }
    if (c === '>' && nest === 0) return src.slice(startIdx, i + 1);
  }
  return src.slice(startIdx, Math.min(src.length, startIdx + 4000));
}

// Exige `=` no handler de clique: um `@click.stop` "pelado" (sem valor) só barra a
// propagação — não é uma AÇÃO e portanto não precisa de equivalente por teclado.
// `@click="fn"`, `@click.stop.prevent="fn"` e `onClick={...}` (com valor) contam.
const RE_CLICK = /(?:@|v-on:)click(?:\.[\w-]+)*\s*=|\bonClick\s*=/;
const RE_ROLE = /\brole\s*=/;
const RE_KEYBOARD = /(?:@|v-on:)key(?:down|up|press)\b|\bonKey(?:Down|Up|Press)\s*=/;
const RE_TABINDEX = /\btab[Ii]ndex\b/;

// Extrai o corpo de `onClick={ ... }` (React), balanceando chaves/strings.
function reactClickBody(tag) {
  const at = tag.search(/\bonClick\s*=\s*\{/);
  if (at === -1) return null;
  const start = tag.indexOf('{', at);
  let depth = 0;
  let str = null;
  for (let i = start; i < tag.length; i++) {
    const c = tag[i];
    if (str) { if (c === '\\') { i++; continue; } if (c === str) str = null; continue; }
    if (c === '"' || c === "'" || c === '`') { str = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return tag.slice(start + 1, i); }
  }
  return null;
}

// Handler React que SÓ barra propagação/default — ex.: `(e) => e.stopPropagation()`,
// `() => { e.preventDefault(); }`. Não é uma AÇÃO -> não exige teclado (espelha o
// tratamento do `@click.stop` pelado do Vue). NÃO cobre `onClick={ref}` (ambíguo:
// pode ser um handler real) nem arrows com lógica extra (`if (...)`, outra chamada).
function isPureGuardHandler(body) {
  if (body == null) return false;
  const arrow = body.trim().match(/^\(?[\w\s,]*\)?\s*=>\s*([\s\S]*)$/);
  if (!arrow) return false;
  let rhs = arrow[1].trim();
  if (rhs.startsWith('{') && rhs.endsWith('}')) rhs = rhs.slice(1, -1).trim();
  const stmts = rhs.split(';').map((s) => s.trim()).filter(Boolean);
  if (!stmts.length) return false;
  return stmts.every((s) => /^(?:[\w$]+\.)*(?:stopPropagation|preventDefault)\(\s*\)$/.test(s));
}

function analyzeFile(file) {
  const ext = path.extname(file);
  const src = sanitizeSource(readText(file), ext);
  const violations = [];
  let m;
  TAG_OPEN_RE.lastIndex = 0;
  while ((m = TAG_OPEN_RE.exec(src)) !== null) {
    const tag = m[1];
    const openTag = readOpeningTag(src, m.index);
    if (!RE_CLICK.test(openTag)) continue;
    // React: se o onClick só barra propagação/default, não é ação -> ignora.
    if (/\bonClick\s*=\s*\{/.test(openTag) && isPureGuardHandler(reactClickBody(openTag))) continue;
    const hasRole = RE_ROLE.test(openTag);
    const hasKeyboard = RE_KEYBOARD.test(openTag);
    const hasTabindex = RE_TABINDEX.test(openTag);
    if (hasRole && hasKeyboard && hasTabindex) continue; // acessível — OK
    const missing = [];
    if (!hasRole) missing.push('role');
    if (!hasKeyboard) missing.push('teclado');
    if (!hasTabindex) missing.push('tabindex');
    // snippet normalizado (1 linha) p/ chave de baseline estável a movimentação.
    const snippet = openTag.replace(/\s+/g, ' ').trim().slice(0, 120);
    violations.push({
      file: relPath(file),
      line: lineAt(src, m.index),
      tag,
      missing: missing.join('+'),
      snippet,
    });
  }
  return violations;
}

function appOf(rel) {
  const parts = rel.split('/');
  if (parts[0] === 'apps') return `apps/${parts[1]}`;
  return parts[0]; // console, portal
}

function analyze() {
  const all = [];
  for (const root of SCAN_ROOTS) {
    const dir = path.join(REPO_ROOT, root);
    for (const file of walk(dir, EXTS)) {
      for (const v of analyzeFile(file)) all.push(v);
    }
  }
  return all;
}

// Chave estável: arquivo + snippet normalizado (não usa linha -> baixa rotatividade).
function keyOf(v) {
  return `${v.file}|${v.snippet}`;
}

function groupByApp(violations) {
  const map = new Map();
  for (const v of violations) {
    const app = appOf(v.file);
    map.set(app, (map.get(app) || 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function printReport(violations) {
  console.log('a11y-static — clicável sem teclado (WCAG 2.1.1)\n');
  const groups = groupByApp(violations);
  if (!groups.length) {
    console.log('  (nenhuma violação encontrada nas raízes varridas)');
  }
  for (const [app, n] of groups) {
    console.log(`  ${app.padEnd(24)} violações: ${n}`);
  }
  console.log(`\n  TOTAL: ${violations.length} violação(ões) em ${groups.length} superfície(s).`);
  // amostra p/ diagnóstico rápido
  if (violations.length) {
    console.log('\n  amostra (até 12):');
    for (const v of violations.slice(0, 12)) {
      console.log(`    ✗ ${v.file}:${v.line}  <${v.tag}> falta: ${v.missing}`);
    }
  }
}

function main() {
  const { check, update } = parseArgs(process.argv);
  const violations = analyze().sort((a, b) => keyOf(a).localeCompare(keyOf(b)));

  if (update) {
    const counts = {};
    for (const [app, n] of groupByApp(violations)) counts[app] = n;
    saveBaseline(BASELINE_FILE, {
      $guard: 'a11y-static',
      $comment: 'Elementos clicáveis-sem-teclado PRÉ-EXISTENTES tolerados. --check falha só em chaves NOVAS. Ao corrigir (role+tabindex+keydown, ou trocar por <button>), rode --update para reduzir o baseline.',
      generatedAt: new Date().toISOString().slice(0, 10),
      counts,
      violations,
    });
    console.log(`baseline gravado: ${relPath(BASELINE_FILE)} (${violations.length} violações)`);
    printReport(violations);
    return;
  }

  if (check) {
    const baseline = loadBaseline(BASELINE_FILE);
    if (!baseline) {
      console.error(`[a11y-static] baseline ausente (${relPath(BASELINE_FILE)}). Rode: node scripts/qa/a11y-static.mjs --update`);
      process.exit(2);
    }
    const known = new Set(baseline.violations.map(keyOf));
    const regressions = violations.filter((v) => !known.has(keyOf(v)));
    if (regressions.length) {
      console.error(`[a11y-static] ${regressions.length} elemento(s) clicável(is)-sem-teclado NOVO(s) (regressão):\n`);
      for (const v of regressions) {
        console.error(`  ✗ ${v.file}:${v.line}  <${v.tag}> falta: ${v.missing}\n     ${v.snippet}`);
      }
      console.error('\nTorne o elemento acessível (role + tabindex + @keydown, ou use <button>/<a>) OU, se intencional, atualize o baseline com --update.');
      process.exit(1);
    }
    console.log(`[a11y-static] OK — 0 regressões (${violations.length} violações conhecidas no baseline).`);
    return;
  }

  printReport(violations);
}

main();
