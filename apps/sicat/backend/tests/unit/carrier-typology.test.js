/**
 * Testes da tipologia derivada do transportador (PR I1, REQ-SICAT-0033).
 *
 * Cobre as FRONTEIRAS do corte de frota (0/1/3/4) para PF e PJ — incluindo o edge assumido "PJ
 * com frota zero ≈ tac" —, a contagem de frota ativa (`countActiveFleet`: só owned+leased, com
 * vigência contra data de referência explícita) e o aviso de divergência declarado×derivado
 * (`buildTypologyWarning`, incluindo o não-aviso deliberado para CTC).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  TAC_MAX_FLEET_SIZE,
  buildTypologyWarning,
  countActiveFleet,
  deriveCarrierTypology
} from '../../src/lib/transport/carrier-typology.js';

describe('deriveCarrierTypology — fronteiras do corte de frota', () => {
  it('PF com frota 0 → driver_pf (motorista sem frota própria)', () => {
    assert.equal(deriveCarrierTypology({ partyKind: 'PF', fleetSize: 0 }), 'driver_pf');
  });

  it('PJ com frota 0 → tac (edge assumido: menor tipologia de transportador, nunca driver_pf)', () => {
    assert.equal(deriveCarrierTypology({ partyKind: 'PJ', fleetSize: 0 }), 'tac');
  });

  it('frota 1 → tac, para PF e PJ', () => {
    assert.equal(deriveCarrierTypology({ partyKind: 'PF', fleetSize: 1 }), 'tac');
    assert.equal(deriveCarrierTypology({ partyKind: 'PJ', fleetSize: 1 }), 'tac');
  });

  it('frota 3 (teto do TAC) → tac, para PF e PJ', () => {
    assert.equal(TAC_MAX_FLEET_SIZE, 3, 'o corte do circuito TRC é 3 caminhões');
    assert.equal(deriveCarrierTypology({ partyKind: 'PF', fleetSize: 3 }), 'tac');
    assert.equal(deriveCarrierTypology({ partyKind: 'PJ', fleetSize: 3 }), 'tac');
  });

  it('frota 4 → etc, para PF e PJ (o corte 3/4 é a fronteira TAC/ETC)', () => {
    assert.equal(deriveCarrierTypology({ partyKind: 'PF', fleetSize: 4 }), 'etc');
    assert.equal(deriveCarrierTypology({ partyKind: 'PJ', fleetSize: 4 }), 'etc');
  });

  it('rejeita fleetSize negativo ou não-inteiro (contrato da função pura)', () => {
    assert.throws(() => deriveCarrierTypology({ partyKind: 'PF', fleetSize: -1 }), RangeError);
    assert.throws(() => deriveCarrierTypology({ partyKind: 'PJ', fleetSize: 1.5 }), RangeError);
  });
});

describe('countActiveFleet — só owned+leased vigentes', () => {
  const REF = '2026-08-16';

  it('conta owned e leased; ignora aggregated e rntrc_fleet', () => {
    const links = [
      { linkType: 'owned', validFrom: null, validUntil: null },
      { linkType: 'leased', validFrom: '2026-01-01', validUntil: null },
      { linkType: 'aggregated', validFrom: null, validUntil: null },
      { linkType: 'rntrc_fleet', validFrom: null, validUntil: null }
    ];
    assert.equal(countActiveFleet(links, REF), 2);
  });

  it('vínculo encerrado antes da referência não conta; encerrando NO dia ainda conta', () => {
    const links = [
      { linkType: 'owned', validFrom: '2025-01-01', validUntil: '2026-08-15' },
      { linkType: 'owned', validFrom: '2025-01-01', validUntil: REF }
    ];
    assert.equal(countActiveFleet(links, REF), 1);
  });

  it('vínculo que só começa depois da referência não conta; começando NO dia conta', () => {
    const links = [
      { linkType: 'leased', validFrom: '2026-08-17', validUntil: null },
      { linkType: 'leased', validFrom: REF, validUntil: null }
    ];
    assert.equal(countActiveFleet(links, REF), 1);
  });

  it('datas nulas não restringem (vínculo sem período declarado é ativo)', () => {
    assert.equal(countActiveFleet([{ linkType: 'owned' }], REF), 1);
  });

  it('lista vazia → 0', () => {
    assert.equal(countActiveFleet([], REF), 0);
  });
});

describe('buildTypologyWarning — divergência declarado×derivado como AVISO', () => {
  it('TAC declarado × etc derivado → aviso com a categoria e a tipologia', () => {
    const warning = buildTypologyWarning({ declaredCategory: 'TAC', derivedTypology: 'etc', fleetSize: 5 });
    assert.ok(warning, 'divergência deveria gerar aviso');
    assert.match(warning, /TAC/);
    assert.match(warning, /etc/);
  });

  it('TAC declarado × driver_pf derivado (frota zerada) → aviso', () => {
    assert.ok(buildTypologyWarning({ declaredCategory: 'TAC', derivedTypology: 'driver_pf', fleetSize: 0 }));
  });

  it('ETC declarado × tac derivado → aviso; ETC × etc → sem aviso', () => {
    assert.ok(buildTypologyWarning({ declaredCategory: 'ETC', derivedTypology: 'tac', fleetSize: 2 }));
    assert.equal(buildTypologyWarning({ declaredCategory: 'ETC', derivedTypology: 'etc', fleetSize: 4 }), null);
  });

  it('TAC declarado × tac derivado → sem aviso (controle negativo)', () => {
    assert.equal(buildTypologyWarning({ declaredCategory: 'TAC', derivedTypology: 'tac', fleetSize: 2 }), null);
  });

  it('CTC (cooperativa) nunca gera aviso — não derivável de contagem de frota', () => {
    assert.equal(buildTypologyWarning({ declaredCategory: 'CTC', derivedTypology: 'etc', fleetSize: 10 }), null);
  });

  it('sem categoria declarada → sem aviso', () => {
    assert.equal(buildTypologyWarning({ declaredCategory: null, derivedTypology: 'tac', fleetSize: 1 }), null);
    assert.equal(buildTypologyWarning({ declaredCategory: undefined, derivedTypology: 'etc', fleetSize: 4 }), null);
  });
});
