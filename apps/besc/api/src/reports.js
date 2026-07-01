// Geracao de relatorios (§9). Recebe um caso JA enriquecido (com .derived) e
// produz uma estrutura de secoes + um HTML imprimivel com aviso legal.
import {
  ENUMS,
  DOC_CATEGORY_LABELS,
  LEGAL_CATEGORY_LABELS,
  TOKENIZATION_CATEGORY_LABELS,
  isDocApplicable,
} from './domain.js';

const label = (enumName, v) => (ENUMS[enumName] && ENUMS[enumName][v]) || v || '—';
const val = (v) => (v === null || v === undefined || v === '' ? '—' : v);

function money(n) {
  if (n === null || n === undefined || n === '') return '—';
  const num = typeof n === 'number' ? n : parseFloat(String(n).replace(/[^0-9.,-]/g, '').replace(/\./g, '').replace(',', '.'));
  if (Number.isNaN(num)) return String(n);
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export const REPORT_TYPES = {
  full_case_report: 'Relatório completo do caso',
  pending_checklist: 'Checklist de pendências',
  executive_summary: 'Resumo executivo',
  risk_matrix: 'Matriz de riscos',
  missing_documents_list: 'Lista de documentos faltantes',
  lawyer_report: 'Relatório para advogado',
  tokenization_partner_report: 'Relatório para parceiro de tokenização',
  collateral_analysis_report: 'Relatório para análise de uso como caução',
};

// --- blocos reutilizaveis ---
function blockCase(c) {
  return {
    heading: 'Dados do caso',
    kv: [
      { k: 'Titular', v: val(c.holder_name) },
      { k: 'CPF/CNPJ', v: val(c.holder_tax_id) },
      { k: 'Tipo de titular', v: label('holder_type', c.holder_type) },
      { k: 'Contato', v: val(c.contact) },
      { k: 'Origem das ações/direitos', v: val(c.origin) },
      { k: 'Data aproximada de aquisição', v: val(c.acquisition_date) },
      { k: 'Quantidade de ações', v: val(c.share_quantity) },
      { k: 'Classe das ações', v: label('share_class', c.share_class) },
      { k: 'Nº de certificados', v: val(c.certificate_count) },
      { k: 'Banco/escriturador', v: val(c.registrar) },
      { k: 'Tipo de direito', v: label('right_type', c.right_type) },
      { k: 'Situação de liquidez', v: label('liquidity_status', c.liquidity_status) },
      { k: 'Valor estimado', v: money(c.derived.estimatedValue) },
    ],
  };
}

function blockProcesses(c) {
  const rows = (c.lawsuits || []).map((l) => [
    val(l.number), val(l.court), val(l.type), label('procedural_phase', l.phase),
    l.transited ? 'Sim' : 'Não', money(l.updated_value), label('legal_risk', l.risk),
  ]);
  return {
    heading: 'Processos judiciais',
    table: { columns: ['Número', 'Tribunal', 'Tipo', 'Fase', 'Trânsito', 'Valor atualizado', 'Risco'], rows },
    empty: rows.length === 0 ? 'Nenhum processo cadastrado.' : null,
  };
}

function blockDocuments(c) {
  const rows = (c.documents || []).map((d) => [d.label, ENUMS.document_status[d.status], d.requirement, isDocApplicable(d, c) ? 'Sim' : 'Não']);
  return {
    heading: `Situação documental (${c.derived.docPct}% concluída)`,
    table: { columns: ['Documento', 'Status', 'Exigência', 'Aplicável'], rows },
  };
}

function blockMissingDocs(c) {
  const missing = (c.documents || []).filter((d) => isDocApplicable(d, c) && d.status !== 'validated');
  return {
    heading: 'Documentos faltantes / não validados',
    list: missing.map((d) => `${d.label} — ${ENUMS.document_status[d.status]}`),
    empty: missing.length === 0 ? 'Todos os documentos aplicáveis estão validados.' : null,
  };
}

function blockLegal(c) {
  const rows = (c.legal || []).map((q) => [q.label, ENUMS.checklist_answer[q.answer], val(q.notes)]);
  return { heading: 'Checklist jurídico', table: { columns: ['Pergunta', 'Resposta', 'Observações'], rows } };
}

function blockTokenization(c, onlyReg) {
  const items = (c.tokenization || []).filter((q) => (onlyReg ? q.requiresLegal : !q.requiresLegal));
  const rows = items.map((q) => [q.label, ENUMS.checklist_answer[q.answer], val(q.value || q.notes)]);
  return {
    heading: onlyReg ? 'Checklist regulatório (requer validação)' : 'Checklist de tokenização',
    table: { columns: ['Item', 'Resposta', 'Definição/observação'], rows },
  };
}

function blockCollateral(c) {
  const col = c.collateral || {};
  if (!col.active) return { heading: 'Uso como caução/garantia', empty: 'Avaliação de caução não iniciada.' };
  return {
    heading: 'Uso como caução/garantia',
    kv: [
      { k: 'Tipo de processo de destino', v: label('collateral_process_type', col.process_type) },
      { k: 'Valor da dívida', v: money(col.debt_value) },
      { k: 'Valor necessário de garantia', v: money(col.required_guarantee_value) },
      { k: 'Cobertura', v: coverage(col) },
      { k: 'Prazo de uso', v: val(col.usage_term) },
      { k: 'Remuneração pelo uso', v: val(col.remuneration) },
      { k: 'Risco de recusa judicial', v: label('refusal_risk', col.refusal_risk) },
      { k: 'Quem assume o risco', v: val(col.risk_bearer) },
      { k: 'Contrato necessário', v: col.contract_needed ? 'Sim' : 'Não' },
      { k: 'Documentos p/ apresentar ao juiz', v: val(col.docs_for_judge) },
    ],
  };
}

function coverage(col) {
  const debt = parseFloat(String(col.debt_value || '').replace(/[^0-9.,-]/g, '').replace(/\./g, '').replace(',', '.'));
  const guar = parseFloat(String(col.required_guarantee_value || '').replace(/[^0-9.,-]/g, '').replace(/\./g, '').replace(',', '.'));
  if (Number.isNaN(debt) || Number.isNaN(guar) || debt === 0) return '—';
  return `${Math.round((guar / debt) * 100)}%`;
}

function blockPendencies(c) {
  const rows = c.derived.pendencies.map((p) => [
    { blocker: 'Bloqueante', high: 'Alta', medium: 'Média', info: 'Informativa' }[p.severity],
    p.message,
    p.requiresLegal ? 'Sim' : 'Não',
  ]);
  return {
    heading: `Pendências abertas (${c.derived.pendencyCount})`,
    table: { columns: ['Severidade', 'Pendência', 'Requer validação jurídica'], rows },
    empty: rows.length === 0 ? 'Sem pendências abertas.' : null,
  };
}

function blockRisk(c) {
  const r = c.derived.risk;
  const dirLabel = { favorable: 'Favorável', unfavorable: 'Desfavorável', unknown: 'Não verificado', neutral: 'Neutro' };
  const rows = r.factors.map((f) => [f.label, dirLabel[f.direction] || f.direction, f.essential ? 'Sim' : 'Não']);
  return {
    heading: `Matriz de risco — risco jurídico indicativo: ${label('legal_risk', r.level)}`,
    table: { columns: ['Fator', 'Direção', 'Essencial'], rows },
  };
}

function blockStatus(c) {
  const next = c.derived.pendencies.slice(0, 5).map((p) => p.message);
  return {
    heading: 'Status e próximos passos',
    kv: [
      { k: 'Status atual', v: label('case_status', c.status) },
      { k: 'Status sugerido', v: label('case_status', c.derived.suggestedStatus) },
    ],
    list: next.length ? next : ['Sem pendências: caso pronto para revisão/estruturação (confirmação manual).'],
  };
}

const DISCLAIMER =
  'Este relatório é um instrumento de organização e levantamento documental. Não constitui aconselhamento jurídico, ' +
  'parecer, oferta ou distribuição de valores mobiliários, nem recomendação de investimento. Itens marcados como ' +
  '"requer validação jurídica" dependem de análise por profissional habilitado.';

export function buildReport(c, type) {
  const t = REPORT_TYPES[type] ? type : 'full_case_report';
  const base = { type: t, title: REPORT_TYPES[t], caseName: c.holder_name || '(sem titular)', generatedAt: new Date().toISOString(), disclaimer: DISCLAIMER };
  let sections;
  switch (t) {
    case 'pending_checklist':
      sections = [blockPendencies(c), blockMissingDocs(c)];
      break;
    case 'executive_summary':
      sections = [
        { heading: 'Resumo', kv: [
          { k: 'Titular', v: val(c.holder_name) },
          { k: 'Status', v: label('case_status', c.status) },
          { k: 'Documentação', v: `${c.derived.docPct}%` },
          { k: 'Pendências', v: String(c.derived.pendencyCount) },
          { k: 'Risco jurídico', v: label('legal_risk', c.derived.risk.level) },
          { k: 'Valor estimado', v: money(c.derived.estimatedValue) },
        ] },
        blockStatus(c),
      ];
      break;
    case 'risk_matrix':
      sections = [blockRisk(c), blockStatus(c)];
      break;
    case 'missing_documents_list':
      sections = [blockMissingDocs(c)];
      break;
    case 'lawyer_report':
      sections = [blockCase(c), blockProcesses(c), blockLegal(c), blockPendencies(c), blockRisk(c), blockStatus(c)];
      break;
    case 'tokenization_partner_report':
      sections = [
        { heading: 'Resumo', kv: [
          { k: 'Titular', v: val(c.holder_name) },
          { k: 'Tipo de direito', v: label('right_type', c.right_type) },
          { k: 'Liquidez', v: label('liquidity_status', c.liquidity_status) },
          { k: 'Valor estimado', v: money(c.derived.estimatedValue) },
          { k: 'Risco jurídico', v: label('legal_risk', c.derived.risk.level) },
        ] },
        blockTokenization(c, false),
        blockTokenization(c, true),
        blockMissingDocs(c),
        blockPendencies(c),
      ];
      break;
    case 'collateral_analysis_report':
      sections = [blockCase(c), blockCollateral(c), blockLegal(c), blockRisk(c), blockPendencies(c)];
      break;
    case 'full_case_report':
    default:
      sections = [
        blockCase(c),
        blockProcesses(c),
        blockDocuments(c),
        blockLegal(c),
        blockTokenization(c, true),
        blockTokenization(c, false),
        blockCollateral(c),
        blockPendencies(c),
        blockRisk(c),
        blockStatus(c),
      ];
      break;
  }
  return { ...base, sections };
}

// --- render HTML imprimivel ---
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

function renderSection(s) {
  let inner = '';
  if (s.empty) inner += `<p class="empty">${esc(s.empty)}</p>`;
  if (s.kv) inner += '<table class="kv"><tbody>' + s.kv.map((r) => `<tr><th>${esc(r.k)}</th><td>${esc(r.v)}</td></tr>`).join('') + '</tbody></table>';
  if (s.table && s.table.rows.length) {
    inner += '<table class="grid"><thead><tr>' + s.table.columns.map((c) => `<th>${esc(c)}</th>`).join('') + '</tr></thead><tbody>' +
      s.table.rows.map((row) => '<tr>' + row.map((cell) => `<td>${esc(cell)}</td>`).join('') + '</tr>').join('') + '</tbody></table>';
  }
  if (s.list && s.list.length) inner += '<ul>' + s.list.map((li) => `<li>${esc(li)}</li>`).join('') + '</ul>';
  return `<section><h2>${esc(s.heading)}</h2>${inner}</section>`;
}

export function renderReportHtml(report) {
  const dt = new Date(report.generatedAt).toLocaleString('pt-BR');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(report.title)} — ${esc(report.caseName)}</title>
<style>
  :root{--ink:#1c2733;--muted:#5b6b7a;--line:#d7dee6;--accent:#0f5c6b;--bg:#f4f6f8}
  *{box-sizing:border-box}
  body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:var(--ink);margin:0;background:var(--bg)}
  .page{max-width:900px;margin:0 auto;background:#fff;padding:40px 48px}
  header{border-bottom:3px solid var(--accent);padding-bottom:14px;margin-bottom:24px}
  .kicker{color:var(--accent);font-weight:700;letter-spacing:.04em;text-transform:uppercase;font-size:12px}
  h1{font-size:24px;margin:6px 0 2px}
  .meta{color:var(--muted);font-size:13px}
  section{margin:22px 0;page-break-inside:avoid}
  h2{font-size:16px;color:var(--accent);border-bottom:1px solid var(--line);padding-bottom:6px;margin:0 0 10px}
  table{width:100%;border-collapse:collapse;font-size:13px;margin:4px 0}
  table.kv th{width:34%;text-align:left;color:var(--muted);font-weight:600;vertical-align:top;padding:4px 8px 4px 0}
  table.kv td{padding:4px 0}
  table.grid th{background:#eef2f5;text-align:left;padding:7px 8px;border:1px solid var(--line);font-size:12px}
  table.grid td{padding:6px 8px;border:1px solid var(--line);vertical-align:top}
  ul{margin:6px 0;padding-left:20px} li{margin:3px 0;font-size:13px}
  .empty{color:var(--muted);font-style:italic;font-size:13px}
  .disclaimer{margin-top:30px;padding:12px 14px;background:#fbf7ec;border:1px solid #e6d9b8;border-radius:6px;font-size:12px;color:#6a5a2f}
  .print-btn{position:fixed;top:16px;right:16px;background:var(--accent);color:#fff;border:0;padding:9px 16px;border-radius:6px;font-size:13px;cursor:pointer}
  @media print{.print-btn{display:none}body{background:#fff}.page{padding:0}}
</style></head>
<body>
  <button class="print-btn" onclick="window.print()">Imprimir / PDF</button>
  <div class="page">
    <header>
      <div class="kicker">Plataforma de Levantamento BESC Tokenização</div>
      <h1>${esc(report.title)}</h1>
      <div class="meta">${esc(report.caseName)} · gerado em ${esc(dt)}</div>
    </header>
    ${report.sections.map(renderSection).join('\n')}
    <div class="disclaimer"><strong>Aviso legal.</strong> ${esc(report.disclaimer)}</div>
  </div>
</body></html>`;
}
