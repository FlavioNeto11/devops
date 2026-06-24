import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

const SPECS_DIR = path.resolve('.');
const REQ_DIR = path.join(SPECS_DIR, '..', 'requirements');

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

// Simula a agregação 3 vezes em sequência
const runs = [];
for (let run = 1; run <= 3; run++) {
  const byProduct = {};
  for (const r of reqs) {
    const p = r.scope?.product_scope ?? 'unknown';
    byProduct[p] = (byProduct[p] ?? 0) + 1;
  }
  runs.push(Object.keys(byProduct).join(','));
}

console.log('Run 1:', runs[0]);
console.log('Run 2:', runs[1]);
console.log('Run 3:', runs[2]);
console.log('\nTodas iguais?', runs[0] === runs[1] && runs[1] === runs[2]);

// Tenta com diferentes ordenaçoes de entrada
console.log('\n=== Testando com diferentes ordenaçoes de requisitos ===');
const shuffled = [...reqs].sort(() => Math.random() - 0.5);
const byProductShuffled = {};
for (const r of shuffled) {
  const p = r.scope?.product_scope ?? 'unknown';
  byProductShuffled[p] = (byProductShuffled[p] ?? 0) + 1;
}
console.log('Com shuffle:', Object.keys(byProductShuffled).join(','));
console.log('Original:', Object.keys(reqs.reduce((acc, r) => {
  const p = r.scope?.product_scope ?? 'unknown';
  acc[p] = (acc[p] ?? 0) + 1;
  return acc;
}, {})).join(','));
