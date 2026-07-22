// =============================================================================
// scripts/qa/lib/common.mjs — utilitários compartilhados pelos guardas estáticos
// de QA (route-integrity, a11y-static). ESM puro, SEM dependências externas
// (apenas `node:fs` / `node:path` / `node:url`). Roda com `node <arquivo.mjs>`.
// -----------------------------------------------------------------------------
// Princípios:
//  - Determinístico: mesma árvore de arquivos => mesmo relatório (ordenação estável).
//  - Sem servidor: só leitura de arquivos + parse leve (regex / varredura de char).
//  - Baseline adotável: cada guarda tolera as violações PRÉ-EXISTENTES gravadas no
//    seu `*.baseline.json`; `--check` só falha em violação NOVA (regressão).
// =============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// lib/ fica em scripts/qa/lib -> raiz do repo é três níveis acima.
export const REPO_ROOT = path.resolve(HERE, '..', '..', '..');

const IGNORE_DIRS = new Set([
  'node_modules', 'dist', 'build', '.output', 'coverage', '.git', '.nuxt',
  '.next', '.turbo', '.vite', 'vendor', 'generated', '__snapshots__', '.cache',
]);

// Caminha recursivamente por `dir` coletando arquivos cujas extensões estão em
// `exts` (com ponto, ex.: ['.vue', '.jsx']). Ignora pastas de build/deps.
export function walk(dir, exts) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) {
        if (IGNORE_DIRS.has(e.name)) continue;
        stack.push(full);
      } else if (e.isFile()) {
        const ext = path.extname(e.name).toLowerCase();
        if (exts.includes(ext)) out.push(full);
      }
    }
  }
  // Ordenação estável (independente do FS) para relatório/baseline determinísticos.
  return out.sort();
}

export function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

export function relPath(file) {
  return path.relative(REPO_ROOT, file).split(path.sep).join('/');
}

// Converte um índice de caractere em nº de linha (1-based).
export function lineAt(src, index) {
  let line = 1;
  for (let i = 0; i < index && i < src.length; i++) {
    if (src[i] === '\n') line++;
  }
  return line;
}

// ---------------------------------------------------------------------------
// Sanitização de comentários PRESERVANDO offsets (troca conteúdo de comentário
// por espaços, mantém `\n`) — assim os números de linha continuam corretos e
// código comentado (ex.: `router.push` antigo, `<div @click>` morto) não gera
// falso-positivo.
// ---------------------------------------------------------------------------

// Apaga comentários JS (`//` e `/* */`), respeitando strings (', ", `).
export function blankJsComments(src) {
  const a = src.split('');
  let i = 0;
  const n = src.length;
  let str = null;
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (str) {
      if (c === '\\') { i += 2; continue; }
      if (c === str) str = null;
      i++;
      continue;
    }
    if (c === '/' && c2 === '/') {
      while (i < n && src[i] !== '\n') { a[i] = ' '; i++; }
      continue;
    }
    if (c === '/' && c2 === '*') {
      a[i] = ' '; a[i + 1] = ' '; i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] !== '\n') a[i] = ' ';
        i++;
      }
      if (i < n) { a[i] = ' '; a[i + 1] = ' '; i += 2; }
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { str = c; i++; continue; }
    i++;
  }
  return a.join('');
}

// Apaga comentários HTML `<!-- ... -->` preservando offsets/linhas.
export function blankHtmlComments(src) {
  return src.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
}

// Sanitiza um arquivo conforme a extensão. Para `.vue`, apaga comentários HTML
// em todo o arquivo e comentários JS somente dentro de blocos <script> (evita
// que apóstrofos no texto do template bagunçem a detecção de string do parser JS).
export function sanitizeSource(src, ext) {
  if (ext === '.vue') {
    let s = blankHtmlComments(src);
    s = s.replace(/<script[\s\S]*?<\/script>/gi, (block) => blankJsComments(block));
    return s;
  }
  // .jsx/.tsx/.js/.ts — comentários `{/* */}` do JSX são `/* */` p/ o blanker JS.
  return blankJsComments(src);
}

// ---------------------------------------------------------------------------
// CLI / baseline
// ---------------------------------------------------------------------------

export function parseArgs(argv) {
  const args = new Set(argv.slice(2));
  return {
    check: args.has('--check'),
    update: args.has('--update') || args.has('--write-baseline'),
    json: args.has('--json'),
  };
}

export function loadBaseline(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data.violations) ? data : { violations: [] };
  } catch {
    return null;
  }
}

export function saveBaseline(file, payload) {
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}
