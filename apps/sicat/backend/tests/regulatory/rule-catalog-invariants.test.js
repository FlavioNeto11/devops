import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  buildRegulatoryCatalogSeed,
  buildRegulatoryCatalogSeedStatements
} from '../../src/bootstrap/regulatory-rules-seed.js';
import { RULE_CODES } from '../../src/lib/transport/regulatory-types.js';
import { RULE_EVALUATORS, RULES_WITHOUT_EVALUATOR_YET } from '../../src/lib/transport/rule-evaluators.js';

/**
 * META-GUARDAS do catálogo regulatório (PR-A6, coração do PR) — testes que codificam POLÍTICA DE
 * ENGENHARIA do programa "SICAT Transporte", não o comportamento de uma função isolada. Cada
 * guarda aqui é uma regra do guia do programa
 * (`apps/sicat/docs/30-transporte/transporte-guia.md`) transformada em asserção automática: se um
 * PR futuro violar a regra, o CI reprova antes de chegar em produção — mesmo que o autor do PR
 * nunca tenha lido o guia.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = path.join(__dirname, '../fixtures/regulatory/fixtures-manifest.json');
const GUIDE_PATH = 'apps/sicat/docs/30-transporte/transporte-guia.md';

const seed = buildRegulatoryCatalogSeed();

// ===================================================================================================
// Meta-guarda 1 — [LEGAL REVIEW REQUIRED]: ACTIVE + blocking=true SEMPRE com revisão humana
// ===================================================================================================

describe('rule-catalog-invariants — meta-guarda 1: ACTIVE+blocking=true exige revisão humana', () => {
  it('nenhuma versão do seed declara ACTIVE+blocking=true sem reviewed_by/reviewed_at', () => {
    // O seed declarativo (`RegulatoryRuleVersionSeed`, src/bootstrap/regulatory-rules-seed.ts) NÃO
    // carrega `blocking`/`reviewed_*` por desenho — são campos do OPERADOR, fora do tipo do seed (a
    // regra de ouro do programa: "toda versão nasce blocking=false", ver header do bootstrap). Por
    // isso hoje este loop nunca encontra uma versão para reprovar — e é assim que deve continuar.
    // A guarda é DEFENSIVA: protege contra um PR futuro que cole `blocking: true` num literal do
    // seed (bypass do tipo via cast) sem revisão — mesmo que o SQL gerado ainda force
    // `blocking=false` (garantia de baixo nível já coberta por
    // `tests/unit/regulatory-rules-seed.test.js`), este teste é quem barra a intenção declarativa.
    //
    // PR-H1 (Regulatory Watch): esta guarda continua verde de propósito — ela afirma sobre o SEED,
    // que segue 100% `blocking=false`. O ÚNICO caminho para `blocking=true` em produção passou a ser
    // a promoção administrativa (`POST /v1/transporte/regras/{code}/versoes/{versionLabel}/promover`,
    // `promoteTransportRuleVersionService`), NUNCA o seed nem o worker do Watch (`aplicar` também
    // força `blocking=false` na criação). A prova de que a promoção produz `block` REAL no motor de
    // compliance — e de que ela SEMPRE exige `reviewNotes` humano — vive em
    // `tests/regulatory/regulatory-watch-promotion-integration.test.js`, não aqui.
    for (const rule of seed.rules) {
      for (const version of rule.versions) {
        const declaredBlocking = version.blocking === true;
        if (version.implementationState !== 'ACTIVE' || !declaredBlocking) continue;

        const reviewed = Boolean(version.reviewedBy) && Boolean(version.reviewedAt);
        assert.ok(
          reviewed,
          `[LEGAL REVIEW REQUIRED] ${rule.code}/${version.versionLabel}: versão ACTIVE+blocking=true `
            + 'sem reviewed_by/reviewed_at registrados. Promoção a bloqueante exige revisão jurídica '
            + `humana — ver ${GUIDE_PATH} ("Regra de ouro" e a pendência LEGAL REVIEW correspondente) `
            + 'antes de declarar esta versão no seed.'
        );
      }
    }
  });
});

// ===================================================================================================
// Meta-guarda 2 — todo ruleCode do seed tem evaluator OU pendência declarada, nunca os dois, nunca nenhum
// ===================================================================================================

describe('rule-catalog-invariants — meta-guarda 2: evaluator XOR pendência para TODO ruleCode', () => {
  it('RULE_EVALUATORS ∪ RULES_WITHOUT_EVALUATOR_YET = RULE_CODES = codes do seed (28, sem sobreposição, sem órfão)', () => {
    const seedCodes = seed.rules.map((rule) => rule.code);
    const withEvaluator = new Set(Object.keys(RULE_EVALUATORS));
    const withoutEvaluator = new Set(Object.keys(RULES_WITHOUT_EVALUATOR_YET));

    const overlap = [...withEvaluator].filter((code) => withoutEvaluator.has(code));
    assert.deepEqual(overlap, [], `code(s) registrado(s) nos DOIS lugares ao mesmo tempo: ${overlap.join(', ')}`);

    // 26 da baseline (PR-A1) + TR-SEG-004 (limite de garantia por viagem — PR-I2, REQ-SICAT-0028
    // rev.2) + TR-SEG-005 (averbação registrada antes do trânsito — PR-I3, REQ-SICAT-0034).
    const union = new Set([...withEvaluator, ...withoutEvaluator]);
    assert.equal(union.size, 28, `a união deveria cobrir exatamente 28 codes, cobre ${union.size}`);

    for (const code of RULE_CODES) {
      assert.ok(union.has(code), `${code} (RULE_CODES) não está em RULE_EVALUATORS nem em RULES_WITHOUT_EVALUATOR_YET`);
    }
    for (const code of seedCodes) {
      assert.ok(union.has(code), `${code} (seed) não está em RULE_EVALUATORS nem em RULES_WITHOUT_EVALUATOR_YET`);
    }
    for (const code of union) {
      assert.ok(
        seedCodes.includes(code),
        `${code} está registrado (evaluator ou pendência) mas NÃO existe no seed — entrada órfã, remova`
      );
    }
  });

  it('toda entrada de RULES_WITHOUT_EVALUATOR_YET declara targetPhase não-vazio', () => {
    for (const [code, entry] of Object.entries(RULES_WITHOUT_EVALUATOR_YET)) {
      assert.ok(typeof entry.targetPhase === 'string' && entry.targetPhase.length > 0, `${code} sem targetPhase`);
    }
  });
});

// ===================================================================================================
// Meta-guarda 3 — toda RegulatoryRuleVersion tem fixture de fronteira temporal (antes/depois)
// ===================================================================================================

describe('rule-catalog-invariants — meta-guarda 3: toda RegulatoryRuleVersion tem fixture de fronteira antes/depois', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const manifestEntries = Object.entries(manifest).filter(([code]) => !code.startsWith('_'));

  it('toda (code, versionLabel) do seed tem entrada em tests/fixtures/regulatory/fixtures-manifest.json', () => {
    for (const rule of seed.rules) {
      for (const version of rule.versions) {
        const entry = manifest[rule.code]?.[version.versionLabel];
        assert.ok(
          entry,
          `${rule.code}/${version.versionLabel} SEM fixture de fronteira temporal em `
            + 'tests/fixtures/regulatory/fixtures-manifest.json — regra de engenharia do programa '
            + `(${GUIDE_PATH}, item 14): "nenhuma mudança de RegulatoryRuleVersion sem fixture `
            + 'demonstrando comportamento antes e depois da vigência". Para corrigir, adicione '
            + `"${rule.code}": { "${version.versionLabel}": { "before": "<data ANTES de `
            + `effective_from=${version.effectiveFrom}>", "on": "<effective_from ou depois>", `
            + '"after": "<data que prova a vigência continuada' + (version.effectiveUntil ? ` ou a saída após effective_until=${version.effectiveUntil}` : '') + '>" } } '
            + 'ao manifesto.'
        );
      }
    }
  });

  it('as datas de cada entrada são coerentes com effective_from/effective_until do seed', () => {
    for (const rule of seed.rules) {
      for (const version of rule.versions) {
        const entry = manifest[rule.code]?.[version.versionLabel];
        if (!entry) continue; // já reprovou no teste anterior — não duplica ruído aqui

        const label = `${rule.code}/${version.versionLabel}`;
        assert.ok(
          entry.before < version.effectiveFrom,
          `${label}: before (${entry.before}) deveria ser ANTERIOR a effectiveFrom (${version.effectiveFrom})`
        );
        assert.ok(
          entry.on >= version.effectiveFrom,
          `${label}: on (${entry.on}) deveria ser >= effectiveFrom (${version.effectiveFrom})`
        );

        if (version.effectiveUntil != null) {
          assert.ok(
            entry.on <= version.effectiveUntil,
            `${label}: on (${entry.on}) deveria ser <= effectiveUntil (${version.effectiveUntil})`
          );
          assert.ok(
            entry.after > version.effectiveUntil,
            `${label}: after (${entry.after}) deveria ser POSTERIOR a effectiveUntil (${version.effectiveUntil}) `
              + '— é o que prova a SAÍDA de vigência'
          );
        } else {
          assert.ok(
            entry.after >= entry.on,
            `${label}: after (${entry.after}) deveria ser >= on (${entry.on}) — prova a vigência continuada`
          );
        }
      }
    }
  });

  it('nenhuma entrada do manifest é órfã (aponta para code/versionLabel que não existe mais no seed)', () => {
    for (const [code, versions] of manifestEntries) {
      const rule = seed.rules.find((entry) => entry.code === code);
      assert.ok(rule, `fixtures-manifest.json referencia code "${code}" que não existe no seed — remova a entrada`);
      for (const versionLabel of Object.keys(versions)) {
        assert.ok(
          rule.versions.some((version) => version.versionLabel === versionLabel),
          `fixtures-manifest.json referencia ${code}/${versionLabel}, que não existe mais no seed — remova a entrada`
        );
      }
    }
  });
});

// ===================================================================================================
// Meta-guarda 4 — piso mínimo de frete NUNCA entra pelo seed (só com revisão humana, pendência P3)
// ===================================================================================================

describe('rule-catalog-invariants — meta-guarda 4: piso mínimo de frete não entra pelo seed', () => {
  it('nenhum statement do seed insere em freight_floor_versions/freight_floor_coefficients', () => {
    const statements = buildRegulatoryCatalogSeedStatements();
    assert.ok(statements.length > 0, 'seed sem statements — algo mudou na geração');

    for (const statement of statements) {
      const sql = statement.sql.toLowerCase();
      assert.ok(
        !sql.includes('freight_floor_versions'),
        `${statement.name}: seed não pode tocar freight_floor_versions — coeficiente de piso só entra `
          + 'com revisão jurídica humana (pendência P3 do guia), nunca via boot automático.'
      );
      assert.ok(
        !sql.includes('freight_floor_coefficients'),
        `${statement.name}: seed não pode tocar freight_floor_coefficients — coeficiente de piso só `
          + 'entra com revisão jurídica humana (pendência P3 do guia), nunca via boot automático.'
      );
    }
  });
});

// ===================================================================================================
// Meta-guarda 5 — invariante temporal: versões da mesma regra NUNCA se sobrepõem (rede em memória)
// ===================================================================================================

describe('rule-catalog-invariants — meta-guarda 5: vigências da mesma regra nunca se sobrepõem', () => {
  // Implementação DELIBERADAMENTE independente de `resolveVersionFromList`/`assertCatalogIsWellFormed`
  // (regulatory-temporal.ts / regulatory-rules-seed.ts) — um segundo cálculo, feito só de
  // comparação de intervalos, que precisa CONCORDAR com o primeiro. É a "rede de segurança em
  // memória" pedida pelo PR-A6, além da exclusion constraint que o banco já garante.
  function windowsOverlap(a, b) {
    const aEnd = a.effectiveUntil ?? '9999-12-31';
    const bEnd = b.effectiveUntil ?? '9999-12-31';
    return a.effectiveFrom <= bEnd && b.effectiveFrom <= aEnd;
  }

  it('para cada regra, nenhum par de versões tem janelas de vigência sobrepostas', () => {
    let pairsChecked = 0;
    for (const rule of seed.rules) {
      for (let i = 0; i < rule.versions.length; i += 1) {
        for (let j = i + 1; j < rule.versions.length; j += 1) {
          const a = rule.versions[i];
          const b = rule.versions[j];
          pairsChecked += 1;
          assert.ok(
            !windowsOverlap(a, b),
            `${rule.code}: ${a.versionLabel} (${a.effectiveFrom}..${a.effectiveUntil ?? 'aberto'}) `
              + `sobrepõe ${b.versionLabel} (${b.effectiveFrom}..${b.effectiveUntil ?? 'aberto'})`
          );
        }
      }
    }
    // TR-CIOT-001 é hoje a única regra com >1 versão — se isso mudar, este contador sobe junto.
    assert.ok(pairsChecked >= 1, 'nenhum par de versões foi comparado — a regra ficaria verde por omissão');
  });
});
