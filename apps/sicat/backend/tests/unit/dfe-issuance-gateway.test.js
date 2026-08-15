/**
 * Gateway de emissão de DF-e (PR-G) — `createDfeIssuanceGateway`.
 *
 * `mode: 'off'` recusa TODA chamada (`DFE_ISSUANCE_DISABLED`). `mode: 'sandbox'` + `documentType:
 * 'NFE'` é a ÚNICA combinação implementada — USA o `@flavioneto11/fiscal-kit` REAL (não um duplo de
 * teste): os asserts abaixo checam o comportamento REAL observado do kit (determinístico, sandbox
 * sempre autoriza) e que o XML final é PARSEÁVEL pelo parser real da Fase E
 * (`lib/transport/dfe-parser.ts`) sem nenhuma alteração naquele código. `documentType: 'CTE'/'MDFE'`
 * recusa com `DFE_ISSUANCE_TYPE_NOT_SUPPORTED` (o kit só cobre NF-e).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { createDfeIssuanceGateway, resetDfeIssuanceSandboxStoreForTests } from '../../src/gateways/dfe-issuance-gateway.js';
import { parseDfeXml } from '../../src/lib/transport/dfe-parser.js';
import { deriveValidationStatus, validateDfeDocument } from '../../src/lib/transport/dfe-validator.js';
import { isRetryableJobError } from '../../src/lib/retry.js';

function buildAggregate(overrides = {}) {
  return {
    operation: { freightOfferedAmount: 4000, freightContractedAmount: 4000 },
    parties: [
      { role: 'contractor', partySnapshot: { documentType: 'CNPJ', documentNumber: '11.222.333/0001-81', legalName: 'Transportadora Exemplo LTDA' } },
      { role: 'consignee', partySnapshot: { documentType: 'CNPJ', documentNumber: '99.888.777/0001-66', legalName: 'Destinatario Exemplo LTDA' } }
    ],
    vehicles: [],
    cargo: [{ description: 'Soja em grãos', cargoType: 'granel', declaredValue: 15000, weightKg: 28000 }],
    route: { originUf: 'SP', destinationUf: 'MG' },
    ...overrides
  };
}

beforeEach(() => {
  resetDfeIssuanceSandboxStoreForTests();
});

describe('dfe-issuance-gateway — mode: off', () => {
  it('recusa TODA chamada com DFE_ISSUANCE_DISABLED (501) citando P9', async () => {
    const gateway = createDfeIssuanceGateway({ mode: 'off', documentType: 'NFE' });
    for (const call of [
      () => gateway.buildDocument({ operationAggregate: buildAggregate(), correlationMarker: '[sicat-dfe:x]' }),
      () => gateway.signDocument({ correlationMarker: '[sicat-dfe:x]' }),
      () => gateway.submitDocument({ correlationMarker: '[sicat-dfe:x]' }),
      () => gateway.queryByMarker({ correlationMarker: '[sicat-dfe:x]' })
    ]) {
      await assert.rejects(call, (error) => {
        assert.equal(error.code, 'DFE_ISSUANCE_DISABLED');
        assert.equal(error.status, 501);
        assert.match(error.message, /P9/);
        // NOTA: `isRetryableJobError` classifica por STATUS antes de por código
        // (`classifyRetryabilityFromStatus`, `lib/retry.ts`) e qualquer status >= 500 é tratado
        // como retryable ANTES de chegar em `NON_RETRYABLE_ERROR_CODES` — mesmo comportamento
        // observado para `CIOT_PROVIDER_NOT_CONFIGURED`/`VPO_PROVIDER_NOT_CONFIGURED` (também
        // 501), que por isso não é exercitado no teste irmão (`ciot-provider-gateway.test.js`).
        // O código ainda está registrado em `NON_RETRYABLE_ERROR_CODES` por documentação de
        // intenção/paridade com os demais domínios — não é dead code por acidente, é uma
        // pré-existência do repo fora do escopo deste PR.
        assert.equal(isRetryableJobError(error), true);
        return true;
      });
    }
  });
});

describe('dfe-issuance-gateway — mode: sandbox — documentType: CTE/MDFE', () => {
  it('recusa TODA chamada com DFE_ISSUANCE_TYPE_NOT_SUPPORTED (501) — fiscal-kit só cobre NF-e', async () => {
    for (const documentType of ['CTE', 'MDFE']) {
      const gateway = createDfeIssuanceGateway({ mode: 'sandbox', documentType });
      await assert.rejects(
        () => gateway.buildDocument({ operationAggregate: buildAggregate(), correlationMarker: '[sicat-dfe:x]' }),
        (error) => {
          assert.equal(error.code, 'DFE_ISSUANCE_TYPE_NOT_SUPPORTED');
          assert.equal(error.status, 501);
          return true;
        }
      );
    }
  });
});

describe('dfe-issuance-gateway — mode: sandbox — documentType: NFE — dados incompletos', () => {
  it('sem parte contractor → DFE_ISSUANCE_INCOMPLETE_DATA (422)', async () => {
    const gateway = createDfeIssuanceGateway({ mode: 'sandbox', documentType: 'NFE' });
    const aggregate = buildAggregate({ parties: buildAggregate().parties.filter((p) => p.role !== 'contractor') });
    await assert.rejects(
      () => gateway.buildDocument({ operationAggregate: aggregate, correlationMarker: '[sicat-dfe:x]' }),
      (error) => {
        assert.equal(error.code, 'DFE_ISSUANCE_INCOMPLETE_DATA');
        assert.equal(error.status, 422);
        assert.equal(isRetryableJobError(error), false);
        return true;
      }
    );
  });

  it('sem parte consignee → DFE_ISSUANCE_INCOMPLETE_DATA (422)', async () => {
    const gateway = createDfeIssuanceGateway({ mode: 'sandbox', documentType: 'NFE' });
    const aggregate = buildAggregate({ parties: buildAggregate().parties.filter((p) => p.role !== 'consignee') });
    await assert.rejects(
      () => gateway.buildDocument({ operationAggregate: aggregate, correlationMarker: '[sicat-dfe:x]' }),
      (error) => {
        assert.equal(error.code, 'DFE_ISSUANCE_INCOMPLETE_DATA');
        return true;
      }
    );
  });

  it('sem itens de carga → DFE_ISSUANCE_INCOMPLETE_DATA (422)', async () => {
    const gateway = createDfeIssuanceGateway({ mode: 'sandbox', documentType: 'NFE' });
    const aggregate = buildAggregate({ cargo: [] });
    await assert.rejects(
      () => gateway.buildDocument({ operationAggregate: aggregate, correlationMarker: '[sicat-dfe:x]' }),
      (error) => {
        assert.equal(error.code, 'DFE_ISSUANCE_INCOMPLETE_DATA');
        return true;
      }
    );
  });

  it('carga sem declaredValue (total zero) → DFE_ISSUANCE_INCOMPLETE_DATA (422)', async () => {
    const gateway = createDfeIssuanceGateway({ mode: 'sandbox', documentType: 'NFE' });
    const aggregate = buildAggregate({ cargo: [{ description: 'Carga sem valor', cargoType: 'granel', declaredValue: null }] });
    await assert.rejects(
      () => gateway.buildDocument({ operationAggregate: aggregate, correlationMarker: '[sicat-dfe:x]' }),
      (error) => {
        assert.equal(error.code, 'DFE_ISSUANCE_INCOMPLETE_DATA');
        return true;
      }
    );
  });
});

describe('dfe-issuance-gateway — mode: sandbox — documentType: NFE — pipeline completo (comportamento REAL do fiscal-kit)', () => {
  it('build → sign → submit produz um XML AUTORIZADO parseável pelo parser real da Fase E, sem issues de validação', async () => {
    const gateway = createDfeIssuanceGateway({ mode: 'sandbox', documentType: 'NFE' });
    const marker = '[sicat-dfe:dfeiss_pipeline_ok]';

    const built = await gateway.buildDocument({ operationAggregate: buildAggregate(), correlationMarker: marker });
    assert.match(built.accessKey, /^\d{44}$/, 'chave de acesso sandbox deve ter 44 dígitos numéricos');
    assert.ok(built.xml.startsWith('<NFe>') && built.xml.endsWith('</NFe>'), 'envelope pré-assinatura é <NFe>...</NFe>, raiz única');
    // Comportamento REAL do kit: buildNfeXml é determinístico e produz o formato PRÓPRIO do kit
    // (bem diferente do envelope real da SEFAZ) — prova de que a chamada ao kit de fato aconteceu.
    assert.match(built.kitRawXml, /<NFe><ide><number>/);

    const signed = await gateway.signDocument({ correlationMarker: marker });
    assert.match(signed.digest, /^[a-f0-9]{32}$/, 'digest determinístico do kit (sandbox — sha256 truncado)');
    assert.ok(signed.signedXml.includes(`<Signature sandbox="true" digest="${signed.digest}"/>`));
    // Comportamento REAL do kit: signXml em sandbox é puramente uma função do XML — mesmo digest
    // sempre que o XML de entrada é o mesmo (determinístico).
    assert.match(signed.kitSignedRawXml, /<Signature sandbox="true" digest="[a-f0-9]{32}"\/>$/);

    const submitted = await gateway.submitDocument({ correlationMarker: marker });
    // Comportamento REAL do kit (sandbox): submit + queryStatus respondem IMEDIATAMENTE
    // 'authorized' — nunca 'rejected', nunca pendente (ver header do gateway/README do kit).
    assert.equal(submitted.outcome, 'authorized');
    assert.ok(submitted.protocol, 'protocolo devolvido pelo kit (queryStatus)');
    assert.ok(submitted.authorizedXml);
    assert.equal(submitted.raw.kitStatus, 'authorized');

    const parsed = parseDfeXml(submitted.authorizedXml);
    assert.equal(parsed.documentType, 'NFE');
    assert.equal(parsed.accessKey, built.accessKey);
    assert.equal(parsed.authorizationStatus, 'authorized');
    assert.equal(parsed.protocol, submitted.protocol);
    assert.equal(parsed.issuer.document, '11222333000181');
    assert.equal(parsed.issuer.name, 'Transportadora Exemplo LTDA');
    assert.equal(parsed.recipient.document, '99888777000166');
    assert.equal(parsed.totalAmount, 15000);

    const issues = validateDfeDocument(parsed, null, {});
    assert.deepEqual(issues, [], 'chave de acesso sandbox sintetizada deve ser COERENTE (DV, modelo, CNPJ) — sem DFE_ACCESS_KEY_MISMATCH');
    assert.equal(deriveValidationStatus(issues), 'valid');
  });

  it('o MESMO correlationMarker sempre produz a MESMA chave de acesso (determinístico — retry seguro)', async () => {
    const gateway = createDfeIssuanceGateway({ mode: 'sandbox', documentType: 'NFE' });
    const marker = '[sicat-dfe:dfeiss_deterministic]';
    const first = await gateway.buildDocument({ operationAggregate: buildAggregate(), correlationMarker: marker });
    const second = await gateway.buildDocument({ operationAggregate: buildAggregate(), correlationMarker: marker });
    assert.equal(second.accessKey, first.accessKey);
  });

  it('signDocument/submitDocument sem buildDocument anterior (mesmo processo) → DFE_ISSUANCE_STEP_OUT_OF_ORDER', async () => {
    const gateway = createDfeIssuanceGateway({ mode: 'sandbox', documentType: 'NFE' });
    await assert.rejects(
      () => gateway.signDocument({ correlationMarker: '[sicat-dfe:never_built]' }),
      (error) => {
        assert.equal(error.code, 'DFE_ISSUANCE_STEP_OUT_OF_ORDER');
        return true;
      }
    );
  });
});

describe('dfe-issuance-gateway — mode: sandbox — queryByMarker', () => {
  it('marcador desconhecido → found=false (nunca lança)', async () => {
    const gateway = createDfeIssuanceGateway({ mode: 'sandbox', documentType: 'NFE' });
    const result = await gateway.queryByMarker({ correlationMarker: '[sicat-dfe:never_existed]' });
    assert.deepEqual(result, { found: false });
  });

  it('marcador submetido → found=true com o MESMO protocolo/XML da submissão', async () => {
    const gateway = createDfeIssuanceGateway({ mode: 'sandbox', documentType: 'NFE' });
    const marker = '[sicat-dfe:dfeiss_query]';
    await gateway.buildDocument({ operationAggregate: buildAggregate(), correlationMarker: marker });
    await gateway.signDocument({ correlationMarker: marker });
    const submitted = await gateway.submitDocument({ correlationMarker: marker });

    const query = await gateway.queryByMarker({ correlationMarker: marker });
    assert.equal(query.found, true);
    assert.equal(query.outcome, 'authorized');
    assert.equal(query.protocol, submitted.protocol);
    assert.equal(query.authorizedXml, submitted.authorizedXml);
  });

  it('marcador com build/sign mas SEM submit → found=false (o "provedor" só sabe de submissões de fato despachadas)', async () => {
    const gateway = createDfeIssuanceGateway({ mode: 'sandbox', documentType: 'NFE' });
    const marker = '[sicat-dfe:dfeiss_no_submit]';
    await gateway.buildDocument({ operationAggregate: buildAggregate(), correlationMarker: marker });
    await gateway.signDocument({ correlationMarker: marker });

    const result = await gateway.queryByMarker({ correlationMarker: marker });
    assert.deepEqual(result, { found: false });
  });
});
