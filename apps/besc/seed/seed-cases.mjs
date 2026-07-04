// seed-cases.mjs — cria um CASO (levantamento) para cada cliente/processo do material
// fornecido, vinculando as decisoes da Jurisprudencia como precedentes. Idempotente:
// marca cada caso com "[caso-fonte:<key>]" nas notas e pula se ja existir.
//
// Uso: node seed-cases.mjs [baseUrl]   (default http://nvit.localhost/besc/api)
const BASE = process.argv[2] || 'http://nvit.localhost/besc/api';

const get = (p) => fetch(BASE + p).then((r) => r.json());
const post = (p, b) => fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json());

// prioridade p/ escolher o mecanismo do CASO a partir dos mecanismos das decisoes
const MECH_PRIORITY = ['compensacao', 'quitacao', 'conversao', 'dacao_pagamento', 'caucao', 'substituicao_penhora'];
function caseMechanism(mechs) {
  for (const m of MECH_PRIORITY) if (mechs.includes(m)) return m;
  return 'indefinido'; // ex.: so 'penhora'
}

// clientes nomeados na jurisprudencia (key = clientCase exato) + metadados curados
const CLIENTS = {
  'SP Renata Sorocaba':          { holder_name: 'Renata (Sorocaba/SP)',            holder_type: 'pessoa_fisica' },
  'MT Valter Rossari':           { holder_name: 'Valter Rossari (MT)',             holder_type: 'pessoa_fisica' },
  'SC Ana Lucia':                { holder_name: 'Ana Lúcia (SC)',                  holder_type: 'pessoa_fisica' },
  'SC EDINEI':                   { holder_name: 'Edinei (SC)',                     holder_type: 'pessoa_fisica' },
  'GO Carlos Ballotin Itajá':    { holder_name: 'Carlos Ballotin (Itajá/GO)',      holder_type: 'pessoa_fisica' },
  'SP Novamoto Araraquara':      { holder_name: 'Novamoto (Araraquara/SP)',        holder_type: 'empresa' },
  'SP Benetton Americana':       { holder_name: 'Benetton (Americana/SP)',         holder_type: 'empresa' },
  'SP Benetton Araraquara':      { holder_name: 'Benetton (Araraquara/SP)',        holder_type: 'empresa' },
  'SP Ferrara Cosmeticos Diadema': { holder_name: 'Ferrara Cosméticos (Diadema/SP)', holder_type: 'empresa' },
  'RS Radicom Porto Alegre':     { holder_name: 'Radicom (Porto Alegre/RS)',       holder_type: 'empresa' },
};

// casos citados nos documentos institucionais (sem decisao na jurisprudencia — link por nota)
const DOC_CASES = [
  { key: 'airton', holder_name: 'Airton (proc. 51.516)', holder_type: 'pessoa_fisica', mechanism: 'compensacao', target_creditor_type: 'banco_do_brasil', target_creditor_name: 'Banco do Brasil S.A.', summary: 'Caso citado no material (1984 BESC Airton / processo 51.516). Ver o documento na Biblioteca.', notes: 'Origem: Biblioteca — "1984 Besc Airton 2022 51.516".' },
  { key: 'central_agricola', holder_name: 'Central Agrícola / Cooperativa Holambra', holder_type: 'empresa', mechanism: 'dacao_pagamento', target_creditor_type: 'empresa_privada', target_creditor_name: 'Cooperativa Holambra', summary: 'Acordo condicional de dação em pagamento com ações BESC. Ver o documento na Biblioteca.', notes: 'Origem: Biblioteca — "Acordo condicional — Central Agrícola e Cooperativa Holambra".' },
];

async function main() {
  const existing = await get('/cases');
  const seededKeys = new Set();
  for (const c of existing) {
    const full = await get('/cases/' + c.id);
    const m = /\[caso-fonte:([^\]]+)\]/.exec(full.notes || '');
    if (m) seededKeys.add(m[1]);
  }
  const juris = await get('/jurisprudence');
  const byClient = {};
  for (const j of juris) if (j.clientCase) (byClient[j.clientCase] = byClient[j.clientCase] || []).push(j);

  let created = 0, skipped = 0;

  // 1) clientes da jurisprudencia
  for (const [key, meta] of Object.entries(CLIENTS)) {
    if (seededKeys.has(key)) { skipped++; continue; }
    const group = byClient[key] || [];
    const mechs = [...new Set(group.flatMap((g) => g.mechanism || []))];
    const precedents = group.map((g) => g.id);
    const body = {
      holder_name: meta.holder_name,
      holder_type: meta.holder_type,
      right_type: 'litigioso',
      liquidity_status: 'litigioso',
      mechanism: caseMechanism(mechs),
      target_creditor_type: 'banco_do_brasil',
      target_creditor_name: 'Banco do Brasil S.A.',
      summary: `Cliente com ${group.length} decisão(ões) sobre ações do BESC contra o Banco do Brasil (mecanismos: ${mechs.join(', ') || '—'}). Precedentes vinculados à aba Jurisprudência.`,
      precedents,
      legal_basis_notes: 'Sub-rogação do BB (incorporação do BESC); CPC art. 805 (menor onerosidade).',
      notes: `Origem: acervo de jurisprudência (pasta "${key}"). [caso-fonte:${key}]`,
    };
    const r = await post('/cases', body);
    if (r && r.id) { created++; console.log(`+ ${meta.holder_name} (${precedents.length} precedentes)`); }
    else console.error('falha', key, r);
  }

  // 2) casos dos documentos
  for (const dc of DOC_CASES) {
    if (seededKeys.has(dc.key)) { skipped++; continue; }
    const body = {
      holder_name: dc.holder_name, holder_type: dc.holder_type,
      right_type: 'litigioso', liquidity_status: 'indeterminado',
      mechanism: dc.mechanism, target_creditor_type: dc.target_creditor_type, target_creditor_name: dc.target_creditor_name,
      summary: dc.summary, precedents: [],
      notes: `${dc.notes} [caso-fonte:${dc.key}]`,
    };
    const r = await post('/cases', body);
    if (r && r.id) { created++; console.log(`+ ${dc.holder_name}`); }
    else console.error('falha', dc.key, r);
  }

  console.log(`\ncriados=${created} pulados(ja existiam)=${skipped}`);
  const total = (await get('/cases')).length;
  console.log(`total de casos agora: ${total}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
