import { describe, it } from 'node:test';
import assert from 'node:assert';
import { validateManifestPayload, normalizeExpeditionDate } from '../../src/lib/validators/manifest-validator.js';
import { AppError } from '../../src/lib/problem.js';

/**
 * Testes para validador de payload de manifesto
 * Baseado em docs/copilot/validacao-sequencia-mtr.md
 */

describe('validateManifestPayload', () => {
  const validPayload = {
    responsibleName: 'Flavio Padilha Neto',
    manifestType: 1,
    expeditionDate: '2026-03-07',
    state: { code: 26, abbreviation: 'SP' },
    generator: { partnerCode: 176163 },
    carrier: { partnerCode: 160627 },
    receiver: { partnerCode: 40110 },
    residues: [
      {
        quantity: 18,
        residue: { code: 731 },
        unit: { code: 3 },
        treatment: { code: 51 },
        class: { code: 11 }
      }
    ]
  };

  const validSessionContext = {
    metadata: { recaptchaToken: 'session-token-456' }
  };

  it('deve aceitar payload válido completo', () => {
    assert.doesNotThrow(() => {
      validateManifestPayload(validPayload, validSessionContext);
    });
  });

  it('deve aceitar payload válido sem sessionContext', () => {
    assert.doesNotThrow(() => {
      validateManifestPayload(validPayload, null);
    });
  });

  it('deve rejeitar payload sem responsibleName', () => {
    const invalid = { ...validPayload, responsibleName: '' };
    assert.throws(
      () => validateManifestPayload(invalid, validSessionContext),
      (err) => {
        assert(err instanceof AppError);
        assert.strictEqual(err.statusCode, 400);
        assert(err.message.includes('responsibleName'));
        return true;
      }
    );
  });

  it('deve rejeitar payload sem manifestType', () => {
    const invalid = { ...validPayload, manifestType: null };
    assert.throws(
      () => validateManifestPayload(invalid, validSessionContext),
      (err) => {
        assert(err instanceof AppError);
        assert(err.message.includes('manifestType'));
        return true;
      }
    );
  });

  it('deve rejeitar payload sem expeditionDate', () => {
    const invalid = { ...validPayload, expeditionDate: '' };
    assert.throws(
      () => validateManifestPayload(invalid, validSessionContext),
      (err) => {
        assert(err instanceof AppError);
        assert(err.message.includes('expeditionDate'));
        return true;
      }
    );
  });

  it('deve rejeitar payload sem state.code', () => {
    const invalid = { ...validPayload, state: { abbreviation: 'SP' } };
    assert.throws(
      () => validateManifestPayload(invalid, validSessionContext),
      (err) => {
        assert(err instanceof AppError);
        assert(err.message.includes('state.code'));
        return true;
      }
    );
  });

  it('deve rejeitar payload sem generator.partnerCode', () => {
    const invalid = { ...validPayload, generator: {} };
    assert.throws(
      () => validateManifestPayload(invalid, validSessionContext),
      (err) => {
        assert(err instanceof AppError);
        assert(err.message.includes('generator.partnerCode'));
        return true;
      }
    );
  });

  it('deve rejeitar payload sem carrier.partnerCode', () => {
    const invalid = { ...validPayload, carrier: {} };
    assert.throws(
      () => validateManifestPayload(invalid, validSessionContext),
      (err) => {
        assert(err instanceof AppError);
        assert(err.message.includes('carrier.partnerCode'));
        return true;
      }
    );
  });

  it('deve rejeitar payload sem receiver.partnerCode', () => {
    const invalid = { ...validPayload, receiver: {} };
    assert.throws(
      () => validateManifestPayload(invalid, validSessionContext),
      (err) => {
        assert(err instanceof AppError);
        assert(err.message.includes('receiver.partnerCode'));
        return true;
      }
    );
  });

  it('deve rejeitar payload sem residues', () => {
    const invalid = { ...validPayload, residues: [] };
    assert.throws(
      () => validateManifestPayload(invalid, validSessionContext),
      (err) => {
        assert(err instanceof AppError);
        assert(err.message.includes('residues'));
        assert(err.message.includes('pelo menos um resíduo'));
        return true;
      }
    );
  });

  it('deve rejeitar payload com resíduo sem residue.code', () => {
    const invalid = {
      ...validPayload,
      residues: [
        {
          quantity: 18,
          residue: {},
          unit: { code: 3 },
          treatment: { code: 51 },
          class: { code: 11 }
        }
      ]
    };
    assert.throws(
      () => validateManifestPayload(invalid, validSessionContext),
      (err) => {
        assert(err instanceof AppError);
        assert(err.message.includes('residue.code'));
        return true;
      }
    );
  });

  it('deve rejeitar payload com resíduo sem unit.code', () => {
    const invalid = {
      ...validPayload,
      residues: [
        {
          quantity: 18,
          residue: { code: 731 },
          unit: {},
          treatment: { code: 51 },
          class: { code: 11 }
        }
      ]
    };
    assert.throws(
      () => validateManifestPayload(invalid, validSessionContext),
      (err) => {
        assert(err instanceof AppError);
        assert(err.message.includes('unit.code'));
        return true;
      }
    );
  });

  it('deve rejeitar payload com resíduo sem treatment.code', () => {
    const invalid = {
      ...validPayload,
      residues: [
        {
          quantity: 18,
          residue: { code: 731 },
          unit: { code: 3 },
          treatment: {},
          class: { code: 11 }
        }
      ]
    };
    assert.throws(
      () => validateManifestPayload(invalid, validSessionContext),
      (err) => {
        assert(err instanceof AppError);
        assert(err.message.includes('treatment.code'));
        return true;
      }
    );
  });

  it('deve rejeitar payload com resíduo sem class.code', () => {
    const invalid = {
      ...validPayload,
      residues: [
        {
          quantity: 18,
          residue: { code: 731 },
          unit: { code: 3 },
          treatment: { code: 51 },
          class: {}
        }
      ]
    };
    assert.throws(
      () => validateManifestPayload(invalid, validSessionContext),
      (err) => {
        assert(err instanceof AppError);
        assert(err.message.includes('class.code'));
        return true;
      }
    );
  });

  it('deve rejeitar payload com resíduo com quantidade inválida', () => {
    const invalid = {
      ...validPayload,
      residues: [
        {
          quantity: 0,
          residue: { code: 731 },
          unit: { code: 3 },
          treatment: { code: 51 },
          class: { code: 11 }
        }
      ]
    };
    assert.throws(
      () => validateManifestPayload(invalid, validSessionContext),
      (err) => {
        assert(err instanceof AppError);
        assert(err.message.includes('quantity'));
        return true;
      }
    );
  });

  it('deve aceitar payload sem recaptchaToken', () => {
    const noToken = { ...validPayload, recaptchaToken: '' };
    assert.doesNotThrow(() => {
      validateManifestPayload(noToken, validSessionContext);
    });
  });

  it('deve rejeitar payload com hasTemporaryStorage=true mas sem temporaryStorage.partnerCode', () => {
    const invalid = {
      ...validPayload,
      hasTemporaryStorage: true,
      temporaryStorage: {},
      temporaryStorageCarrier: { partnerCode: 123 }
    };
    assert.throws(
      () => validateManifestPayload(invalid, validSessionContext),
      (err) => {
        assert(err instanceof AppError);
        assert(err.message.includes('temporaryStorage.partnerCode'));
        return true;
      }
    );
  });

  it('deve rejeitar payload com hasTemporaryStorage=true mas sem temporaryStorageCarrier.partnerCode', () => {
    const invalid = {
      ...validPayload,
      hasTemporaryStorage: true,
      temporaryStorage: { partnerCode: 123 },
      temporaryStorageCarrier: {}
    };
    assert.throws(
      () => validateManifestPayload(invalid, validSessionContext),
      (err) => {
        assert(err instanceof AppError);
        assert(err.message.includes('temporaryStorageCarrier.partnerCode'));
        return true;
      }
    );
  });

  it('deve listar todos os erros de validação quando houver múltiplos problemas', () => {
    const invalid = {
      responsibleName: '',
      manifestType: null,
      expeditionDate: '',
      state: {},
      generator: {},
      carrier: {},
      receiver: {},
      residues: []
    };
    assert.throws(
      () => validateManifestPayload(invalid, null),
      (err) => {
        assert(err instanceof AppError);
        assert(err.statusCode === 400);
        assert(err.context?.validationErrors);
        assert(err.context.validationErrors.length >= 7);
        return true;
      }
    );
  });
});

describe('normalizeExpeditionDate', () => {
  it('deve adicionar timestamp quando data não contém T', () => {
    const result = normalizeExpeditionDate('2026-03-07');
    assert.strictEqual(result, '2026-03-07T03:00:00.000Z');
  });

  it('deve manter formato completo quando data já contém T', () => {
    const result = normalizeExpeditionDate('2026-03-07T10:00:00.000Z');
    assert.strictEqual(result, '2026-03-07T10:00:00.000Z');
  });

  it('deve manter formato ISO completo sem alterar', () => {
    const result = normalizeExpeditionDate('2026-03-07T03:00:00.000Z');
    assert.strictEqual(result, '2026-03-07T03:00:00.000Z');
  });

  it('deve rejeitar data vazia', () => {
    assert.throws(
      () => normalizeExpeditionDate(''),
      (err) => {
        assert(err instanceof AppError);
        assert(err.message.includes('expeditionDate é obrigatório'));
        return true;
      }
    );
  });

  it('deve rejeitar data null', () => {
    assert.throws(
      () => normalizeExpeditionDate(null),
      (err) => {
        assert(err instanceof AppError);
        return true;
      }
    );
  });

  it('deve remover espaços em branco da data', () => {
    const result = normalizeExpeditionDate('  2026-03-07  ');
    assert.strictEqual(result, '2026-03-07T03:00:00.000Z');
  });
});
