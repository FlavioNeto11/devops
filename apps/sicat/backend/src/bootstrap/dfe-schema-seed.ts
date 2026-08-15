/**
 * Seed do schema registry de DF-e (`dfe_schema_registry`) — PR-E1 do programa "SICAT Transporte"
 * (DL-103).
 *
 * Arquivo PRÓPRIO (não uma função a mais em `regulatory-rules-seed.ts`) porque o schema registry
 * não é o catálogo regulatório TR-*: é o registro de LAYOUTS de XML que `dfe-parser.ts`/
 * `dfe-validator.ts` reconhecem, com o PERFIL de validação ativável por (tipo, layout, nota
 * técnica). Mesmas regras de ouro do molde (`bootstrap/regulatory-rules-seed.ts`):
 *
 * ── IDEMPOTÊNCIA ────────────────────────────────────────────────────────────────────────────────
 * Chave = UNIQUE NATURAL (`document_type`, `layout_version`, `coalesce(technical_note, '')` — ver
 * `030_transport_fiscal_documents.sql`), JAMAIS a PK (`createPrefixedId` é randômico). Uma única
 * transação, `on conflict do update`, seguro para rodar em dois pods (api+worker) ao mesmo tempo.
 *
 * ── SEED PEQUENO E ESTÁVEL, sem "operador dono da decisão" ─────────────────────────────────────
 * Ao contrário do catálogo regulatório (onde `implementation_state`/`blocking` pertencem ao
 * operador e ficam FORA do `do update`), este registry é 100% declarativo — não há campo de
 * decisão humana pós-seed aqui (a decisão de "isto é bloqueante" já está no
 * `validation_profile`/`RULES_WITHOUT_EVALUATOR_YET` do catálogo TR-*, não neste registry). Por
 * isso `effective_from`/`effective_until`/`validation_profile`/`notes` entram no `do update`: o
 * seed é a fonte da verdade e um reboot reconcilia qualquer edição manual acidental no banco.
 *
 * ── A entrada da NT MDF-e 2026.001 — antecipação em TESTE ──────────────────────────────────────
 * `MDFE/3.00/NT MDF-e 2026.001` nasce com `validation_profile.mdfeRequiresCiot = true` e
 * `effective_from` **[ASSUMPTION]** `2026-10-01` — a NT MDF-e 2026.001 (CIOT obrigatório no MDF-e
 * para transporte remunerado por terceiros) ainda não tem cronograma técnico OFICIAL publicado até
 * 15/08/2026 (pendência P7 do guia do programa); a data usada aqui é um PLANEJAMENTO razoável (~45
 * dias após a baseline regulatória de 13/08/2026), não uma confirmação da SEFAZ/CONFAZ. Antes dessa
 * data, `resolveVersionFromList` resolve para a entrada BASELINE (`MDFE/3.00/null`,
 * `validation_profile: {}`) e `MDFE_CIOT_MISSING` nunca dispara — depois dela, dispara em TESTE
 * (ambiente local), nunca em produção real sem confirmação humana da data.
 */

import type { PoolClient } from 'pg';
import { withTransaction } from '../db/pool.js';
import { createPrefixedId } from '../lib/ids.js';
import type { FiscalDocumentType } from '../lib/transport/dfe-types.js';

export type DfeSchemaRegistrySeedEntry = {
  /** Chave natural junto com `layoutVersion`/`technicalNote`. */
  documentType: FiscalDocumentType;
  layoutVersion: string;
  technicalNote: string | null;
  effectiveFrom: string;
  effectiveUntil?: string | null;
  validationProfile: Record<string, unknown>;
  notes?: string;
};

export type DfeSchemaRegistrySeedStatement = {
  name: string;
  sql: string;
  params: unknown[];
};

/**
 * Colunas de CONTEÚDO reconciliadas no `on conflict do update` — este registry é 100%
 * declarativo (sem campo de decisão do operador pós-seed), então TODAS as colunas de conteúdo
 * entram aqui. `updated_at` fica fora: o trigger `increment_version` cuida disso quando (e só
 * quando) o conteúdo de fato muda.
 */
export const DFE_SCHEMA_REGISTRY_UPDATE_COLUMNS = [
  'effective_from',
  'effective_until',
  'validation_profile',
  'notes'
] as const;

const SEEDED_ENTRIES: DfeSchemaRegistrySeedEntry[] = [
  {
    documentType: 'NFE',
    layoutVersion: '4.00',
    technicalNote: null,
    effectiveFrom: '2018-01-01',
    validationProfile: {},
    notes: 'Layout 4.00 da NF-e (Ajustes SINIEF / MOC NF-e) — sem perfil de validação adicional.'
  },
  {
    documentType: 'CTE',
    layoutVersion: '4.00',
    technicalNote: null,
    effectiveFrom: '2023-02-01',
    validationProfile: {},
    notes: 'Layout 4.00 do CT-e (Ajustes SINIEF / MOC CT-e) — sem perfil de validação adicional.'
  },
  {
    documentType: 'MDFE',
    layoutVersion: '3.00',
    technicalNote: null,
    effectiveFrom: '2018-01-01',
    validationProfile: {},
    notes: 'Layout 3.00 do MDF-e — baseline ANTES da NT MDF-e 2026.001 (sem exigência de CIOT no perfil).'
  },
  {
    documentType: 'MDFE',
    layoutVersion: '3.00',
    technicalNote: 'NT MDF-e 2026.001',
    effectiveFrom: '2026-10-01',
    validationProfile: { mdfeRequiresCiot: true },
    notes: '[ASSUMPTION] effective_from PLANEJADO (~45 dias após a baseline de 13/08/2026) — a NT '
      + 'MDF-e 2026.001 (CIOT obrigatório no MDF-e para transporte remunerado por terceiros, '
      + 'pendência P7 do guia) ainda não tem cronograma técnico oficial publicado. Antecipação em '
      + 'TESTE: mdfeRequiresCiot=true dispara MDFE_CIOT_MISSING (dfe-validator.ts) só a partir '
      + 'desta data — confirmar/ajustar quando a SEFAZ/CONFAZ publicar o cronograma real.'
  }
];

function assertSeedIsWellFormed(entries: DfeSchemaRegistrySeedEntry[]): void {
  const seen = new Set<string>();
  for (const entry of entries) {
    const key = `${entry.documentType}::${entry.layoutVersion}::${entry.technicalNote ?? ''}`;
    if (seen.has(key)) {
      throw new Error(`[dfe-schema-seed] chave natural duplicada no seed: ${key}`);
    }
    seen.add(key);

    if (entry.effectiveUntil != null && entry.effectiveUntil < entry.effectiveFrom) {
      throw new Error(`[dfe-schema-seed] ${key} com vigência invertida (effective_until < effective_from).`);
    }
  }
}

/** Estrutura declarativa do seed. Função PURA e determinística. */
export function buildDfeSchemaRegistrySeed(): DfeSchemaRegistrySeedEntry[] {
  assertSeedIsWellFormed(SEEDED_ENTRIES);
  return SEEDED_ENTRIES;
}

function buildUpdateSetClause(columns: readonly string[]): string {
  return columns.map((column) => `${column} = excluded.${column}`).join(',\n                  ');
}

/** Statements do seed, em ordem determinística (document_type, layout_version, technical_note). Função PURA. */
export function buildDfeSchemaRegistrySeedStatements(): DfeSchemaRegistrySeedStatement[] {
  const entries = [...buildDfeSchemaRegistrySeed()].sort((left, right) => {
    const leftKey = `${left.documentType}::${left.layoutVersion}::${left.technicalNote ?? ''}`;
    const rightKey = `${right.documentType}::${right.layoutVersion}::${right.technicalNote ?? ''}`;
    return leftKey.localeCompare(rightKey);
  });

  return entries.map((entry) => ({
    name: `dfe-schema:${entry.documentType}:${entry.layoutVersion}:${entry.technicalNote ?? 'baseline'}`,
    sql: `insert into dfe_schema_registry (
            id, document_type, layout_version, technical_note, effective_from, effective_until,
            validation_profile, notes, version
          ) values ($1, $2, $3, $4, $5::date, $6::date, $7::jsonb, $8, 1)
          on conflict (document_type, layout_version, (coalesce(technical_note, '')))
          do update set ${buildUpdateSetClause(DFE_SCHEMA_REGISTRY_UPDATE_COLUMNS)}`,
    params: [
      createPrefixedId('dfeschema'),
      entry.documentType,
      entry.layoutVersion,
      entry.technicalNote,
      entry.effectiveFrom,
      entry.effectiveUntil ?? null,
      JSON.stringify(entry.validationProfile ?? {}),
      entry.notes ?? ''
    ]
  }));
}

export type DfeSchemaRegistrySeedResult = { entriesReconciled: number };

async function runSeedStatements(client: PoolClient): Promise<DfeSchemaRegistrySeedResult> {
  let entriesReconciled = 0;
  for (const statement of buildDfeSchemaRegistrySeedStatements()) {
    const executed = await client.query(statement.sql, statement.params);
    entriesReconciled += executed.rowCount ?? 0;
  }
  return { entriesReconciled };
}

/** Reconcilia o schema registry inteiro numa ÚNICA transação. NÃO engole exceção — mesmo racional de `ensureRegulatoryCatalogSeeded` (o chamador em `startup.ts` decide como degradar). */
export async function ensureDfeSchemaRegistrySeeded(): Promise<DfeSchemaRegistrySeedResult> {
  return withTransaction(runSeedStatements);
}
