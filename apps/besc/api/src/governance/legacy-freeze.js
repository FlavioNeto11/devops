// Congelamento da tese antiga (ADR-010). As rotas abaixo implementavam o marketplace de
// tokens lastreados em "ações BESC" (título, valuation por perícia, fator tokens/ação,
// emissão, contratação, aluguel, substituição, faturamento, go-live) ou expunham dados
// do titular publicamente (catálogo/dossiê). Elas respondem 410 Gone ANTES de qualquer
// middleware de identidade ou autorização: nenhum header, token, perfil ou flag de
// frontend reabre essas operações. As leituras administrativas (GET /titles, /contracts,
// /invoices, /leases, /gate, relatórios financeiros) continuam sob RBAC como histórico
// somente leitura — DEPRECATED, mantidas para auditoria e migração.
export const LEGACY_FREEZE_CODE = 'LEGACY_THESIS_FROZEN';

export const FROZEN_ROUTES = Object.freeze([
  // títulos, valuation por perícia, parâmetros de tokenização, listagem, estado jurídico
  ['post', '/titles', 'MARKETPLACE_REAL'],
  ['post', '/titles/:id/valuations', 'MARKETPLACE_REAL'],
  ['post', '/titles/:id/parameters', 'TOKENIZATION_REAL'],
  ['post', '/parameters/:id/activate', 'TOKENIZATION_REAL'],
  ['post', '/titles/:id/listing', 'MARKETPLACE_REAL'],
  ['post', '/titles/:id/legal-status', 'MARKETPLACE_REAL'],
  // emissão, contratação, substituição, write-off
  ['post', '/titles/:id/batches', 'TOKENIZATION_REAL'],
  ['post', '/titles/:id/contracts', 'MARKETPLACE_REAL'],
  ['post', '/contracts/:id/substitute', 'MARKETPLACE_REAL'],
  ['post', '/contracts/:id/write-off', 'MARKETPLACE_REAL'],
  // receita: faturas, aluguel, custos
  ['post', '/invoices/:id/pay', 'REAL_MONEY'],
  ['post', '/contracts/:id/leases', 'REAL_MONEY'],
  ['post', '/leases/:id/close-competence', 'REAL_MONEY'],
  ['post', '/costs', 'REAL_MONEY'],
  // gate de go-live do marketplace (substituído pelas capacidades de código)
  ['put', '/gate/items/:key', 'MARKETPLACE_REAL'],
  ['post', '/gate/grant', 'MARKETPLACE_REAL'],
  ['post', '/gate/revoke', 'MARKETPLACE_REAL'],
  // portal do investidor: catálogo e dossiê públicos (expunham holder_name), contratação, termos
  ['get', '/marketplace/catalog', 'MARKETPLACE_REAL'],
  ['get', '/marketplace/titles/:id/dossier', 'MARKETPLACE_REAL'],
  ['post', '/marketplace/titles/:id/contract', 'REAL_INVESTMENT'],
  ['post', '/terms/:id/accept', 'REAL_INVESTMENT'],
  // levantamento: checklist de tokenização e "caução" deixam de ser editáveis
  ['put', '/cases/:id/tokenization/:key', 'TOKENIZATION_REAL'],
  ['put', '/cases/:id/collateral', 'MARKETPLACE_REAL'],
]);

// Relatórios removidos: afirmavam estratégia de liquidação, perícia como base de valor e
// cobertura de garantia sem confirmação externa.
export const REMOVED_REPORT_TYPES = Object.freeze(['strategy_report', 'tokenization_partner_report', 'collateral_analysis_report']);

function frozenResponse(capability) {
  return (req, res) => res.status(410).json({
    error: 'funcionalidade desativada: a plataforma deixou de operar marketplace, tokenização, aluguel e investimento (pivot para recuperação de ativos legados)',
    code: LEGACY_FREEZE_CODE,
    capability,
    adr: 'ADR-010',
  });
}

// Instalar ANTES de installFoundation/installMarketplace: o Express resolve na ordem de registro.
export function installLegacyFreeze(app) {
  for (const [method, route, capability] of FROZEN_ROUTES) app[method](route, frozenResponse(capability));
  // relatórios removidos: bloqueio antes do authorize das rotas de relatório
  const refuseRemovedReports = (req, res, next) => {
    if (REMOVED_REPORT_TYPES.includes(String(req.query.type || ''))) return frozenResponse('MARKETPLACE_REAL')(req, res);
    next();
  };
  app.get('/cases/:id/report', refuseRemovedReports);
  app.get('/cases/:id/report.html', refuseRemovedReports);
}
