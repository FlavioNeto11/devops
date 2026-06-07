import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

const openApiPath = path.resolve(process.cwd(), 'openapi/mtr_automacao_openapi_interna.yaml');
const outputPath = path.resolve(process.cwd(), 'src/generated/operations.js');

const raw = fs.readFileSync(openApiPath, 'utf-8');
const spec = YAML.parse(raw);

function sanitizePathToKey(routePath, method) {
  return `${method.toLowerCase()}_${routePath.replace(/^\//, '').replace(/[{}]/g, '').replace(/\//g, '_').replace(/[^a-zA-Z0-9_]+/g, '_')}`;
}

const operations = [];

for (const [specPath, methods] of Object.entries(spec.paths || {})) {
  for (const [method, operation] of Object.entries(methods || {})) {
    const successStatus = Object.keys(operation.responses || {}).find((status) => String(status).startsWith('2'));

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

const content = `export const operations = ${JSON.stringify(operations, null, 2)};\n`;
fs.writeFileSync(outputPath, content, 'utf-8');

console.log(`[ok] ${operations.length} operações regeneradas em ${outputPath}`);
