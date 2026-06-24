import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

const openApiPath = path.resolve(process.cwd(), 'src/openapi/openapi.yaml');
const outputPath = path.resolve(process.cwd(), 'src/generated/operations.js');

const raw = fs.readFileSync(openApiPath, 'utf-8');
const spec = YAML.parse(raw);

const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);

function sanitizePathToKey(routePath, method) {
  return `${method.toLowerCase()}_${routePath.replace(/^\//, '').replace(/[{}]/g, '').replace(/\//g, '_').replace(/[^a-zA-Z0-9_]+/g, '_')}`;
}

const operations = [];

for (const [specPath, pathItem] of Object.entries(spec.paths || {})) {
  for (const [method, operation] of Object.entries(pathItem || {})) {
    if (!HTTP_METHODS.has(method.toLowerCase())) continue;
    const successStatus = Object.keys(operation.responses || {}).find((s) => String(s).startsWith('2'));
    operations.push({
      key: sanitizePathToKey(specPath, method),
      method: method.toLowerCase(),
      specPath,
      expressPath: specPath.replace(/\{([^}]+)\}/g, ':$1'),
      summary: operation.summary || '',
      tag: Array.isArray(operation.tags) ? operation.tags[0] : 'default',
      successStatus: Number(successStatus || 200),
    });
  }
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `export const operations = ${JSON.stringify(operations, null, 2)};\n`, 'utf-8');

console.log(`[ok] ${operations.length} operações regeneradas em ${outputPath}`);
