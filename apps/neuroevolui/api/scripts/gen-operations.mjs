// gen-operations.mjs — gera src/generated/operations.js a partir do OpenAPI canônico.
// Roda com: node scripts/gen-operations.mjs (no diretório api/)
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const openApiPath = path.join(root, 'src', 'openapi', 'openapi.yaml');
const outDir = path.join(root, 'src', 'generated');
const outputPath = path.join(outDir, 'operations.js');

const raw = fs.readFileSync(openApiPath, 'utf-8');
const spec = YAML.parse(raw);

function pathToKey(specPath, method) {
  return `${method.toLowerCase()}_${specPath
    .replace(/^\//, '')
    .replace(/[{}]/g, '')
    .replace(/\//g, '_')
    .replace(/[^a-zA-Z0-9_]+/g, '_')}`;
}

const operations = [];

for (const [specPath, methods] of Object.entries(spec.paths || {})) {
  for (const [method, operation] of Object.entries(methods || {})) {
    if (['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].indexOf(method.toLowerCase()) === -1) continue;
    const successStatus = Object.keys(operation.responses || {}).find((s) => String(s).startsWith('2'));
    operations.push({
      key: pathToKey(specPath, method),
      method: method.toLowerCase(),
      specPath,
      fastifyPath: specPath.replace(/\{([^}]+)\}/g, ':$1'),
      summary: operation.summary || '',
      tag: Array.isArray(operation.tags) ? operation.tags[0] : 'default',
      successStatus: Number(successStatus || 200),
    });
  }
}

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const content = [
  '// AUTO-GERADO por scripts/gen-operations.mjs — NÃO EDITAR MANUALMENTE.',
  '// Fonte: src/openapi/openapi.yaml. Regenere com: npm run gen:operations',
  '',
  '/**',
  ' * @typedef {{',
  ' *   key: string,',
  ' *   method: string,',
  ' *   specPath: string,',
  ' *   fastifyPath: string,',
  ' *   summary: string,',
  ' *   tag: string,',
  ' *   successStatus: number',
  ' * }} OperationDefinition',
  ' */',
  '',
  `/** @type {OperationDefinition[]} */`,
  `export const operations = ${JSON.stringify(operations, null, 2)};`,
  '',
  `export const operationKeys = /** @type {const} */ (${JSON.stringify(operations.map((o) => o.key))});`,
  '',
].join('\n');

fs.writeFileSync(outputPath, content, 'utf-8');
console.log(`[gen:operations] ${operations.length} operações regeneradas em ${outputPath}`);
