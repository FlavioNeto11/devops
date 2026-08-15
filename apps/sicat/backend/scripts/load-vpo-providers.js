/**
 * Loader MANUAL do operador para o cadastro de fornecedoras de VPO habilitadas (PR-D1, DL-103).
 *
 * ── POR QUE É MANUAL (NUNCA SEED DE BOOT) ───────────────────────────────────────────────────────
 * A lista de fornecedoras habilitadas pela ANTT é DINÂMICA — novo credenciamento/descredenciamento
 * acontece sem aviso prévio ([EXTERNAL DEPENDENCY] P6 do guia do programa). Este loader lê um
 * SNAPSHOT pesquisado manualmente na fonte oficial (`reference-data/vpo/fornecedoras-habilitadas.json`)
 * e nunca roda no boot (`AUTO_SEED`) — mesmo racional de `load-freight-floor-tables.js` (PR-B1).
 *
 * ── O QUE ELE FAZ ────────────────────────────────────────────────────────────────────────────────
 * Lê `reference-data/vpo/fornecedoras-habilitadas.json`, valida o shape, e faz upsert por `name`
 * (`vpo-repo.ts#upsertVpoProviderByName`) — ADITIVO: NUNCA apaga uma fornecedora, e NUNCA toca
 * `is_active` de uma linha já existente (desativar é ato manual do operador, futura rota admin).
 * IDEMPOTENTE: rodar duas vezes com o mesmo JSON produz o mesmo estado final.
 *
 * Uso:
 *   npm run load:vpo-providers
 *   DATABASE_URL=postgres://... npm run load:vpo-providers
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { pool } from '../src/db/pool.ts';
import { createPrefixedId } from '../src/lib/ids.ts';
import { findVpoProviderByName, upsertVpoProviderByName } from '../src/repositories/vpo-repo.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REFERENCE_DATA_FILE = path.resolve(__dirname, '../reference-data/vpo/fornecedoras-habilitadas.json');

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function assertNonEmptyString(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`[load-vpo-providers] campo '${field}' ausente ou vazio.`);
  }
  return value.trim();
}

function assertIsoDate(value, field) {
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) {
    throw new Error(`[load-vpo-providers] campo '${field}' inválido (esperado YYYY-MM-DD, recebido '${value}').`);
  }
  return value;
}

function validateFile(data) {
  const habilitationSource = assertNonEmptyString(data.habilitationSource, 'habilitationSource');
  const checkedAt = assertIsoDate(data.checkedAt, 'checkedAt');
  const notes = typeof data.notes === 'string' ? data.notes : '';

  if (!Array.isArray(data.providers) || data.providers.length === 0) {
    throw new Error('[load-vpo-providers] \'providers\' deve ser um array não-vazio.');
  }

  const names = data.providers.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`[load-vpo-providers] providers[${index}] deve ser um objeto.`);
    }
    return assertNonEmptyString(entry.name, `providers[${index}].name`);
  });

  const uniqueNames = new Set(names);
  if (uniqueNames.size !== names.length) {
    throw new Error('[load-vpo-providers] há nomes de fornecedora duplicados no arquivo.');
  }

  return { habilitationSource, checkedAt, notes, names };
}

/**
 * Carrega TODAS as fornecedoras do snapshot — núcleo reutilizável, SEM `console.log`/`pool.end`/
 * `process.exit` (efeitos de CLI ficam em `main()`, mais abaixo). Exportada para o teste de
 * integração chamar o LOADER DE VERDADE contra o banco de teste, mesmo molde de
 * `load-freight-floor-tables.js#loadAllFreightFloorTables`.
 */
export async function loadAllVpoProviders() {
  const raw = await fs.readFile(REFERENCE_DATA_FILE, 'utf8');
  const data = JSON.parse(raw);
  const parsed = validateFile(data);

  const results = [];
  for (const name of parsed.names) {
    const existing = await findVpoProviderByName(name);
    const provider = await upsertVpoProviderByName({
      id: existing?.id ?? createPrefixedId('vpoprov'),
      name,
      habilitationSource: parsed.habilitationSource,
      habilitationCheckedAt: parsed.checkedAt,
      notes: parsed.notes
    });
    results.push({ name: provider.name, isActive: provider.isActive, created: !existing });
  }
  return results;
}

async function main() {
  const results = await loadAllVpoProviders();

  console.log(`[load-vpo-providers] ${results.length} fornecedora(s) processada(s) a partir de ${REFERENCE_DATA_FILE}`);
  console.log('');
  for (const result of results) {
    console.log(`[load-vpo-providers] ${result.name}: ${result.created ? 'CRIADA' : 'ATUALIZADA'} (isActive=${result.isActive})`);
  }

  const created = results.filter((result) => result.created).length;
  const updated = results.length - created;
  console.log('');
  console.log(`[load-vpo-providers] concluído: ${created} nova(s), ${updated} atualizada(s) — is_active NUNCA tocado em linha existente.`);
}

// Só roda como CLI quando o arquivo é o ENTRYPOINT do processo — importar `loadAllVpoProviders` de
// um teste NÃO pode disparar `pool.end()`/`process.exit()` como efeito colateral do import (mesmo
// molde de `load-freight-floor-tables.js`).
const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  main()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('[load-vpo-providers] falha:', error);
      return pool.end().finally(() => process.exit(1));
    });
}
