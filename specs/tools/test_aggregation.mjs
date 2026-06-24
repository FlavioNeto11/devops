import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

const SPECS_DIR = path.resolve('.');
const REQ_DIR = path.join(SPECS_DIR, '..', 'requirements');

// Carrega requisitos
function loadRequirements() {
  if (!fs.existsSync(REQ_DIR)) return [];
  const files = fs
    .readdirSync(REQ_DIR, { recursive: true })
    .filter((f) => typeof f === 'string' && /\.ya?ml$/.test(f))
    .map((f) => path.join(REQ_DIR, f));
  const items = [];
  for (const file of files) {
    let doc;
    try {
      doc = parseYaml(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      continue;
    }
    items.push({ file: path.relative(SPECS_DIR, file).replace(/\\/g, '/'), doc });
  }
  return items;
}

const items = loadRequirements();
const reqs = items
  .map(({ file, doc }) => ({ ...doc, _file: file }))
  .sort((a, b) => String(a.id).localeCompare(String(b.id)));

// Mostra ordem dos primeiros 10 requisitos (após sort)
console.log('Primeiros 10 requisitos (após sort por ID):');
reqs.slice(0, 10).forEach(r => {
  console.log(`  ${r.id} -> product_scope: ${r.scope?.product_scope ?? 'unknown'}, status: ${r.status}, type: ${r.type}`);
});

// Simula a agregação (linhas 194-201)
const byProduct = {};
const byStatus = {};
const byType = {};
for (const r of reqs) {
  const p = r.scope?.product_scope ?? 'unknown';
  byProduct[p] = (byProduct[p] ?? 0) + 1;
  byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  byType[r.type] = (byType[r.type] ?? 0) + 1;
}

console.log('\nOrder of insertion para byProduct:', Object.keys(byProduct));
console.log('\nOrder of insertion para byStatus:', Object.keys(byStatus));
console.log('\nOrder of insertion para byType:', Object.keys(byType));

// Verifica se está em ordem alfabética
const isAlphabetical = (arr) => arr.every((v, i, a) => i === 0 || v >= a[i-1]);
console.log('\nbyProduct em ordem alfabética?', isAlphabetical(Object.keys(byProduct)));
console.log('byStatus em ordem alfabética?', isAlphabetical(Object.keys(byStatus)));
console.log('byType em ordem alfabética?', isAlphabetical(Object.keys(byType)));
