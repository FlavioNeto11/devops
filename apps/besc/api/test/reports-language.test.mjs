// ADR-010, hardening P1 — relatórios internos do levantamento não afirmam valor. Laudo = alegação de
// parte, sem "valor atualizado" nem ágio calculado; toda seção com número de laudo ou de
// levantamento carrega o aviso fixo. Dados históricos preservados (os campos continuam no caso).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  enrichCase, instantiateDocuments, instantiateLegal, instantiateTokenization, emptyCollateral, emptyPericia,
} from '../src/domain.js';
import { buildReport, renderReportHtml, REPORT_TYPES, VALUATION_NOTICE } from '../src/reports.js';

const legacyCase = () => enrichCase({
  id: 'c1', holder_name: 'Titular Teste', holder_type: 'pessoa_fisica', estimated_value: '150.000,00', status: 'new',
  lawsuits: [], documents: instantiateDocuments(), legal: instantiateLegal(), tokenization: instantiateTokenization(),
  collateral: { ...emptyCollateral(), active: true, debt_value: '100', required_guarantee_value: '100' },
  pericia: { ...emptyPericia(), active: true, acquisition_price: '5.000,00', updated_value_pericial: '900.000,00', agio: '895.000,00', perito: 'Perito X' },
  statusHistory: [], precedents: [],
}).case;

const FORBIDDEN = [/Ágio/, /\bágio\b/i, /Valor pericial atualizado/i, /Valor atualizado \(laudo\)/i, /Cobertura/, /tokeniza/i, /Uso como caução/i];

test('nenhum tipo de relatório exibe ágio, "valor atualizado", cobertura de garantia ou tokenização', () => {
  const c = legacyCase();
  for (const type of Object.keys(REPORT_TYPES)) {
    const html = renderReportHtml(buildReport(c, type, () => null));
    for (const re of FORBIDDEN) assert.ok(!re.test(html), `${type}: ${re}`);
  }
});

test('laudo aparece como alegação de parte, com o aviso fixo, e o dado histórico é preservado', () => {
  const c = legacyCase();
  const r = buildReport(c, 'lawyer_report', () => null);
  const laudo = r.sections.find((s) => /Laudo informado pela parte/.test(s.heading));
  assert.equal(laudo.notice, VALUATION_NOTICE);
  assert.match(VALUATION_NOTICE, /NÃO É VALOR RECONHECIDO/);
  assert.match(VALUATION_NOTICE, /NÃO É VALOR DE MERCADO/);
  assert.match(VALUATION_NOTICE, /NÃO CONFIRMA TITULARIDADE/);
  const est = laudo.kv.find((k) => k.k === 'Estimativa de especialista declarada');
  assert.ok(est && /900/.test(est.v), 'número do laudo continua visível como declarado');
  const diff = laudo.kv.find((k) => /Diferencial alegado/.test(k.k));
  assert.ok(diff, 'diferencial só como alegação quando o laudo o informou');
  assert.equal(c.pericia.agio, '895.000,00', 'dado histórico intacto');
  const html = renderReportHtml(r);
  assert.ok(html.includes('NÃO CONFIRMA TITULARIDADE'));
  assert.match(r.disclaimer, /não são valor reconhecido nem de mercado/);
});

test('sem autor do laudo, o diferencial não aparece', () => {
  const c = legacyCase();
  c.pericia.perito = '';
  const laudo = buildReport(c, 'lawyer_report', () => null).sections.find((s) => /Laudo/.test(s.heading));
  assert.ok(!laudo.kv.some((k) => /Diferencial/.test(k.k)));
});
