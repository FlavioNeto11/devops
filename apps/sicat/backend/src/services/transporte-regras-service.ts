/**
 * Service da superfície read-only do catálogo regulatório TRANSPORTE (PR-A2, DL-103).
 *
 * Fino de propósito: valida os query params contra os enums de `regulatory-types` (a data via
 * `normalizeReferenceDate`, o único sítio do predicado temporal), delega a consulta ao
 * `regulatory-repo` e mapeia as linhas para o shape do CONTRATO (`TransporteRegraResource` /
 * `TransporteRegraVersaoResource` do OpenAPI) — camelCase, SEM ids internos randômicos
 * (`regrule_`/`regrulev_`), sem `source_hash` e sem campos que o contrato não promete.
 *
 * Tudo síncrono (200/404): consulta local, nenhum job, nenhum gateway.
 */

import { AppError } from '../lib/problem.js';
import { normalizeReferenceDate } from '../lib/transport/regulatory-temporal.js';
import {
  COMPLIANCE_GATES,
  REGULATORY_DOMAINS,
  RULE_IMPLEMENTATION_STATES
} from '../lib/transport/regulatory-types.js';
import type {
  ComplianceGate,
  LegalBasisEntry,
  RegulatoryDomain,
  RegulatoryRule,
  RegulatoryRuleVersion,
  RuleImplementationState,
  RuleSeverity
} from '../lib/transport/regulatory-types.js';
import {
  getRuleByCode,
  getRuleVersionByCodeAndLabel,
  listRulesWithVersionAt,
  listRuleVersions,
  promoteRuleVersionBlocking,
  resolveRuleVersionAt
} from '../repositories/regulatory-repo.js';
import { findWatchItemByAppliedRuleVersionId, insertWatchEvent } from '../repositories/regulatory-watch-repo.js';
import { insertAuditEntry } from '../repositories/audit-repo.js';
import { createPrefixedId } from '../lib/ids.js';

type LooseRecord = Record<string, unknown>;

/** Shape do contrato `TransporteRegraVersaoResource` — sem ids internos nem source_hash. */
export type TransportRuleVersionResource = {
  versionLabel: string;
  legalBasis: LegalBasisEntry[];
  summary: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  implementationState: RuleImplementationState;
  blocking: boolean;
  severity: RuleSeverity;
  reviewedBy: string | null;
  reviewedAt: string | null;
};

/** Shape do contrato `TransporteRegraResource`. */
export type TransportRuleResource = {
  code: string;
  domain: RegulatoryDomain;
  title: string;
  description: string;
  defaultGate: ComplianceGate;
  displayOrder: number;
  currentVersion: TransportRuleVersionResource | null;
};

export type TransportRuleListResponse = {
  items: TransportRuleResource[];
  referenceDate: string;
  totalItems: number;
};

export type TransportRuleHistoryResponse = {
  code: string;
  versions: TransportRuleVersionResource[];
};

/** Hoje em 'YYYY-MM-DD' no fuso LOCAL do processo — mesmo padrão do `toIsoDate` de api-routes. */
function todayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function firstQueryValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

/**
 * Valida um filtro de enum vindo da query. Valor ausente/vazio vira `undefined` (sem filtro);
 * valor fora do enum é 400 com código estável — nunca chega ao SQL (defesa em profundidade,
 * ainda que o repositório seja parametrizado).
 */
function parseEnumFilter(
  field: string,
  value: unknown,
  allowed: readonly string[]
): string | undefined {
  const candidate = firstQueryValue(value);
  if (candidate === undefined || candidate === '') return undefined;
  if (!allowed.includes(candidate)) {
    throw new AppError(
      400,
      'Bad Request',
      `Valor inválido para '${field}': '${candidate}'. Valores aceitos: ${allowed.join(', ')}.`,
      {
        code: 'TRANSPORT_RULE_FILTER_INVALID',
        errors: [{ field, message: `Valor fora do enum do catálogo: ${candidate}` }]
      }
    );
  }
  return candidate;
}

/** `vigenteEm` ausente = hoje; presente, passa pelo normalizador (400 em formato inválido). */
function parseReferenceDate(value: unknown): string {
  const candidate = firstQueryValue(value);
  if (candidate === undefined || candidate === '') return todayIsoDate();
  return normalizeReferenceDate(candidate);
}

function toVersionResource(version: RegulatoryRuleVersion): TransportRuleVersionResource {
  return {
    versionLabel: version.versionLabel,
    legalBasis: version.legalBasis,
    summary: version.summary,
    effectiveFrom: version.effectiveFrom,
    effectiveUntil: version.effectiveUntil,
    implementationState: version.implementationState,
    blocking: version.blocking,
    severity: version.severity,
    reviewedBy: version.reviewedBy,
    reviewedAt: version.reviewedAt
  };
}

function toRuleResource(
  rule: RegulatoryRule,
  resolvedVersion: RegulatoryRuleVersion | null
): TransportRuleResource {
  return {
    code: rule.code,
    domain: rule.domain,
    title: rule.title,
    description: rule.description,
    defaultGate: rule.defaultGate,
    displayOrder: rule.displayOrder,
    currentVersion: resolvedVersion ? toVersionResource(resolvedVersion) : null
  };
}

function ruleNotFound(code: string): AppError {
  return new AppError(404, 'Not Found', `Regra de transporte não encontrada: '${code}'.`, {
    code: 'TRANSPORT_RULE_NOT_FOUND'
  });
}

/** GET /v1/transporte/regras — lista com filtros e resolução temporal. */
export async function listTransportRulesService(
  query: LooseRecord = {}
): Promise<TransportRuleListResponse> {
  const referenceDate = parseReferenceDate(query.vigenteEm);
  const domain = parseEnumFilter('domain', query.domain, REGULATORY_DOMAINS);
  const gate = parseEnumFilter('gate', query.gate, COMPLIANCE_GATES);
  const implementationState = parseEnumFilter(
    'implementationState',
    query.implementationState,
    RULE_IMPLEMENTATION_STATES
  );

  const rules = await listRulesWithVersionAt(referenceDate, { domain, gate, implementationState });
  const items = rules.map((rule) => toRuleResource(rule, rule.resolvedVersion));

  return { items, referenceDate, totalItems: items.length };
}

/** GET /v1/transporte/regras/{code} — detalhe com a versão vigente em `vigenteEm`. */
export async function getTransportRuleService(
  code: string,
  query: LooseRecord = {}
): Promise<TransportRuleResource> {
  const referenceDate = parseReferenceDate(query.vigenteEm);
  const rule = await getRuleByCode(code);
  if (!rule) throw ruleNotFound(code);

  const resolvedVersion = await resolveRuleVersionAt(code, referenceDate);
  return toRuleResource(rule, resolvedVersion);
}

/** GET /v1/transporte/regras/{code}/historico — todas as versões, `effectiveFrom` crescente. */
export async function getTransportRuleHistoryService(
  code: string
): Promise<TransportRuleHistoryResponse> {
  const rule = await getRuleByCode(code);
  if (!rule) throw ruleNotFound(code);

  const versions = await listRuleVersions({ ruleId: rule.id });
  return { code: rule.code, versions: versions.map(toVersionResource) };
}

// =============================================================================
// POST /v1/transporte/regras/{code}/versoes/{versionLabel}/promover (PR-H1)
// =============================================================================

/**
 * Promoção administrativa — o ÚNICO caminho para `blocking=true` (ou para REVERTER uma promoção
 * anterior, com `blocking=false`; a rota aceita os dois sentidos). Regra de ouro do programa: exige
 * `reviewNotes` não-vazio (400) e a versão tem de estar `ACTIVE` (409) — a mesma trava que
 * `chk_regrulev_blocking_reviewed` (migration 021) sustenta no banco.
 */
export type PromoteTransportRuleVersionContext = { correlationId: string | null; evaluatedBy: string | null };

export type TransportRulePromotionResource = {
  ruleCode: string;
  versionLabel: string;
  implementationState: RuleImplementationState;
  blocking: boolean;
  reviewNotes: string;
  reviewedBy: string;
  reviewedAt: string;
  version: number;
};

export async function promoteTransportRuleVersionService(
  code: string,
  versionLabel: string,
  body: LooseRecord,
  ctx: PromoteTransportRuleVersionContext
): Promise<TransportRulePromotionResource> {
  if (typeof body.blocking !== 'boolean') {
    throw new AppError(400, 'Bad Request', 'blocking é obrigatório e deve ser boolean.', {
      code: 'REGULATORY_RULE_PROMOTION_BLOCKING_REQUIRED'
    });
  }
  const reviewNotes = typeof body.reviewNotes === 'string' ? body.reviewNotes.trim() : '';
  if (!reviewNotes) {
    throw new AppError(400, 'Bad Request', 'reviewNotes é obrigatório para promover/rebaixar uma versão.', {
      code: 'REGULATORY_RULE_PROMOTION_REVIEW_NOTES_REQUIRED'
    });
  }
  const expectedVersion = Number(body.version);
  if (!Number.isFinite(expectedVersion)) {
    throw new AppError(400, 'Bad Request', 'version é obrigatório (locking otimista).', {
      code: 'REGULATORY_RULE_PROMOTION_VERSION_REQUIRED'
    });
  }
  const reviewedBy = ctx.evaluatedBy;
  if (!reviewedBy) {
    throw new AppError(401, 'Unauthorized', 'Sessão SICAT sem usuário identificável para promover.', {
      code: 'REGULATORY_RULE_PROMOTION_REVIEWER_REQUIRED'
    });
  }

  const current = await getRuleVersionByCodeAndLabel(code, versionLabel);
  if (!current) {
    throw new AppError(404, 'Not Found', `Versão não encontrada: ${code}/${versionLabel}.`, {
      code: 'TRANSPORT_RULE_VERSION_NOT_FOUND'
    });
  }
  if (current.implementationState !== 'ACTIVE') {
    throw new AppError(
      409,
      'Conflict',
      `${code}/${versionLabel} está em '${current.implementationState}' — só é possível promover versões 'ACTIVE'.`,
      { code: 'REGULATORY_RULE_VERSION_NOT_ACTIVE' }
    );
  }
  if (current.version !== expectedVersion) {
    throw new AppError(
      409,
      'Conflict',
      `${code}/${versionLabel} foi alterado por outra operação (version divergente) — recarregue e tente de novo.`,
      { code: 'REGULATORY_RULE_VERSION_CONFLICT' }
    );
  }

  const reviewedAt = new Date().toISOString();
  const promoted = await promoteRuleVersionBlocking({
    id: current.id,
    blocking: body.blocking,
    reviewedBy,
    reviewedAt
  });
  if (!promoted) {
    // Corrida rara entre a checagem acima e o UPDATE (outra promoção concorrente mudou o estado).
    throw new AppError(
      409,
      'Conflict',
      `${code}/${versionLabel} não pôde ser promovida — o estado mudou entre a leitura e a escrita.`,
      { code: 'REGULATORY_RULE_VERSION_CONFLICT' }
    );
  }

  const correlationId = ctx.correlationId || createPrefixedId('corr');

  // Registra em `regulatory_watch_events` quando esta versão nasceu de um item do Watch (o item já
  // é terminal — `active_applied` — e o novo evento fica ligado a ele); senão, apenas auditoria
  // técnica. Nenhum dos dois é caminho crítico: falha aqui não desfaz a promoção já persistida.
  try {
    const linkedItem = await findWatchItemByAppliedRuleVersionId(current.id);
    if (linkedItem) {
      await insertWatchEvent({
        id: createPrefixedId('regwev'),
        watchItemId: linkedItem.id,
        sourceId: linkedItem.sourceId,
        eventType: 'active_applied',
        detail: { promoted: true, ruleCode: code, versionLabel, blocking: body.blocking, reviewedBy, reviewNotes },
        correlationId
      });
    } else {
      await insertAuditEntry({
        correlationId,
        entityType: 'regulatory_rule_version',
        entityId: current.id,
        direction: 'inbound',
        component: 'regulatory-admin',
        httpMethod: 'POST',
        endpoint: `/v1/transporte/regras/${code}/versoes/${versionLabel}/promover`,
        httpStatus: 200,
        sanitizedBody: { blocking: body.blocking, reviewedBy, reviewNotes }
      });
    }
  } catch (auditError) {
    console.warn(`[transporte-regras] registro de auditoria da promoção de ${code}/${versionLabel} falhou: ${auditError instanceof Error ? auditError.message : String(auditError)}`);
  }

  return {
    ruleCode: code,
    versionLabel,
    implementationState: promoted.implementationState,
    blocking: promoted.blocking,
    reviewNotes,
    reviewedBy,
    reviewedAt: promoted.reviewedAt ?? reviewedAt,
    version: promoted.version
  };
}
