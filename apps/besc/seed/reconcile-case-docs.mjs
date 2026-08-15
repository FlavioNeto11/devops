// reconcile-case-docs.mjs — corrige a documentação/pendências dos casos semeados:
// adiciona o processo judicial (torna as peças aplicáveis), marca como VALIDADOS no
// checklist os documentos judiciais que o caso realmente tem (com ref ao PDF da
// jurisprudência) e a comprovação de titularidade. Idempotente. Só toca nos casos
// semeados (marca "[caso-fonte:" nas notas) — não altera os casos do operador.
//
// Uso: node reconcile-case-docs.mjs [baseUrl]   (default http://nvit.localhost/besc/api)
const BASE = process.argv[2] || 'http://nvit.localhost/besc/api';
const get = (p) => fetch(BASE + p).then((r) => r.json());
const put = (p, b) => fetch(BASE + p, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json());
const post = (p, b) => fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json());

// instância da decisão -> item do checklist documental
const INST_DOC = { primeira: 'sentence', segunda: 'appellate_decision', superior_STJ: 'appeals', STF: 'appeals', administrativa: 'appellate_decision' };
const INST_RANK = { primeira: 1, segunda: 2, superior_STJ: 3, STF: 4, administrativa: 2 };

async function reconcileCase(summary) {
  const c = await get('/cases/' + summary.id);
  if (!/\[caso-fonte:/.test(c.notes || '')) return { skipped: 'não-semeado' };
  // idempotência: se já tem processo cadastrado, considera reconciliado
  if ((c.lawsuits || []).length > 0) return { skipped: 'já reconciliado' };

  const precIds = c.precedents || [];
  const decisions = (await Promise.all(precIds.map((id) => get('/jurisprudence/' + id).catch(() => null)))).filter(Boolean);

  // 1) processo judicial derivado das decisões
  const withNum = decisions.find((d) => d.processNumber);
  const anyTransitado = decisions.some((d) => /transitad/i.test(d.title || '') || d.instancia === 'superior_STJ');
  const phase = anyTransitado ? 'transito_em_julgado' : (decisions.length ? 'sentenca' : 'inicial');
  const court = (decisions.find((d) => d.tribunal && d.tribunal !== 'outro') || {}).tribunal || '';
  const party = decisions.map((d) => d.parties).find(Boolean);
  const partiesStr = party ? [party.creditor, party.debtor].filter(Boolean).join(' × ') : '';
  await post('/cases/' + c.id + '/lawsuits', {
    number: withNum ? withNum.processNumber : '',
    court,
    type: `Ação com ações do BESC contra ${c.target_creditor_name || 'o credor'}`,
    parties: partiesStr,
    phase,
    has_sentence: decisions.length > 0,
    transited: phase === 'transito_em_julgado',
    risk: 'undetermined',
    next_steps: 'Documentos judiciais vinculados na aba Documentos.',
  });

  // 2) mapeia decisões -> itens do checklist e valida com ref ao PDF
  const byDoc = {};
  for (const d of decisions) {
    const key = INST_DOC[d.instancia] || 'appellate_decision';
    (byDoc[key] = byDoc[key] || []).push({ jurisprudenceId: d.id, title: d.title });
  }
  for (const [key, refs] of Object.entries(byDoc)) {
    await put(`/cases/${c.id}/documents/${key}`, { status: 'validated', source: 'Decisão judicial vinculada (acervo)', refs });
  }

  // 3) titularidade comprovada pela decisão mais autoritativa (limpa o bloqueante)
  const primary = [...decisions].sort((a, b) =>
    (b.outcome === 'favoravel' ? 1 : 0) - (a.outcome === 'favoravel' ? 1 : 0) ||
    (INST_RANK[b.instancia] || 0) - (INST_RANK[a.instancia] || 0))[0];
  if (primary) {
    await put(`/cases/${c.id}/documents/ownership_docs`, {
      status: 'validated',
      source: 'Titularidade reconhecida na decisão judicial vinculada',
      refs: [{ jurisprudenceId: primary.id, title: primary.title }],
    });
  } else {
    // casos sem decisão na jurisprudência (Airton, Central Agrícola) -> doc na Biblioteca
    await put(`/cases/${c.id}/documents/ownership_docs`, {
      status: 'validated',
      source: 'Documento do caso disponível na Biblioteca (ver descrição).',
    });
  }

  const after = await get('/cases/' + c.id);
  return { holder: c.holder_name, decisoes: decisions.length, docPct: after.derived.docPct, status: after.status, blockers: after.derived.blockerCount };
}

async function main() {
  const cases = await get('/cases');
  let done = 0, skipped = 0;
  for (const s of cases) {
    const r = await reconcileCase(s);
    if (r.skipped) { skipped++; continue; }
    done++;
    console.log(`✓ ${r.holder} — ${r.decisoes} decisão(ões) → docPct ${r.docPct}% · status ${r.status} · bloqueantes ${r.blockers}`);
  }
  console.log(`\nreconciliados=${done} pulados=${skipped}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
