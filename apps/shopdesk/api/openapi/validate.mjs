// validate.mjs — validador de contrato contract-first SEM dependências novas.
//
// Faz (a) parse do OpenAPI (YAML, parser de subconjunto próprio — zero deps) e
// (b) checa DRIFT bidirecional entre o contrato e as rotas REAIS do server.js:
//   - toda rota app.get/app.post(...) do server.js DEVE existir no OpenAPI;
//   - todo path+método documentado no OpenAPI DEVE existir no server.js.
// Qualquer divergência reprova (exit 1) — assim mudança de rota obriga atualizar o
// openapi.yaml no MESMO PR (REQ-STOCKPILOT-0006).
//
// As funções puras (parseYaml/extractDocumentedRoutes/extractServerRoutes/diffRoutes)
// são exportadas e testáveis SEM Postgres e SEM I/O.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'];

// ---------------------------------------------------------------------------
// (a) Parser de YAML — subconjunto suficiente para OpenAPI 3.1 como o autoramos:
// mapas aninhados por indentação (2 espaços), listas com "- ", escalares com
// aspas opcionais e block scalars ">-"/"|" de uma chave. Sem âncoras/multi-doc.
// Não é um parser YAML completo; é determinístico e cobre o nosso contrato.
// ---------------------------------------------------------------------------
export function parseYaml(text) {
  // Normaliza quebras de linha e remove linhas de comentário puro e linhas vazias.
  const rawLines = text.replace(/\r\n?/g, '\n').split('\n');
  const lines = [];
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const noIndent = line.replace(/^\s+/, '');
    if (noIndent === '' || noIndent.startsWith('#')) continue; // vazio / comentário puro
    lines.push(line);
  }

  let idx = 0;
  const peekIndent = (line) => line.length - line.replace(/^\s+/, '').length;

  function parseBlock(minIndent) {
    // Decide se o bloco é lista (linhas começam com "- ") ou mapa.
    if (idx >= lines.length) return null;
    const first = lines[idx];
    const indent = peekIndent(first);
    if (indent < minIndent) return null;
    const isList = first.replace(/^\s+/, '').startsWith('- ') || first.trim() === '-';
    return isList ? parseList(indent) : parseMap(indent);
  }

  function parseMap(indent) {
    const obj = {};
    while (idx < lines.length) {
      const line = lines[idx];
      const ci = peekIndent(line);
      if (ci < indent) break;
      if (ci > indent) break; // pertence a um filho já consumido
      const content = line.slice(indent);
      const m = /^("(?:[^"\\]|\\.)*"|'[^']*'|[^:]+):(?:\s+(.*))?$/.exec(content);
      if (!m) { idx++; continue; }
      const key = unquote(m[1].trim());
      const inlineRaw = m[2] === undefined ? '' : m[2].trim();
      idx++;
      if (inlineRaw === '' ) {
        // Valor em bloco (mapa/lista filho) — ou chave vazia.
        const child = parseBlock(indent + 1);
        obj[key] = child === null ? null : child;
      } else if (inlineRaw === '>-' || inlineRaw === '>' || inlineRaw === '|' || inlineRaw === '|-') {
        obj[key] = parseBlockScalar(indent);
      } else {
        obj[key] = scalar(inlineRaw);
      }
    }
    return obj;
  }

  function parseList(indent) {
    const arr = [];
    while (idx < lines.length) {
      const line = lines[idx];
      const ci = peekIndent(line);
      if (ci !== indent) break;
      const content = line.slice(indent);
      if (!content.startsWith('-')) break;
      const after = content.slice(1).replace(/^\s+/, ''); // texto após "- "
      if (after === '') {
        // Item em bloco na(s) próxima(s) linha(s).
        idx++;
        const child = parseBlock(indent + 1);
        arr.push(child);
        continue;
      }
      // Item inline: pode ser escalar ("- foo") ou mapa ("- name: id").
      const km = /^("(?:[^"\\]|\\.)*"|'[^']*'|[^:]+):(?:\s+(.*))?$/.exec(after);
      if (km) {
        // Trata o "- " como início de um mapa: reescreve a linha sem o "- " e
        // reparseia como mapa com indentação deslocada (indent + 2).
        const childIndent = indent + (content.length - content.slice(1).replace(/^\s+/, '').length);
        lines[idx] = ' '.repeat(childIndent) + after;
        const obj = parseMap(childIndent);
        arr.push(obj);
      } else {
        arr.push(scalar(after));
        idx++;
      }
    }
    return arr;
  }

  function parseBlockScalar(parentIndent) {
    const parts = [];
    while (idx < lines.length) {
      const line = lines[idx];
      const ci = peekIndent(line);
      if (ci <= parentIndent && line.trim() !== '') break;
      parts.push(line.trim());
      idx++;
    }
    return parts.join(' ').trim();
  }

  function unquote(s) {
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      return s.slice(1, -1);
    }
    return s;
  }

  function scalar(s) {
    const v = unquote(s);
    return v;
  }

  const root = parseBlock(0);
  return root === null ? {} : root;
}

// ---------------------------------------------------------------------------
// (b) Extração das rotas documentadas no OpenAPI → Set de "METHOD path".
// Paths já vêm com {param}; normalizamos {param} → {} para casar com o server.
// ---------------------------------------------------------------------------
export function normalizePath(p) {
  // {anything} → {} para comparar independente do nome do parâmetro.
  return p.replace(/\{[^}]+\}/g, '{}');
}

export function extractDocumentedRoutes(openapi) {
  const out = new Set();
  const paths = openapi && openapi.paths;
  if (!paths || typeof paths !== 'object') return out;
  for (const [rawPath, item] of Object.entries(paths)) {
    if (!item || typeof item !== 'object') continue;
    for (const method of HTTP_METHODS) {
      if (item[method]) out.add(method.toUpperCase() + ' ' + normalizePath(rawPath));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Extração das rotas implementadas no server.js → Set de "METHOD path".
// Converte express :param → {} e normaliza igual ao OpenAPI.
// ---------------------------------------------------------------------------
export function extractServerRoutes(serverSource) {
  const out = new Set();
  const re = /app\.(get|post|put|delete|patch|options|head)\s*\(\s*(['"`])([^'"`]+)\2/g;
  let m;
  while ((m = re.exec(serverSource)) !== null) {
    const method = m[1].toUpperCase();
    const expressPath = m[3];
    const openapiPath = expressPath.replace(/:[A-Za-z0-9_]+/g, '{}');
    out.add(method + ' ' + normalizePath(openapiPath));
  }
  return out;
}

// Diferença bidirecional. missingInOpenapi: implementadas mas NÃO documentadas.
// missingInServer: documentadas mas NÃO implementadas.
export function diffRoutes(serverRoutes, documentedRoutes) {
  const missingInOpenapi = [...serverRoutes].filter((r) => !documentedRoutes.has(r)).sort();
  const missingInServer = [...documentedRoutes].filter((r) => !serverRoutes.has(r)).sort();
  return { missingInOpenapi, missingInServer, ok: missingInOpenapi.length === 0 && missingInServer.length === 0 };
}

// Orquestra a validação a partir de fontes em memória (testável sem I/O).
export function validateSources({ openapiText, serverSource }) {
  const openapi = parseYaml(openapiText);
  if (!openapi || typeof openapi !== 'object' || !openapi.openapi) {
    throw new Error('OpenAPI inválido: campo "openapi" ausente (parse falhou?)');
  }
  const documented = extractDocumentedRoutes(openapi);
  if (documented.size === 0) throw new Error('OpenAPI sem paths documentados');
  const server = extractServerRoutes(serverSource);
  if (server.size === 0) throw new Error('Nenhuma rota app.get/post encontrada no server.js');
  const result = diffRoutes(server, documented);
  return { ...result, counts: { documented: documented.size, implemented: server.size }, openapi };
}

// Validação a partir de arquivos do disco.
export function validateFiles({ openapiPath, serverPath }) {
  const openapiText = readFileSync(openapiPath, 'utf8');
  const serverSource = readFileSync(serverPath, 'utf8');
  return validateSources({ openapiText, serverSource });
}

// ---------------------------------------------------------------------------
// CLI: `node openapi/validate.mjs` (npm run validate:openapi)
// ---------------------------------------------------------------------------
function isMain() {
  return process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
}

if (isMain()) {
  const here = dirname(fileURLToPath(import.meta.url));
  const openapiPath = resolve(here, 'openapi.yaml');
  const serverPath = resolve(here, '..', 'src', 'server.js');
  try {
    const r = validateFiles({ openapiPath, serverPath });
    if (r.ok) {
      console.log(`[validate:openapi] OK — ${r.counts.implemented} rotas implementadas, ${r.counts.documented} documentadas, sem drift.`);
      process.exit(0);
    }
    console.error('[validate:openapi] DRIFT detectado entre server.js e openapi.yaml:');
    if (r.missingInOpenapi.length) {
      console.error('  Rotas implementadas mas NÃO documentadas no OpenAPI:');
      for (const x of r.missingInOpenapi) console.error('    - ' + x);
    }
    if (r.missingInServer.length) {
      console.error('  Rotas documentadas mas NÃO implementadas no server.js:');
      for (const x of r.missingInServer) console.error('    - ' + x);
    }
    process.exit(1);
  } catch (e) {
    console.error('[validate:openapi] ERRO: ' + e.message);
    process.exit(1);
  }
}
