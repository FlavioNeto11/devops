// ADR-010, Passo 2/3/8 — conteúdo público separado em fatos da plataforma × alegações de terceiros,
// reavaliação da jurisprudência aplicada na leitura e varredura de frases perigosas.
// Sem banco (fundação desligada): as rotas públicas de conteúdo funcionam sem login.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'besc-content-'));
delete process.env.DATABASE_URL;
delete process.env.SESSION_SECRET;

const seedPath = (f) => new URL(`../seed/${f}`, import.meta.url);
const seed = JSON.parse(readFileSync(seedPath('jurisprudence.json'), 'utf8'));
const overlay = JSON.parse(readFileSync(seedPath('jurisprudence-reassessment.json'), 'utf8'));
const classification = JSON.parse(readFileSync(seedPath('content-classification.json'), 'utf8'));
const { REFERENCE, GLOSSARY } = await import('../src/reference/index.js');

// Frases da tese antiga que não podem aparecer como afirmação da plataforma.
export const DANGEROUS = [
  /investir em t[íi]tulos/i,
  /t[íi]tulos? de d[íi]vida p[úu]blica/i,
  /equiparad[ao]s? a dinheiro/i,
  /not[óo]ria liquidez/i,
  /2º grau na hierarquia/i,
  /30 dias para converter/i,
  /converter .{0,40} ou vender/i,
  /redu[çc][ãa]o de 70/i,
  /libera[çc][ãa]o de CND/i,
  /gera o [áa]gio/i,
  /preserva[çc][ãa]o (autom[áa]tica )?de valor/i,
  /rentabilidade/i,
  /liquidez garantida/i,
  /consolida-se favoravelmente/i,
];

const bySeq = (n) => Object.entries(overlay.entries).find(([, e]) => e.seq === n);
const seedById = Object.fromEntries(seed.map((j) => [j.id, j]));

test('reavaliação: 99 entradas, todas no seed, sem finalidade inventada', () => {
  const ids = Object.keys(overlay.entries);
  assert.equal(ids.length, 99);
  for (const id of ids) {
    const e = overlay.entries[id];
    assert.ok(seedById[id], `${id} não existe no seed`);
    assert.ok(['NOT_VERIFIED', 'REPORTED_FINAL_UNVERIFIED', 'REVERSED_ON_APPEAL'].includes(e.finality), `${id}: ${e.finality}`);
    assert.notEqual(e.sourceNature, 'FINAL_COURT_DECISION');
    assert.equal(e.verification, 'SOURCE_CLAIM');
    assert.ok(e.finalityBasis);
  }
  assert.equal(ids.filter((i) => overlay.entries[i].finality === 'REVERSED_ON_APPEAL').length, 1);
  assert.equal(ids.filter((i) => overlay.entries[i].finality === 'REPORTED_FINAL_UNVERIFIED').length, 4);
  assert.equal(ids.filter((i) => overlay.entries[i].isDecision).length, 79);
});

test('reavaliação: correções verificadas e o seed original intocado', () => {
  const [id44, e44] = bySeq(44);
  const [id99, e99] = bySeq(99);
  assert.equal(e44.correctedOutcome, 'desfavoravel');
  assert.equal(e44.finality, 'REVERSED_ON_APPEAL');
  assert.equal(e99.correctedOutcome, 'desfavoravel');
  assert.equal(seedById[id44].outcome, 'favoravel', 'o seed guarda o outcome original');
  assert.notEqual(seedById[id99].outcome, 'desfavoravel');
  assert.equal(bySeq(20)[1].correctedProcessNumber, '2145163-11.2022.8.26.0000');
  assert.equal(bySeq(21)[1].correctedProcessNumber, null);
  // Somente as correções verificadas: nenhum outro outcome é reescrito.
  const corrected = Object.values(overlay.entries).filter((e) => 'correctedOutcome' in e).map((e) => e.seq).sort((a, b) => a - b);
  assert.deepEqual(corrected, [44, 99]);
  // Cauções provisórias da §4.2 marcadas como provisórias e só sobre garantia.
  for (const n of [8, 56, 57, 58]) {
    assert.equal(bySeq(n)[1].provisional, true, `#${n}`);
    assert.equal(bySeq(n)[1].guaranteeOnly, true, `#${n}`);
  }
  for (const n of [3, 34, 70]) assert.equal(bySeq(n)[1].isDecision, false, `#${n} não é decisão`);
});

test('referência: fatos têm fonte; alegações de terceiros só sob thirdPartyClaims, com aviso e contraponto', () => {
  for (const k of ['valueProposition', 'mechanisms', 'jurisprudencePattern']) assert.ok(!(k in REFERENCE), `${k} não pode estar no topo`);
  for (const f of REFERENCE.historyTimeline) {
    if (f.verification === 'PLATFORM_VERIFIED_FACT') assert.ok(f.sourceRef, f.id);
  }
  const g1987 = REFERENCE.historyTimeline.find((f) => f.id === 'besc-1987-grupamento');
  assert.equal(g1987.verification, 'SOURCE_CLAIM');
  const conv = REFERENCE.historyTimeline.find((f) => f.id === 'besc-2009-conversao');
  assert.equal(conv.verification, 'PLATFORM_VERIFIED_FACT');
  assert.equal(conv.date, '11/02/2009');
  assert.ok(REFERENCE.historyTimeline.some((f) => f.id === 'bescval-2021'));
  assert.ok(REFERENCE.shareConversion.ratios.some((r) => /90\.994,324415154/.test(r.to)));

  const tpc = REFERENCE.thirdPartyClaims;
  assert.ok(tpc.warning);
  const all = [...tpc.valueProposition, ...tpc.mechanisms, ...tpc.legalTheses, tpc.jurisprudencePattern];
  for (const c of all) {
    assert.equal(c.verification, 'SOURCE_CLAIM', c.id);
    assert.ok(c.warning && c.rebuttal && c.rebuttalRef, c.id);
    assert.ok(['COMMERCIAL_MATERIAL', 'PETITION', 'PRIVATE_APPRAISAL'].includes(c.nature), c.id);
  }
});

test('varredura: nenhuma frase perigosa como afirmação da plataforma (referência fora de terceiros + glossário)', () => {
  const { thirdPartyClaims, ...platform } = REFERENCE;
  const texts = [JSON.stringify(platform), JSON.stringify(GLOSSARY)];
  for (const t of texts) for (const re of DANGEROUS) assert.ok(!re.test(t), `frase perigosa ${re} no conteúdo da plataforma`);
  // As frases antigas continuam preservadas — rotuladas — em thirdPartyClaims.
  assert.ok(/d[íi]vida p[úu]blica/i.test(JSON.stringify(thirdPartyClaims)));
});

test('biblioteca: todo item do seed classificado; material de terceiros fora do público', () => {
  const lib = JSON.parse(readFileSync(seedPath('library.json'), 'utf8'));
  for (const it of lib) {
    const c = classification.library[it.id];
    assert.ok(c, `${it.id} sem classificação`);
    assert.notEqual(c.sourceNature, 'FINAL_COURT_DECISION');
  }
  assert.equal(classification.library.lib_50ddd5611b1c.visibility, 'research');
  assert.equal(classification.library.lib_50ddd5611b1c.sourceNature, 'COMMERCIAL_MATERIAL');
  assert.ok(classification.library.lib_0390897258c1.labelCorrection);
});

let server; let base;
before(async () => {
  const { createApp } = await import('../src/app.js');
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());
const get = async (p) => { const r = await fetch(base + p); return { status: r.status, json: await r.json().catch(() => null) }; };

test('HTTP: /jurisprudence e /stats servem a reavaliação ao lado do outcome original', async () => {
  const store = await import('../src/store.js');
  await store.init();
  const [id44] = bySeq(44);
  const one = await get(`/jurisprudence/${id44}`);
  assert.equal(one.status, 200);
  assert.equal(one.json.outcome, 'favoravel');
  assert.equal(one.json.outcomeAssessed, 'desfavoravel');
  assert.equal(one.json.assessment.finality, 'REVERSED_ON_APPEAL');
  assert.ok(one.json.disclaimer);
  const list = await get('/jurisprudence');
  assert.ok(list.json.every((j) => j.assessment && j.assessment.verification === 'SOURCE_CLAIM'));
  const stats = await get('/stats');
  const js = stats.json.jurisprudence;
  assert.ok(js.byOutcomeAssessed && js.byFinality && js.caveat);
  assert.equal(js.byFinality.FINAL, undefined);
  assert.equal(js.nonDecision, 20);
});

test('HTTP: público não vê itens de pesquisa da biblioteca (lista, detalhe, arquivo)', async () => {
  const list = await get('/library');
  assert.ok(list.json.every((it) => it.visibility !== 'research' && it.verification === 'SOURCE_CLAIM'));
  assert.ok(!list.json.some((it) => it.id === 'lib_50ddd5611b1c'));
  assert.equal((await get('/library/lib_50ddd5611b1c')).status, 404);
  assert.equal((await get('/library/lib_50ddd5611b1c/file')).status, 404);
  const pub = await get('/library/lib_0390897258c1');
  assert.equal(pub.status, 200);
  assert.ok(pub.json.labelCorrection);
  const meta = await get('/meta');
  assert.ok(meta.json.reference.thirdPartyClaims.warning);
  assert.ok(!('valueProposition' in meta.json.reference));
});
