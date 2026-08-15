/**
 * Testes PUROS do `FreightFloorEngine` (PR-B1) — SEM banco, SEM service. Coeficientes usados nos
 * casos de aritmética são os REAIS da Tabela A (Res. ANTT 6.084/2026,
 * `reference-data/freight-floor/res-6084-2026-tabela-a.json`), copiados aqui como literais —
 * qualquer divergência entre este arquivo e o JSON é bug de transcrição em um dos dois lados.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  FREIGHT_FLOOR_CARGO_SLUGS,
  calculateFreightFloor,
  decideFreightFloorOutcome,
  mapCargoTypeToFloorSlug,
  resolveFloorTableCodeForCargoRegime,
  roundHalfUp2,
  sumAxlesFromVehicles
} from '../../src/lib/transport/freight-floor-engine.js';

// ===================================================================================================
// Aritmética exata — coeficientes reais da Tabela A (Res. ANTT 6.084/2026)
// ===================================================================================================

describe('calculateFreightFloor — aritmética exata com coeficientes reais da Tabela A', () => {
  it('carga_geral, 6 eixos, 850 km: 7.3547*850 + 671.93 = 6923.43', () => {
    const result = calculateFreightFloor({
      cargoType: 'carga_geral',
      axlesCount: 6,
      distanceKm: 850,
      coefficients: { displacement: 7.3547, loadUnload: 671.93 }
    });
    assert.equal(result.minimumAmount, 6923.43);
    assert.equal(result.trace.formula, 'CCD*km + CC');
    assert.equal(result.trace.components.displacementSubtotal, 6251.5);
    assert.equal(result.trace.components.loadUnloadSubtotal, 671.93);
  });

  it('frigorificada, 5 eixos, 1200 km: 7.8666*1200 + 757.98 = 10197.90', () => {
    const result = calculateFreightFloor({
      cargoType: 'frigorificada',
      axlesCount: 5,
      distanceKm: 1200,
      coefficients: { displacement: 7.8666, loadUnload: 757.98 }
    });
    assert.equal(result.minimumAmount, 10197.90);
  });

  it('granel_solido, 2 eixos, 100 km: 4.0144*100 + 460.59 = 862.03', () => {
    const result = calculateFreightFloor({
      cargoType: 'granel_solido',
      axlesCount: 2,
      distanceKm: 100,
      coefficients: { displacement: 4.0144, loadUnload: 460.59 }
    });
    // 4.0144*100 = 401.44; + 460.59 = 862.03 (exato, sem fronteira de arredondamento).
    assert.equal(result.minimumAmount, 862.03);
  });

  it('perigosa_carga_geral, 9 eixos, 2000 km: 9.6501*2000 + 1016.33 = 20316.53', () => {
    const result = calculateFreightFloor({
      cargoType: 'perigosa_carga_geral',
      axlesCount: 9,
      distanceKm: 2000,
      coefficients: { displacement: 9.6501, loadUnload: 1016.33 }
    });
    assert.equal(result.minimumAmount, 20316.53);
  });
});

// ===================================================================================================
// Arredondamento HALF-UP — robusto a erro de representação de ponto flutuante
// ===================================================================================================

describe('roundHalfUp2 — HALF-UP, nunca banker\'s rounding', () => {
  it('1.005 → 1.01 (o caso clássico onde toFixed/Math.round sozinhos falham)', () => {
    assert.equal(roundHalfUp2(1.005), 1.01);
  });

  it('2.675 → 2.68', () => {
    assert.equal(roundHalfUp2(2.675), 2.68);
  });

  it('6923.425 → 6923.43 (fronteira exata do exemplo carga_geral/850km)', () => {
    assert.equal(roundHalfUp2(6923.425), 6923.43);
  });

  it('valores sem fronteira de arredondamento passam inalterados', () => {
    assert.equal(roundHalfUp2(100), 100);
    assert.equal(roundHalfUp2(0), 0);
  });

  it('negativos arredondam mantendo o sinal', () => {
    assert.equal(roundHalfUp2(-1.005), -1.01);
  });
});

// ===================================================================================================
// Mapeamento de cargoType (texto livre do operador) → slug canônico
// ===================================================================================================

describe('mapCargoTypeToFloorSlug — cargoType livre → 1 dos 11 slugs canônicos, ou null', () => {
  it('os 11 slugs canônicos mapeiam para si mesmos', () => {
    for (const slug of FREIGHT_FLOOR_CARGO_SLUGS) {
      assert.equal(mapCargoTypeToFloorSlug(slug), slug);
    }
    assert.equal(FREIGHT_FLOOR_CARGO_SLUGS.length, 11);
  });

  it('rótulos PT-BR com acento/parênteses (como no JSON de referência) mapeiam corretamente', () => {
    assert.equal(mapCargoTypeToFloorSlug('Granel sólido'), 'granel_solido');
    assert.equal(mapCargoTypeToFloorSlug('Granel líquido'), 'granel_liquido');
    assert.equal(mapCargoTypeToFloorSlug('Frigorificada ou aquecida'), 'frigorificada');
    assert.equal(mapCargoTypeToFloorSlug('Conteinerizada'), 'conteinerizada');
    assert.equal(mapCargoTypeToFloorSlug('Carga geral'), 'carga_geral');
    assert.equal(mapCargoTypeToFloorSlug('Perigosa (granel sólido)'), 'perigosa_granel_solido');
    assert.equal(mapCargoTypeToFloorSlug('Perigosa (carga geral)'), 'perigosa_carga_geral');
  });

  it('variações comuns (maiúsculas, espaços) também mapeiam', () => {
    assert.equal(mapCargoTypeToFloorSlug('  CARGA_GERAL  '), 'carga_geral');
    assert.equal(mapCargoTypeToFloorSlug('Container'), 'conteinerizada');
    assert.equal(mapCargoTypeToFloorSlug('Refrigerada'), 'frigorificada');
  });

  it('cargoType sem correspondência conhecida → null (nunca adivinha um slug "parecido")', () => {
    assert.equal(mapCargoTypeToFloorSlug('fracionada'), null);
    assert.equal(mapCargoTypeToFloorSlug('granel'), null);
    assert.equal(mapCargoTypeToFloorSlug('xyz-tipo-desconhecido'), null);
  });

  it('cargoType ausente/vazio → null', () => {
    assert.equal(mapCargoTypeToFloorSlug(null), null);
    assert.equal(mapCargoTypeToFloorSlug(undefined), null);
    assert.equal(mapCargoTypeToFloorSlug(''), null);
    assert.equal(mapCargoTypeToFloorSlug('   '), null);
  });
});

// ===================================================================================================
// Resolução de tabela por regime de carga
// ===================================================================================================

describe('resolveFloorTableCodeForCargoRegime — Fase B só resolve a Tabela A', () => {
  it('lotacao → "A"', () => {
    assert.equal(resolveFloorTableCodeForCargoRegime('lotacao'), 'A');
  });

  it('fracionada → null', () => {
    assert.equal(resolveFloorTableCodeForCargoRegime('fracionada'), null);
  });

  it('unknown → null', () => {
    assert.equal(resolveFloorTableCodeForCargoRegime('unknown'), null);
  });
});

// ===================================================================================================
// Soma de eixos a partir dos veículos vinculados
// ===================================================================================================

describe('sumAxlesFromVehicles — soma axlesCount dos vehicleSnapshot vinculados', () => {
  it('soma tração + reboques', () => {
    const vehicles = [
      { vehicleSnapshot: { axlesCount: 3 } },
      { vehicleSnapshot: { axlesCount: 3 } }
    ];
    assert.equal(sumAxlesFromVehicles(vehicles), 6);
  });

  it('sem veículos → null', () => {
    assert.equal(sumAxlesFromVehicles([]), null);
  });

  it('veículo sem axlesCount declarado é ignorado (não vira 0 nem NaN)', () => {
    const vehicles = [{ vehicleSnapshot: { axlesCount: null } }, { vehicleSnapshot: {} }];
    assert.equal(sumAxlesFromVehicles(vehicles), null);
  });

  it('mistura de veículo com e sem axlesCount soma só o declarado', () => {
    const vehicles = [{ vehicleSnapshot: { axlesCount: 4 } }, { vehicleSnapshot: {} }];
    assert.equal(sumAxlesFromVehicles(vehicles), 4);
  });
});

// ===================================================================================================
// Árvore de decisão PURA — os 4 outcomes da migration 026, sem tocar banco
// ===================================================================================================

describe('decideFreightFloorOutcome — árvore de decisão pura', () => {
  it('fracionada → not_applicable, independente dos demais insumos', () => {
    const decision = decideFreightFloorOutcome({
      cargoRegime: 'fracionada',
      cargoTypeRaw: 'carga_geral',
      axlesCount: 6,
      distanceKm: 850,
      floorVersionFound: true,
      coefficients: { displacement: 7.3547, loadUnload: 671.93 }
    });
    assert.equal(decision.outcome, 'not_applicable');
  });

  it('unknown → not_applicable', () => {
    const decision = decideFreightFloorOutcome({
      cargoRegime: 'unknown',
      cargoTypeRaw: null,
      axlesCount: null,
      distanceKm: null,
      floorVersionFound: false,
      coefficients: null
    });
    assert.equal(decision.outcome, 'not_applicable');
  });

  it('lotacao + distância nula → missing_inputs (cargoType e axles presentes)', () => {
    const decision = decideFreightFloorOutcome({
      cargoRegime: 'lotacao',
      cargoTypeRaw: 'carga_geral',
      axlesCount: 6,
      distanceKm: null,
      floorVersionFound: true,
      coefficients: null
    });
    assert.equal(decision.outcome, 'missing_inputs');
    assert.match(decision.reason, /distanceKm/);
  });

  it('lotacao + cargoType não mapeado → missing_inputs, cargoFloorSlug null', () => {
    const decision = decideFreightFloorOutcome({
      cargoRegime: 'lotacao',
      cargoTypeRaw: 'tipo-desconhecido',
      axlesCount: 6,
      distanceKm: 850,
      floorVersionFound: true,
      coefficients: null
    });
    assert.equal(decision.outcome, 'missing_inputs');
    assert.equal(decision.cargoFloorSlug, null);
  });

  it('lotacao + sem veículo (axlesCount null) → missing_inputs', () => {
    const decision = decideFreightFloorOutcome({
      cargoRegime: 'lotacao',
      cargoTypeRaw: 'carga_geral',
      axlesCount: null,
      distanceKm: 850,
      floorVersionFound: true,
      coefficients: null
    });
    assert.equal(decision.outcome, 'missing_inputs');
  });

  it('lotacao + insumos completos + nenhuma tabela vigente (floorVersionFound=false) → missing_coefficients', () => {
    const decision = decideFreightFloorOutcome({
      cargoRegime: 'lotacao',
      cargoTypeRaw: 'carga_geral',
      axlesCount: 6,
      distanceKm: 850,
      floorVersionFound: false,
      coefficients: null
    });
    assert.equal(decision.outcome, 'missing_coefficients');
    assert.match(decision.reason, /nenhuma versão/i);
  });

  it('lotacao + tabela vigente MAS sem coeficiente para o cargoType/axlesCount → missing_coefficients', () => {
    const decision = decideFreightFloorOutcome({
      cargoRegime: 'lotacao',
      cargoTypeRaw: 'carga_geral',
      axlesCount: 8, // eixo sem linha na Tabela A (só existem 2,3,4,5,6,7,9)
      distanceKm: 850,
      floorVersionFound: true,
      coefficients: null
    });
    assert.equal(decision.outcome, 'missing_coefficients');
    assert.match(decision.reason, /vigente, mas sem coeficiente/i);
  });

  it('lotacao + tudo resolvido → calculated, com minimumAmount correto (carga_geral 6 eixos 850km)', () => {
    const decision = decideFreightFloorOutcome({
      cargoRegime: 'lotacao',
      cargoTypeRaw: 'carga_geral',
      axlesCount: 6,
      distanceKm: 850,
      floorVersionFound: true,
      coefficients: { displacement: 7.3547, loadUnload: 671.93 }
    });
    assert.equal(decision.outcome, 'calculated');
    assert.equal(decision.minimumAmount, 6923.43);
    assert.equal(decision.cargoFloorSlug, 'carga_geral');
    assert.equal(decision.axlesCount, 6);
    assert.equal(decision.distanceKm, 850);
  });
});
