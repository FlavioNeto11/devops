/**
 * Repositório do catálogo regulatório TRANSPORTE (PR-A1, DL-103).
 *
 * Leitura do catálogo temporal (`regulatory_rules` + `regulatory_rule_versions` +
 * `regulatory_sources`, migration 021). SEM escrita aqui: o único escritor do catálogo é o
 * seed (`bootstrap/regulatory-rules-seed.ts`, que monta SQL direto no molde do
 * access-control-seed) e, no futuro, a superfície administrativa com revisão humana.
 *
 * A regra de vigência NÃO é duplicada em SQL: as consultas carregam as versões da regra e
 * DELEGAM para `resolveVersionFromList` (lib/transport/regulatory-temporal.ts) — um único
 * sítio para o predicado temporal, compartilhado com os testes de fronteira.
 *
 * Padrões da casa: SQL parametrizado, client opcional (`DbClient`) para participar de
 * transações do chamador.
 */

import type { PoolClient } from 'pg';
import { query } from '../db/pool.js';
import { AppError } from '../lib/problem.js';
import { resolveVersionFromList } from '../lib/transport/regulatory-temporal.js';
import type {
  ComplianceGate,
  LegalBasisEntry,
  RegulatoryDomain,
  RegulatoryRule,
  RegulatoryRuleVersion,
  RuleImplementationState,
  RuleSeverity
} from '../lib/transport/regulatory-types.js';

type DbClient = Pick<PoolClient, 'query'> | null;

function getQueryExecutor(client: DbClient = null) {
  return client?.query?.bind(client) || query;
}

export type RegulatoryRuleFilters = {
  domain?: RegulatoryDomain | string;
  gate?: ComplianceGate | string;
};

export type RegulatoryRuleWithVersion = RegulatoryRule & {
  /** Versão vigente na data de referência, ou null se nenhuma janela contém a data. */
  resolvedVersion: RegulatoryRuleVersion | null;
};

type RuleRow = {
  id: string;
  code: string;
  domain: string;
  title: string;
  description: string;
  default_gate: string;
  display_order: number;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
};

type RuleVersionRow = {
  id: string;
  rule_id: string;
  version_label: string;
  legal_basis: unknown;
  summary: string;
  effective_from: Date | string;
  effective_until: Date | string | null;
  implementation_state: string;
  blocking: boolean;
  severity: string;
  applicability: unknown;
  reason_codes: unknown;
  source_hash: string | null;
  reviewed_by: string | null;
  reviewed_at: Date | string | null;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
};

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function toIsoDateOnly(value: Date | string | null | undefined): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function toJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toLegalBasis(value: unknown): LegalBasisEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => toJsonObject(entry))
    .filter((entry) => typeof entry.reference === 'string')
    .map((entry) => ({ reference: String(entry.reference) }));
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry));
}

function mapRuleRow(row: RuleRow | undefined): RegulatoryRule | null {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    domain: row.domain as RegulatoryDomain,
    title: row.title,
    description: row.description,
    defaultGate: row.default_gate as ComplianceGate,
    displayOrder: Number(row.display_order ?? 0),
    version: Number(row.version ?? 1),
    createdAt: toIso(row.created_at) ?? '',
    updatedAt: toIso(row.updated_at) ?? ''
  };
}

function mapVersionRow(row: RuleVersionRow | undefined): RegulatoryRuleVersion | null {
  if (!row) return null;
  return {
    id: row.id,
    ruleId: row.rule_id,
    versionLabel: row.version_label,
    legalBasis: toLegalBasis(row.legal_basis),
    summary: row.summary,
    effectiveFrom: toIsoDateOnly(row.effective_from),
    effectiveUntil: row.effective_until == null ? null : toIsoDateOnly(row.effective_until),
    implementationState: row.implementation_state as RuleImplementationState,
    blocking: Boolean(row.blocking),
    severity: row.severity as RuleSeverity,
    applicability: toJsonObject(row.applicability),
    reasonCodes: toStringArray(row.reason_codes),
    sourceHash: row.source_hash,
    reviewedBy: row.reviewed_by,
    reviewedAt: toIso(row.reviewed_at),
    version: Number(row.version ?? 1),
    createdAt: toIso(row.created_at) ?? '',
    updatedAt: toIso(row.updated_at) ?? ''
  };
}

/** Regras do catálogo (SEM versões), filtráveis por domínio e/ou gate default. */
export async function listRules(
  filters: RegulatoryRuleFilters = {},
  client: DbClient = null
): Promise<RegulatoryRule[]> {
  const execute = getQueryExecutor(client);
  const where: string[] = [];
  const values: unknown[] = [];

  if (filters.domain) {
    values.push(filters.domain);
    where.push(`domain = $${values.length}`);
  }
  if (filters.gate) {
    values.push(filters.gate);
    where.push(`default_gate = $${values.length}`);
  }

  const whereSql = where.length ? `where ${where.join(' and ')}` : '';
  const result = await execute<RuleRow>(
    `select * from regulatory_rules
      ${whereSql}
      order by display_order asc, code asc`,
    values
  );

  return result.rows.map(mapRuleRow).filter((row): row is RegulatoryRule => row !== null);
}

export async function getRuleByCode(
  code: string,
  client: DbClient = null
): Promise<RegulatoryRule | null> {
  const execute = getQueryExecutor(client);
  const result = await execute<RuleRow>(
    'select * from regulatory_rules where code = $1',
    [code]
  );
  return mapRuleRow(result.rows[0]);
}

export type RuleVersionsRef = { ruleId?: string; code?: string };

/** Versões de uma regra (por id OU por code), ordenadas por vigência crescente. */
export async function listRuleVersions(
  ref: RuleVersionsRef,
  client: DbClient = null
): Promise<RegulatoryRuleVersion[]> {
  if (!ref.ruleId && !ref.code) {
    throw new AppError(400, 'Bad Request', 'listRuleVersions exige ruleId ou code.', {
      code: 'REGULATORY_RULE_REF_REQUIRED'
    });
  }

  const execute = getQueryExecutor(client);
  const result = ref.ruleId
    ? await execute<RuleVersionRow>(
      `select * from regulatory_rule_versions
        where rule_id = $1
        order by effective_from asc, version_label asc`,
      [ref.ruleId]
    )
    : await execute<RuleVersionRow>(
      `select v.* from regulatory_rule_versions v
        inner join regulatory_rules r on r.id = v.rule_id
        where r.code = $1
        order by v.effective_from asc, v.version_label asc`,
      [ref.code]
    );

  return result.rows.map(mapVersionRow).filter((row): row is RegulatoryRuleVersion => row !== null);
}

/**
 * A consulta FUNDACIONAL do catálogo: versão da regra vigente na data de referência
 * (`effective_from <= d` e (`effective_until` nulo OU `>= d`)), ou null se nenhuma janela
 * contém a data (regra futura, regra revogada) — ou se o code não existe (o chamador que
 * precise distinguir usa `getRuleByCode`). O predicado temporal vive em
 * `resolveVersionFromList`; aqui só se carregam as versões e se delega.
 */
export async function resolveRuleVersionAt(
  code: string,
  referenceDate: string,
  client: DbClient = null
): Promise<RegulatoryRuleVersion | null> {
  const versions = await listRuleVersions({ code }, client);
  return resolveVersionFromList(versions, referenceDate);
}

export type RulesWithVersionFilters = RegulatoryRuleFilters & {
  /** Filtra pelo estado da VERSÃO RESOLVIDA na data (não de qualquer versão da regra). */
  implementationState?: RuleImplementationState | string;
};

/**
 * Regras + versão resolvida na data de referência (base da API read-only do PR-A2).
 * Regra sem versão vigente na data vem com `resolvedVersion: null` — a menos que o filtro
 * `implementationState` esteja presente, caso em que só entram regras cuja versão resolvida
 * está no estado pedido.
 */
export async function listRulesWithVersionAt(
  referenceDate: string,
  filters: RulesWithVersionFilters = {},
  client: DbClient = null
): Promise<RegulatoryRuleWithVersion[]> {
  const execute = getQueryExecutor(client);
  const rules = await listRules({ domain: filters.domain, gate: filters.gate }, client);
  if (rules.length === 0) return [];

  const versionsResult = await execute<RuleVersionRow>(
    `select * from regulatory_rule_versions
      where rule_id = any($1::text[])
      order by rule_id asc, effective_from asc, version_label asc`,
    [rules.map((rule) => rule.id)]
  );

  const versionsByRuleId = new Map<string, RegulatoryRuleVersion[]>();
  for (const row of versionsResult.rows) {
    const mapped = mapVersionRow(row);
    if (!mapped) continue;
    const bucket = versionsByRuleId.get(mapped.ruleId) ?? [];
    bucket.push(mapped);
    versionsByRuleId.set(mapped.ruleId, bucket);
  }

  const resolved = rules.map((rule) => ({
    ...rule,
    resolvedVersion: resolveVersionFromList(versionsByRuleId.get(rule.id) ?? [], referenceDate)
  }));

  if (!filters.implementationState) return resolved;

  return resolved.filter(
    (entry) => entry.resolvedVersion?.implementationState === filters.implementationState
  );
}
