/**
 * Mapa central de status para badges/cores/labels.
 *
 * Fonte única consumida por SicatStatusBadge. Cada domínio (manifest, job, cdf, dmr)
 * declara seu próprio mapa de status -> tone e status -> label pt-BR.
 *
 * Tonalidades alinhadas a tokens.generated.css (--color-status-*) e ao tema Vuetify.
 *
 * Tones disponíveis:
 *   neutral  -> cinza claro    (queued, draft, cancelled)
 *   running  -> azul ciano     (processing, printing, retry)
 *   warning  -> amarelo        (retry_wait, pendente operacional, envio sem confirmação)
 *   success  -> verde          (succeeded, submitted, completed)
 *   error    -> vermelho       (failed, dlq, error)
 */

export const STATUS_TONES = Object.freeze(['neutral', 'running', 'warning', 'success', 'error']);

/**
 * Status INTERNO do manifesto quando o envio foi despachado para a CETESB e o
 * SICAT **não sabe** se o MTR nasceu (resposta perdida/ilegível do SIGOR).
 *
 * É um terceiro estado, não um sinônimo dos outros dois:
 *   - `submitted` = sabemos que nasceu;
 *   - `failed`    = sabemos que NÃO nasceu;
 *   - `submit_unconfirmed` = não sabemos.
 *
 * Exportado como constante porque o token é consumido fora deste módulo
 * (`features/mtr/list/manifestHelpers.js` decide ações a partir dele) — string
 * literal duplicada é como um dos dois lados sai do ar sem ninguém notar.
 */
export const MANIFEST_STATUS_SUBMIT_UNCONFIRMED = 'submit_unconfirmed';

const JOB_STATUS_TONES = Object.freeze({
  queued: 'neutral',
  pending: 'neutral',
  scheduled: 'neutral',
  running: 'running',
  retry_wait: 'warning',
  succeeded: 'success',
  submitted: 'success',
  finished: 'success',
  completed: 'success',
  failed: 'error',
  dlq: 'error',
  cancelled: 'neutral'
});

const JOB_STATUS_LABELS = Object.freeze({
  queued: 'Na fila',
  pending: 'Pendente',
  scheduled: 'Agendado',
  running: 'Executando',
  retry_wait: 'Aguardando retry',
  succeeded: 'Concluído',
  submitted: 'Submetido',
  finished: 'Finalizado',
  completed: 'Concluído',
  failed: 'Falhou',
  dlq: 'DLQ',
  cancelled: 'Cancelado'
});

const MANIFEST_STATUS_TONES = Object.freeze({
  draft: 'neutral',
  rascunho: 'neutral',
  queued: 'neutral',
  queued_submit: 'neutral',
  pending: 'running',
  processing: 'running',
  printing: 'running',
  submitted: 'success',
  succeeded: 'success',
  completed: 'success',
  received: 'success',
  cancelled: 'neutral',
  // Envio despachado, desfecho DESCONHECIDO. Tem de ser 'warning': sem entrada
  // própria a chave caía no fallback por substring (que não reconhece nada aqui)
  // e virava 'neutral' — cinza, indistinguível de rascunho, ESCONDENDO do
  // operador que existe um MTR possivelmente órfão na CETESB. Jogá-la no balde
  // de falha seria o erro oposto: a tela passaria a MENTIR dizendo que falhou.
  [MANIFEST_STATUS_SUBMIT_UNCONFIRMED]: 'warning',
  failed: 'error',
  error: 'error'
});

// Situações CETESB chegam em pt-BR livre ('Salvo', 'Recebido', 'Armazenado'...)
// e não casam com as chaves exatas acima — sem este fallback por substring,
// tudo vira cinza neutro e o operador perde a leitura de relance do que é
// acionável (Salvo = aguardando baixa; Recebido = pronto para CDF).
function resolveManifestToneBySubstring(key) {
  if (!key) return null;
  if (key.includes('receb')) return 'success';
  if (key.includes('salvo')) return 'running';
  if (key.includes('armazenado')) return 'warning';
  if (key.includes('cancel')) return 'neutral';
  if (key.includes('falha') || key.includes('erro') || key.includes('fail') || key.includes('error')) return 'error';
  return null;
}

// Vocabulário CANÔNICO das situações CETESB (texto livre pt-BR vindo do SIGOR:
// 'Salvo', 'Recebido', 'Armazenado temporariamente'...). Sem este mapa a lista
// mostrava o termo CRU ('Salvo') enquanto o filtro da mesma tela chamava o mesmo
// estado de 'Aguardando baixa' — dois vocabulários para o mesmo status.
// Ordem importa: o primeiro fragmento que casar vence.
const MANIFEST_SITUATION_LABEL_RULES = Object.freeze([
  ['receb', 'Recebido'],
  ['salvo', 'Aguardando baixa'],
  ['armazenado', 'Armazenado temporariamente'],
  ['trâns', 'Em trânsito'],
  ['trans', 'Em trânsito'],
  ['rejeit', 'Rejeitado'],
  ['cancel', 'Cancelado']
]);

const MANIFEST_STATUS_LABELS = Object.freeze({
  draft: 'Rascunho',
  rascunho: 'Rascunho',
  queued: 'Na fila',
  queued_submit: 'Aguardando envio',
  pending: 'Em processamento',
  processing: 'Em processamento',
  printing: 'Imprimindo',
  submitted: 'Enviado',
  succeeded: 'Concluído',
  completed: 'Concluído',
  received: 'Recebido',
  cancelled: 'Cancelado',
  // Linguagem de operador, não de máquina: sem esta entrada o humanizador
  // devolvia 'Submit Unconfirmed' (jargão em inglês) na coluna Situação.
  [MANIFEST_STATUS_SUBMIT_UNCONFIRMED]: 'Envio sem confirmação',
  failed: 'Falhou',
  error: 'Erro'
});

const CDF_STATUS_TONES = Object.freeze({
  pending: 'running',
  processing: 'running',
  generating: 'running',
  generated: 'success',
  ready: 'success',
  succeeded: 'success',
  completed: 'success',
  downloaded: 'success',
  failed: 'error',
  error: 'error',
  cancelled: 'neutral'
});

const CDF_STATUS_LABELS = Object.freeze({
  pending: 'Pendente',
  processing: 'Em processamento',
  generating: 'Gerando',
  generated: 'Gerado',
  ready: 'Pronto',
  succeeded: 'Concluído',
  completed: 'Concluído',
  downloaded: 'Baixado',
  failed: 'Falhou',
  error: 'Erro',
  cancelled: 'Cancelado'
});

const DMR_STATUS_TONES = Object.freeze({
  draft: 'neutral',
  rascunho: 'neutral',
  pending_review: 'warning',
  pending: 'warning',
  consolidating: 'running',
  consolidated: 'running',
  validating: 'running',
  submitting: 'running',
  submitted: 'success',
  succeeded: 'success',
  completed: 'success',
  failed_validation: 'error',
  failed_remote: 'error',
  failed: 'error',
  error: 'error',
  cancelled: 'neutral'
});

const DMR_STATUS_LABELS = Object.freeze({
  draft: 'Rascunho',
  rascunho: 'Rascunho',
  pending_review: 'Aguardando revisão',
  pending: 'Pendente',
  consolidating: 'Consolidando',
  consolidated: 'Consolidada',
  validating: 'Validando',
  submitting: 'Enviando',
  submitted: 'Enviada',
  succeeded: 'Concluída',
  completed: 'Concluída',
  failed_validation: 'Falha de validação',
  failed_remote: 'Falha no gateway',
  failed: 'Falhou',
  error: 'Erro',
  cancelled: 'Cancelada'
});

// -----------------------------------------------------------------------------
// Transporte (DL-103, programa Onda 1.5/PR-F1) — bounded context separado do
// ambiental. Três domínios novos: a máquina de estados de `TransportOperation`
// (13 estados — transport-state-machine.ts), o resultado PÓS-CLAMP de cada
// check do motor de compliance (PASS/WARN/BLOCK/NOT_APPLICABLE, sempre em
// MAIÚSCULO no contrato — normalizeKey já faz o lowercase na leitura) e o
// ciclo de vida do CIOT (Fase C — sem UI ainda nesta onda, mas o vocabulário
// nasce aqui para não duplicar quando a tela chegar).
// -----------------------------------------------------------------------------

const TRANSPORT_OPERATION_STATUS_TONES = Object.freeze({
  draft: 'neutral',
  validating: 'running',
  blocked: 'error',
  ready_for_contract: 'neutral',
  contracted: 'success',
  ciot_pending: 'running',
  ciot_registered: 'neutral',
  fiscal_pending: 'running',
  ready_for_release: 'neutral',
  in_transit: 'running',
  completion_pending: 'running',
  completed: 'success',
  cancelled: 'error'
});

const TRANSPORT_OPERATION_STATUS_LABELS = Object.freeze({
  draft: 'Rascunho',
  validating: 'Validando',
  blocked: 'Bloqueada',
  ready_for_contract: 'Pronta para contratar',
  contracted: 'Contratada',
  ciot_pending: 'CIOT pendente',
  ciot_registered: 'CIOT registrado',
  fiscal_pending: 'Fiscal pendente',
  ready_for_release: 'Pronta para liberação',
  in_transit: 'Em trânsito',
  completion_pending: 'Conclusão pendente',
  completed: 'Concluída',
  cancelled: 'Cancelada'
});

// Status PÓS-CLAMP de UM check de compliance (`TransporteConformidadeCheckResource.status`
// e `overallStatus` da avaliação de gate) — o contrato devolve sempre em
// MAIÚSCULO (PASS/WARN/BLOCK/NOT_APPLICABLE); `normalizeKey` faz o lowercase.
const COMPLIANCE_STATUS_TONES = Object.freeze({
  pass: 'success',
  warn: 'warning',
  block: 'error',
  not_applicable: 'neutral'
});

const COMPLIANCE_STATUS_LABELS = Object.freeze({
  pass: 'Conforme',
  warn: 'Atenção',
  block: 'Bloqueado',
  not_applicable: 'Não aplicável'
});

// Ciclo de vida do CIOT — Fase C do programa (sem tela nesta onda). Vocabulário
// mínimo registrado agora para a UI futura não inventar um segundo léxico.
const CIOT_STATUS_TONES = Object.freeze({
  pre_validation: 'neutral',
  requested: 'running',
  // DL-102: a resposta do provedor se perdeu depois do dispatch — NUNCA é
  // `rejected` (decisão definitiva). Sem entrada própria a chave cairia no
  // fallback 'neutral' e esconderia do operador que existe uma solicitação
  // possivelmente órfã (mesmo raciocínio de MANIFEST_STATUS_SUBMIT_UNCONFIRMED).
  request_unconfirmed: 'warning',
  registered: 'success',
  rectified: 'warning',
  closed: 'success',
  cancelled: 'neutral',
  rejected: 'error',
  blocked: 'error'
});

const CIOT_STATUS_LABELS = Object.freeze({
  pre_validation: 'Pré-validação',
  requested: 'Solicitado',
  request_unconfirmed: 'Solicitação sem confirmação',
  registered: 'Registrado',
  rectified: 'Retificado',
  closed: 'Encerrado',
  cancelled: 'Cancelado',
  rejected: 'Rejeitado',
  blocked: 'Bloqueado'
});

// -----------------------------------------------------------------------------
// Transporte (PR-H2, frontend completo) — domínios que faltavam no PR-F1
// mínimo: status DECLARADO de RNTRC do transportador (cadastro), tentativa de
// VERIFICAÇÃO de RNTRC, alocação de VPO, validação/autorização de documento
// fiscal (dois domínios separados — são dimensões independentes do mesmo
// TransporteFiscalDocumentResource, ver TransporteDfeValidationIssue/
// authorizationStatus no OpenAPI), apólice de seguro, PGR, revisão de tabela
// de piso e emissão de DF-e sandbox-ready. Cada um espelha 1:1 um enum do
// contrato — igual ao vocabulário 'ciot' acima, nunca reaproveitar por
// substring entre domínios diferentes.
// -----------------------------------------------------------------------------

// TransporteTransportadorResource.rntrcStatus — estado DECLARADO no cadastro
// (o que o operador afirma, sujeito a checagem por `rntrc-verification`).
const RNTRC_STATUS_TONES = Object.freeze({
  unknown: 'neutral',
  active: 'success',
  suspended: 'warning',
  cancelled: 'neutral',
  expired: 'error'
});

const RNTRC_STATUS_LABELS = Object.freeze({
  unknown: 'Não verificado',
  active: 'Ativo',
  suspended: 'Suspenso',
  cancelled: 'Cancelado',
  expired: 'Vencido'
});

// TransporteRntrcVerificacaoResource.requestedStatus — desfecho de UMA
// tentativa de verificação (síncrona `manual` ou assíncrona `open_data`).
const RNTRC_VERIFICATION_TONES = Object.freeze({
  pending: 'running',
  succeeded: 'success',
  failed: 'error'
});

const RNTRC_VERIFICATION_LABELS = Object.freeze({
  pending: 'Em verificação',
  succeeded: 'Concluída',
  failed: 'Falhou'
});

// TransporteVpoAllocationResource.status — recurso MUTÁVEL (uma linha por
// operação, ao contrário do CIOT). `acquisition_unconfirmed` segue o mesmo
// padrão DL-102 do CIOT: NUNCA é falha definitiva.
const VPO_ALLOCATION_TONES = Object.freeze({
  pending: 'neutral',
  applicable: 'warning',
  not_applicable: 'neutral',
  acquisition_requested: 'running',
  acquisition_unconfirmed: 'warning',
  acquired: 'success',
  cancelled: 'neutral'
});

const VPO_ALLOCATION_LABELS = Object.freeze({
  pending: 'Pendente de avaliação',
  applicable: 'Devido',
  not_applicable: 'Não aplicável',
  acquisition_requested: 'Aquisição solicitada',
  acquisition_unconfirmed: 'Aquisição sem confirmação',
  acquired: 'Adquirido',
  cancelled: 'Cancelado'
});

// TransporteFiscalDocumentResource.validationStatus — resultado do
// dfe-validator.ts local (schema + regras cruzadas), independente da
// autorização fiscal do documento (domínio `fiscal-authorization`, abaixo).
const FISCAL_VALIDATION_TONES = Object.freeze({
  pending: 'neutral',
  valid: 'success',
  invalid: 'error',
  warnings: 'warning'
});

const FISCAL_VALIDATION_LABELS = Object.freeze({
  pending: 'Pendente',
  valid: 'Válido',
  invalid: 'Inválido',
  warnings: 'Com avisos'
});

// TransporteFiscalDocumentResource.authorizationStatus — extraído do
// protocolo SEFAZ (protNFe/protCTe/protMDFe) presente no XML importado;
// `unknown` quando o XML não trazia protocolo (assinado isolado).
const FISCAL_AUTHORIZATION_TONES = Object.freeze({
  unknown: 'neutral',
  authorized: 'success',
  cancelled: 'neutral',
  denied: 'error'
});

const FISCAL_AUTHORIZATION_LABELS = Object.freeze({
  unknown: 'Desconhecida',
  authorized: 'Autorizada',
  cancelled: 'Cancelada',
  denied: 'Denegada'
});

// TransporteApoliceResource.status — status ADMINISTRATIVO da apólice (não
// confundir com a vigência DERIVADA — `expiring`/`expired` — ver o helper puro
// `resolveInsuranceExpiryState` em transporteUiHelpers.js).
// As três primeiras chaves são o enum ADMINISTRATIVO do contrato; as três
// últimas (`valid`/`expiring`/`expired`) são a VIGÊNCIA derivada que o helper
// puro `resolveInsurancePolicyStatus` (transporteUiHelpers.js) devolve — a
// visão consolidada de Apólices (onda F7) mostra a vigência, não o cadastro.
// Compartilham o MESMO domínio de badge de propósito: as chaves não colidem e
// quem lê a tela vê "situação da apólice" como um conceito só. `cancelled`
// serve às duas dimensões (cancelada não vence — sai da conta da janela).
const INSURANCE_POLICY_TONES = Object.freeze({
  active: 'success',
  cancelled: 'neutral',
  expired_marked: 'error',
  valid: 'success',
  expiring: 'warning',
  expired: 'error',
  unknown: 'neutral'
});

const INSURANCE_POLICY_LABELS = Object.freeze({
  active: 'Ativa',
  cancelled: 'Cancelada',
  expired_marked: 'Marcada como vencida',
  valid: 'Vigente',
  expiring: 'Vencendo',
  expired: 'Vencida',
  unknown: 'Vigência desconhecida'
});

// `insurance_shipment_declarations.status` (DL-102, migration 036/PR-I3). A
// leitura é em três tempos: o ciclo EM VOO (`declaring`/`rectifying`/
// `cancelling`) é 'running'; o desfecho DESCONHECIDO (`*_unconfirmed` — o
// SICAT despachou e não sabe se a seguradora registrou) é 'warning', pelo mesmo
// racional do `submit_unconfirmed` do manifesto lá em cima: sem entrada própria
// ele viraria cinza e esconderia do operador uma averbação possivelmente órfã;
// e o desfecho CONHECIDO fecha em success/error/neutral.
const AVERBACAO_TONES = Object.freeze({
  declaring: 'running',
  rectifying: 'running',
  cancelling: 'running',
  declare_unconfirmed: 'warning',
  rectify_unconfirmed: 'warning',
  cancel_unconfirmed: 'warning',
  declared: 'success',
  cancelled: 'neutral',
  rejected: 'error'
});

const AVERBACAO_LABELS = Object.freeze({
  declaring: 'Averbando',
  rectifying: 'Retificando',
  cancelling: 'Cancelando',
  declare_unconfirmed: 'Averbação sem confirmação',
  rectify_unconfirmed: 'Retificação sem confirmação',
  cancel_unconfirmed: 'Cancelamento sem confirmação',
  declared: 'Averbada',
  cancelled: 'Cancelada',
  rejected: 'Rejeitada pela seguradora'
});

// `insurance_billing_periods.status` (migration 037/PR-I4). Mês ABERTO ainda
// recebe averbações e aceita recálculo — é 'running' (em curso), não 'warning':
// não há nada errado num mês em andamento. Fechado é o desfecho bom.
const APURACAO_PERIODO_TONES = Object.freeze({
  open: 'running',
  closed: 'success'
});

const APURACAO_PERIODO_LABELS = Object.freeze({
  open: 'Aberto',
  closed: 'Fechado'
});

// TransportePgrResource.status.
const PGR_STATUS_TONES = Object.freeze({
  active: 'success',
  superseded: 'neutral',
  cancelled: 'neutral'
});

const PGR_STATUS_LABELS = Object.freeze({
  active: 'Ativo',
  superseded: 'Substituído',
  cancelled: 'Cancelado'
});

// TransportePisoTabelaResource.reviewStatus — sempre `pending_review` nesta
// fase do programa (promoção a `reviewed` é ato humano futuro, sem rota admin
// ainda) — o badge já cobre os 3 valores do contrato.
const PISO_TABELA_REVIEW_TONES = Object.freeze({
  pending_review: 'warning',
  reviewed: 'success',
  rejected: 'error'
});

const PISO_TABELA_REVIEW_LABELS = Object.freeze({
  pending_review: 'Em revisão',
  reviewed: 'Revisada',
  rejected: 'Rejeitada'
});

// TransporteEmissaoResource.status — pipeline sandbox-ready do
// @flavioneto11/fiscal-kit (build → sign → submit). `submit_unconfirmed`
// segue o mesmo padrão DL-102 do CIOT/VPO — nunca confundir com
// `failed_validation` (falha ANTES do dispatch, essa sim definitiva).
const DFE_ISSUANCE_TONES = Object.freeze({
  draft: 'neutral',
  building: 'running',
  built: 'running',
  signing: 'running',
  signed: 'running',
  submitting: 'running',
  submit_unconfirmed: 'warning',
  authorized: 'success',
  rejected: 'error',
  failed_validation: 'error',
  cancelled: 'neutral'
});

const DFE_ISSUANCE_LABELS = Object.freeze({
  draft: 'Rascunho',
  building: 'Construindo',
  built: 'Construído',
  signing: 'Assinando',
  signed: 'Assinado',
  submitting: 'Enviando',
  submit_unconfirmed: 'Envio sem confirmação',
  authorized: 'Autorizado',
  rejected: 'Rejeitado',
  failed_validation: 'Falha de validação',
  cancelled: 'Cancelado'
});

// Vigência DERIVADA da CNH do motorista (onda F6, REQ-SICAT-0033/0037). O
// contrato só entrega `cnhValidUntil` (date) — CNH vencida é ACEITA no
// cadastro e o vencimento alimenta alertas/GR; a decisão válida/vencendo/
// vencida é do FRONTEND, no helper puro `resolveDriverCnhStatus`
// (transporteUiHelpers.js), que devolve {status,label} para este domínio.
// Mesmo racional de `resolveInsuranceExpiryState`: dimensão independente do
// status administrativo do motorista (`active`/`inactive`, texto simples na
// tela — sem domínio próprio de badge).
const DRIVER_CNH_TONES = Object.freeze({
  valid: 'success',
  expiring: 'warning',
  expired: 'error',
  unknown: 'neutral'
});

const DRIVER_CNH_LABELS = Object.freeze({
  valid: 'Válida',
  expiring: 'Vencendo',
  expired: 'Vencida',
  unknown: 'Sem validade informada'
});

// Pesquisa cadastral de GR (onda F9, REQ-SICAT-0036/0037). O contrato tem DUAS
// dimensões — `status` (o ciclo do despacho: requesting → completed, com
// `request_unconfirmed` no padrão DL-102 e `failed`) e `outcome` (o VEREDITO:
// approved/rejected/inconclusive, só existente quando concluída). O que o
// operador precisa ler numa linha é UM estado, então o helper puro
// `resolveGrScreeningBadge` (transporteUiHelpers.js) achata os dois: veredito
// quando há, ciclo quando ainda não há. Por isso o domínio mistura as chaves.
// `completed` sem veredito é estado real (provedor respondeu sem conclusão) e
// entra explicitamente para não cair no humanizado em inglês.
const GR_SCREENING_TONES = Object.freeze({
  approved: 'success',
  rejected: 'error',
  inconclusive: 'warning',
  requesting: 'running',
  request_unconfirmed: 'running',
  completed: 'neutral',
  failed: 'error'
});

const GR_SCREENING_LABELS = Object.freeze({
  approved: 'Aprovado',
  rejected: 'Reprovado',
  inconclusive: 'Inconclusivo',
  requesting: 'Pesquisando',
  request_unconfirmed: 'Pesquisa sem confirmação',
  completed: 'Concluída',
  failed: 'Falhou'
});

// TransporteWatchItemResource.status — trilha do Regulatory Watch
// (DETECTED → ... → ACTIVE_APPLIED), PR-H1/PR-H2.
const WATCH_ITEM_TONES = Object.freeze({
  detected: 'neutral',
  ingested: 'neutral',
  ai_analyzed: 'running',
  ai_skipped: 'neutral',
  human_review: 'warning',
  approved: 'success',
  rejected: 'error',
  tested: 'running',
  scheduled: 'running',
  active_applied: 'success'
});

const WATCH_ITEM_LABELS = Object.freeze({
  detected: 'Detectado',
  ingested: 'Capturado',
  ai_analyzed: 'Analisado por IA',
  ai_skipped: 'Análise de IA pulada',
  human_review: 'Aguardando revisão humana',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
  tested: 'Testado',
  scheduled: 'Agendado',
  active_applied: 'Aplicado'
});

const ACCOUNT_HEALTH_TONES = Object.freeze({
  authenticated: 'success',
  ok: 'success',
  healthy: 'success',
  degraded: 'warning',
  pending: 'warning',
  expiring: 'warning',
  expired: 'error',
  error: 'error',
  failed: 'error',
  unknown: 'neutral'
});

const ACCOUNT_HEALTH_LABELS = Object.freeze({
  authenticated: 'Autenticada',
  ok: 'OK',
  healthy: 'Saudável',
  degraded: 'Degradada',
  pending: 'Pendente',
  expiring: 'Expirando',
  expired: 'Expirada',
  error: 'Erro',
  failed: 'Falhou',
  unknown: 'Desconhecido'
});

const TONE_TO_VUETIFY_COLOR = Object.freeze({
  neutral: 'default',
  running: 'info',
  warning: 'warning',
  success: 'success',
  error: 'error'
});

const DOMAIN_TONES = Object.freeze({
  job: JOB_STATUS_TONES,
  manifest: MANIFEST_STATUS_TONES,
  cdf: CDF_STATUS_TONES,
  dmr: DMR_STATUS_TONES,
  'account-health': ACCOUNT_HEALTH_TONES,
  'transport-operation': TRANSPORT_OPERATION_STATUS_TONES,
  compliance: COMPLIANCE_STATUS_TONES,
  ciot: CIOT_STATUS_TONES,
  'rntrc-status': RNTRC_STATUS_TONES,
  'rntrc-verification': RNTRC_VERIFICATION_TONES,
  'vpo-allocation': VPO_ALLOCATION_TONES,
  'fiscal-validation': FISCAL_VALIDATION_TONES,
  'fiscal-authorization': FISCAL_AUTHORIZATION_TONES,
  'insurance-policy': INSURANCE_POLICY_TONES,
  averbacao: AVERBACAO_TONES,
  'apuracao-periodo': APURACAO_PERIODO_TONES,
  'pgr-status': PGR_STATUS_TONES,
  'piso-tabela-review': PISO_TABELA_REVIEW_TONES,
  'dfe-issuance': DFE_ISSUANCE_TONES,
  'driver-cnh': DRIVER_CNH_TONES,
  'gr-screening': GR_SCREENING_TONES,
  'watch-item': WATCH_ITEM_TONES
});

const DOMAIN_LABELS = Object.freeze({
  job: JOB_STATUS_LABELS,
  manifest: MANIFEST_STATUS_LABELS,
  cdf: CDF_STATUS_LABELS,
  dmr: DMR_STATUS_LABELS,
  'account-health': ACCOUNT_HEALTH_LABELS,
  'transport-operation': TRANSPORT_OPERATION_STATUS_LABELS,
  compliance: COMPLIANCE_STATUS_LABELS,
  ciot: CIOT_STATUS_LABELS,
  'rntrc-status': RNTRC_STATUS_LABELS,
  'rntrc-verification': RNTRC_VERIFICATION_LABELS,
  'vpo-allocation': VPO_ALLOCATION_LABELS,
  'fiscal-validation': FISCAL_VALIDATION_LABELS,
  'fiscal-authorization': FISCAL_AUTHORIZATION_LABELS,
  'insurance-policy': INSURANCE_POLICY_LABELS,
  averbacao: AVERBACAO_LABELS,
  'apuracao-periodo': APURACAO_PERIODO_LABELS,
  'pgr-status': PGR_STATUS_LABELS,
  'piso-tabela-review': PISO_TABELA_REVIEW_LABELS,
  'dfe-issuance': DFE_ISSUANCE_LABELS,
  'driver-cnh': DRIVER_CNH_LABELS,
  'gr-screening': GR_SCREENING_LABELS,
  'watch-item': WATCH_ITEM_LABELS
});

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase();
}

function humanizeFallback(value) {
  const key = String(value || '').trim();
  if (!key) return 'Indefinido';
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/(^|\s)([a-zà-ÿ])/g, (_, prefix, char) => `${prefix}${char.toUpperCase()}`);
}

export function resolveJobStatusTone(status) {
  return JOB_STATUS_TONES[normalizeKey(status)] || 'neutral';
}

export function resolveManifestStatusTone(status) {
  const key = normalizeKey(status);
  return MANIFEST_STATUS_TONES[key] || resolveManifestToneBySubstring(key) || 'neutral';
}

export function resolveStatusTone(domain, status) {
  const map = DOMAIN_TONES[domain];
  if (!map) return 'neutral';
  const key = normalizeKey(status);
  if (map[key]) return map[key];
  if (domain === 'manifest') {
    return resolveManifestToneBySubstring(key) || 'neutral';
  }
  return 'neutral';
}

export function resolveStatusLabel(domain, status, { fallback = null } = {}) {
  const map = DOMAIN_LABELS[domain];
  const key = normalizeKey(status);
  if (map && map[key]) return map[key];
  if (fallback) return fallback;
  return humanizeFallback(status);
}

/**
 * Rótulo canônico da SITUAÇÃO de um manifesto, na ordem de precedência real:
 * situação CETESB (externalStatus, texto livre) -> status interno -> humanizado.
 *
 * Fonte ÚNICA das telas de MTR (lista, relatório e dashboard) para o mesmo
 * manifesto não ser rotulado de três jeitos diferentes.
 */
export function resolveManifestSituationLabel(manifest) {
  const externalKey = normalizeKey(manifest?.externalStatus);
  if (externalKey) {
    const rule = MANIFEST_SITUATION_LABEL_RULES.find(([fragment]) => externalKey.includes(fragment));
    if (rule) return rule[1];
    if (MANIFEST_STATUS_LABELS[externalKey]) return MANIFEST_STATUS_LABELS[externalKey];
    return humanizeFallback(manifest?.externalStatus);
  }

  const internalKey = normalizeKey(manifest?.status);
  if (!internalKey) return '-';
  return MANIFEST_STATUS_LABELS[internalKey] || humanizeFallback(manifest?.status);
}

/**
 * Termo CRU da CETESB, para expor como tooltip/legenda ao lado do rótulo
 * canônico (rastreabilidade: o operador ainda consegue casar com o SIGOR).
 */
export function resolveManifestRawSituation(manifest) {
  return String(manifest?.externalStatus || manifest?.status || '').trim();
}

export function toneToVuetifyColor(tone) {
  return TONE_TO_VUETIFY_COLOR[tone] || 'default';
}

export {
  JOB_STATUS_TONES,
  JOB_STATUS_LABELS,
  MANIFEST_STATUS_TONES,
  MANIFEST_STATUS_LABELS,
  CDF_STATUS_TONES,
  CDF_STATUS_LABELS,
  DMR_STATUS_TONES,
  DMR_STATUS_LABELS,
  ACCOUNT_HEALTH_TONES,
  ACCOUNT_HEALTH_LABELS,
  TRANSPORT_OPERATION_STATUS_TONES,
  TRANSPORT_OPERATION_STATUS_LABELS,
  COMPLIANCE_STATUS_TONES,
  COMPLIANCE_STATUS_LABELS,
  CIOT_STATUS_TONES,
  CIOT_STATUS_LABELS,
  RNTRC_STATUS_TONES,
  RNTRC_STATUS_LABELS,
  RNTRC_VERIFICATION_TONES,
  RNTRC_VERIFICATION_LABELS,
  VPO_ALLOCATION_TONES,
  VPO_ALLOCATION_LABELS,
  FISCAL_VALIDATION_TONES,
  FISCAL_VALIDATION_LABELS,
  FISCAL_AUTHORIZATION_TONES,
  FISCAL_AUTHORIZATION_LABELS,
  INSURANCE_POLICY_TONES,
  INSURANCE_POLICY_LABELS,
  AVERBACAO_TONES,
  AVERBACAO_LABELS,
  APURACAO_PERIODO_TONES,
  APURACAO_PERIODO_LABELS,
  PGR_STATUS_TONES,
  PGR_STATUS_LABELS,
  PISO_TABELA_REVIEW_TONES,
  PISO_TABELA_REVIEW_LABELS,
  DFE_ISSUANCE_TONES,
  DFE_ISSUANCE_LABELS,
  DRIVER_CNH_TONES,
  DRIVER_CNH_LABELS,
  GR_SCREENING_TONES,
  GR_SCREENING_LABELS,
  WATCH_ITEM_TONES,
  WATCH_ITEM_LABELS
};
