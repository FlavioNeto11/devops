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
  // ADR-010: removidos tokenization_partner_report, collateral_analysis_report e
  // strategy_report (afirmavam perícia como valor, cobertura de garantia e estratégia de
  // liquidação sem confirmação externa). As rotas respondem 410 (governance/legacy-freeze.js);
  // os construtores abaixo ficam inalcançáveis até a remoção definitiva.
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
      { k: 'Mecanismo pretendido', v: label('mechanism', c.mechanism) },
      { k: 'Credor-alvo', v: c.target_creditor_type ? `${label('target_creditor_type', c.target_creditor_type)}${c.target_creditor_name ? ' — ' + c.target_creditor_name : ''}` : '—' },
      { k: 'Valor estimado', v: money(c.derived.estimatedValue) },
    ],
  };
}

// Bloco do laudo informado pela parte (ADR-010). Registro histórico de ALEGAÇÃO: não é valor reconhecido,
// não é valor de mercado e não confirma titularidade. A plataforma não calcula ágio nem "valor atualizado".
export const VALUATION_NOTICE = 'NÃO É VALOR RECONHECIDO · NÃO É VALOR DE MERCADO · NÃO CONFIRMA TITULARIDADE';
function blockPericia(c) {
  const p = c.pericia || {};
  const heading = 'Laudo informado pela parte (alegação de fonte)';
  if (!p.active) return { heading, empty: 'Nenhum laudo informado.' };
  const kv = [
    { k: 'Preço de aquisição declarado', v: money(p.acquisition_price) },
    { k: 'Data-base declarada', v: val(p.acquisition_date) },
    { k: 'Índice usado no laudo', v: label('monetary_index', p.monetary_index) },
    { k: 'Estimativa de especialista declarada', v: money(p.updated_value_pericial) },
  ];
  // diferencial só quando o próprio laudo o informou, e rotulado como alegação
  if (p.agio != null && p.agio !== '' && p.perito) kv.push({ k: 'Diferencial alegado pelo laudo (informado)', v: money(p.agio) });
  kv.push(
    { k: 'Autor do laudo', v: val(p.perito) },
    { k: 'Status do laudo', v: label('laudo_status', p.laudo_status) },
    { k: 'Autenticidade do papel (segundo o laudo)', v: label('authenticity_status', p.authenticity_status) },
  );
  return { heading, notice: VALUATION_NOTICE, kv };
}

// Precedentes de apoio: resolve os ids de jurisprudencia vinculados ao caso.
// `resolver` (id -> item) e injetado por buildReport (o dominio nao acopla a coleccao).
function blockPrecedents(c, resolver) {
  const ids = Array.isArray(c.precedents) ? c.precedents : [];
  const items = ids.map((id) => (resolver ? resolver(id) : null)).filter(Boolean);
  return {
    heading: 'Jurisprudência de apoio',
    list: items.map((j) => `${j.title}${j.tribunal ? ' — ' + j.tribunal : ''}${j.year ? ' (' + j.year + ')' : ''}`),
    empty: items.length === 0 ? 'Nenhum precedente vinculado.' : null,
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
  const rows = (c.documents || []).map((d) => [d.label, ENUMS.document_status[d.status], d.requirement, isDocApplicable(d, c) ? 'Sim' : 'Não', String((d.attachments || []).length)]);
  return {
    heading: `Situação documental (${c.derived.docPct}% concluída)`,
    table: { columns: ['Documento', 'Status', 'Exigência', 'Aplicável', 'Anexos'], rows },
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
  'parecer, oferta ou distribuição de valores mobiliários, nem recomendação de investimento. Valores de laudo ou de ' +
  'levantamento são alegações de fonte: não são valor reconhecido nem de mercado e não confirmam titularidade (ADR-010). ' +
  'Documento antigo não é ativo. Itens marcados como "requer validação jurídica" dependem de análise por profissional habilitado.';

export function buildReport(c, type, resolver) {
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
          { k: 'Mecanismo', v: label('mechanism', c.mechanism) },
          { k: 'Documentação', v: `${c.derived.docPct}%` },
          { k: 'Pendências', v: String(c.derived.pendencyCount) },
          { k: 'Risco jurídico', v: label('legal_risk', c.derived.risk.level) },
          { k: 'Valor alegado no levantamento', v: money(c.derived.estimatedValue) },
        ], notice: VALUATION_NOTICE },
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
      sections = [blockCase(c), blockProcesses(c), blockPericia(c), blockLegal(c), blockPrecedents(c, resolver), blockPendencies(c), blockRisk(c), blockStatus(c)];
      break;
    case 'full_case_report':
    default:
      sections = [
        blockCase(c),
        blockProcesses(c),
        blockPericia(c),
        blockDocuments(c),
        blockLegal(c),
        blockPrecedents(c, resolver),
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
  if (s.notice) inner += `<p class="notice">${esc(s.notice)}</p>`;
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
  .notice{margin:4px 0 8px;padding:6px 10px;border-left:3px solid #b7791f;background:#fbf7ec;font-size:11.5px;font-weight:700;letter-spacing:.02em;color:#6a5a2f}
  .disclaimer{margin-top:30px;padding:12px 14px;background:#fbf7ec;border:1px solid #e6d9b8;border-radius:6px;font-size:12px;color:#6a5a2f}
  .print-btn{position:fixed;top:16px;right:16px;background:var(--accent);color:#fff;border:0;padding:9px 16px;border-radius:6px;font-size:13px;cursor:pointer}
  @media print{.print-btn{display:none}body{background:#fff}.page{padding:0}}
</style></head>
<body>
  <button class="print-btn" onclick="window.print()">Imprimir / PDF</button>
  <div class="page">
    <header>
      <div class="kicker">Plataforma de Pesquisa e Recuperação de Ativos Legados · levantamento histórico</div>
      <h1>${esc(report.title)}</h1>
      <div class="meta">${esc(report.caseName)} · gerado em ${esc(dt)}</div>
    </header>
    ${report.sections.map(renderSection).join('\n')}
    <div class="disclaimer"><strong>Aviso legal.</strong> ${esc(report.disclaimer)}</div>
  </div>
</body></html>`;
}
