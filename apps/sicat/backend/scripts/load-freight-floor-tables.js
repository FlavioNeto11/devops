/**
 * Loader MANUAL do operador para as tabelas de piso mínimo de frete (PR-B1, DL-103).
 *
 * ── POR QUE É MANUAL (NUNCA SEED DE BOOT) ───────────────────────────────────────────────────────
 * Coeficiente de piso jamais entra no catálogo por seed automático — meta-guarda 4 de
 * `tests/regulatory/rule-catalog-invariants.test.js` PROÍBE `regulatory-rules-seed.ts` de tocar
 * `freight_floor_versions`/`freight_floor_coefficients`, e este script continua fora do boot
 * (`AUTO_SEED`) de propósito: a tabela A da Res. ANTT 6.084/2026 já foi transcrita da fonte
 * oficial (`reference-data/freight-floor/res-6084-2026-tabela-a.json`), mas a CONFERÊNCIA jurídica
 * contra o DOU é pendência P3 do guia — por isso toda versão carregada aqui nasce SEMPRE
 * `review_status = 'pending_review'`. Promoção a `reviewed` é ato humano futuro (rota admin ainda
 * não existe nesta fase), nunca um efeito colateral de rodar este loader.
 *
 * ── O QUE ELE FAZ ────────────────────────────────────────────────────────────────────────────────
 * Lê TODOS os `.json` de `reference-data/freight-floor/`, valida o shape, calcula o hash SHA-256
 * do arquivo (`source_hash`, prova de que o coeficiente carregado é EXATAMENTE o transcrito) e faz
 * upsert por `(normative_reference, table_code)` — versão + substituição total dos coeficientes,
 * na MESMA transação (`freight-floor-repo.loadFreightFloorTableInTransaction`). IDEMPOTENTE: rodar
 * duas vezes produz o mesmo estado final (mesmos coeficientes, mesmo hash, review_status
 * inalterado se já `pending_review`).
 *
 * ── ABORT-IF-REVIEWED ───────────────────────────────────────────────────────────────────────────
 * Se a versão já existe como `review_status = 'reviewed'` (revisão humana já registrada), este
 * script NUNCA rebaixa: pula aquela tabela com um aviso e segue para as demais. Rebaixar uma
 * decisão humana silenciosamente na próxima carga do JSON seria pior que não automatizar nada.
 *
 * Uso:
 *   npm run load:freight-floor
 *   DATABASE_URL=postgres://... npm run load:freight-floor
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { pool } from '../src/db/pool.ts';
import { createPrefixedId } from '../src/lib/ids.ts';
import {
  FREIGHT_FLOOR_CARGO_SLUGS,
  FREIGHT_FLOOR_TABLE_CODES
} from '../src/lib/transport/freight-floor-engine.ts';
import {
  getFloorVersionByNaturalKey,
  loadFreightFloorTableInTransaction
} from '../src/repositories/freight-floor-repo.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REFERENCE_DATA_DIR = path.resolve(__dirname, '../reference-data/freight-floor');

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CARGO_SLUGS = new Set(FREIGHT_FLOOR_CARGO_SLUGS);
const TABLE_CODES = new Set(FREIGHT_FLOOR_TABLE_CODES);

// ───────────────────────────────────────────────────────────────────────────────────────────────
// Validação de shape — falha ALTO (lança) antes de qualquer SQL, mesmo racional do seed regulatório
// ───────────────────────────────────────────────────────────────────────────────────────────────

function assertNonEmptyString(value, field, fileName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`[load-freight-floor-tables] ${fileName}: campo '${field}' ausente ou vazio.`);
  }
  return value.trim();
}

function assertIsoDate(value, field, fileName) {
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) {
    throw new Error(`[load-freight-floor-tables] ${fileName}: campo '${field}' inválido (esperado YYYY-MM-DD, recebido '${value}').`);
  }
  return value;
}

function assertTableCode(value, fileName) {
  if (typeof value !== 'string' || !TABLE_CODES.has(value)) {
    throw new Error(
      `[load-freight-floor-tables] ${fileName}: 'tableCode' inválido (esperado um de ${[...TABLE_CODES].join(', ')}, recebido '${value}').`
    );
  }
  return value;
}

function assertCoefficients(rawCoefficients, fileName) {
  if (!Array.isArray(rawCoefficients) || rawCoefficients.length === 0) {
    throw new Error(`[load-freight-floor-tables] ${fileName}: 'coefficients' deve ser um array não-vazio.`);
  }

  return rawCoefficients.map((entry, index) => {
    const label = `${fileName}: coefficients[${index}]`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`[load-freight-floor-tables] ${label} deve ser um objeto.`);
    }

    const cargoType = assertNonEmptyString(entry.cargoType, 'cargoType', label);
    if (!CARGO_SLUGS.has(cargoType)) {
      throw new Error(
        `[load-freight-floor-tables] ${label}: cargoType '${cargoType}' não é um dos 11 slugs canônicos `
          + `(${[...CARGO_SLUGS].join(', ')}).`
      );
    }

    const axlesCount = Number(entry.axlesCount);
    if (!Number.isInteger(axlesCount) || axlesCount <= 0) {
      throw new Error(`[load-freight-floor-tables] ${label}: axlesCount deve ser inteiro > 0 (recebido '${entry.axlesCount}').`);
    }

    const displacementCost = Number(entry.displacement_cost);
    if (!Number.isFinite(displacementCost) || displacementCost <= 0) {
      throw new Error(`[load-freight-floor-tables] ${label}: displacement_cost deve ser > 0 (recebido '${entry.displacement_cost}').`);
    }

    const loadUnloadCost = Number(entry.load_unload_cost);
    if (!Number.isFinite(loadUnloadCost) || loadUnloadCost <= 0) {
      throw new Error(`[load-freight-floor-tables] ${label}: load_unload_cost deve ser > 0 (recebido '${entry.load_unload_cost}').`);
    }

    return { cargoType, axlesCount, displacementCost, loadUnloadCost };
  });
}

function validateTableFile(data, fileName) {
  const normativeReference = assertNonEmptyString(data.normativeReference, 'normativeReference', fileName);
  const tableCode = assertTableCode(data.tableCode, fileName);
  const effectiveFrom = assertIsoDate(data.effectiveFrom, 'effectiveFrom', fileName);
  const publishedAt = data.publishedAt == null || data.publishedAt === ''
    ? null
    : assertIsoDate(data.publishedAt, 'publishedAt', fileName);
  const methodologyNotes = typeof data.methodologyNotes === 'string' ? data.methodologyNotes : '';
  const sourceUrl = typeof data.sourceUrl === 'string' && data.sourceUrl.trim().length > 0 ? data.sourceUrl.trim() : null;
  const resolution = typeof data.resolution === 'string' && data.resolution.trim().length > 0 ? data.resolution.trim() : null;
  const coefficients = assertCoefficients(data.coefficients, fileName);

  return { normativeReference, tableCode, effectiveFrom, publishedAt, methodologyNotes, sourceUrl, resolution, coefficients };
}

// ───────────────────────────────────────────────────────────────────────────────────────────────
// Carregamento — um arquivo por vez, cada um sua própria transação (abort-if-reviewed por arquivo)
// ───────────────────────────────────────────────────────────────────────────────────────────────

async function loadOneFile(fileName) {
  const filePath = path.join(REFERENCE_DATA_DIR, fileName);
  const raw = await fs.readFile(filePath, 'utf8');
  const sourceHash = createHash('sha256').update(raw, 'utf8').digest('hex');
  const data = JSON.parse(raw);
  const parsed = validateTableFile(data, fileName);

  const existing = await getFloorVersionByNaturalKey(parsed.normativeReference, parsed.tableCode);
  if (existing && existing.reviewStatus === 'reviewed') {
    console.warn(
      `[load-freight-floor-tables] ⚠️  PULADO ${fileName} (${parsed.normativeReference} / Tabela `
        + `${parsed.tableCode}): já está review_status='reviewed' — o loader NUNCA rebaixa uma `
        + 'revisão humana. Promova uma nova versão normativa (novo normativeReference) se a tabela mudou.'
    );
    return { fileName, skipped: true, tableCode: parsed.tableCode, normativeReference: parsed.normativeReference };
  }

  const versionInput = {
    id: existing?.id ?? createPrefixedId('ffver'),
    normativeReference: parsed.normativeReference,
    resolution: parsed.resolution,
    tableCode: parsed.tableCode,
    publishedAt: parsed.publishedAt,
    effectiveFrom: parsed.effectiveFrom,
    effectiveUntil: null,
    methodologyNotes: parsed.methodologyNotes,
    sourceUrl: parsed.sourceUrl,
    sourceHash
  };

  const coefficientInputs = parsed.coefficients.flatMap((entry) => ([
    {
      id: createPrefixedId('ffcoef'),
      cargoType: entry.cargoType,
      axlesCount: entry.axlesCount,
      coefficientType: 'displacement_cost',
      value: entry.displacementCost
    },
    {
      id: createPrefixedId('ffcoef'),
      cargoType: entry.cargoType,
      axlesCount: entry.axlesCount,
      coefficientType: 'load_unload_cost',
      value: entry.loadUnloadCost
    }
  ]));

  const { version, coefficientsWritten } = await loadFreightFloorTableInTransaction(versionInput, coefficientInputs);
  const uniqueCargoTypes = new Set(parsed.coefficients.map((entry) => entry.cargoType)).size;

  return {
    fileName,
    skipped: false,
    tableCode: version.tableCode,
    normativeReference: version.normativeReference,
    reviewStatus: version.reviewStatus,
    effectiveFrom: version.effectiveFrom,
    uniqueCargoTypes,
    rowsCount: parsed.coefficients.length,
    coefficientsWritten,
    sourceHash
  };
}

/**
 * Carrega TODOS os `.json` de `reference-data/freight-floor/` — núcleo reutilizável, SEM
 * `console.log`/`pool.end`/`process.exit` (efeitos de CLI ficam em `main()`, mais abaixo). Exportada
 * para `tests/regulatory/freight-floor-engine.test.js` chamar o LOADER DE VERDADE contra o banco de
 * teste, em vez de reimplementar o carregamento no teste.
 */
export async function loadAllFreightFloorTables() {
  const entries = await fs.readdir(REFERENCE_DATA_DIR, { withFileTypes: true });
  const jsonFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.json')).map((entry) => entry.name).sort();

  const results = [];
  for (const fileName of jsonFiles) {
    results.push(await loadOneFile(fileName));
  }
  return results;
}

async function main() {
  const results = await loadAllFreightFloorTables();

  if (results.length === 0) {
    console.log(`[load-freight-floor-tables] nenhum .json encontrado em ${REFERENCE_DATA_DIR}`);
    return;
  }

  console.log(`[load-freight-floor-tables] ${results.length} arquivo(s) em ${REFERENCE_DATA_DIR}`);
  console.log('');
  for (const result of results) {
    if (result.skipped) {
      console.log(`[load-freight-floor-tables] ${result.fileName}: PULADO (${result.tableCode}, review_status=reviewed)`);
      continue;
    }
    console.log(
      `[load-freight-floor-tables] ${result.fileName}: OK — ${result.normativeReference} (Tabela `
        + `${result.tableCode}), review_status=${result.reviewStatus}, effectiveFrom=${result.effectiveFrom}, `
        + `${result.uniqueCargoTypes} cargoTypes / ${result.rowsCount} linhas (cargoType×axlesCount) / `
        + `${result.coefficientsWritten} coeficientes gravados, source_hash=${result.sourceHash}`
    );
  }

  const loaded = results.filter((result) => !result.skipped).length;
  const skipped = results.filter((result) => result.skipped).length;
  console.log('');
  console.log(`[load-freight-floor-tables] concluído: ${loaded} tabela(s) carregada(s), ${skipped} pulada(s).`);
}

// Só roda como CLI quando o arquivo é o ENTRYPOINT do processo — importar `loadAllFreightFloorTables`
// de um teste NÃO pode disparar `pool.end()`/`process.exit()` como efeito colateral do import.
const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  main()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('[load-freight-floor-tables] falha:', error);
      return pool.end().finally(() => process.exit(1));
    });
}
