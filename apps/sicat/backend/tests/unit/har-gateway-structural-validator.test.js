import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  HAR_OPERATION_PROFILES,
  validateHarEntryShape,
  validateHarGatewayStructure,
  validateGatewayStructure
} from '../../scripts/har-gateway-structural-validator.js';

test('validateHarGatewayStructure valida estrutura real do repositório', () => {
  const report = validateHarGatewayStructure(process.cwd());

  assert.equal(report.har.totalValidated >= 5, true);
  assert.equal(report.gateway.totalSections >= 5, true);
  assert.equal(report.totalChecks, report.har.totalValidated + report.gateway.totalSections);
});

test('validateHarEntryShape falha quando chave obrigatória do request está ausente', () => {
  const loginProfile = HAR_OPERATION_PROFILES.login;

  const fakeEntry = {
    request: {
      method: 'POST',
      url: 'https://mtrr.cetesb.sp.gov.br/api/mtr/carregaDadosLogin',
      postData: {
        text: JSON.stringify({
          sistema: 0,
          login: '31913781000139',
          email: 'foo@bar.com',
          senha: '123456',
          parCodigo: 176163
        })
      }
    },
    response: {
      status: 200,
      content: {
        mimeType: 'application/json',
        text: JSON.stringify({
          mensagem: '',
          erro: false,
          objetoResposta: {
            token: 'jwt',
            parCodigo: 176163,
            paaCodigo: 333948
          }
        })
      }
    }
  };

  assert.throws(
    () => validateHarEntryShape(fakeEntry, loginProfile, 'login'),
    /request: chave obrigatória ausente 'recaptcha'/
  );
});

test('validateGatewayStructure falha quando padrões obrigatórios não existem', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'har-gateway-validator-'));
  const gatewayDir = path.join(tmpRoot, 'src', 'gateways');
  fs.mkdirSync(gatewayDir, { recursive: true });
  fs.writeFileSync(path.join(gatewayDir, 'cetesb-gateway.js'), 'export const noop = true;\n', 'utf8');

  assert.throws(
    () => validateGatewayStructure(tmpRoot),
    /Gateway sem padrão obrigatório/
  );
});
