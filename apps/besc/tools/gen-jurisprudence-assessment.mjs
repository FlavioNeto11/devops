#!/usr/bin/env node
// Gera api/seed/jurisprudence-reassessment.json a partir da tabela das 99 decisões da reconciliação
// (repo besc: docs/reconciliation/_notas/jurisprudencia-devops-reavaliacao.md). A camada é aplicada
// na LEITURA (/jurisprudence), nunca grava no seed: o campo `outcome` original fica intacto.
//
// Disciplina (ADR-010): nenhum valor que a fonte não verificou.
//   - finality: só NOT_VERIFIED | REPORTED_FINAL_UNVERIFIED | REVERSED_ON_APPEAL (nunca "FINAL")
//   - sourceNature: nunca FINAL_COURT_DECISION
//   - campos descritivos são CÓPIA LITERAL das colunas; nada é inferido de prosa
//   - correções só onde a reavaliação verificou (e-SAJ / informativo oficial), com fonte
// Uso: node apps/besc/tools/gen-jurisprudence-assessment.mjs <caminho/jurisprudencia-devops-reavaliacao.md>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2];
if (!src || !fs.existsSync(src)) { console.error('uso: gen-jurisprudence-assessment.mjs <jurisprudencia-devops-reavaliacao.md>'); process.exit(2); }
const md = fs.readFileSync(src, 'utf8');
const seed = JSON.parse(fs.readFileSync(path.join(APP, 'api/seed/jurisprudence.json'), 'utf8'));
const seedIds = new Set(seed.map((j) => j.id));

const FINALITY = new Set(['NOT_VERIFIED', 'REPORTED_FINAL_UNVERIFIED', 'REVERSED_ON_APPEAL']);
const NATURES = new Set(['NON_FINAL_COURT_DECISION', 'PETITION', 'PRIVATE_APPRAISAL', 'UNKNOWN']);

// §2.2 da reavaliação, linha "Excluídos" (não são decisões com dispositivo legível).
const NON_DECISION = {
  PETITION: [3, 9, 35, 52, 75],
  UNKNOWN_DOC: [10, 24, 85],
  PRIVATE_APPRAISAL: [34, 60],
  COVER_OR_CERTIFICATE: [70, 73, 99],
  OCR_WITHOUT_DISPOSITIVE: [15, 29, 30, 39, 76, 84, 92],
};
const natureForNonDecision = (n) => (NON_DECISION.PETITION.includes(n) ? 'PETITION' : NON_DECISION.PRIVATE_APPRAISAL.includes(n) ? 'PRIVATE_APPRAISAL' : 'UNKNOWN');
const nonDecisionNums = new Set(Object.values(NON_DECISION).flat());

// §2.2 "trânsito noticiado": só por afirmação do resumo, nunca por certidão verificada.
const REPORTED_FINAL = { 4: 'acórdão "transitado" segundo o resumo do seed; certidão não verificada', 38: 'certidão citada no resumo; não verificada', 67: 'trânsito da decisão contrária citado no resumo; não verificado', 91: 'resumo afirma trânsito; sem número de processo, não verificável' };
// §2.3 V5: liminar monocrática superada pelo colegiado (verificado no e-SAJ).
const REVERSED = { 44: 'e-SAJ/TJSP AI 2087469-50.2023.8.26.0000: colegiado negou provimento em 25/05/2023 e 29/08/2023 (EDcl)' };

// Correções verificadas (§2.3 e §4.5), com fonte. Nada além disto é corrigido.
const CORRECTIONS = {
  44: [{ field: 'outcome', to: 'desfavoravel', source: 'e-SAJ/TJSP (V5): colegiado negou provimento; a liminar catalogada como favorável foi superada' }],
  99: [{ field: 'outcome', to: 'desfavoravel', source: 'TJDFT Informativo 388 (V2): Ac. 1151371, apelação desprovida; conversão negada à cessionária' }],
  20: [{ field: 'processNumber', to: '2145163-11.2022.8.26.0000', source: 'e-SAJ/TJSP (V7): o número do seed não existe; acórdão real da 17ª CDP, j. 22/03/2023 (alternativa: 2233769-49.2021, j. 18/11/2021)' }],
  21: [{ field: 'processNumber', to: null, source: 'e-SAJ/TJSP (V6): o número do seed pertence a outro processo (Patrimony × Lamas)' }],
  54: [{ field: 'processNumber', to: 'REsp 2.148.164/PR', source: 'formato do seed inválido; AgInt no REsp 2.148.164/PR (STJ, 3ª T.)' }],
  27: [{ field: 'processNumber', to: null, source: 'número do TJSP (registro 58) colado em decisão de Jataí/GO' }],
  94: [{ field: 'processNumber', to: null, source: 'número do TJSP (registro 58) colado em decisão de Jataí/GO' }],
  76: [{ field: 'processNumber', to: null, source: 'número pertence ao TRF4 (registro 83)' }],
  10: [{ field: 'processNumber', to: null, source: 'número pertence ao TJMA (registro 95); documento é registral' }],
  83: [{ field: 'description', to: null, source: 'AI 5016710-94.2019 é a monocrática de caução (registro 8), não "quitação com perícia"; inteiro teor não obtido' }],
  15: [{ field: 'reliability', to: 'UNRELIABLE', source: '§4.5: partes/número aparentemente fictícios; ano 1979; fora da contagem de decisões' }, { field: 'mechanism', to: null, source: '§4.5: mecanismo sem base' }],
  29: [{ field: 'reliability', to: 'UNRELIABLE', source: '§4.5: partes/número aparentemente fictícios; instância "superior_STJ" errada' }],
  9: [{ field: 'mechanism', to: null, source: '§4.5: mecanismo sem base' }],
  24: [{ field: 'mechanism', to: null, source: '§4.5: mecanismo sem base' }],
  37: [{ field: 'uf', to: 'GO', source: '§4.5: é Itajá/GO, 2019; número a conferir' }],
  81: [{ field: 'tribunal', to: 'JF-PR', source: '§4.5: 1º grau da Justiça Federal, não STJ; sem número' }],
  91: [{ field: 'tribunal', to: 'JF-SP', source: '§4.5: 1º grau da Justiça Federal, não STJ; sem número' }],
  74: [{ field: 'tribunal', to: 'TJCE', source: '§4.5' }],
  95: [{ field: 'tribunal', to: 'TJMA', source: '§4.5' }],
  30: [{ field: 'tribunal', to: 'TJMA', source: '§4.5' }],
};
// §4.2: caução/garantia aceita em cognição sumária — decide garantia do juízo, não valor nem existência.
const GUARANTEE_ONLY = new Set([8, 13, 17, 18, 22, 64, 27, 94, 42, 59, 44, 48, 50, 66, 56, 57, 58, 63, 71, 89, 6, 78, 87, 88, 92, 98]);

const PROVISIONAL = /liminar|tutela|interlocut|efeito suspensivo|monocr|despacho|homolog|penhora|n[ãa]o conhecid|cautelar/i;

// Só a tabela da §1 (as tabelas da §4 também começam com número).
const section1 = md.split(/^## 2\./m)[0].split(/^## 1\./m)[1];
if (!section1) throw new Error('seção 1 não encontrada');
const rows = section1.split(/\r?\n/).filter((l) => /^\|\s*\d+\s*\|/.test(l));
const out = {};
for (const line of rows) {
  const cells = line.split('|').slice(1, -1).map((c) => c.trim());
  if (cells.length !== 14) throw new Error(`linha com ${cells.length} colunas (esperado 14): ${line.slice(0, 80)}`);
  const [num, id, trib, uf, ano, instReal, tipo, mecanismo, contraparte, outcomeSeed, questao, naoDecidiu, objeto, alerta] = cells;
  const n = Number(num);
  if (!seedIds.has(id)) throw new Error(`id ${id} (#${n}) não existe no seed`);
  if (out[id]) throw new Error(`id duplicado: ${id}`);
  const isDecision = !nonDecisionNums.has(n);
  const finality = REVERSED[n] ? 'REVERSED_ON_APPEAL' : REPORTED_FINAL[n] ? 'REPORTED_FINAL_UNVERIFIED' : 'NOT_VERIFIED';
  const finalityBasis = REVERSED[n] || REPORTED_FINAL[n] || 'sem verificação de trânsito em julgado nesta reavaliação';
  const sourceNature = isDecision ? 'NON_FINAL_COURT_DECISION' : natureForNonDecision(n);
  const objectKind = (/^CAUTELA/i.test(objeto) ? 'CAUTELA' : /^CONVERTIDA/i.test(objeto) ? 'CONVERTIDA' : 'N/A');
  const corrections = CORRECTIONS[n] || [];
  const corrected = Object.fromEntries(corrections.filter((c) => ['outcome', 'processNumber', 'reliability'].includes(c.field)).map((c) => [c.field, c.to]));
  if (!FINALITY.has(finality)) throw new Error(`finality inválida em ${id}`);
  if (!NATURES.has(sourceNature)) throw new Error(`sourceNature inválida em ${id}`);
  out[id] = {
    seq: n,
    verification: 'SOURCE_CLAIM',
    isDecision,
    sourceNature,
    finality,
    finalityBasis,
    provisional: isDecision && (PROVISIONAL.test(tipo) || /provis/i.test(alerta) || GUARANTEE_ONLY.has(n)),
    provisionalBasis: !isDecision ? 'não é decisão' : PROVISIONAL.test(tipo) ? 'coluna Tipo' : /provis/i.test(alerta) ? 'coluna Alerta' : GUARANTEE_ONLY.has(n) ? '§4.2 garantia em cognição sumária' : null,
    guaranteeOnly: GUARANTEE_ONLY.has(n),
    tribunalReal: trib,
    ufReal: uf,
    yearReal: ano,
    instanceReal: instReal,
    decisionType: tipo,
    mechanismNote: mecanismo,
    counterparty: contraparte,
    outcomeSeed,
    questionDecided: questao,
    notDecided: naoDecidiu,
    objectKind,
    objectNote: objeto,
    alerts: alerta,
    ...(Object.prototype.hasOwnProperty.call(corrected, 'outcome') ? { correctedOutcome: corrected.outcome } : {}),
    ...(Object.prototype.hasOwnProperty.call(corrected, 'processNumber') ? { correctedProcessNumber: corrected.processNumber } : {}),
    ...(corrected.reliability ? { reliability: corrected.reliability } : {}),
    corrections,
  };
}
const ids = Object.keys(out);
if (ids.length !== 99) throw new Error(`esperadas 99 decisões, encontradas ${ids.length}`);
const doc = {
  version: 1,
  reassessedAt: '2026-09-25',
  basis: 'repo besc: docs/reconciliation/_notas/jurisprudencia-devops-reavaliacao.md (tabela §1, estatísticas §2, verificações §2.3, correções §4.5)',
  disclaimer: 'Reavaliação editorial: descreve o que cada decisão efetivamente decidiu e o que NÃO decidiu. Nenhuma decisão do acervo prova que ações BESC existem hoje, têm valor, são líquidas ou transferíveis. Trânsito em julgado não foi verificado por certidão em nenhum registro.',
  entries: out,
};
fs.writeFileSync(path.join(APP, 'api/seed/jurisprudence-reassessment.json'), JSON.stringify(doc, null, 2) + '\n');
const tally = (k) => ids.reduce((m, id) => ((m[out[id][k]] = (m[out[id][k]] || 0) + 1), m), {});
console.log(JSON.stringify({ entries: ids.length, finality: tally('finality'), sourceNature: tally('sourceNature'), provisional: ids.filter((i) => out[i].provisional).length, nonDecision: ids.filter((i) => !out[i].isDecision).length, objectKind: tally('objectKind') }, null, 2));
