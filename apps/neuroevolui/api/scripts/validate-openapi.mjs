// validate-openapi.mjs — valida que todos os paths do server.js existem no OpenAPI canônico.
// Sai com código 1 (falha CI) se houver divergência.
// Roda com: node scripts/validate-openapi.mjs (no diretório api/)
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// ─── 1. Carregar e validar sintaxe do OpenAPI YAML ───────────────────────────
const openApiPath = path.join(root, 'src', 'openapi', 'openapi.yaml');
if (!fs.existsSync(openApiPath)) {
  console.error('[validate:openapi] ERRO: src/openapi/openapi.yaml não encontrado.');
  process.exit(1);
}

let spec;
try {
  spec = YAML.parse(fs.readFileSync(openApiPath, 'utf-8'));
} catch (e) {
  console.error('[validate:openapi] ERRO: falha ao parsear YAML:', e.message);
  process.exit(1);
}

if (!spec || !spec.paths || typeof spec.paths !== 'object') {
  console.error('[validate:openapi] ERRO: spec.paths ausente ou inválido.');
  process.exit(1);
}

// ─── 2. Extrair paths documentados no OpenAPI ─────────────────────────────────
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

/** @type {Set<string>} "METHOD /path" */
const specRoutes = new Set();
for (const [specPath, methods] of Object.entries(spec.paths)) {
  for (const method of Object.keys(methods || {})) {
    if (HTTP_METHODS.includes(method.toLowerCase())) {
      specRoutes.add(`${method.toUpperCase()} ${specPath}`);
    }
  }
}

// ─── 3. Extrair rotas registradas em server.js ────────────────────────────────
const serverPath = path.join(root, 'src', 'server.js');
const serverSrc = fs.readFileSync(serverPath, 'utf-8');

// Regex que captura: app.METHOD('path', ...) ou app.METHOD("path", ...)
// Converte paths Fastify (:param) → OpenAPI ({param}) para comparação.
const routeRe = /app\.(get|post|put|patch|delete|head|options)\s*\(\s*['"`]([^'"`]+)['"`]/gi;

/** @type {Set<string>} "METHOD /path" normalizado */
const implRoutes = new Set();
let m;
while ((m = routeRe.exec(serverSrc)) !== null) {
  const method = m[1].toUpperCase();
  const fastifyPath = m[2];
  // Converte :paramName → {paramName}
  const openApiPath = fastifyPath.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, '{$1}');
  implRoutes.add(`${method} ${openApiPath}`);
}

// ─── 4. Comparar ──────────────────────────────────────────────────────────────
const missingFromSpec = [...implRoutes].filter((r) => !specRoutes.has(r));
const missingFromImpl = [...specRoutes].filter((r) => !implRoutes.has(r));

let hasErrors = false;

if (missingFromSpec.length > 0) {
  hasErrors = true;
  console.error('[validate:openapi] ERRO: rotas implementadas ausentes do OpenAPI (adicione-as ao openapi.yaml):');
  for (const r of missingFromSpec.sort()) console.error(`  - ${r}`);
}

if (missingFromImpl.length > 0) {
  // Apenas aviso: rotas documentadas mas não implementadas (rascunhos futuros são ok, mas avisa)
  console.warn('[validate:openapi] AVISO: rotas no OpenAPI sem implementação em server.js:');
  for (const r of missingFromImpl.sort()) console.warn(`  ~ ${r}`);
}

// ─── 5. Resultado ─────────────────────────────────────────────────────────────
if (hasErrors) {
  console.error(`\n[validate:openapi] FALHOU: ${missingFromSpec.length} rota(s) não documentada(s).`);
  process.exit(1);
}

console.log(`[validate:openapi] OK — ${implRoutes.size} rotas implementadas, ${specRoutes.size} documentadas.`);
