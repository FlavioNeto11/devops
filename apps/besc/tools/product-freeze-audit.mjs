#!/usr/bin/env node
// Passo 1 do pivot (ADR-010): auditoria de congelamento do produto.
// Varre apps/besc por termos da tese antiga (marketplace/tokenização/perícia como valor)
// e classifica CADA ocorrência por REGRAS (superfície + padrão) com overrides manuais
// para as linhas-exhibit. Não é revisão humana linha a linha: é triagem reprodutível.
// Uso: node apps/besc/tools/product-freeze-audit.mjs [--out docs/pivot/before] [--label before]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const argOf = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const OUT = path.join(APP, argOf('--out', 'docs/pivot'));
const LABEL = argOf('--label', 'current');
const SCAN = ['frontend/src', 'api/src', 'api/seed', 'api/test', 'api/sql', 'seed', 'docs', 'k8s', 'CLAUDE.md', 'ESCOPO-FUNCIONAL.md', 'devops.yaml'];
const EXT = /\.(js|jsx|mjs|json|sql|md|yaml|ps1|sol)$/;
const SKIP = [/docs[\\/]pivot[\\/]/, /TitleRegistry\.json$/, /jurisprudence-reassessment\.json$/];

// Termos pedidos no Passo 1 (agrupados por tema).
export const TERMS = [
  ['investimento', /\b(investir|investimento|investidor(a|es)?|retorno financeiro)\b/i],
  ['marketplace', /\bmarketplace\b/i],
  ['treasury', /\b(treasury|tesouraria)\b/i],
  ['tokens_por_acao', /tokens_per_share|tokens? por a[çc][ãa]o|fator de (tokeniza|desmembr)/i],
  ['aluguel', /\b(aluguel|alugu[ée]is|alugar|lease[s]?|locat[áa]rio)\b/i],
  ['rentabilidade', /rentabilidade|rendimento garantido/i],
  ['valorizacao', /valoriza[çc][ãa]o|valorizar/i],
  ['preservacao_valor', /preserva[çc][ãa]o (autom[áa]tica )?(de )?valor|preserved_face_value|preserva o (montante|valor)/i],
  ['substituicao_token', /substitui[çc][ãa]o (de|do) (token|contrato|t[íi]tulo)|substituteContract|contract_substitution/i],
  ['pericia_valuation', /per[íi]cia|pericial|updated_value_pericial|laudo/i],
  ['agio', /[áa]gio\b/i],
  ['divida_publica', /d[íi]vida p[úu]blica/i],
  ['equiparacao_dinheiro', /equiparad[oa]s? a dinheiro|dinheiro em esp[ée]cie/i],
  ['liquidez_garantida', /not[óo]ria liquidez|liquidez (garantida|imediata|compar[áa]vel)|2º grau/i],
  ['converter_ou_vender', /converter .{0,40}ou vender|30 dias para converter/i],
  ['cta_investimento', /Investir em t[íi]tulos|to=["']\/marketplace/i],
  ['compensacao', /compensa[çc][ãa]o|quita[çc][ãa]o|quitar/i],
  ['garantia_caucao', /cau[çc][ãa]o|caucionar|garantia (do ju[íi]zo|processual)/i],
  ['dacao', /da[çc][ãa]o em pagamento/i],
  ['tokenizacao', /tokeniza|token_batch|token_contract|tokenization_parameter|emiss[ãa]o de tokens?/i],
  ['erc3643_besu', /ERC-?3643|\bBesu\b|TitleRegistry/i],
  ['comprar_vender_acoes', /(comprar|vender|venda de) a[çc][õo]es (do )?BESC/i],
  ['cautela_ativo', /cautela|c[áa]rtula/i],
  ['unit_face_value', /unit_face_value|valor de face|valor unit[áa]rio/i],
];

const SAFE = /n[ãa]o (executa |faz |realiza )?tokeniza|sem blockchain|n[ãa]o tokeniza|fora de escopo|requer valida[çc][ãa]o|n[ãa]o presta aconselhamento|n[ãa]o constitui oferta|ADR-010|DEPRECATED|superad|n[ãa]o [ée] (oferta|aconselhamento)|source_claim|SOURCE_CLAIM|alega[çc][ãa]o de terceiro/i;

function surfaceOf(rel) {
  const r = rel.replace(/\\/g, '/');
  if (/^frontend\/src\/pages\/(PortalHome|Marketplace|TituloDossie|InvestidorCarteira)\.jsx$/.test(r)) return 'public_ui_offer';
  if (/^frontend\/src\/(App|investor)\.jsx$/.test(r) || /^frontend\/src\/pages\/(Ajuda|Roadmap|Referencia|Glossario|Entrar)\.jsx$/.test(r)) return 'public_ui';
  if (/^frontend\/src\/pages\/(Gestao(Titulos|TituloDetail|Alugueis|Financeiro)|GateRegulatorio|AuditoriaTitulo|Auditoria)\.jsx$/.test(r)) return 'internal_ui_marketplace';
  if (/^frontend\/src\//.test(r)) return 'internal_ui';
  if (/^api\/src\/reference\//.test(r)) return 'public_content';
  if (/^api\/src\/(marketplace|ledger)\//.test(r)) return 'marketplace_code';
  if (/^api\/src\/reports\.js$/.test(r)) return 'reports';
  if (/^api\/src\//.test(r)) return 'api_core';
  if (/^api\/seed\/jurisprudence\.json$/.test(r)) return 'seed_jurisprudence';
  if (/^api\/seed\/overrides\.json$/.test(r)) return 'seed_overrides';
  if (/^api\/seed\/library\.json$/.test(r)) return 'seed_library';
  if (/^api\/seed\//.test(r)) return 'seed_other';
  if (/^api\/sql\/000[35]/.test(r)) return 'sql_marketplace';
  if (/^api\/sql\//.test(r)) return 'sql_core';
  if (/^api\/test\//.test(r)) return 'tests';
  if (/^seed\//.test(r)) return 'fixtures';
  if (/^docs\/evolution\//.test(r)) return 'docs_evolution';
  if (/^k8s\/besu/.test(r)) return 'infra_besu';
  if (/^k8s\//.test(r) || r === 'devops.yaml') return 'infra';
  if (r === 'ESCOPO-FUNCIONAL.md') return 'docs_escopo_v1';
  if (r === 'CLAUDE.md') return 'docs_agent_context';
  return 'other';
}

// Overrides manuais das linhas-exhibit (docs/reconciliation/01-conflict-matrix.md §1.3 no repo besc).
const OVERRIDES = [
  [/PortalHome\.jsx$/, /Investir em t[íi]tulos|to="\/marketplace"|quitar e compensar|futura tokeniza/i, 'DANGEROUS', 'exhibit 3: CTA/promessa na home pública'],
  [/App\.jsx$/, /to="\/marketplace"|Investir/i, 'DANGEROUS', 'exhibit 3: navegação pública para oferta'],
  [/portal-content\.js$/, /converter .{0,40}ou vender/i, 'DANGEROUS', 'exhibit 3: "30 dias para converter ou vender" (a conversão foi automática em 11/02/2009)'],
  [/portal-content\.js$/, /2º grau|idôneas|quita[çc][ãa]o de passivos|TRIBUT[ÁA]RIOS|compartilhada|rejeitado|gera o [áa]gio|atualiza pela data/i, 'DANGEROUS', 'exhibit 3: proposta de valor/mecanismos servidos como fato'],
  [/glossary\.js$/, /2º grau|apenas na esfera judicial|compartilhada com a Uni[ãa]o|rejeitado|gera o [áa]gio|express/i, 'MISLEADING', 'glossário transcreve material comercial'],
  [/library\.json$/, /d[íi]vida p[úu]blica|dinheiro em esp[ée]cie|not[óo]ria liquidez|70%|CND/i, 'LEGAL_CLAIM_REQUIRING_CONTEXT', 'petição/material comercial servido como biblioteca'],
];

function classify(surface, term, line, rel) {
  for (const [fre, lre, cls, why] of OVERRIDES) if (fre.test(rel) && lre.test(line)) return [cls, why];
  if (SAFE.test(line)) return ['SAFE_INFORMATIONAL', 'linha declara restrição/aviso'];
  switch (surface) {
    case 'public_ui_offer': return ['DANGEROUS', 'tela pública de oferta/investimento'];
    case 'public_content':
      if (['compensacao', 'garantia_caucao', 'dacao', 'liquidez_garantida', 'pericia_valuation', 'agio', 'divida_publica', 'equiparacao_dinheiro'].includes(term)) return ['MISLEADING', 'conteúdo público afirma mecanismo/valor sem base'];
      return ['SAFE_INFORMATIONAL', 'conteúdo público neutro'];
    case 'public_ui':
      if (['investimento', 'marketplace', 'tokenizacao', 'aluguel', 'cta_investimento'].includes(term)) return ['MISLEADING', 'UI pública apresenta a tese antiga'];
      return ['SAFE_INFORMATIONAL', 'UI pública neutra'];
    case 'marketplace_code': case 'sql_marketplace': case 'internal_ui_marketplace': case 'infra_besu':
      return ['LEGACY_PRODUCT', 'implementação da tese antiga'];
    case 'reports':
      if (['tokenizacao', 'pericia_valuation', 'agio', 'garantia_caucao', 'compensacao'].includes(term)) return ['LEGACY_PRODUCT', 'relatório afirma valor/estratégia'];
      return ['SAFE_INFORMATIONAL', 'relatório de triagem'];
    case 'seed_jurisprudence': return ['HISTORICAL_QUOTE', 'ementa/resumo de decisão (fonte de terceiros)'];
    case 'seed_overrides': return ['HISTORICAL_QUOTE', 'ementa curada / body histórico'];
    case 'seed_library': return ['LEGAL_CLAIM_REQUIRING_CONTEXT', 'documento de terceiro (petição, laudo, material comercial)'];
    case 'docs_evolution': return ['LEGACY_PRODUCT', 'documento de desenho da tese antiga'];
    case 'docs_escopo_v1':
      if (['tokenizacao', 'garantia_caucao', 'pericia_valuation'].includes(term)) return ['LEGACY_PRODUCT', 'checklist v1 de tokenização/caução/perícia'];
      return ['SAFE_INFORMATIONAL', 'escopo v1 (levantamento)'];
    case 'docs_agent_context': return ['MISLEADING', 'contexto de agente descreve marketplace como vigente'];
    case 'tests': return ['LEGACY_PRODUCT', 'teste da tese antiga'];
    case 'fixtures': return ['LEGAL_CLAIM_REQUIRING_CONTEXT', 'fixture com dados de processos'];
    case 'api_core':
      if (['tokenizacao', 'pericia_valuation', 'agio', 'garantia_caucao', 'unit_face_value'].includes(term)) return ['LEGACY_PRODUCT', 'núcleo carrega campos da tese antiga'];
      return ['SAFE_INFORMATIONAL', 'núcleo neutro'];
    case 'internal_ui':
      if (['tokenizacao', 'pericia_valuation', 'agio', 'garantia_caucao', 'marketplace', 'investimento'].includes(term)) return ['LEGACY_PRODUCT', 'UI interna da tese antiga'];
      return ['SAFE_INFORMATIONAL', 'UI interna neutra'];
    default: return ['SAFE_INFORMATIONAL', 'sem regra específica'];
  }
}

const walk = (p) => {
  const abs = path.join(APP, p);
  if (!fs.existsSync(abs)) return [];
  const st = fs.statSync(abs);
  if (st.isFile()) return EXT.test(p) ? [p] : [];
  return fs.readdirSync(abs).flatMap((n) => (n === 'node_modules' || n === 'vendor' || n === 'dist') ? [] : walk(path.join(p, n)));
};

const rows = [];
for (const rel of SCAN.flatMap(walk)) {
  if (SKIP.some((re) => re.test(rel))) continue;
  const surface = surfaceOf(rel);
  const lines = fs.readFileSync(path.join(APP, rel), 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const [term, re] of TERMS) {
      if (!re.test(line)) continue;
      const [cls, why] = classify(surface, term, line, rel);
      const excerpt = line.trim().replace(/\s+/g, ' ').slice(0, 160);
      rows.push({ file: rel.replace(/\\/g, '/'), line: i + 1, surface, term, classification: cls, rule: why, excerpt });
    }
  });
}

fs.mkdirSync(OUT, { recursive: true });
const csvEsc = (s) => `"${String(s).replace(/"/g, '""')}"`;
fs.writeFileSync(path.join(OUT, `product-freeze-audit.${LABEL}.csv`),
  'file,line,surface,term,classification,rule,excerpt\n' + rows.map((r) => [r.file, r.line, r.surface, r.term, r.classification, r.rule, r.excerpt].map(csvEsc).join(',')).join('\n') + '\n');

const tally = (key) => rows.reduce((m, r) => ((m[r[key]] = (m[r[key]] || 0) + 1), m), {});
const bySurfaceAndClassification = {};
for (const r of rows) { const k = `${r.surface}|${r.classification}`; bySurfaceAndClassification[k] = (bySurfaceAndClassification[k] || 0) + 1; }
const summary = {
  label: LABEL, total: rows.length,
  byClassification: tally('classification'), bySurface: tally('surface'), byTerm: tally('term'),
  bySurfaceAndClassification,
  dangerous: rows.filter((r) => r.classification === 'DANGEROUS'),
  misleading: rows.filter((r) => r.classification === 'MISLEADING'),
};
fs.writeFileSync(path.join(OUT, `product-freeze-audit.${LABEL}.summary.json`), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ label: LABEL, total: summary.total, byClassification: summary.byClassification }, null, 2));
