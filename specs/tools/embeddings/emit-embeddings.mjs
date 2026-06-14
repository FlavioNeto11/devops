// =============================================================================
// emit-embeddings.mjs — gera specs/baseline/embeddings.json com embeddings LOCAIS
// (Xenova/all-MiniLM-L6-v2, 384d, normalizados) por requisito. Sem API paga.
// Consumido pelo Reqhub para "requisitos similares" e deteccao de duplicidades
// (similaridade semantica REQ->REQ, sem rodar modelo no browser).
//
// Deterministico (mesmo modelo + texto => mesmo vetor). Committed e assado na imagem.
// Rode apos mudar titulo/enunciado/tags de requisitos:
//   cd specs/tools/embeddings && npm install && npm run emit
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from '@xenova/transformers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASELINE = path.resolve(__dirname, '..', '..', 'baseline', 'current-baseline.json');
const OUT = path.resolve(__dirname, '..', '..', 'baseline', 'embeddings.json');
const MODEL = 'Xenova/all-MiniLM-L6-v2';

const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
const reqs = baseline.requirements ?? [];
const text = (r) => `${r.title}. ${r.statement} ${(r.risk_tags ?? []).join(' ')}`.trim();

console.log(`[embeddings] carregando modelo ${MODEL}...`);
const extractor = await pipeline('feature-extraction', MODEL);

const ids = reqs.map((r) => r.id);
const out = await extractor(reqs.map(text), { pooling: 'mean', normalize: true });
const dims = out.dims[1];

const vectors = {};
ids.forEach((id, i) => {
  const v = Array.from(out.data.slice(i * dims, (i + 1) * dims), (x) => Math.round(x * 1e5) / 1e5);
  vectors[id] = v;
});

const payload = {
  model: MODEL,
  dims,
  metamodel_version: baseline.metamodel_version ?? null,
  baseline_hash: baseline.baseline_hash,
  count: ids.length,
  vectors,
};
fs.writeFileSync(OUT, JSON.stringify(payload) + '\n');
console.log(`[embeddings] ${ids.length} vetores (${dims}d) -> specs/baseline/embeddings.json`);
