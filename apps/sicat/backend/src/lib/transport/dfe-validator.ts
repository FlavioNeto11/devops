/**
 * Validador de DF-e (NF-e/CT-e/MDF-e) — PR-E1, DL-103.
 *
 * PURO: recebe o `ParsedDfeDocument` (já interpretado por `dfe-parser.ts`), a entrada resolvida do
 * schema registry (`dfe_schema_registry`, ou `null` quando nenhuma entrada cobre o layout) e um
 * `DfeValidationContext` opcional (recorte da operação vinculada, montado pelo service — o
 * validador NUNCA lê banco). Devolve uma lista de `DfeValidationIssue` com código ESTÁVEL — nunca
 * lança.
 *
 * NÃO valida XSD completo (nenhum schema da SEFAZ é baixado/embutido aqui) — LIMITAÇÃO DOCUMENTADA:
 * este validador confere (1) coerência estrutural mínima da chave de acesso (dígito verificador,
 * modelo do documento, CNPJ embutido), (2) sinais de autorização/relacionamento entre documentos, e
 * (3) coerência com a operação vinculada quando há uma. O schema registry (`dfe_schema_registry`)
 * governa PERFIS de validação ativáveis por (tipo, layout, nota técnica) — nunca um XSD completo.
 *
 * ── A regra da NT MDF-e 2026.001 ANTECIPADA em TESTE ──────────────────────────────────────────────
 * `MDFE_CIOT_MISSING` só dispara quando `registryEntry.validationProfile.mdfeRequiresCiot === true`
 * — hoje isso só acontece para a entrada do schema registry com `technicalNote: 'NT MDF-e 2026.001'`
 * (ver `bootstrap/dfe-schema-seed.ts`, `effectiveFrom` [ASSUMPTION] 2026-10-01). Antes dessa data, a
 * entrada resolvida para MDF-e 3.00 é a BASELINE (`validationProfile: {}`) e o mesmo MDF-e sem CIOT
 * não gera este issue — o comportamento muda de acordo com a DATA DE EMISSÃO do documento, nunca um
 * `if` hardcoded no código (mesmo padrão do catálogo regulatório, `regulatory-temporal.ts`).
 */

import type { DfeReferencedDocument, ParsedDfeDocument } from './dfe-parser.js';
import type { DfeSchemaRegistryEntry, DfeValidationIssue, FiscalDocumentType, FiscalValidationStatus } from './dfe-types.js';

const EXPECTED_MODEL_CODE: Record<FiscalDocumentType, string> = { NFE: '55', CTE: '57', MDFE: '58' };

/** DV mod-11 da chave de acesso (44 dígitos: 43 de corpo + 1 dígito verificador), layout SEFAZ. */
export function computeAccessKeyCheckDigit(body43Digits: string): number {
  const weights = [2, 3, 4, 5, 6, 7, 8, 9];
  let sum = 0;
  let weightIndex = 0;
  for (let i = body43Digits.length - 1; i >= 0; i -= 1) {
    const weight = weights[weightIndex % weights.length] ?? 2;
    sum += Number(body43Digits[i] ?? '0') * weight;
    weightIndex += 1;
  }
  const remainder = sum % 11;
  return remainder === 0 || remainder === 1 ? 0 : 11 - remainder;
}

function onlyDigits(value: string | null | undefined): string {
  return String(value ?? '').replace(/\D+/g, '');
}

/**
 * Recorte da operação vinculada que o validador precisa para checar coerência (montado pelo
 * `transport-fiscal-service.ts` a partir do agregado `TransportOperationAggregate` — o validador
 * nunca lê `parties`/`route` cru do banco).
 */
export interface DfeValidationContext {
  /** `true` quando a operação vinculada tem frete declarado (ofertado OU contratado > 0) — mesmo critério de `isOperationRemunerated` em `rule-evaluators.ts`. Usado por `MDFE_CIOT_MISSING`. */
  remunerated?: boolean;
  /** Documentos (CNPJ/CPF, com ou sem máscara — normalizado internamente) das partes vinculadas à operação. */
  partyDocuments?: Array<string | null | undefined>;
  route?: { originUf: string | null; destinationUf: string | null } | null;
  tollExpected?: boolean | null;
  /** `ciot_number` do CIOT REGISTRADO mais recente da operação — `undefined`/`null` quando não há. Usado por `MDFE_CIOT_MISMATCH` (cross-check pós-vínculo). */
  linkedCiotNumber?: string | null;
}

function issue(severity: DfeValidationIssue['severity'], code: string, message: string): DfeValidationIssue {
  return { severity, code, message };
}

/** `DFE_ACCESS_KEY_MISMATCH` — dígitos da chave vs. conteúdo do documento, quando verificável. */
function checkAccessKeyCoherence(parsed: ParsedDfeDocument): DfeValidationIssue[] {
  const { accessKey, documentType } = parsed;
  if (!/^\d{44}$/.test(accessKey)) {
    return [issue('error', 'DFE_ACCESS_KEY_MISMATCH', `Chave de acesso "${accessKey}" não tem 44 dígitos numéricos.`)];
  }

  const body = accessKey.slice(0, 43);
  const declaredDv = Number(accessKey[43]);
  const expectedDv = computeAccessKeyCheckDigit(body);
  if (declaredDv !== expectedDv) {
    return [issue(
      'error',
      'DFE_ACCESS_KEY_MISMATCH',
      `Dígito verificador da chave de acesso inválido (esperado ${expectedDv}, chave declara ${declaredDv}).`
    )];
  }

  const modelInKey = accessKey.slice(20, 22);
  const expectedModel = EXPECTED_MODEL_CODE[documentType];
  if (modelInKey !== expectedModel) {
    return [issue(
      'error',
      'DFE_ACCESS_KEY_MISMATCH',
      `Modelo embutido na chave de acesso ("${modelInKey}") não corresponde ao tipo ${documentType} (esperado "${expectedModel}").`
    )];
  }

  const issuerDigits = onlyDigits(parsed.issuer.document);
  if (issuerDigits.length === 14) {
    const cnpjInKey = accessKey.slice(6, 20);
    if (cnpjInKey !== issuerDigits) {
      return [issue(
        'error',
        'DFE_ACCESS_KEY_MISMATCH',
        'CNPJ do emitente embutido na chave de acesso diverge do CNPJ declarado em emit/CNPJ.'
      )];
    }
  }

  return [];
}

/** `DFE_NOT_AUTHORIZED` — warning quando não há protocolo de autorização no XML. */
function checkAuthorization(parsed: ParsedDfeDocument): DfeValidationIssue[] {
  if (parsed.authorizationStatus === 'unknown') {
    return [issue(
      'warning',
      'DFE_NOT_AUTHORIZED',
      'XML sem protocolo de autorização (protNFe/protCTe/protMDFe ausente) — situação de autorização desconhecida.'
    )];
  }
  return [];
}

/** `MDFE_CIOT_MISSING` — a regra da NT MDF-e 2026.001 ANTECIPADA (perfil ativável do schema registry). */
function checkMdfeCiotRequired(
  parsed: ParsedDfeDocument,
  registryEntry: DfeSchemaRegistryEntry | null,
  context: DfeValidationContext
): DfeValidationIssue[] {
  if (parsed.documentType !== 'MDFE' || !parsed.mdfe) return [];
  const requiresCiot = registryEntry?.validationProfile?.mdfeRequiresCiot === true;
  if (!requiresCiot || context.remunerated !== true) return [];
  if (parsed.mdfe.ciots.length > 0) return [];

  return [issue(
    'error',
    'MDFE_CIOT_MISSING',
    'MDF-e de transporte remunerado por terceiros sem CIOT (infCIOT) — obrigatório sob o perfil '
      + `${registryEntry?.technicalNote ?? 'vigente'} do schema registry (antecipação em TESTE da NT MDF-e 2026.001).`
  )];
}

/** `MDFE_CIOT_MISMATCH` — cross-check contra o CIOT registrado da operação vinculada (pós-vínculo, revalidação). */
function checkMdfeCiotMatchesOperation(parsed: ParsedDfeDocument, context: DfeValidationContext): DfeValidationIssue[] {
  if (parsed.documentType !== 'MDFE' || !parsed.mdfe) return [];
  const linked = context.linkedCiotNumber;
  if (!linked) return [];

  const found = parsed.mdfe.ciots.some((entry) => entry.ciotNumber === linked);
  if (found) return [];

  return [issue(
    'error',
    'MDFE_CIOT_MISMATCH',
    `CIOT registrado na operação (${linked}) não aparece no infCIOT do MDF-e importado `
      + `(${parsed.mdfe.ciots.map((entry) => entry.ciotNumber).join(', ') || 'nenhum CIOT no XML'}).`
  )];
}

/** `MDFE_VPO_MISSING_INFO` — warning quando a rota espera pedágio mas o MDF-e não traz valePed/disp. */
function checkMdfeTollInfo(parsed: ParsedDfeDocument, context: DfeValidationContext): DfeValidationIssue[] {
  if (parsed.documentType !== 'MDFE' || !parsed.mdfe) return [];
  if (context.tollExpected !== true) return [];
  if (parsed.mdfe.toll.hasValePedagio) return [];

  return [issue(
    'warning',
    'MDFE_VPO_MISSING_INFO',
    'Rota da operação espera pedágio (tollExpected), mas o MDF-e não traz informação de vale-pedágio '
      + '(infANTT/valePed/disp).'
  )];
}

/** `CTE_WITHOUT_NFE_REFERENCE` — warning quando o CT-e não referencia nenhuma NF-e transportada. */
function checkCteReferencesNfe(parsed: ParsedDfeDocument): DfeValidationIssue[] {
  if (parsed.documentType !== 'CTE' || !parsed.cte) return [];
  if (parsed.cte.referencedDocuments.length > 0) return [];

  return [issue(
    'warning',
    'CTE_WITHOUT_NFE_REFERENCE',
    'CT-e não referencia nenhuma NF-e transportada (infCTeNorm/infDoc/infNFe vazio) — pode ser '
      + 'legítimo (ex.: carga sem NF-e própria), mas vale confirmar.'
  )];
}

/** `DFE_PARTY_MISMATCH` — warning quando NENHUMA parte do documento bate com as partes da operação vinculada. */
function checkPartyMismatch(parsed: ParsedDfeDocument, context: DfeValidationContext): DfeValidationIssue[] {
  const partyDocuments = (context.partyDocuments ?? []).map(onlyDigits).filter((doc) => doc.length > 0);
  if (partyDocuments.length === 0) return [];

  const documentDocuments = [onlyDigits(parsed.issuer.document), onlyDigits(parsed.recipient.document)]
    .filter((doc) => doc.length > 0);
  if (documentDocuments.length === 0) return [];

  const partySet = new Set(partyDocuments);
  const anyMatch = documentDocuments.some((doc) => partySet.has(doc));
  if (anyMatch) return [];

  return [issue(
    'warning',
    'DFE_PARTY_MISMATCH',
    'Nem o emitente nem o destinatário do documento correspondem a alguma parte vinculada à operação.'
  )];
}

/** `DFE_ROUTE_MISMATCH` — warning quando a UF origem/destino da operação não aparece no percurso do MDF-e. */
function checkRouteMismatch(parsed: ParsedDfeDocument, context: DfeValidationContext): DfeValidationIssue[] {
  if (parsed.documentType !== 'MDFE' || !parsed.mdfe) return [];
  const route = context.route;
  if (!route || (!route.originUf && !route.destinationUf)) return [];

  const routeUfs = new Set(parsed.mdfe.routeUfs);
  const originMismatch = Boolean(route.originUf) && !routeUfs.has(String(route.originUf));
  const destinationMismatch = Boolean(route.destinationUf) && !routeUfs.has(String(route.destinationUf));
  if (!originMismatch && !destinationMismatch) return [];

  return [issue(
    'warning',
    'DFE_ROUTE_MISMATCH',
    `UF origem/destino da operação (${route.originUf ?? '?'}/${route.destinationUf ?? '?'}) não aparece `
      + `no percurso declarado do MDF-e (${parsed.mdfe.routeUfs.join(', ') || 'nenhuma UF'}).`
  )];
}

/** Roda TODAS as checagens e devolve a lista consolidada de issues. Função PURA, nunca lança. */
export function validateDfeDocument(
  parsed: ParsedDfeDocument,
  registryEntry: DfeSchemaRegistryEntry | null,
  context: DfeValidationContext = {}
): DfeValidationIssue[] {
  return [
    ...checkAccessKeyCoherence(parsed),
    ...checkAuthorization(parsed),
    ...checkMdfeCiotRequired(parsed, registryEntry, context),
    ...checkMdfeCiotMatchesOperation(parsed, context),
    ...checkMdfeTollInfo(parsed, context),
    ...checkCteReferencesNfe(parsed),
    ...checkPartyMismatch(parsed, context),
    ...checkRouteMismatch(parsed, context)
  ];
}

/** `validation_status` a partir da lista de issues: qualquer `error` → invalid; só `warning` → warnings; nenhum → valid. */
export function deriveValidationStatus(issues: DfeValidationIssue[]): FiscalValidationStatus {
  if (issues.some((entry) => entry.severity === 'error')) return 'invalid';
  if (issues.length > 0) return 'warnings';
  return 'valid';
}

/** Referências de documentos citados no XML (NF-e dentro do CT-e, NF-e/CT-e dentro do MDF-e) — usadas pelo service para resolver `fiscal_document_links` na importação. */
export function extractReferencedDocuments(parsed: ParsedDfeDocument): DfeReferencedDocument[] {
  if (parsed.documentType === 'CTE' && parsed.cte) return parsed.cte.referencedDocuments;
  if (parsed.documentType === 'MDFE' && parsed.mdfe) return parsed.mdfe.referencedDocuments;
  return [];
}
