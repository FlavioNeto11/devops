/**
 * Testes do validador declaratório do cadastro-base de transportadores/veículos (PR-A3).
 *
 * Cobre: dígito verificador de CNPJ/CPF (válidos e inválidos, incluindo os casos degenerados
 * "todos os dígitos iguais"), placa nos dois formatos vigentes (antigo e Mercosul), UF, categoria
 * RNTRC, roles permitidos e a normalização (documentNumber só dígitos; plate maiúscula sem hífen).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { AppError } from '../../src/lib/problem.js';
import {
  onlyDigits,
  validateAxlesCount,
  validatePartyDocument,
  validatePartyRoles,
  validatePlate,
  validateRntrcCategory,
  validateRntrcStatus,
  validateUf,
  validateVehicleLinkPeriod,
  validateVehicleLinkType,
  validateVehicleType
} from '../../src/lib/validators/transport-party-validator.js';

function assertAppError(fn, code) {
  assert.throws(fn, (err) => {
    assert.ok(err instanceof AppError, 'erro deve ser AppError');
    assert.strictEqual(err.statusCode, 400);
    assert.strictEqual(err.code, code);
    return true;
  });
}

describe('validatePartyDocument — CNPJ', () => {
  it('aceita CNPJ com dígito verificador válido e normaliza para só dígitos', () => {
    const result = validatePartyDocument('CNPJ', '11.222.333/0001-81');
    assert.deepEqual(result, { documentType: 'CNPJ', documentNumber: '11222333000181' });
  });

  it('rejeita CNPJ com dígito verificador inválido', () => {
    assertAppError(
      () => validatePartyDocument('CNPJ', '11.222.333/0001-80'),
      'TRANSPORT_PARTY_DOCUMENT_INVALID'
    );
  });

  it('rejeita CNPJ com todos os dígitos iguais', () => {
    assertAppError(
      () => validatePartyDocument('CNPJ', '11111111111111'),
      'TRANSPORT_PARTY_DOCUMENT_INVALID'
    );
  });

  it('rejeita CNPJ com tamanho incorreto', () => {
    assertAppError(
      () => validatePartyDocument('CNPJ', '1122233300018'),
      'TRANSPORT_PARTY_DOCUMENT_INVALID'
    );
  });
});

describe('validatePartyDocument — CPF', () => {
  it('aceita CPF com dígito verificador válido e normaliza para só dígitos', () => {
    const result = validatePartyDocument('CPF', '529.982.247-25');
    assert.deepEqual(result, { documentType: 'CPF', documentNumber: '52998224725' });
  });

  it('rejeita CPF com dígito verificador inválido', () => {
    assertAppError(
      () => validatePartyDocument('CPF', '529.982.247-26'),
      'TRANSPORT_PARTY_DOCUMENT_INVALID'
    );
  });

  it('rejeita CPF com todos os dígitos iguais', () => {
    assertAppError(
      () => validatePartyDocument('CPF', '111.111.111-11'),
      'TRANSPORT_PARTY_DOCUMENT_INVALID'
    );
  });
});

describe('validatePartyDocument — documentType', () => {
  it('rejeita documentType fora de CNPJ/CPF', () => {
    assertAppError(
      () => validatePartyDocument('RG', '11222333000181'),
      'TRANSPORT_PARTY_DOCUMENT_INVALID'
    );
  });
});

describe('onlyDigits', () => {
  it('remove tudo que não é dígito', () => {
    assert.strictEqual(onlyDigits('11.222.333/0001-81'), '11222333000181');
    assert.strictEqual(onlyDigits('ABC 123-45'), '12345');
  });
});

describe('validatePlate — formato antigo e Mercosul', () => {
  it('aceita placa no formato antigo (AAA9999)', () => {
    assert.strictEqual(validatePlate('ABC1234'), 'ABC1234');
  });

  it('aceita placa no formato Mercosul (AAA9A99)', () => {
    assert.strictEqual(validatePlate('ABC1D23'), 'ABC1D23');
  });

  it('normaliza minúsculas e remove hífen/espaço', () => {
    assert.strictEqual(validatePlate('abc-1234'), 'ABC1234');
    assert.strictEqual(validatePlate('abc 1d23'), 'ABC1D23');
  });

  it('rejeita placa em formato inválido', () => {
    assertAppError(() => validatePlate('AB1234'), 'TRANSPORT_VEHICLE_PLATE_INVALID');
    assertAppError(() => validatePlate('ABCD123'), 'TRANSPORT_VEHICLE_PLATE_INVALID');
    assertAppError(() => validatePlate('1234ABC'), 'TRANSPORT_VEHICLE_PLATE_INVALID');
  });

  it('rejeita placa vazia', () => {
    assertAppError(() => validatePlate(''), 'TRANSPORT_VEHICLE_FIELD_REQUIRED');
  });
});

describe('validateUf', () => {
  it('aceita UF válida e normaliza para maiúsculas', () => {
    assert.strictEqual(validateUf('sp'), 'SP');
    assert.strictEqual(validateUf('RJ'), 'RJ');
  });

  it('aceita null/undefined/vazio como ausência de UF', () => {
    assert.strictEqual(validateUf(null), null);
    assert.strictEqual(validateUf(undefined), null);
    assert.strictEqual(validateUf(''), null);
  });

  it('rejeita UF fora das 27 unidades federativas', () => {
    assertAppError(() => validateUf('XX'), 'TRANSPORT_PARTY_UF_INVALID');
    assertAppError(() => validateUf('SPX'), 'TRANSPORT_PARTY_UF_INVALID');
  });
});

describe('validateRntrcCategory', () => {
  it('aceita TAC/ETC/CTC', () => {
    assert.strictEqual(validateRntrcCategory('TAC'), 'TAC');
    assert.strictEqual(validateRntrcCategory('ETC'), 'ETC');
    assert.strictEqual(validateRntrcCategory('CTC'), 'CTC');
  });

  it('aceita null/undefined/vazio', () => {
    assert.strictEqual(validateRntrcCategory(null), null);
    assert.strictEqual(validateRntrcCategory(undefined), null);
    assert.strictEqual(validateRntrcCategory(''), null);
  });

  it('rejeita categoria fora do enum', () => {
    assertAppError(() => validateRntrcCategory('XYZ'), 'TRANSPORT_PARTY_RNTRC_CATEGORY_INVALID');
  });
});

describe('validateRntrcStatus', () => {
  it('aceita os 5 status declarados', () => {
    for (const status of ['unknown', 'active', 'suspended', 'cancelled', 'expired']) {
      assert.strictEqual(validateRntrcStatus(status), status);
    }
  });

  it('ausência vira unknown (default)', () => {
    assert.strictEqual(validateRntrcStatus(null), 'unknown');
    assert.strictEqual(validateRntrcStatus(undefined), 'unknown');
  });

  it('rejeita status fora do enum', () => {
    assertAppError(() => validateRntrcStatus('regular'), 'TRANSPORT_PARTY_RNTRC_STATUS_INVALID');
  });
});

describe('validatePartyRoles', () => {
  it('aceita lista de papéis permitidos, sem duplicatas', () => {
    assert.deepEqual(validatePartyRoles(['carrier', 'shipper', 'carrier']), ['carrier', 'shipper']);
  });

  it('lista ausente vira array vazio', () => {
    assert.deepEqual(validatePartyRoles(undefined), []);
    assert.deepEqual(validatePartyRoles(null), []);
  });

  it('rejeita role fora do enum', () => {
    assertAppError(() => validatePartyRoles(['owner']), 'TRANSPORT_PARTY_ROLE_INVALID');
  });

  it('rejeita valor que não é array', () => {
    assertAppError(() => validatePartyRoles('carrier'), 'TRANSPORT_PARTY_ROLE_INVALID');
  });
});

describe('validateVehicleType', () => {
  it('aceita os 5 tipos de veículo', () => {
    for (const type of ['tractor', 'truck', 'semi_trailer', 'trailer', 'other']) {
      assert.strictEqual(validateVehicleType(type), type);
    }
  });

  it('rejeita tipo fora do enum', () => {
    assertAppError(() => validateVehicleType('moto'), 'TRANSPORT_VEHICLE_TYPE_INVALID');
  });
});

describe('validateAxlesCount', () => {
  it('aceita inteiros entre 1 e 12', () => {
    assert.strictEqual(validateAxlesCount(1), 1);
    assert.strictEqual(validateAxlesCount(12), 12);
    assert.strictEqual(validateAxlesCount('5'), 5);
  });

  it('aceita ausência como null', () => {
    assert.strictEqual(validateAxlesCount(null), null);
    assert.strictEqual(validateAxlesCount(undefined), null);
  });

  it('rejeita fora de 1..12 e não inteiro', () => {
    assertAppError(() => validateAxlesCount(0), 'TRANSPORT_VEHICLE_AXLES_INVALID');
    assertAppError(() => validateAxlesCount(13), 'TRANSPORT_VEHICLE_AXLES_INVALID');
    assertAppError(() => validateAxlesCount(2.5), 'TRANSPORT_VEHICLE_AXLES_INVALID');
  });
});

describe('validateVehicleLinkType', () => {
  it('aceita owned/leased/aggregated/rntrc_fleet', () => {
    for (const type of ['owned', 'leased', 'aggregated', 'rntrc_fleet']) {
      assert.strictEqual(validateVehicleLinkType(type), type);
    }
  });

  it('rejeita tipo fora do enum', () => {
    assertAppError(() => validateVehicleLinkType('shared'), 'TRANSPORT_VEHICLE_LINK_TYPE_INVALID');
  });
});

describe('validateVehicleLinkPeriod', () => {
  it('aceita ambas as datas ausentes', () => {
    assert.deepEqual(validateVehicleLinkPeriod(undefined, undefined), { validFrom: null, validUntil: null });
  });

  it('aceita validUntil >= validFrom', () => {
    assert.deepEqual(
      validateVehicleLinkPeriod('2026-01-01', '2026-12-31'),
      { validFrom: '2026-01-01', validUntil: '2026-12-31' }
    );
  });

  it('rejeita validUntil anterior a validFrom', () => {
    assertAppError(
      () => validateVehicleLinkPeriod('2026-12-31', '2026-01-01'),
      'TRANSPORT_VEHICLE_LINK_PERIOD_INVALID'
    );
  });

  it('rejeita formato de data fora de YYYY-MM-DD', () => {
    assertAppError(
      () => validateVehicleLinkPeriod('01/01/2026', undefined),
      'TRANSPORT_VEHICLE_LINK_PERIOD_INVALID'
    );
  });
});
