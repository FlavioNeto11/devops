// =============================================================================
// build.mjs — sincroniza a casca global (shell.js + shell.css) para DENTRO de cada
// app próprio da plataforma, como `platform-shell.{js,css}`. Mesmo idioma do
// design-tokens/build.mjs: cada app builda em contexto Docker isolado e não alcança
// packages/, então o código vai por codegen-sync + drift-check. Determinístico.
//
// Uso:  node build.mjs           # escreve os platform-shell.{js,css} nos apps
//       node build.mjs --check   # NÃO escreve; exit 1 se algum estiver desatualizado
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..', '..');
const CHECK = process.argv.includes('--check');

const NOTE = 'SINCRONIZADO de packages/platform-shell — NÃO editar aqui; edite o pacote e rode `node build.mjs`.';
const HEADER_CSS = `/* ${NOTE} */\n`;
const HEADER_JS = `// ${NOTE}\n`;

// [arquivo-fonte, [destinos]]
const APPS = ['portal/frontend/assets', 'apps/reqhub/frontend/assets', 'console/frontend/src', 'apps/portal-recorder/frontend/src'];
const SOURCES = [
  ['shell.js', APPS.map((d) => d + '/platform-shell.js')],
  ['shell.css', APPS.map((d) => d + '/platform-shell.css')],
  ['platform-tokens.css', APPS.map((d) => d + '/platform-tokens.css')],
];

function bodyFor(src) {
  const raw = fs.readFileSync(path.join(__dirname, src), 'utf8');
  return (src.endsWith('.css') ? HEADER_CSS : HEADER_JS) + raw;
}

let drift = false; let count = 0;
for (const [src, dests] of SOURCES) {
  const content = bodyFor(src);
  for (const rel of dests) {
    count++;
    const abs = path.join(REPO, rel);
    if (CHECK) {
      const cur = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
      if (cur !== content) { drift = true; console.error(`\x1b[31m[platform-shell] desatualizado: ${rel} — rode \`node build.mjs\` e commite.\x1b[0m`); }
    } else {
      fs.writeFileSync(abs, content);
      console.log(`[platform-shell] ${src} -> ${rel}`);
    }
  }
}
if (CHECK) {
  if (drift) process.exit(1);
  console.log(`\x1b[32m[platform-shell] OK — ${count} arquivo(s) em dia.\x1b[0m`);
}
