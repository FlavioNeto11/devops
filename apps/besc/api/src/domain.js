// Dominio da Plataforma de Levantamento BESC Tokenizacao.
// Enums canonicos (ESCOPO-FUNCIONAL.md §2.11), templates de checklist, motor de
// pendencias (§8.1), maquina de status (§8.2) e matriz de risco (§8.3).
// Este modulo NAO conclui juridicamente: apenas deriva pendencias/status/risco
// organizacionais a partir dos dados levantados.

export const ENUMS = {
  case_status: {
    new: 'Novo',
    docs_incomplete: 'Documentação incompleta',
    legal_review: 'Em análise jurídica',
    awaiting_calculation: 'Aguardando cálculo',
    awaiting_opinion: 'Aguardando parecer',
    ready_for_structuring: 'Apto para estruturação',
    ready_with_caveats: 'Apto com ressalvas',
    not_eligible: 'Não apto',
    archived: 'Arquivado',
  },
  holder_type: {
    pessoa_fisica: 'Pessoa física',
    empresa: 'Empresa',
    espolio: 'Espólio',
    herdeiro: 'Herdeiro',
    cessionario: 'Cessionário',
  },
  share_class: {
    ON: 'Ordinária (ON)',
    PNA: 'Preferencial classe A (PNA)',
    PNB: 'Preferencial classe B (PNB)',
    unknown: 'Desconhecida',
  },
  document_status: {
    pending: 'Pendente',
    received: 'Recebido',
    in_review: 'Em análise',
    validated: 'Validado',
    rejected: 'Rejeitado',
    needs_completion: 'Necessita complementação',
  },
  legal_risk: {
    low: 'Baixo',
    medium: 'Médio',
    high: 'Alto',
    undetermined: 'Indeterminado',
  },
  checklist_answer: {
    sim: 'Sim',
    nao: 'Não',
    parcial: 'Parcial',
    nao_avaliado: 'Não avaliado',
    nao_se_aplica: 'Não se aplica',
  },
  collateral_process_type: {
    execucao_civel: 'Execução cível',
    execucao_fiscal: 'Execução fiscal (LEF)',
    trabalhista: 'Reclamação trabalhista',
    cautelar_recursal: 'Caução cautelar/recursal',
    acordo_homologado: 'Acordo homologado',
    outro: 'Outro (verificar)',
  },
  right_type: {
    acionario_remanescente: 'Direito acionário remanescente',
    creditorio_indenizatorio: 'Direito creditório/indenizatório',
    litigioso: 'Direito litigioso',
    indeterminado: 'Indeterminado (verificar)',
  },
  liquidity_status: {
    remanescente_liquido: 'Remanescente/líquido',
    iliquido_condicional: 'Ilíquido/condicional',
    litigioso: 'Litigioso',
    indeterminado: 'Indeterminado (verificar)',
  },
  procedural_phase: {
    inicial: 'Fase inicial',
    sentenca: 'Com sentença',
    transito_em_julgado: 'Trânsito em julgado',
    desconhecida: 'Desconhecida (verificar)',
  },
  refusal_risk: {
    baixo: 'Baixo',
    medio: 'Médio',
    alto: 'Alto',
    indeterminado: 'Indeterminado',
  },
};

// ---------------------------------------------------------------------------
// Templates de checklist
// ---------------------------------------------------------------------------

// Documento: requirement = required | conditional | optional. `when(c)` decide a
// aplicabilidade dos condicionais (entra ou nao no denominador de completude).
export const DOCUMENT_TEMPLATE = [
  { key: 'identity_doc', label: 'Documento pessoal do titular', requirement: 'required', category: 'titular' },
  { key: 'address_proof', label: 'Comprovante de endereço', requirement: 'required', category: 'titular' },
  { key: 'power_of_attorney', label: 'Procuração', requirement: 'optional', category: 'titular' },
  { key: 'death_certificate', label: 'Certidão de óbito', requirement: 'conditional', category: 'sucessao', when: (c) => ['espolio', 'herdeiro'].includes(c.holder_type) },
  { key: 'formal_partition', label: 'Formal de partilha', requirement: 'conditional', category: 'sucessao', when: (c) => ['espolio', 'herdeiro'].includes(c.holder_type) },
  { key: 'besc_share_certificate', label: 'Certificado das ações BESC', requirement: 'required', category: 'acoes' },
  { key: 'share_statement', label: 'Extrato / comprovante das ações', requirement: 'required', category: 'acoes' },
  { key: 'acquisition_docs', label: 'Documentos de aquisição', requirement: 'required', category: 'acoes' },
  { key: 'initial_petition', label: 'Petição inicial', requirement: 'conditional', category: 'processo', when: (c) => (c.lawsuits || []).length > 0 },
  { key: 'sentence', label: 'Sentença', requirement: 'conditional', category: 'processo', when: (c) => (c.lawsuits || []).length > 0 },
  { key: 'appellate_decision', label: 'Acórdão', requirement: 'conditional', category: 'processo', when: (c) => (c.lawsuits || []).length > 0 },
  { key: 'appeals', label: 'Recursos', requirement: 'conditional', category: 'processo', when: (c) => (c.lawsuits || []).length > 0 },
  { key: 'judicial_calculations', label: 'Cálculos judiciais', requirement: 'conditional', category: 'processo', when: (c) => (c.lawsuits || []).length > 0 },
  { key: 'legal_opinion', label: 'Parecer jurídico', requirement: 'optional', category: 'analise' },
  { key: 'valuation_report', label: 'Laudo de avaliação', requirement: 'optional', category: 'analise' },
  { key: 'assignment_contract', label: 'Contrato de cessão', requirement: 'conditional', category: 'titularidade', when: (c) => c.holder_type === 'cessionario' },
  { key: 'ownership_docs', label: 'Documentos que comprovem titularidade', requirement: 'required', category: 'titularidade' },
  { key: 'assignability_docs', label: 'Documentos de possibilidade de cessão/caução', requirement: 'optional', category: 'titularidade' },
];

const DOC_BY_KEY = Object.fromEntries(DOCUMENT_TEMPLATE.map((d) => [d.key, d]));

export const LEGAL_TEMPLATE = [
  { key: 'right_exists', label: 'O direito existe?', category: 'existencia' },
  { key: 'transferable', label: 'O direito é transferível?', category: 'transferibilidade' },
  { key: 'assignable', label: 'Pode ser cedido?', category: 'transferibilidade' },
  { key: 'usable_as_collateral', label: 'Pode ser usado como caução?', category: 'garantia' },
  { key: 'prescription_risk', label: 'Há risco de prescrição/decadência?', category: 'riscos', invert: true },
  { key: 'liquidity_discussion', label: 'Há discussão sobre liquidez?', category: 'riscos', invert: true },
  { key: 'favorable_case_law', label: 'Existe jurisprudência favorável?', category: 'jurisprudencia' },
  { key: 'adverse_case_law', label: 'Existe jurisprudência contrária?', category: 'jurisprudencia', invert: true },
  { key: 'judge_may_refuse', label: 'O juiz pode recusar como garantia?', category: 'garantia', invert: true },
  { key: 'needs_external_opinion', label: 'Precisa de parecer externo?', category: 'analise' },
  { key: 'needs_capital_markets_expert', label: 'Precisa de avaliação por especialista em mercado de capitais?', category: 'analise' },
];

// Checklist de tokenizacao (§7.1) + itens regulatorios (§6.2) como categorias.
export const TOKENIZATION_TEMPLATE = [
  { key: 'what_tokenized', label: 'O que exatamente será tokenizado', category: 'objeto' },
  { key: 'asset_nature', label: 'Será ação, direito creditório, litigioso ou econômico', category: 'objeto' },
  { key: 'backing', label: 'Qual será o lastro', category: 'lastro' },
  { key: 'doc_custodian', label: 'Quem será o custodiante dos documentos', category: 'lastro' },
  { key: 'legal_validator', label: 'Quem validará juridicamente o lastro', category: 'lastro' },
  { key: 'estimated_value', label: 'Valor estimado do ativo', category: 'valor' },
  { key: 'fractionation', label: 'Haverá fracionamento?', category: 'estrutura' },
  { key: 'smart_contract', label: 'Haverá smart contract?', category: 'estrutura' },
  { key: 'blockchain_type', label: 'Blockchain pública ou permissionada?', category: 'estrutura' },
  { key: 'whitelist', label: 'Haverá whitelist de participantes?', category: 'estrutura' },
  { key: 'kyc', label: 'Haverá KYC?', category: 'estrutura' },
  { key: 'transfer_restriction', label: 'Haverá restrição de transferência?', category: 'estrutura' },
  { key: 'future_distribution', label: 'Haverá distribuição futura de valores?', category: 'estrutura' },
  { key: 'collateral_remuneration', label: 'Haverá remuneração pelo uso como garantia/caução?', category: 'estrutura' },
  // --- regulatorio (§6.2) ---
  { key: 'is_security', label: 'O token pode ser valor mobiliário? (CVM Parecer 40)', category: 'regulatorio', requiresLegal: true },
  { key: 'offer_registration', label: 'Precisa de registro/dispensa de oferta? (Res. CVM 88)', category: 'regulatorio', requiresLegal: true },
  { key: 'fidc_structure', label: 'Estrutura via FIDC / direito creditório? (Res. CVM 175)', category: 'regulatorio', requiresLegal: true },
  { key: 'vasp_bcb', label: 'Enquadra no Marco Legal de Ativos Virtuais / BCB (VASP)?', category: 'regulatorio', requiresLegal: true },
  { key: 'kyc_aml_pldft', label: 'Necessita PLD-FT / COAF?', category: 'regulatorio', requiresLegal: true },
  { key: 'lgpd', label: 'Conformidade LGPD (dados pessoais / whitelist)?', category: 'regulatorio', requiresLegal: true },
  { key: 'taxation', label: 'Aspectos tributários (ganho de capital) mapeados?', category: 'regulatorio', requiresLegal: true },
];

export const DOC_CATEGORY_LABELS = {
  titular: 'Titular',
  sucessao: 'Sucessão (espólio/herdeiros)',
  acoes: 'Ações BESC',
  processo: 'Processo judicial',
  analise: 'Análise / avaliação',
  titularidade: 'Titularidade e cessão',
};

export const TOKENIZATION_CATEGORY_LABELS = {
  objeto: 'O que será tokenizado',
  lastro: 'Lastro e custódia',
  valor: 'Valor',
  estrutura: 'Estrutura técnica',
  regulatorio: 'Regulatório (CVM/BCB/LGPD) — requer validação',
};

export const LEGAL_CATEGORY_LABELS = {
  existencia: 'Existência do direito',
  transferibilidade: 'Transferibilidade e cessão',
  garantia: 'Uso como garantia',
  riscos: 'Riscos',
  jurisprudencia: 'Jurisprudência',
  analise: 'Necessidade de análise externa',
};

// ---------------------------------------------------------------------------
// Instanciacao de um caso novo
// ---------------------------------------------------------------------------

export function instantiateDocuments() {
  return DOCUMENT_TEMPLATE.map((d) => ({
    key: d.key,
    label: d.label,
    requirement: d.requirement,
    category: d.category,
    status: 'pending',
    source: '',
    notes: '',
    attachments: [],
    updatedAt: null,
  }));
}

export function instantiateLegal() {
  return LEGAL_TEMPLATE.map((q) => ({ key: q.key, label: q.label, category: q.category, answer: 'nao_avaliado', notes: '', updatedAt: null }));
}

export function instantiateTokenization() {
  return TOKENIZATION_TEMPLATE.map((q) => ({
    key: q.key,
    label: q.label,
    category: q.category,
    requiresLegal: !!q.requiresLegal,
    answer: 'nao_avaliado',
    value: '',
    notes: '',
    updatedAt: null,
  }));
}

export function emptyCollateral() {
  return {
    active: false,
    process_type: '',
    debt_value: '',
    required_guarantee_value: '',
    usage_term: '',
    remuneration: '',
    refusal_risk: 'indeterminado',
    risk_bearer: '',
    contract_needed: false,
    docs_for_judge: '',
    notes: '',
    updatedAt: null,
  };
}

// ---------------------------------------------------------------------------
// Derivacoes (completude, pendencias, status, risco)
// ---------------------------------------------------------------------------

export function isDocApplicable(doc, c) {
  const tpl = DOC_BY_KEY[doc.key];
  if (!tpl) return true;
  if (tpl.requirement === 'optional') return false; // opcionais nao contam no denominador
  if (tpl.requirement === 'required') return true;
  return typeof tpl.when === 'function' ? !!tpl.when(c) : true;
}

export function computeDocPct(c) {
  const docs = c.documents || [];
  const applicable = docs.filter((d) => isDocApplicable(d, c));
  if (applicable.length === 0) return 0;
  const validated = applicable.filter((d) => d.status === 'validated').length;
  return Math.round((validated / applicable.length) * 100);
}

function docValidated(c, key) {
  const d = (c.documents || []).find((x) => x.key === key);
  return !!d && d.status === 'validated';
}

function legalAnswer(c, key) {
  const it = (c.legal || []).find((x) => x.key === key);
  return it ? it.answer : 'nao_avaliado';
}

function tokenAnswer(c, key) {
  const it = (c.tokenization || []).find((x) => x.key === key);
  return it ? it.answer : 'nao_avaliado';
}

const SEVERITY_ORDER = { info: 0, medium: 1, high: 2, blocker: 3 };

// Motor de pendencias (§8.1). Cada pendencia: key, type, severity, message,
// requiresLegal, resolve (aba/campo que resolve).
export function computePendencies(c) {
  const p = [];
  const add = (key, type, severity, message, requiresLegal, resolve) =>
    p.push({ key, type, severity, message, requiresLegal: !!requiresLegal, resolve });

  if (!docValidated(c, 'ownership_docs') && !docValidated(c, 'besc_share_certificate')) {
    add('missing_ownership_proof', 'titularidade', 'blocker', 'Falta comprovar titularidade das ações/direitos.', false, 'documents');
  }
  const hasLitigioso = c.right_type === 'litigioso';
  const lawsuitsWithNumber = (c.lawsuits || []).filter((l) => (l.number || '').trim() !== '');
  if (hasLitigioso && lawsuitsWithNumber.length === 0) {
    add('missing_process_number', 'processo', 'high', 'Falta o número do processo judicial de origem do direito litigioso.', false, 'lawsuits');
  }
  if (!docValidated(c, 'legal_opinion')) {
    add('missing_legal_opinion', 'legal', 'high', 'Falta parecer jurídico validado.', true, 'documents');
  }
  const hasCalc = (c.lawsuits || []).some((l) => String(l.updated_value || '').trim() !== '');
  if (!hasCalc) {
    add('missing_updated_calculation', 'legal', 'medium', 'Falta cálculo/valor atualizado do direito.', false, 'lawsuits');
  }
  if (legalAnswer(c, 'assignable') !== 'sim') {
    add('assignability_unverified', 'legal', 'high', 'Falta validar a possibilidade de cessão do direito.', true, 'legal');
  }
  if (tokenAnswer(c, 'asset_nature') === 'nao_avaliado') {
    add('undefined_legal_structure', 'tokenizacao', 'medium', 'Falta definir a estrutura jurídica (o que o direito é).', true, 'tokenization');
  }
  if (tokenAnswer(c, 'what_tokenized') === 'nao_avaliado') {
    add('undefined_token_represents', 'tokenizacao', 'medium', 'Falta definir o que exatamente o token representará.', false, 'tokenization');
  }
  const regItems = (c.tokenization || []).filter((x) => x.requiresLegal);
  if (regItems.some((x) => x.answer === 'nao_avaliado')) {
    add('regulatory_analysis_missing', 'tokenizacao', 'medium', 'Falta análise regulatória (CVM/BCB/LGPD).', true, 'tokenization');
  }
  if (c.collateral && c.collateral.active) {
    if (c.collateral.contract_needed && !docValidated(c, 'assignment_contract')) {
      add('missing_collateral_contract', 'caucao', 'medium', 'Falta contrato de caução/cessão para uso como garantia.', false, 'collateral');
    }
    if (!docValidated(c, 'valuation_report')) {
      add('missing_valuation_report', 'caucao', 'medium', 'Falta laudo de avaliação para lastrear a garantia.', false, 'documents');
    }
  }
  if (tokenAnswer(c, 'doc_custodian') === 'nao_avaliado') {
    add('missing_document_custodian', 'tokenizacao', 'info', 'Falta definir o custodiante documental.', false, 'tokenization');
  }

  p.sort((a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]);
  return p;
}

const AUTO_STATUSES = ['new', 'docs_incomplete', 'legal_review', 'awaiting_calculation', 'awaiting_opinion'];
const DECISION_STATUSES = ['ready_for_structuring', 'ready_with_caveats', 'not_eligible', 'archived'];

export function suggestStatus(c, pendencies) {
  const hasBlocker = pendencies.some((x) => x.severity === 'blocker');
  const openKeys = new Set(pendencies.map((x) => x.key));
  const highOrLegal = pendencies.filter((x) => x.severity === 'high' || x.requiresLegal);
  if (hasBlocker) return 'docs_incomplete';
  if (openKeys.has('missing_updated_calculation') && highOrLegal.length === 0) return 'awaiting_calculation';
  if (openKeys.has('missing_legal_opinion') && !openKeys.has('missing_updated_calculation')) return 'awaiting_opinion';
  if (highOrLegal.length > 0) return 'legal_review';
  if (openKeys.has('missing_updated_calculation')) return 'awaiting_calculation';
  return 'ready_for_structuring';
}

// Aplica transicoes automaticas (nunca decide status "confirmado"). Retorna o
// status resultante (pode ser igual ao atual). Regressoes por blocker sao automaticas.
export function applyAutoStatus(c, pendencies, suggested) {
  const current = c.status || 'new';
  if (current === 'archived') return current; // arquivado so sai manualmente
  const hasBlocker = pendencies.some((x) => x.severity === 'blocker');
  // regressao automatica: blocker reaparece -> volta para docs_incomplete
  if (hasBlocker && current !== 'not_eligible') return 'docs_incomplete';
  // avanco automatico apenas entre status nao-decisorios
  if (AUTO_STATUSES.includes(current) && AUTO_STATUSES.includes(suggested)) return suggested;
  return current;
}

export function isDecisionStatus(status) {
  return DECISION_STATUSES.includes(status);
}

// Matriz de risco (§8.3). Retorna { level, factors }.
export function computeRisk(c) {
  const factors = [];
  const F = (key, label, dir, essential) => factors.push({ key, label, direction: dir, essential });

  // ownership_proven
  const ownProven = docValidated(c, 'ownership_docs') || (docValidated(c, 'besc_share_certificate') && docValidated(c, 'share_statement'));
  const ownPending = (c.documents || []).some((d) => ['ownership_docs', 'besc_share_certificate'].includes(d.key) && d.status !== 'validated' && d.status !== 'rejected');
  F('ownership_proven', 'Titularidade comprovada', ownProven ? 'favorable' : ownPending ? 'unknown' : 'unfavorable', true);

  // procedural_phase
  const phases = (c.lawsuits || []).map((l) => l.phase).filter(Boolean);
  let phaseDir = 'unknown';
  if (c.right_type === 'acionario_remanescente') phaseDir = 'favorable';
  else if (phases.includes('transito_em_julgado')) phaseDir = 'favorable';
  else if (phases.includes('sentenca')) phaseDir = 'neutral';
  else if (c.right_type === 'litigioso' && (phases.length === 0 || phases.includes('inicial'))) phaseDir = 'unfavorable';
  F('procedural_phase', 'Fase processual / trânsito em julgado', phaseDir, true);

  // prescription_risk (invert: sim = ruim)
  const presc = legalAnswer(c, 'prescription_risk');
  F('prescription_risk', 'Risco de prescrição', presc === 'nao' ? 'favorable' : presc === 'sim' ? 'unfavorable' : presc === 'nao_avaliado' ? 'unknown' : 'neutral', false);

  // liquidity
  let liqDir = 'unknown';
  if (c.liquidity_status === 'remanescente_liquido') liqDir = 'favorable';
  else if (['iliquido_condicional', 'litigioso'].includes(c.liquidity_status)) liqDir = 'unfavorable';
  else if (c.liquidity_status === 'indeterminado' || !c.liquidity_status) liqDir = 'unknown';
  F('liquidity', 'Liquidez do direito', liqDir, true);

  // assignability
  const assign = legalAnswer(c, 'assignable');
  F('assignability', 'Possibilidade de cessão', assign === 'sim' ? 'favorable' : assign === 'nao' ? 'unfavorable' : 'unknown', true);

  // case_law
  const fav = legalAnswer(c, 'favorable_case_law');
  const adv = legalAnswer(c, 'adverse_case_law');
  let clDir = 'unknown';
  if (fav === 'sim' && adv !== 'sim') clDir = 'favorable';
  else if (adv === 'sim' && fav !== 'sim') clDir = 'unfavorable';
  else if (fav === 'nao_avaliado' && adv === 'nao_avaliado') clDir = 'unknown';
  else clDir = 'neutral';
  F('case_law_alignment', 'Alinhamento jurisprudencial', clDir, false);

  // regra de agregacao
  const essentialUnknown = factors.some((f) => f.essential && f.direction === 'unknown');
  if (essentialUnknown) return { level: 'undetermined', factors };

  const weight = { ownership_proven: 3, procedural_phase: 2, liquidity: 2, assignability: 2, prescription_risk: 2, case_law_alignment: 1 };
  let score = 0;
  let maxScore = 0;
  for (const f of factors) {
    const w = weight[f.key] || 1;
    maxScore += w;
    if (f.direction === 'favorable') score += w;
    else if (f.direction === 'unfavorable') score -= w;
  }
  const ratio = score / maxScore;
  let level;
  if (ratio >= 0.34) level = 'low';
  else if (ratio <= -0.2) level = 'high';
  else level = 'medium';
  return { level, factors };
}

// Valor estimado do caso: maior valor atualizado informado nos processos, senao
// o valor estimado no proprio caso.
export function estimatedValue(c) {
  const nums = (c.lawsuits || [])
    .map((l) => parseFloat(String(l.updated_value || l.claimed_value || '').replace(/[^0-9.,-]/g, '').replace(/\./g, '').replace(',', '.')))
    .filter((n) => !Number.isNaN(n));
  if (nums.length) return Math.max(...nums);
  const own = parseFloat(String(c.estimated_value || '').replace(/[^0-9.,-]/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isNaN(own) ? null : own;
}

// Enriquecimento de leitura: agrega derivados e aplica auto-status.
// Retorna { case: enriched, changed } (changed = auto-status alterou algo).
export function enrichCase(c) {
  const pendencies = computePendencies(c);
  const suggested = suggestStatus(c, pendencies);
  const nextStatus = applyAutoStatus(c, pendencies, suggested);
  const changed = nextStatus !== (c.status || 'new');
  const risk = computeRisk(c);
  const docPct = computeDocPct(c);
  const enriched = {
    ...c,
    status: nextStatus,
    derived: {
      pendencies,
      suggestedStatus: suggested,
      canConfirmReady: !pendencies.some((x) => x.severity === 'blocker' || x.severity === 'high'),
      risk,
      docPct,
      estimatedValue: estimatedValue(c),
      pendencyCount: pendencies.length,
      blockerCount: pendencies.filter((x) => x.severity === 'blocker').length,
    },
  };
  return { case: enriched, changed, nextStatus };
}
