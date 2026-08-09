/**
 * CATRACA de dado pessoal no contrato OpenAPI interno.
 *
 * Contexto: `openapi/mtr_automacao_openapi_interna.yaml` era servido ANONIMAMENTE em
 * `https://dev.nvit.com.br/sicat/api/openapi.yaml` (254 KB) e carregava, nos `examples`, 3 CNPJs
 * reais, 2 CPFs reais, 2 e-mails pessoais, 2 nomes de pessoa física, o endereço residencial completo
 * (com coordenadas), um número de MTR real emitido na CETESB e uma senha de portal em texto claro.
 * As rotas foram fechadas (`sicatAuthMiddleware` em `/openapi.yaml`, `/openapi.json` e `/docs`) e os
 * exemplos, saneados. Este teste prende o SANEAMENTO — a outra metade está em
 * `tests/api/v1-auth-coverage.test.js`.
 *
 * POR QUE OS VALORES REAIS ESTÃO AQUI COMO SHA-256, E NÃO EM TEXTO:
 * um teste que guardasse `'31913781000139'` em claro para procurá-lo no YAML apenas MOVERIA o
 * vazamento de arquivo — o CNPJ continuaria versionado, e o `grep` de quem auditasse o repositório
 * continuaria achando. O digest detecta a reintrodução sem republicar o dado.
 *
 * TRÊS REGRAS, propositalmente redundantes:
 *  A (denylist por digest) — pega a volta EXATA dos valores conhecidos, inclusive os que nenhuma
 *    regra estrutural alcança: nome de pessoa, logradouro, razão social, senha.
 *  B (allowlist de documentos) — todo número com forma de CPF/CNPJ/telefone tem de estar na lista de
 *    valores sintéticos. Pega CNPJ real NOVO, que a regra A não conheceria.
 *  C (domínio de e-mail) — todo e-mail tem de estar sob domínio reservado (RFC 2606). Pega e-mail
 *    real NOVO.
 *
 * CONTROLE NEGATIVO: as três regras são exercidas contra um texto FABRICADO que contém a violação,
 * provando que o medidor acusa quando o dado está presente — senão um tokenizador quebrado devolveria
 * "nada encontrado" para sempre e o teste passaria por vacuidade. Para a regra A o controle usa uma
 * SENTINELA inócua (`SENTINELA-PII-CONTROLE-NEGATIVO`), cujo digest está na denylist: prova o
 * mecanismo sem precisar reescrever um valor real no repositório.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const OPENAPI_FILE = path.resolve(
  process.cwd(),
  'openapi/mtr_automacao_openapi_interna.yaml'
);

/**
 * SHA-256 dos valores REAIS que já estiveram neste contrato. Nunca adicione o valor em claro ao lado
 * do digest — o objetivo do digest é exatamente não versionar o dado.
 * Para acrescentar um valor: `node -e "console.log(require('crypto').createHash('sha256').update(process.argv[1]).digest('hex'))" '<valor>'`.
 */
const REAL_PII_DIGESTS = new Map([
  ['e19e35536a1443d9af6b13ae5a16b31cdcc4f11d8364cd96005d565de5c2ab5a', 'CNPJ da empresa 1 (titular)'],
  ['c1105f65725456cf2703f43989144c8db5f5f2a2c54afed2969f667477a382c1', 'CNPJ da empresa 2 (transportador real)'],
  ['dd6d4c4672b79f83f448fb673b0f38cd6cc4517860f8e5348ceeedbd5cd2e3fd', 'CNPJ da empresa 3 (destinador real)'],
  ['f058a67dd7ab0d9fce1550f191339ed8faa88e13a752921f1c6f8fde04852061', 'CPF do responsável 1'],
  ['c4d70f86ee9befe53475fb002aabc8bfb62dd8aaed9c9605b2fde0ed7791fa7e', 'CPF do responsável 2'],
  ['a6ea4d55c675f837a9f2dc1066cabbf958974639d7a340d2dd8939146d2fc3d4', 'telefone celular real'],
  ['6d9a9668d1c8c6d46bf576f87b10095d7a779626ef3d1d9613a3182edb072e35', 'número de MTR real emitido na CETESB'],
  ['bcf26a42e5f18cca2b1715f727c1213e4e853c3719a0bf4c9e9b6069b3f6d64e', 'CEP residencial real'],
  ['366e4a2c17ce4a1010847291d00614110d4c7661fa87c2f9e12745c35536aef8', 'CEP da empresa 2'],
  ['d4cdc305a548ec3149441c2c697d50acedd1f522d1523dd58b247b3226c6501e', 'CEP da empresa 3'],
  ['a1de91e6e710669cc6e79a7c4e9e12f41eeade31d73bacc1314ec1f689e1c962', 'nº de licença ambiental real'],
  ['8dc3ce727a043643d7b02f802abc7d422a6d01e089bad7b9c09259316c048bf3', 'inscrição estadual real'],
  ['3508d20c5082c63b4d100fa810e7346d6ac368dfb7a99eb1e01f0b2085cd3e2e', 'código de acesso CETESB do titular'],
  ['ad0d0c9e7f22e3a190a2da8fd38be761185f10fb7a99131b62b27bd730facf01', 'código de parceiro CETESB da empresa 1'],
  ['cd50cf66c999cb6950512d7d4f343e89ac67f287804ac22932023b3693036ca4', 'código de parceiro CETESB da empresa 2'],
  ['e02b5b4964c98fd4c18cacaaa04c4d3e2326c14aa88fc2bd02e766d096c1f2e6', 'código de parceiro CETESB da empresa 3'],
  ['31277c84bcd94af7d5c8d2364f142455fd1dfa4f34c74b09ce1d3af14793ba3b', 'e-mail pessoal 1'],
  ['16393b4d4ab66871a7533b41455a49f4241a95842446edcd7d227bd9e4c5de7b', 'e-mail pessoal 2'],
  ['f844c2bebb8377424575725d7bae52a03feda7699a1e3d0c24dbd8d88e8c0ea0', 'nome de pessoa física 1'],
  ['cd81457fe30bce7abdc66dc8a12f618f8520da94d03bf302717e831aacdac8bd', 'nome de pessoa física 2'],
  ['15828ac3bd419706e202ab34d9212463a936f9655ee3ffd5ff55933a8ca329e9', 'login do operador'],
  ['34562f664a2a1b4a7df0a3e92cae8fa5cb02137cf817422ddda0630264264164', 'razão social da empresa 1'],
  ['cd89dbfc432e495c194b67ef89518fef8dfca90a92835f621b820ff6add85133', 'razão social da empresa 2'],
  ['22bfac2903c52a5f1f3cd5dbf0147dd9e0f30f750b20612f766dcebb4ab4526f', 'razão social da empresa 3'],
  ['350c46397b06cf6dc9b9d8841e79e0a42b61560f245d97cd9768adb1ee7888ec', 'logradouro residencial real'],
  ['3ca181ceafb427eab0f7d8c102d255984e2b99b2dc9ce4ae97c5ecd441a4c619', 'logradouro da empresa 2'],
  ['49a7142535e7cca7b531a783da981f83526f89e7b45c07e8ceaeeee2064e785c', 'logradouro da empresa 3'],
  ['29d80139bf75a32e29dc1c4ec3964d8c7846a4cddb0eab032d51df08149a5fae', 'bairro residencial real'],
  ['beb01a5ec981111d3263ccbdfe4b05558fcc7339c2d386db83600444ec90f02a', 'bairro da empresa 2'],
  ['c970c629d2d66dc9cadd7b7c2d8aad38d42c5ef9cf9c47a841d3dc9dc04f7cf9', 'bairro da empresa 3'],
  ['b8ba00ef5adc644f79ae559b3ce1bc052b3393d7e35cfcd060fc226424adb91f', 'município residencial real'],
  ['d70775fcc655dcd4748ac9bad62ebb7cda2a36474210780b4e807a81d80e25df', 'município da empresa 2'],
  ['90dc936633eb904361a782a558ee62c99d3005541af467137521de1fd3dd3d71', 'município da empresa 3'],
  ['8e3bef8c5fcd2bb38c33abb65e9a09aa7c3eef82480b624de7f6bc50e7537f6c', 'senha de portal em texto claro'],
  ['721d03be1f20c80fa35d56ad63bf2c0e076d9e023b847c08656869da6ebc7194', 'SENTINELA de controle negativo (valor inócuo)']
]);

/**
 * Documentos SINTÉTICOS aceitos no contrato. CNPJs e CPFs têm dígito verificador válido — o schema
 * não valida DV hoje, mas um exemplo que só passa enquanto ninguém confere é dívida.
 * Ampliar esta lista é decisão consciente: o valor novo tem de ser comprovadamente fictício.
 */
const SYNTHETIC_DOCUMENTS = new Set([
  '12345678000195', // CNPJ fictício — empresa 1 (gerador)
  '98765432000198', // CNPJ fictício — empresa 2 (transportador)
  '11222333000181', // CNPJ fictício — empresa 3 (destinador)
  '12345678909', //    CPF fictício — responsável 1
  '11144477735', //    CPF fictício — responsável 2
  '11999990000', //    telefone fictício
  '5511999990032', //  telefone fictício com DDI (canal WhatsApp)
  '5511988880011', //  telefone fictício com DDI (canal WhatsApp)
  '999900000001' //    número de MTR fictício
]);

/** Domínios reservados para documentação (RFC 2606) — os únicos aceitos em e-mail de exemplo. */
const RESERVED_EMAIL_DOMAINS = [
  '.invalid',
  '.example',
  '.test',
  '.localhost',
  'example.com',
  'example.org',
  'example.net'
];

const sha256 = (value) => crypto.createHash('sha256').update(value, 'utf8').digest('hex');

/** Remove aspas YAML e pontuação de borda que não faz parte do valor. */
function normalizeToken(token) {
  return token.replace(/^['"([]+/, '').replace(/['")\],]+$/, '');
}

/**
 * REGRA A — procura os valores conhecidos por digest.
 *
 * Tokeniza cada LINHA (todo valor perseguido cabe numa linha) e monta n-gramas de 1 a 8 palavras,
 * porque `Flavio Padilha Neto` e `CASAMAX COMERCIAL LTDA.` só existem como sequência. Os números
 * entram também como sequências puras de dígitos, para achá-los dentro de `mtr-<numero>.pdf`.
 */
export function findKnownRealPii(text) {
  const achados = [];
  const linhas = text.split(/\r?\n/);

  for (let i = 0; i < linhas.length; i += 1) {
    const linha = linhas[i];
    const candidatos = new Set();

    const palavras = linha.trim().split(/\s+/).filter(Boolean);
    for (let inicio = 0; inicio < palavras.length; inicio += 1) {
      for (let tamanho = 1; tamanho <= 8 && inicio + tamanho <= palavras.length; tamanho += 1) {
        const bruto = palavras.slice(inicio, inicio + tamanho).join(' ');
        candidatos.add(normalizeToken(bruto));
      }
    }

    for (const digitos of linha.match(/[0-9]{5,}/g) || []) candidatos.add(digitos);
    for (const ie of linha.match(/[0-9]{3}-[0-9]{4,}/g) || []) candidatos.add(ie);

    for (const candidato of candidatos) {
      if (!candidato) continue;
      const rotulo = REAL_PII_DIGESTS.get(sha256(candidato));
      if (rotulo) achados.push(`linha ${i + 1}: ${rotulo}`);
    }
  }

  return achados;
}

/** REGRA B — todo número com forma de documento tem de estar na allowlist sintética. */
export function findUnknownDocuments(text) {
  const achados = [];
  const linhas = text.split(/\r?\n/);

  for (let i = 0; i < linhas.length; i += 1) {
    // Sequências MAXIMAIS de dígitos: `(?<![0-9])…(?![0-9])` evita casar uma janela de 14 dentro de
    // um identificador de 32 (o `MessageSid` do Twilio), que não é documento nenhum.
    for (const numero of linhas[i].match(/(?<![0-9])[0-9]{11,14}(?![0-9])/g) || []) {
      if (SYNTHETIC_DOCUMENTS.has(numero)) continue;
      if (/^0+$/.test(numero)) continue; // placeholder explícito de "vazio"
      achados.push(`linha ${i + 1}: documento fora da allowlist sintética (${numero.length} dígitos)`);
    }
  }

  return achados;
}

/** REGRA C — todo e-mail tem de estar sob domínio reservado para documentação. */
export function findNonReservedEmails(text) {
  const achados = [];
  const linhas = text.split(/\r?\n/);

  for (let i = 0; i < linhas.length; i += 1) {
    for (const email of linhas[i].match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []) {
      const dominio = email.slice(email.indexOf('@') + 1).toLowerCase();
      const reservado = RESERVED_EMAIL_DOMAINS.some(
        (sufixo) => dominio === sufixo || dominio.endsWith(sufixo)
      );
      if (!reservado) achados.push(`linha ${i + 1}: e-mail fora de domínio reservado (${email})`);
    }
  }

  return achados;
}

describe('Contrato OpenAPI não carrega dado pessoal real', () => {
  const spec = fs.readFileSync(OPENAPI_FILE, 'utf8');

  it('o arquivo lido é o contrato de verdade (controle do medidor)', () => {
    // Sem esta guarda, um caminho errado devolveria string vazia e as três regras achariam zero
    // violações — passando por vacuidade, que é o modo de falha clássico deste tipo de teste.
    assert.ok(spec.length > 100_000, `contrato suspeitosamente curto: ${spec.length} bytes`);
    assert.match(spec, /^openapi: 3/m, 'não parece um documento OpenAPI 3');
    assert.ok(spec.includes('/v1/manifestos'), 'o contrato deveria declarar /v1/manifestos');
  });

  it('REGRA A: nenhum valor real conhecido reaparece', () => {
    assert.deepStrictEqual(findKnownRealPii(spec), []);
  });

  it('REGRA B: todo documento é sintético e está na allowlist', () => {
    assert.deepStrictEqual(findUnknownDocuments(spec), []);
  });

  it('REGRA C: todo e-mail está sob domínio reservado (RFC 2606)', () => {
    assert.deepStrictEqual(findNonReservedEmails(spec), []);
  });

  it('CONTROLE NEGATIVO: as três regras acusam quando a violação está presente', () => {
    // Regra A — sentinela inócua cujo digest está na denylist. Prova que o tokenizador de n-gramas
    // realmente alcança o texto, sem reescrever um valor real no repositório.
    const comSentinela = `${spec}\n              exemplo: SENTINELA-PII-CONTROLE-NEGATIVO\n`;
    const achadosA = findKnownRealPii(comSentinela);
    assert.strictEqual(achadosA.length, 1, `a regra A deveria achar a sentinela; achou ${achadosA.length}`);
    assert.match(achadosA[0], /SENTINELA/);

    // A mesma sentinela em MEIO a outras palavras — garante que o n-grama, e não a linha inteira, é
    // a unidade de comparação.
    const sentinelaNoMeio = `${spec}\n              nome: Prefixo SENTINELA-PII-CONTROLE-NEGATIVO sufixo\n`;
    assert.strictEqual(findKnownRealPii(sentinelaNoMeio).length, 1);

    // Regra B — CNPJ de 14 dígitos fora da allowlist.
    const comDocumento = `${spec}\n              document: '99887766000155'\n`;
    const achadosB = findUnknownDocuments(comDocumento);
    assert.strictEqual(achadosB.length, 1, `a regra B deveria achar o documento; achou ${achadosB.length}`);
    assert.match(achadosB[0], /14 dígitos/);

    // Regra C — e-mail em domínio real.
    const comEmail = `${spec}\n              email: alguem@umdominioreal.com.br\n`;
    const achadosC = findNonReservedEmails(comEmail);
    assert.strictEqual(achadosC.length, 1, `a regra C deveria achar o e-mail; achou ${achadosC.length}`);
    assert.match(achadosC[0], /umdominioreal\.com\.br/);
  });

  it('CONTROLE NEGATIVO: as regras NÃO acusam os substitutos sintéticos', () => {
    // Espelho do anterior: se as regras acusassem qualquer coisa, os testes acima passariam por um
    // motivo errado (medidor histérico) e o contrato saneado seria impossível de manter.
    const sintetico = [
      "              document: '12345678000195'",
      "              cpf: '12345678909'",
      '              email: operador@exemplo.invalid',
      '              name: Fulano de Tal',
      '              legalName: Empresa Exemplo LTDA',
      '              street: RUA EXEMPLO UM'
    ].join('\n');

    assert.deepStrictEqual(findKnownRealPii(sintetico), []);
    assert.deepStrictEqual(findUnknownDocuments(sintetico), []);
    assert.deepStrictEqual(findNonReservedEmails(sintetico), []);
  });
});
