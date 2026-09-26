// AssetOrigin (Passo 10). BESC deixa de comandar o domínio e passa a ser UMA origem.
// Somente fatos com fonte primária entram como eventos; o que não foi pesquisado fica
// RESEARCH_PENDING, sem eventos. Fontes: repo besc, relatorio/02 e docs/reconciliation/11
// (pesquisa de 25/09/2026), Protocolo e Justificação de 11/09/2008, comunicados do BB,
// Fato Relevante de 09/11/2020 (Bescval), cadastro CVM, COTAHIST B3.
//
// verification_level: PRIMARY (documento do emissor/regulador lido), SECONDARY (imprensa,
// escritório), UNVERIFIED (afirmado em algum material, sem fonte localizada).
export const ORIGIN_STATUS = Object.freeze(['ACTIVE', 'RESEARCH_PENDING', 'EXCLUDED']);

const ev = (id, date, type, description, facts, verificationLevel, source) =>
  Object.freeze({ id, date, type, description, facts: Object.freeze(facts), verificationLevel, source });

export const ASSET_ORIGINS = Object.freeze([
  Object.freeze({
    id: 'BESC',
    name: 'Banco do Estado de Santa Catarina S.A.',
    cnpj: '83.876.003/0001-10',
    cvmCode: '1104',
    status: 'ACTIVE',
    issuerStatus: 'EXTINCT_BY_MERGER',
    successor: Object.freeze({ id: 'BB', name: 'Banco do Brasil S.A.', role: 'sucessor universal e escriturador das próprias ações (BBAS3)' }),
    securityClasses: Object.freeze(['ON', 'PNA', 'PNB']),
    tickers: Object.freeze(['BSCT3', 'BSCT5', 'BSCT6']),
    family: Object.freeze(['BESC', 'BESCRI', 'BESC_LEASING', 'BESCREDI', 'BESCVAL']),
    corporateEvents: Object.freeze([
      ev('besc-1990-nominatividade', '1990-04-12', 'FORM_CHANGE', 'Lei 8.021/1990: ações devem ser nominativas; ações ao portador só circulam sob custódia com identificação (prazo de 2 anos).', {}, 'PRIMARY', 'Lei 8.021/1990, arts. 4º e 5º'),
      ev('besc-1987-grupamento', '1987-05-28', 'REVERSE_SPLIT', 'Agrupamento de ações citado em material histórico; data e proporção sem fonte primária localizada.', {}, 'UNVERIFIED', 'reference/portal-content.js (material de terceiros); ver ADENDO-RECONCILIACAO item 3'),
      ev('besc-2007-grupamento', '2007-11-01', 'REVERSE_SPLIT', 'AGE do BESC: grupamento de 503.932.710.389 ações em 167.977.568 (3.000:1).', { ratioFrom: 3000, ratioTo: 1 }, 'PRIMARY', 'Edital BCB PND 2002/003 × Protocolo 11/09/2008 item 3.2; COTAHIST B3'),
      ev('besc-2008-recesso', '2008-11-04', 'APPRAISAL_RIGHT', 'Recesso de 06/10 a 04/11/2008 a R$ 2,44675527 por ação BESC (só ações inscritas até 11/09/2008).', { reimbursementPerShare: '2.44675527', cutoff: '2008-09-11' }, 'PRIMARY', 'Protocolo item 7; avisos BB 01/10 e 03/10/2008'),
      ev('besc-2009-conversao', '2009-02-11', 'MERGER_EXCHANGE', 'Conversão automática e escritural: 1 ação ON do BB para 12,13308922 ações BESC (ON, PNA ou PNB); 1 ON BB para 1.592,261627 ON da BESCRI. Não houve prazo de "converter ou vender": os 30 dias eram do recesso.', { ratioFrom: '12.13308922', ratioTo: 1, successorSecurity: 'BBAS3' }, 'PRIMARY', 'Protocolo 11/09/2008 item 5.2; comunicado BB 06/02/2009'),
      ev('besc-2009-isin-segregado', '2009-02-11', 'ISIN_SEGREGATION', 'Ações oriundas dos aumentos de capital de 2000 e 2002 registradas em ISINs próprios do BB (BRBBASA04OR8 / BRBBASA05OR5) até decisão judicial final.', { isins: ['BRBBASA04OR8', 'BRBBASA05OR5'] }, 'PRIMARY', 'Comunicado BB 06/02/2009; BDI B3 27/09/2024'),
      ev('besc-2009-fracoes', '2009-06-26', 'FRACTION_SALE', 'Frações leiloadas em 20/05/2009 e pagas a R$ 20,649745763 por ação; valores de cadastro desatualizado retidos à disposição.', { pricePerShare: '20.649745763' }, 'PRIMARY', 'Comunicados BB 15/04/2009 e 25/06/2009'),
      ev('bescleasing-bescredi-2010', '2010-04-13', 'MERGER_EXCHANGE', 'BESC Leasing e BESCREDI incorporadas ao BB (1 BB : 25,5461 e 1 BB : 479,7168).', {}, 'PRIMARY', 'Fato Relevante BB 17/03/2010; cadastro CVM'),
      ev('bescval-2021', '2021-07-28', 'MERGER_EXCHANGE', 'Bescval incorporada ao BB: 1 ação ON do BB para 90.994,324415154 ações ON da Bescval; recesso a R$ 0,0006077429 por ação; frações vendidas em bolsa.', { ratioFrom: '90994.324415154', ratioTo: 1 }, 'PRIMARY', 'Fato Relevante BB 09/11/2020 (via canal de divulgação); ADENDO-RECONCILIACAO item 2'),
      ev('bbas3-2024-desdobramento', '2024-04-16', 'SPLIT', 'Desdobramento de BBAS3: 1 nova ação para cada ação existente.', { ratioFrom: 1, ratioTo: 2 }, 'SECONDARY', 'RI BB (investalk); histórico de eventos BBAS3'),
    ]),
    notes: 'Cautela física é evidência de titularidade histórica, não posição atual. A posição só existe no escriturador (Lei 6.404, art. 35).',
  }),
  // Origens pesquisadas parcialmente ou não pesquisadas: nenhuma é aceita para Claim enquanto o
  // multi_issuer_research_gate estiver CLOSED e o status não for ACTIVE. Fatos pesquisados ficam
  // na documentação de pesquisa (repo besc, docs/reconciliation/11), não no produto.
  ...['NOSSA_CAIXA', 'BEP', 'BANESPA', 'BEMGE', 'BANESTADO', 'BANERJ', 'BEG', 'BEC', 'BEM', 'BEA', 'BANEB', 'MERIDIONAL', 'CREDIREAL'].map((id) => Object.freeze({
    id, name: id, status: 'RESEARCH_PENDING', issuerStatus: 'UNKNOWN', successor: null, corporateEvents: Object.freeze([]),
    notes: 'RESEARCH_PENDING: não cadastrar fatos até pesquisa com fonte primária (ADR-010; multi_issuer_research_gate CLOSED).',
  })),
]);

export function getOrigin(id) {
  return ASSET_ORIGINS.find((o) => o.id === id) || null;
}

// Identificação de origem candidata por texto (nome do arquivo, campos digitados, OCR futuro).
// Heurística declarada: produz CANDIDATO, nunca fato; o analista confirma a origem.
const PATTERNS = [
  ['BESC', /\bBESC\b|banco do estado de santa catarina|\bBESCRI\b|\bBESCVAL\b/i],
  ['NOSSA_CAIXA', /nossa caixa/i],
  ['BANESPA', /\bBANESPA\b|banco do estado de s[ãa]o paulo/i],
  ['BEMGE', /\bBEMGE\b/i],
  ['BANESTADO', /\bBANESTADO\b/i],
  ['BANERJ', /\bBANERJ\b/i],
  ['BEP', /\bBEP\b|banco do estado do piau[íi]/i],
];

export function detectOriginCandidates(text) {
  const t = String(text || '');
  return PATTERNS.filter(([, re]) => re.test(t)).map(([id]) => ({ originId: id, status: getOrigin(id)?.status || 'RESEARCH_PENDING', basis: 'HEURISTIC_TEXT_MATCH' }));
}
