/**
 * Testes da validação declaratória de motoristas (PR I1, REQ-SICAT-0033).
 *
 * Cobre: CNH (normalização do número para só dígitos, categoria do enum, validade YYYY-MM-DD
 * obrigatória — CNH VENCIDA é aceita de propósito, o cadastro é declarativo), UF emissora, status,
 * tipo e vigência do vínculo (validFrom OBRIGATÓRIO — diferente do vínculo de veículo) e o filtro
 * LGPD de `evidence` (só notes/documentRef sobrevivem, truncados).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { AppError } from '../../src/lib/problem.js';
import {
  sanitizeDriverEvidence,
  validateCnhCategory,
  validateCnhNumber,
  validateCnhUf,
  validateCnhValidUntil,
  validateDriverLinkPeriod,
  validateDriverLinkType,
  validateDriverStatus
} from '../../src/lib/transport/transport-driver-types.js';

function assertAppError(fn, code) {
  assert.throws(fn, (err) => {
    assert.ok(err instanceof AppError, 'erro deve ser AppError');
    assert.strictEqual(err.statusCode, 400);
    assert.strictEqual(err.code, code);
    return true;
  });
}

describe('validateCnhNumber', () => {
  it('aceita número com máscara e normaliza para só dígitos', () => {
    assert.equal(validateCnhNumber(' 123 456 789-09 '), '12345678909');
    assert.equal(validateCnhNumber('123.456.789.09'), '12345678909');
  });

  it('rejeita número com letras (não some silenciosamente na normalização)', () => {
    assertAppError(() => validateCnhNumber('ABC12345'), 'TRANSPORT_DRIVER_CNH_NUMBER_INVALID');
  });

  it('rejeita vazio/ausente como campo obrigatório', () => {
    assertAppError(() => validateCnhNumber(''), 'TRANSPORT_DRIVER_FIELD_REQUIRED');
    assertAppError(() => validateCnhNumber('   '), 'TRANSPORT_DRIVER_FIELD_REQUIRED');
    assertAppError(() => validateCnhNumber(undefined), 'TRANSPORT_DRIVER_FIELD_REQUIRED');
  });
});

describe('validateCnhCategory', () => {
  it('aceita as categorias simples e combinadas do enum', () => {
    for (const category of ['A', 'B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE']) {
      assert.equal(validateCnhCategory(category), category);
    }
  });

  it('rejeita categoria fora do enum (incluindo minúscula — sem normalização implícita)', () => {
    assertAppError(() => validateCnhCategory('F'), 'TRANSPORT_DRIVER_CNH_CATEGORY_INVALID');
    assertAppError(() => validateCnhCategory('e'), 'TRANSPORT_DRIVER_CNH_CATEGORY_INVALID');
    assertAppError(() => validateCnhCategory(undefined), 'TRANSPORT_DRIVER_CNH_CATEGORY_INVALID');
  });
});

describe('validateCnhValidUntil', () => {
  it('aceita data ISO — inclusive no PASSADO (CNH vencida é fato registrável)', () => {
    assert.equal(validateCnhValidUntil('2028-05-20'), '2028-05-20');
    assert.equal(validateCnhValidUntil('2020-01-01'), '2020-01-01');
  });

  it('rejeita ausência e formatos fora de YYYY-MM-DD', () => {
    assertAppError(() => validateCnhValidUntil(undefined), 'TRANSPORT_DRIVER_CNH_VALIDITY_INVALID');
    assertAppError(() => validateCnhValidUntil('20/05/2028'), 'TRANSPORT_DRIVER_CNH_VALIDITY_INVALID');
    assertAppError(() => validateCnhValidUntil('2028-5-2'), 'TRANSPORT_DRIVER_CNH_VALIDITY_INVALID');
  });
});

describe('validateCnhUf', () => {
  it('aceita UF válida (normalizando caixa) e ausência como null', () => {
    assert.equal(validateCnhUf('sp'), 'SP');
    assert.equal(validateCnhUf(null), null);
    assert.equal(validateCnhUf(''), null);
  });

  it('rejeita UF inexistente', () => {
    assertAppError(() => validateCnhUf('XX'), 'TRANSPORT_DRIVER_CNH_UF_INVALID');
  });
});

describe('validateDriverStatus', () => {
  it('default active quando ausente; aceita o enum', () => {
    assert.equal(validateDriverStatus(undefined), 'active');
    assert.equal(validateDriverStatus('inactive'), 'inactive');
  });

  it('rejeita status fora do enum', () => {
    assertAppError(() => validateDriverStatus('suspended'), 'TRANSPORT_DRIVER_STATUS_INVALID');
  });
});

describe('validateDriverLinkType', () => {
  it('aceita fleet e aggregated', () => {
    assert.equal(validateDriverLinkType('fleet'), 'fleet');
    assert.equal(validateDriverLinkType('aggregated'), 'aggregated');
  });

  it('rejeita tipos do vínculo de VEÍCULO (owned/leased não valem aqui)', () => {
    assertAppError(() => validateDriverLinkType('owned'), 'TRANSPORT_DRIVER_LINK_TYPE_INVALID');
    assertAppError(() => validateDriverLinkType(undefined), 'TRANSPORT_DRIVER_LINK_TYPE_INVALID');
  });
});

describe('validateDriverLinkPeriod', () => {
  it('validFrom é OBRIGATÓRIO; validUntil é opcional', () => {
    assert.deepEqual(validateDriverLinkPeriod('2026-08-01', undefined), {
      validFrom: '2026-08-01',
      validUntil: null
    });
    assert.deepEqual(validateDriverLinkPeriod('2026-08-01', '2026-12-31'), {
      validFrom: '2026-08-01',
      validUntil: '2026-12-31'
    });
  });

  it('rejeita validFrom ausente/malformado e validUntil anterior ao início', () => {
    assertAppError(() => validateDriverLinkPeriod(undefined, null), 'TRANSPORT_DRIVER_LINK_PERIOD_INVALID');
    assertAppError(() => validateDriverLinkPeriod('01/08/2026', null), 'TRANSPORT_DRIVER_LINK_PERIOD_INVALID');
    assertAppError(() => validateDriverLinkPeriod('2026-08-01', '2026-07-31'), 'TRANSPORT_DRIVER_LINK_PERIOD_INVALID');
  });

  it('vigência de um dia só (until = from) é válida', () => {
    assert.deepEqual(validateDriverLinkPeriod('2026-08-01', '2026-08-01'), {
      validFrom: '2026-08-01',
      validUntil: '2026-08-01'
    });
  });
});

describe('sanitizeDriverEvidence — LGPD', () => {
  it('só notes e documentRef sobrevivem; campos livres são descartados', () => {
    const evidence = sanitizeDriverEvidence({
      notes: 'CNH conferida presencialmente.',
      documentRef: 'arquivo-123',
      cpfDoMotorista: 'nunca persiste',
      endereco: 'nunca persiste'
    });
    assert.deepEqual(evidence, { notes: 'CNH conferida presencialmente.', documentRef: 'arquivo-123' });
  });

  it('trunca notes em 500 e documentRef em 200', () => {
    const evidence = sanitizeDriverEvidence({ notes: 'x'.repeat(600), documentRef: 'y'.repeat(300) });
    assert.equal(evidence.notes.length, 500);
    assert.equal(evidence.documentRef.length, 200);
  });

  it('body não-objeto (ou array) vira objeto vazio', () => {
    assert.deepEqual(sanitizeDriverEvidence(undefined), {});
    assert.deepEqual(sanitizeDriverEvidence('texto solto'), {});
    assert.deepEqual(sanitizeDriverEvidence(['a']), {});
  });
});
