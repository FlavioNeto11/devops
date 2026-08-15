/**
 * Repositório do catálogo regulatório TRANSPORTE (PR-A1, DL-103).
 *
 * Leitura do catálogo temporal (`regulatory_rules` + `regulatory_rule_versions` +
 * `regulatory_sources`, migration 021). O único escritor do catálogo era o seed
 * (`bootstrap/regulatory-rules-seed.ts`, que monta SQL direto no molde do access-control-seed) até
 * o PR-H1, que abre a superfície administrativa com revisão humana ANUNCIADA aqui desde o PR-A1:
 * `insertRuleVersion` (nova versão nascida de um item do Regulatory Watch, SEMPRE `blocking=false` —
 * o parâmetro nem existe na assinatura) e `promoteRuleVersionBlocking` (o ÚNICO caminho para
 * `blocking=true`, chamado por `POST /v1/transporte/regras/{code}/versoes/{versionLabel}/promover`).
 * Nenhuma das duas contorna as travas de banco da migration 021
 * (`excl_regrulev_no_temporal_overlap`/`chk_regrulev_blocking_reviewed`) — ambas propagam a
 * exceção do Postgres para o chamador decidir o HTTP status.
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

/** Uma versão específica por (code, versionLabel) — usado pela promoção administrativa (PR-H1). */
export async function getRuleVersionByCodeAndLabel(
  code: string,
  versionLabel: string,
  client: DbClient = null
): Promise<RegulatoryRuleVersion | null> {
  const execute = getQueryExecutor(client);
  const result = await execute<RuleVersionRow>(
    `select v.* from regulatory_rule_versions v
       inner join regulatory_rules r on r.id = v.rule_id
      where r.code = $1 and v.version_label = $2`,
    [code, versionLabel]
  );
  return mapVersionRow(result.rows[0]);
}

// =============================================================================
// Escrita (PR-H1) — ver o header do arquivo. `insertRuleVersion` é chamada pelo fluxo `aplicar` do
// Regulatory Watch; `promoteRuleVersionBlocking`, pela promoção administrativa.
// =============================================================================

export type InsertRuleVersionInput = {
  id: string;
  ruleId: string;
  versionLabel: string;
  legalBasis: LegalBasisEntry[];
  summary: string;
  effectiveFrom: string;
  effectiveUntil?: string | null;
  implementationState: RuleImplementationState;
  severity: RuleSeverity;
  sourceHash?: string | null;
};

/**
 * Cria uma NOVA versão da regra a partir de um item aprovado do Regulatory Watch. `blocking` NÃO É
 * PARÂMETRO — o insert grava o literal `false` (regra de ouro do programa: nenhuma versão nasce
 * bloqueante). `reviewed_by`/`reviewed_at` também ficam de fora — pertencem exclusivamente à
 * promoção administrativa (`promoteRuleVersionBlocking`). Uma janela de vigência sobreposta à de
 * outra versão da MESMA regra é rejeitada pelo Postgres (`excl_regrulev_no_temporal_overlap`,
 * 23P01) — o chamador (`transporte-regras-service`/`transport-regulatory-watch-service`) traduz
 * isso para `409`.
 */
export async function insertRuleVersion(
  input: InsertRuleVersionInput,
  client: DbClient = null
): Promise<RegulatoryRuleVersion> {
  const execute = getQueryExecutor(client);
  const result = await execute<RuleVersionRow>(
    `insert into regulatory_rule_versions (
       id, rule_id, version_label, legal_basis, summary, effective_from, effective_until,
       implementation_state, blocking, severity, source_hash
     ) values ($1, $2, $3, $4::jsonb, $5, $6::date, $7::date, $8, false, $9, $10)
     returning *`,
    [
      input.id,
      input.ruleId,
      input.versionLabel,
      JSON.stringify(input.legalBasis || []),
      input.summary,
      input.effectiveFrom,
      input.effectiveUntil ?? null,
      input.implementationState,
      input.severity,
      input.sourceHash ?? null
    ]
  );
  const mapped = mapVersionRow(result.rows[0]);
  if (!mapped) throw new Error('insertRuleVersion: insert não retornou linha');
  return mapped;
}

export type PromoteRuleVersionInput = {
  id: string;
  blocking: boolean;
  reviewedBy: string;
  reviewedAt: string;
};

/**
 * O ÚNICO caminho para `blocking=true` no catálogo (ou para reverter uma promoção anterior, com
 * `blocking=false` — a rota HTTP aceita os dois sentidos, sempre com revisão humana registrada).
 * Exige `implementation_state = 'ACTIVE'` (verificado AQUI, não só pelo check de banco, para poder
 * devolver `null` — o chamador traduz para `409` — em vez de deixar a UPDATE simplesmente não achar
 * a linha por um motivo que o SQL sozinho não distingue de "id inexistente"). O check
 * `chk_regrulev_blocking_reviewed` (migration 021) é a garantia de banco que sustenta isto mesmo se
 * este filtro de estado um dia for removido por engano.
 */
export async function promoteRuleVersionBlocking(
  input: PromoteRuleVersionInput,
  client: DbClient = null
): Promise<RegulatoryRuleVersion | null> {
  const execute = getQueryExecutor(client);
  const result = await execute<RuleVersionRow>(
    `update regulatory_rule_versions
        set blocking = $2, reviewed_by = $3, reviewed_at = $4::timestamptz
      where id = $1 and implementation_state = 'ACTIVE'
      returning *`,
    [input.id, input.blocking, input.reviewedBy, input.reviewedAt]
  );
  return mapVersionRow(result.rows[0]);
}
