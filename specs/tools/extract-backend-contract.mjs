// =============================================================================
// extract-backend-contract.mjs — tabela de rotas EXTRAÍDA do backend real.
// -----------------------------------------------------------------------------
// Modo não-openapi do grounding de contrato (Forja 4.1 F4): apps gerados pela
// Forja (contaviva-360, neuroevolui, ...) NÃO são contract-first — o contrato
// real vive nos registros de rota Fastify/Express (`app.get('/v1/x', handler)`)
// em apps/<app>/api/src/**. Este módulo extrai DETERMINISTICAMENTE:
//   - a tabela de rotas (template + métodos), com {param} normalizado;
//   - por rota/método, os campos de payload LIDOS pelo handler (leituras claras:
//     `b.campo`, destructuring de req.body/req.query) — best-effort HONESTO:
//     uso não-rastreável do body (spread, passagem inteira a função, acesso
//     computado) marca o shape como ABERTO (ausência de campo NÃO é provável);
//   - campos de RESPOSTA quando todo `return` do handler é objeto literal
//     (ou const resolvível a literal); qualquer retorno opaco abre o shape;
//   - enums por campo quando o handler valida `CONST_ARRAY.includes(<campo>)`;
//   - se a rota aceita multipart (parser registrado no app OU handler que
//     trata multipart explicitamente).
//
// NUNCA conserta nem inventa: o que não dá para provar vira `open: true`
// (consumidores rebaixam para warning `field-unverifiable`). Sem mapa de
// sinônimos, sem heurística de correção.
//
// Consumidores: validate-refinement-contract.mjs (fallback quando não há
// openapi.yaml) e validate-view-contracts.mjs (validador de views do motor).
//
// Uso (debug): node extract-backend-contract.mjs --src apps/<app>/api/src
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
const SKIP_DIRS = new Set(['node_modules', 'vendor', 'generated', 'dist', 'coverage', 'test', 'tests', '__tests__']);
// chars que, antes de `/`, indicam início de REGEX literal (heurística padrão de scanners JS)
const REGEX_PREFIX_CHARS = '([{=,;:!&|?+*%<>~^-';
const REGEX_PREFIX_WORDS = new Set(['return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'new', 'do', 'else', 'instanceof']);

// Diretórios canônicos do backend de um app da plataforma (primeiro que existir).
export const backendSrcCandidates = (product) => [
  path.join('apps', product, 'api', 'src'),
];

// ---------------------------------------------------------------------------
// scanRegions(text) -> { masked, inString }
//   masked: texto com COMENTÁRIOS substituídos por espaços (strings intactas);
//   inString: Uint8Array — 1 quando o char pertence a string/template (inclui
//   as aspas; o código dentro de ${...} de template É código, não string).
// Usado para casar regex só em CÓDIGO e balancear parênteses ignorando strings.
// ---------------------------------------------------------------------------
export function scanRegions(text) {
  const n = text.length;
  const out = text.split('');
  const inString = new Uint8Array(n);
  // pilha de frames: {t:'code',depth} | {t:'tpl'} — templates aninham código via ${}
  const stack = [{ t: 'code', depth: 0 }];
  let lastCodeChar = '';
  let lastWord = '';
  const noteCode = (c) => {
    if (/\s/.test(c)) return;
    if (/[\w$]/.test(c)) lastWord += c; else lastWord = '';
    lastCodeChar = c;
  };
  let i = 0;
  while (i < n) {
    const frame = stack[stack.length - 1];
    const c = text[i]; const d = i + 1 < n ? text[i + 1] : '';
    if (frame.t === 'tpl') {
      if (c === '\\') { inString[i] = 1; if (i + 1 < n) inString[i + 1] = 1; i += 2; continue; }
      if (c === '`') { inString[i] = 1; stack.pop(); i++; continue; }
      if (c === '$' && d === '{') { inString[i] = 1; inString[i + 1] = 1; stack.push({ t: 'code', depth: 0 }); i += 2; continue; }
      inString[i] = 1; i++; continue;
    }
    // frame de código
    if (c === '/' && d === '/') { while (i < n && text[i] !== '\n') { out[i] = ' '; inString[i] = 1; i++; } continue; }
    if (c === '/' && d === '*') {
      while (i < n && !(text[i] === '*' && text[i + 1] === '/')) { if (text[i] !== '\n') out[i] = ' '; inString[i] = 1; i++; }
      if (i < n) { out[i] = ' '; out[i + 1] = ' '; inString[i] = 1; inString[i + 1] = 1; i += 2; }
      continue;
    }
    if (c === "'" || c === '"') {
      const q = c; inString[i] = 1; i++;
      while (i < n && text[i] !== q) {
        if (text[i] === '\\') { inString[i] = 1; i++; if (i < n) { inString[i] = 1; i++; } continue; }
        inString[i] = 1; i++;
      }
      if (i < n) { inString[i] = 1; i++; }
      lastCodeChar = q; lastWord = '';
      continue;
    }
    if (c === '`') { inString[i] = 1; stack.push({ t: 'tpl' }); i++; continue; }
    if (c === '/') {
      // regex literal vs divisão: depende do token anterior
      const isRegex = lastCodeChar === '' || REGEX_PREFIX_CHARS.includes(lastCodeChar) || REGEX_PREFIX_WORDS.has(lastWord);
      if (isRegex) {
        inString[i] = 1; i++;
        let inClass = false;
        while (i < n) {
          if (text[i] === '\\') { inString[i] = 1; i++; if (i < n) { inString[i] = 1; i++; } continue; }
          if (text[i] === '[') inClass = true;
          else if (text[i] === ']') inClass = false;
          else if (text[i] === '/' && !inClass) { inString[i] = 1; i++; break; }
          else if (text[i] === '\n') break; // regex nunca cruza linha — aborta com segurança
          inString[i] = 1; i++;
        }
        while (i < n && /[a-z]/i.test(text[i])) { inString[i] = 1; i++; } // flags
        lastCodeChar = '/'; lastWord = '';
        continue;
      }
    }
    if (c === '{') frame.depth++;
    else if (c === '}') {
      if (frame.depth > 0) frame.depth--;
      else if (stack.length > 1) { stack.pop(); inString[i] = 1; i++; continue; } // fecha ${}
    }
    noteCode(c);
    i++;
  }
  return { masked: out.join(''), inString };
}

// balanceia delimitadores a partir de openIdx (que aponta para o char de abertura)
// respeitando inString; devolve o índice do fechamento correspondente ou -1.
export function matchDelim(text, inString, openIdx, open, close) {
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    if (inString[i]) continue;
    if (text[i] === open) depth++;
    else if (text[i] === close) { depth--; if (depth === 0) return i; }
  }
  return -1;
}

// divide o miolo de uma chamada em argumentos top-level (vírgulas fora de (){}[])
export function splitTopLevelArgs(text, inString, start, end) {
  const args = []; let depth = 0; let s = start;
  for (let i = start; i < end; i++) {
    if (inString[i]) continue;
    const c = text[i];
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === ',' && depth === 0) { args.push({ start: s, end: i }); s = i + 1; }
  }
  if (s < end) args.push({ start: s, end });
  return args;
}

export const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;

// normaliza um path de registro de rota para template openapi-style: :id -> {id}
export function toTemplate(rawPath) {
  const params = [];
  const template = '/' + String(rawPath).split('/').filter(Boolean).map((seg) => {
    if (seg.startsWith(':')) { const name = seg.slice(1).replace(/\(.*\)$/, '') || 'param'; params.push(name); return '{' + name + '}'; }
    if (seg === '*' || seg === '**') { params.push('wildcard'); return '{wildcard}'; }
    return seg;
  }).join('/');
  return { template: rawPath === '/' ? '/' : template, params };
}

// extrai as chaves top-level de um objeto literal `{...}` (texto entre chaves).
// Devolve { keys:[], open } — spread/computed key => open (chaves não prováveis).
export function parseObjectLiteralKeys(text, inString, openBrace) {
  const close = matchDelim(text, inString, openBrace, '{', '}');
  if (close < 0) return { keys: [], open: true, end: openBrace };
  const keys = []; let open = false;
  let depth = 0; let segStart = openBrace + 1;
  const segments = [];
  for (let i = openBrace + 1; i < close; i++) {
    if (inString[i]) continue;
    const c = text[i];
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === ',' && depth === 0) { segments.push(text.slice(segStart, i)); segStart = i + 1; }
  }
  segments.push(text.slice(segStart, close));
  for (const seg of segments) {
    const s = seg.trim();
    if (!s) continue;
    if (s.startsWith('...')) { open = true; continue; }
    if (s.startsWith('[')) { open = true; continue; } // chave computada
    const m = s.match(/^(?:async\s+)?(?:get\s+|set\s+)?(['"]?)([A-Za-z_$][\w$]*)\1\s*(?::|\(|,|$|=)/) || s.match(/^(['"]?)([A-Za-z_$][\w$]*)\1\s*$/);
    if (m) keys.push(m[2]);
    else open = true; // segmento não parseável — não dá para provar as chaves
  }
  return { keys, open, end: close };
}

// ---------------------------------------------------------------------------
// coleta de acessos a um objeto-raiz (req.body / req.query) dentro do handler:
// leituras claras => fields; uso opaco => open (com motivo).
// ---------------------------------------------------------------------------
export function collectRootAccess(masked, inString, rootRxSource) {
  const fields = new Set();
  let open = false; const openReasons = [];
  const aliases = new Set();
  const prevNonSpace = (idx) => { let j = idx - 1; while (j >= 0 && /\s/.test(masked[j])) j--; return j; };

  const classify = (tokenRx, label) => {
    tokenRx.lastIndex = 0;
    let m;
    while ((m = tokenRx.exec(masked)) !== null) {
      if (inString[m.index]) continue;
      const after = m.index + m[0].length;
      // contexto ANTES: declaração (`const b = req.body`) ou destructuring (`{a} = b`)?
      const pj = prevNonSpace(m.index);
      if (pj >= 0 && masked[pj] === '=') {
        const pk = prevNonSpace(pj);
        if (pk >= 0 && masked[pk] === '}') {
          // destructuring: balanceia para trás até o `{` e extrai as chaves top-level
          let depth = 0; let openB = -1;
          for (let i = pk; i >= 0; i--) {
            if (inString[i]) continue;
            if (masked[i] === '}') depth++;
            else if (masked[i] === '{') { depth--; if (depth === 0) { openB = i; break; } }
          }
          if (openB >= 0) {
            const lit = parseObjectLiteralKeys(masked, inString, openB);
            for (const k of lit.keys) fields.add(k);
            if (masked.slice(openB, pk + 1).includes('...')) open = true; // rest => leva o resto todo
          }
          continue;
        }
        // alias: const X = req.body (|| {} / ?? {})
        const declM = masked.slice(0, pj).match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*$/);
        if (declM) { aliases.add(declM[1]); continue; }
        // reatribuição x = req.body — trata o LHS como alias também (best-effort)
        const idM = masked.slice(0, pj).match(/([A-Za-z_$][\w$]*)\s*$/);
        if (idM) { aliases.add(idM[1]); continue; }
      }
      // declaração/atribuição do PRÓPRIO alias (LHS): `const b = ...`, `b = ...` — não é uso do body
      if (/(?:const|let|var)\s+$/.test(masked.slice(Math.max(0, m.index - 8), m.index))) continue;
      // contexto DEPOIS: leitura de propriedade?
      let k = after;
      while (k < masked.length && /\s/.test(masked[k])) k++;
      if (masked[k] === '=' && masked[k + 1] !== '=' && masked[k + 1] !== '>') continue; // LHS de atribuição
      const two = masked.slice(k, k + 2);
      if (masked[k] === '.' || two === '?.') {
        const propM = masked.slice(k).match(/^\??\.\s*([A-Za-z_$][\w$]*)/);
        if (propM) { fields.add(propM[1]); continue; }
      }
      if (masked[k] === '[') { open = true; openReasons.push(label + ': acesso computado'); continue; }
      // uso opaco (passado inteiro, spread, for-in, JSON.stringify, ...)
      open = true; openReasons.push(label + ': uso não-rastreável (objeto usado inteiro)');
    }
  };

  classify(new RegExp('(?<![.\\w$])' + rootRxSource + '(?![\\w$])', 'g'), 'root');
  for (const a of aliases) classify(new RegExp('(?<![.\\w$])' + a.replace(/\$/g, '\\$') + '(?![\\w$])', 'g'), 'alias ' + a);
  return { fields, open, openReasons, aliases };
}

// coleta RECURSIVA de chaves de um objeto literal (p/ campos de RESPOSTA — o
// openapi coleta propriedades aninhadas; aqui espelhamos essa profundidade).
export function collectLiteralFieldsDeep(text, inString, openBrace, fields, state, depth = 0) {
  if (depth > 8) return;
  const { entries, open } = parseObjectEntries(text, inString, openBrace);
  if (open) state.open = true;
  for (const e of entries) {
    fields.add(e.key);
    const vs = e.valueStart;
    let k = vs;
    while (k < text.length && /\s/.test(text[k])) k++;
    if (text[k] === '{') collectLiteralFieldsDeep(text, inString, k, fields, state, depth + 1);
  }
}

// entradas chave->valor de um objeto literal (top-level), com posições
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
      const rel = m[3] === ':' ? seg.indexOf(':') + 1 : seg.indexOf('(');
      entries.push({ key: m[2], valueStart: s + rel, valueEnd: e, kind: m[3] === ':' ? 'value' : 'method' });
      continue;
    }
    const sh = seg.match(/^\s*([A-Za-z_$][\w$]*)\s*$/);
    if (sh) { entries.push({ key: sh[1], valueStart: s + seg.indexOf(sh[1]), valueEnd: e, kind: 'shorthand' }); continue; }
    open = true;
  }
  return { entries, end: close, open };
}

// colunas citadas no SQL do handler (SELECT lista FROM / RETURNING lista /
// INSERT INTO t(cols)). Fonte da verdade dos campos ROW-level das respostas
// (`{ data: rows }`). `SELECT *` ou expressão não-parseável => open.
export function collectSqlFields(handlerMasked) {
  const fields = new Set();
  let open = false;
  const addList = (list) => {
    let depth = 0; let s = 0; const items = [];
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if ('(['.includes(c)) depth++;
      else if (')]'.includes(c)) depth--;
      else if (c === ',' && depth === 0) { items.push(list.slice(s, i)); s = i + 1; }
    }
    items.push(list.slice(s));
    for (const raw of items) {
      const it = raw.trim();
      if (!it) continue;
      if (it === '*' || it.endsWith('.*')) { open = true; continue; }
      const asM = it.match(/\s+AS\s+([A-Za-z_][\w]*)\s*$/i);
      if (asM) { fields.add(asM[1]); continue; }
      const colM = it.match(/^(?:[A-Za-z_][\w]*\.)?([A-Za-z_][\w]*)$/);
      if (colM) { fields.add(colM[1]); continue; }
      open = true; // expressão sem alias — coluna resultante não é provável
    }
  };
  for (const m of handlerMasked.matchAll(/SELECT\s+([\s\S]*?)\s+FROM\b/gi)) addList(m[1]);
  for (const m of handlerMasked.matchAll(/RETURNING\s+([^;`'"]+)/gi)) addList(m[1]);
  for (const m of handlerMasked.matchAll(/INSERT\s+INTO\s+[A-Za-z_][\w]*\s*\(([^)]*)\)/gi)) addList(m[1]);
  return { fields, open };
}

// enums declarados no módulo: const STATUS = ['a','b',...] (somente strings)
export function collectModuleEnums(masked, inString) {
  const enums = new Map();
  const rx = /const\s+([A-Za-z_$][\w$]*)\s*=\s*\[/g;
  let m;
  while ((m = rx.exec(masked)) !== null) {
    if (inString[m.index]) continue;
    const openB = m.index + m[0].length - 1;
    const close = matchDelim(masked, inString, openB, '[', ']');
    if (close < 0) continue;
    const body = masked.slice(openB + 1, close);
    const items = [...body.matchAll(/(['"])((?:\\.|(?!\1).)*)\1/g)].map((x) => x[2]);
    // só vale como enum se o array é 100% strings literais (sem expressões)
    const residue = body.replace(/(['"])((?:\\.|(?!\1).)*)\1/g, '').replace(/[,\s]/g, '');
    if (items.length > 0 && residue === '') enums.set(m[1], items);
  }
  return enums;
}

// analisa o texto do handler de UMA rota. lastArgMasked/lastArgInString = o
// ÚLTIMO argumento do registro (o handler em si, sem opts) — usado para captar
// retorno implícito de arrow: async (req) => ({ ... }) (padrão de /health, /me).
export function analyzeHandler(handlerMasked, handlerInString, moduleEnums, lastArgMasked, lastArgInString) {
  const body = collectRootAccess(handlerMasked, handlerInString, 'req\\s*\\.\\s*body');
  const query = collectRootAccess(handlerMasked, handlerInString, 'req\\s*\\.\\s*query');

  // enums: CONST.includes(expr) onde expr referencia um campo de body conhecido
  const enums = {};
  const incRx = /([A-Za-z_$][\w$]*)\s*\.includes\(\s*([^)]*)\)/g;
  let m;
  while ((m = incRx.exec(handlerMasked)) !== null) {
    if (handlerInString[m.index]) continue;
    const values = moduleEnums.get(m[1]);
    if (!values) continue;
    const argIdent = (m[2].match(/([A-Za-z_$][\w$]*)\s*$/) || [])[1];
    if (argIdent && body.fields.has(argIdent)) enums[argIdent] = values;
  }

  // campos de resposta: return {literal} / return <constLiteral> / reply.send({...}) / res.json({...})
  // Coleta RECURSIVA (chaves aninhadas contam, como no openapi). responseFields =
  // só o 1º nível (consumido pelo check de leitura das views); deepResponseFields =
  // todos os níveis + colunas de SQL (consumido pela união refinement-compat).
  const responseFields = new Set();
  const deepResponseFields = new Set();
  let responseOpen = false;
  const addLiteral = (openBrace) => {
    const lit = parseObjectLiteralKeys(handlerMasked, handlerInString, openBrace);
    for (const k of lit.keys) responseFields.add(k);
    if (lit.open) responseOpen = true;
    const state = { open: false };
    collectLiteralFieldsDeep(handlerMasked, handlerInString, openBrace, deepResponseFields, state, 0);
  };
  const localConsts = new Map(); // ident -> índice do `{` do literal
  const constRx = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\{/g;
  while ((m = constRx.exec(handlerMasked)) !== null) {
    if (handlerInString[m.index]) continue;
    localConsts.set(m[1], m.index + m[0].length - 1);
  }
  const retRx = /(?<![.\w$])return(?![\w$])/g;
  while ((m = retRx.exec(handlerMasked)) !== null) {
    if (handlerInString[m.index]) continue;
    let k = m.index + 6;
    while (k < handlerMasked.length && /[ \t]/.test(handlerMasked[k])) k++;
    const rest = handlerMasked.slice(k);
    if (rest.startsWith(';') || rest.startsWith('\n') || rest === '') continue; // return vazio
    if (handlerMasked[k] === '{') { addLiteral(k); continue; }
    if (handlerMasked[k] === "'" || handlerMasked[k] === '"' || handlerMasked[k] === '`') continue; // string => sem campos legíveis
    const identM = rest.match(/^([A-Za-z_$][\w$]*)\s*[;\n]/);
    if (identM && localConsts.has(identM[1])) { addLiteral(localConsts.get(identM[1])); continue; }
    if (/^[\w$.[\]]+\.join\(/.test(rest)) continue; // .join() => string
    responseOpen = true; // retorno opaco (rows[0], chamada, expressão) — shape não provável
  }
  const sendRx = /(?:reply\s*\.\s*send|res\s*\.\s*json|res\s*\.\s*send)\s*\(\s*\{/g;
  while ((m = sendRx.exec(handlerMasked)) !== null) {
    if (handlerInString[m.index]) continue;
    addLiteral(m.index + m[0].length - 1);
  }
  // retorno IMPLÍCITO do arrow do handler: async (req) => ({ ... }) — ancorado no
  // início do último argumento (arrows aninhados em .map() etc. NÃO contam aqui).
  if (lastArgMasked) {
    const im = lastArgMasked.match(/^\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*\(\s*\{/);
    if (im) {
      const openB = lastArgMasked.indexOf('{', im[0].length - 1);
      const lit = parseObjectLiteralKeys(lastArgMasked, lastArgInString, openB);
      for (const k of lit.keys) responseFields.add(k);
      if (lit.open) responseOpen = true;
      const state = { open: false };
      collectLiteralFieldsDeep(lastArgMasked, lastArgInString, openB, deepResponseFields, state, 0);
    }
  }

  const handlesMultipart = /multipart/i.test(handlerMasked);
  const sql = collectSqlFields(handlerMasked);
  return {
    bodyFields: body.fields, bodyOpen: body.open,
    queryFields: query.fields, queryOpen: query.open,
    responseFields, responseOpen, deepResponseFields,
    sqlFields: sql.fields, sqlOpen: sql.open,
    enums, handlesMultipart,
  };
}

// ---------------------------------------------------------------------------
// extração de rotas de UM arquivo-fonte
// ---------------------------------------------------------------------------
export function extractRoutesFromSource(text, file) {
  const { masked, inString } = scanRegions(text);
  const moduleEnums = collectModuleEnums(masked, inString);
  const fileMultipart = /addContentTypeParser\(\s*['"`]multipart/i.test(masked) || /@fastify\/multipart|fastify-multipart|\bmulter\b/.test(masked);
  const routes = [];
  const rx = /(?<![.\w$])([A-Za-z_$][\w$]*)\s*\.\s*(get|post|put|patch|delete|head|options)\s*\(/g;
  let m;
  while ((m = rx.exec(masked)) !== null) {
    if (inString[m.index]) continue;
    const openParen = m.index + m[0].length - 1;
    const closeParen = matchDelim(masked, inString, openParen, '(', ')');
    if (closeParen < 0) continue;
    const args = splitTopLevelArgs(masked, inString, openParen + 1, closeParen);
    if (args.length < 2) continue; // registro de rota tem path + handler (Map.get('/x') não tem)
    const a0 = masked.slice(args[0].start, args[0].end).trim();
    const litM = a0.match(/^(['"])(\/[^'"]*)\1$/);
    if (!litM) continue;
    const rawPath = litM[2].split(/[?#]/)[0];
    const { template, params } = toTemplate(rawPath);
    const handlerStart = args[1].start;
    const handlerMasked = masked.slice(handlerStart, closeParen);
    const handlerInString = inString.subarray(handlerStart, closeParen);
    const lastArg = args[args.length - 1];
    const analysis = analyzeHandler(
      handlerMasked, handlerInString, moduleEnums,
      masked.slice(lastArg.start, lastArg.end), inString.subarray(lastArg.start, lastArg.end),
    );
    routes.push({
      template, params, method: m[2].toLowerCase(),
      file, line: lineOf(text, m.index),
      ...analysis,
    });
  }
  return { routes, fileMultipart };
}

// ---------------------------------------------------------------------------
// extractBackendContract(srcDir) — varre apps/<app>/api/src/** e monta a tabela.
// Shape compatível com parseContract() do validate-refinement-contract
// ({ paths:[{template, methods, fields, open}] }) + granularidade por método.
// ---------------------------------------------------------------------------
export function extractBackendContract(srcDir) {
  const files = [];
  const walk = (dir) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name)); continue; }
      if (/\.(mjs|js|cjs)$/.test(e.name) && !/\.test\./.test(e.name)) files.push(path.join(dir, e.name));
    }
  };
  walk(srcDir);
  files.sort();

  let multipart = false;
  const byTemplate = new Map();
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    const { routes, fileMultipart } = extractRoutesFromSource(text, path.relative(srcDir, f).replace(/\\/g, '/'));
    if (fileMultipart) multipart = true;
    for (const r of routes) {
      let entry = byTemplate.get(r.template);
      if (!entry) {
        entry = { template: r.template, methods: new Set(), fields: new Set(), open: false, ops: {} };
        byTemplate.set(r.template, entry);
      }
      entry.methods.add(r.method);
      for (const p of r.params) entry.fields.add(p);
      for (const s of [r.bodyFields, r.queryFields, r.responseFields, r.deepResponseFields, r.sqlFields]) for (const k of s) entry.fields.add(k);
      if (r.bodyOpen || r.queryOpen || r.responseOpen || r.sqlOpen) entry.open = true;
      entry.ops[r.method] = {
        bodyFields: r.bodyFields, bodyOpen: r.bodyOpen,
        queryFields: r.queryFields, queryOpen: r.queryOpen,
        responseFields: r.responseFields, responseOpen: r.responseOpen,
        enums: r.enums, handlesMultipart: r.handlesMultipart,
        file: r.file, line: r.line,
      };
    }
  }
  return {
    mode: 'extracted',
    multipart,
    paths: [...byTemplate.values()],
    stats: { files: files.length, routes: [...byTemplate.values()].reduce((s, e) => s + e.methods.size, 0) },
  };
}

// ---------------- CLI de depuração ----------------
function main() {
  const argv = process.argv.slice(2);
  let src = null;
  for (let i = 0; i < argv.length; i++) if (argv[i] === '--src') src = argv[++i];
  if (!src) { console.error('uso: node extract-backend-contract.mjs --src apps/<app>/api/src'); process.exit(2); }
  const contract = extractBackendContract(path.resolve(process.cwd(), src));
  const printable = {
    ...contract,
    paths: contract.paths.map((e) => ({
      template: e.template, methods: [...e.methods], open: e.open,
      fields: [...e.fields].sort(),
      ops: Object.fromEntries(Object.entries(e.ops).map(([mth, op]) => [mth, {
        bodyFields: [...op.bodyFields].sort(), bodyOpen: op.bodyOpen,
        queryFields: [...op.queryFields].sort(), queryOpen: op.queryOpen,
        responseFields: [...op.responseFields].sort(), responseOpen: op.responseOpen,
        enums: op.enums, handlesMultipart: op.handlesMultipart, source: op.file + ':' + op.line,
      }])),
    })),
  };
  console.log(JSON.stringify(printable, null, 2));
}

if (process.argv[1] && process.argv[1].endsWith('extract-backend-contract.mjs')) main();
