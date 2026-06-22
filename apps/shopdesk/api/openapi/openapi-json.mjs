// openapi-json.mjs — converte o openapi.yaml canônico em um objeto JS COMPLETO e resolve $ref,
// para a API servir GET /v1/openapi.json (consumido pela tela de documentação SEM parser no front).
//
// Por que um parser próprio (e não a lib `yaml`): o padrão da plataforma evita dependências novas e
// o contrato é escrito em um subconjunto bem-definido de YAML (mapas/listas por indentação de 2
// espaços + escalares de fluxo `{ ... }` / `[ ... ]` de 1–2 níveis + aspas opcionais). Diferente do
// validate.mjs (que só precisa enxergar paths→métodos para o anti-drift), AQUI precisamos do grafo
// inteiro (parameters, requestBody, schemas), incluindo o açúcar de fluxo `{ }`/`[ ]` — então este
// parser entende fluxo aninhado. As funções puras são exportadas e testadas sem I/O.

// --- tokenizer de valor escalar/fluxo --------------------------------------
// Converte um valor de fluxo YAML (`{ a: 1, b: [x, y] }`, `[a, b]`, `"texto"`, `123`, `true`) em JS.
export function parseFlow(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (s === '') return null;
  if (s[0] === '{' || s[0] === '[') {
    const { value, end } = parseFlowAt(s, 0);
    // ignora sobra após o fechamento (não esperada no contrato)
    void end;
    return value;
  }
  return parseScalar(s);
}

function parseFlowAt(s, i) {
  i = skipWs(s, i);
  const ch = s[i];
  if (ch === '{') return parseFlowMap(s, i);
  if (ch === '[') return parseFlowSeq(s, i);
  return parseFlowScalar(s, i);
}

function parseFlowMap(s, i) {
  const obj = {};
  i++; // consume {
  i = skipWs(s, i);
  if (s[i] === '}') return { value: obj, end: i + 1 };
  while (i < s.length) {
    i = skipWs(s, i);
    // chave: até ':' no nível atual (sem entrar em fluxo aninhado)
    const keyRes = readFlowKey(s, i);
    const key = keyRes.key;
    i = skipWs(s, keyRes.end);
    if (s[i] !== ':') break;
    i = skipWs(s, i + 1);
    const valRes = parseFlowAt(s, i);
    obj[key] = valRes.value;
    i = skipWs(s, valRes.end);
    if (s[i] === ',') { i++; continue; }
    if (s[i] === '}') { i++; break; }
    break;
  }
  return { value: obj, end: i };
}

function parseFlowSeq(s, i) {
  const arr = [];
  i++; // consume [
  i = skipWs(s, i);
  if (s[i] === ']') return { value: arr, end: i + 1 };
  while (i < s.length) {
    i = skipWs(s, i);
    const valRes = parseFlowAt(s, i);
    arr.push(valRes.value);
    i = skipWs(s, valRes.end);
    if (s[i] === ',') { i++; continue; }
    if (s[i] === ']') { i++; break; }
    break;
  }
  return { value: arr, end: i };
}

function readFlowKey(s, i) {
  if (s[i] === '"' || s[i] === "'") {
    const q = s[i];
    let j = i + 1, buf = '';
    while (j < s.length && s[j] !== q) { if (s[j] === '\\') { buf += s[j + 1]; j += 2; continue; } buf += s[j]; j++; }
    return { key: buf, end: j + 1 };
  }
  let j = i, buf = '';
  while (j < s.length && s[j] !== ':' && s[j] !== ',' && s[j] !== '}' && s[j] !== ']') { buf += s[j]; j++; }
  return { key: buf.trim(), end: j };
}

function parseFlowScalar(s, i) {
  if (s[i] === '"' || s[i] === "'") {
    const q = s[i];
    let j = i + 1, buf = '';
    while (j < s.length && s[j] !== q) { if (s[j] === '\\') { buf += s[j + 1]; j += 2; continue; } buf += s[j]; j++; }
    return { value: buf, end: j + 1 };
  }
  let j = i, buf = '';
  while (j < s.length && s[j] !== ',' && s[j] !== '}' && s[j] !== ']') { buf += s[j]; j++; }
  return { value: coerce(buf.trim()), end: j };
}

function parseScalar(s) {
  if ((s[0] === '"' && s.endsWith('"')) || (s[0] === "'" && s.endsWith("'"))) return s.slice(1, -1);
  return coerce(s);
}

function coerce(t) {
  if (t === '') return '';
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t === 'null' || t === '~') return null;
  if (/^-?\d+$/.test(t)) return Number(t);
  if (/^-?\d*\.\d+$/.test(t)) return Number(t);
  if ((t[0] === '"' && t.endsWith('"')) || (t[0] === "'" && t.endsWith("'"))) return t.slice(1, -1);
  return t;
}

function skipWs(s, i) { while (i < s.length && (s[i] === ' ' || s[i] === '\t')) i++; return i; }

// --- parser por indentação (mapas/listas em bloco; valores podem ser fluxo) --
const KEY_RE = /^("(?:[^"\\]|\\.)*"|'[^']*'|[^:]+):(?:\s+([\s\S]*))?$/;

export function parseYamlFull(text) {
  const raw = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const lines = [];
  for (const line of raw) {
    const trimmed = line.replace(/^\s+/, '');
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    lines.push(line);
  }
  let idx = 0;
  const indentOf = (l) => l.length - l.replace(/^\s+/, '').length;
  const unq = (s) => ((s[0] === '"' && s.endsWith('"')) || (s[0] === "'" && s.endsWith("'")) ? s.slice(1, -1) : s);

  function parseBlock(min) {
    if (idx >= lines.length) return null;
    const ind = indentOf(lines[idx]);
    if (ind < min) return null;
    const head = lines[idx].slice(ind);
    return head.startsWith('- ') || head === '-' ? parseList(ind) : parseMap(ind);
  }

  function parseMap(indent) {
    const obj = {};
    while (idx < lines.length) {
      const ind = indentOf(lines[idx]);
      if (ind < indent) break;
      if (ind > indent) break;
      const content = lines[idx].slice(indent);
      const m = KEY_RE.exec(content);
      if (!m) { idx++; continue; }
      const key = unq(m[1].trim());
      const inline = m[2] === undefined ? '' : m[2].trim();
      idx++;
      if (inline === '') {
        obj[key] = parseBlock(indent + 1);
      } else if (inline[0] === '{' || inline[0] === '[') {
        obj[key] = parseFlow(inline);
      } else if (inline === '|' || inline === '>' || inline === '|-' || inline === '>-') {
        obj[key] = parseBlockScalar(indent);
      } else {
        obj[key] = parseScalar(inline);
      }
    }
    return obj;
  }

  function parseList(indent) {
    const arr = [];
    while (idx < lines.length) {
      const ind = indentOf(lines[idx]);
      if (ind !== indent) break;
      const content = lines[idx].slice(indent);
      if (!content.startsWith('-')) break;
      const after = content.slice(1).replace(/^\s+/, '');
      if (after === '') { idx++; arr.push(parseBlock(indent + 1)); continue; }
      if (after[0] === '{' || after[0] === '[') { arr.push(parseFlow(after)); idx++; continue; }
      const km = KEY_RE.exec(after);
      if (km) {
        const childIndent = indent + (content.length - content.slice(1).replace(/^\s+/, '').length);
        lines[idx] = ' '.repeat(childIndent) + after;
        arr.push(parseMap(childIndent));
      } else {
        arr.push(parseScalar(after));
        idx++;
      }
    }
    return arr;
  }

  function parseBlockScalar(parentIndent) {
    const parts = [];
    while (idx < lines.length) {
      const ind = indentOf(lines[idx]);
      if (ind <= parentIndent && lines[idx].trim() !== '') break;
      parts.push(lines[idx].trim());
      idx++;
    }
    return parts.join(' ').trim();
  }

  const root = parseBlock(0);
  return root === null ? {} : root;
}

// --- resolução de $ref (componentes locais "#/...") -------------------------
export function resolveRefs(doc) {
  const root = doc;
  const seen = new WeakSet();
  function lookup(ref) {
    if (typeof ref !== 'string' || !ref.startsWith('#/')) return null;
    let node = root;
    for (const seg of ref.slice(2).split('/')) {
      if (node == null) return null;
      node = node[seg];
    }
    return node;
  }
  function walk(node) {
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === 'object') {
      if (seen.has(node)) return node;
      seen.add(node);
      if (typeof node.$ref === 'string') {
        const target = lookup(node.$ref);
        if (target && typeof target === 'object') return walk(JSON.parse(JSON.stringify(target)));
      }
      const out = {};
      for (const [k, v] of Object.entries(node)) out[k] = walk(v);
      return out;
    }
    return node;
  }
  return walk(root);
}

// Converte o texto YAML do contrato em objeto JS completo, com $ref resolvidos.
export function openapiToJson(yamlText) {
  return resolveRefs(parseYamlFull(yamlText));
}
