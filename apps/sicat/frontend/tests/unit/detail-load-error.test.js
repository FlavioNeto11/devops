/**
 * DETALHE INEXISTENTE — uma história só, em pt-BR, sem id interno.
 *
 * Medido em produção:
 *   /manifestos/<id inválido> → "Manifesto man_… was not found." (inglês + id interno)
 *   /dmr/<id inválido>        → pt-BR, mas cabeçalho preso em "Carregando…"
 *
 * Estes testes travam a tradução única e a redação do identificador interno.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  describeDetailLoadError,
  isNotFoundError,
  redactInternalIds
} from '../../src/lib/detail-load-error.js';

test('404 da API é reconhecido como "não encontrado"', () => {
  assert.equal(isNotFoundError({ status: 404, message: 'Manifesto man_01JQ8ZK2QY3T4 was not found.' }), true);
  assert.equal(isNotFoundError('Manifesto man_01JQ8ZK2QY3T4 was not found.'), true);
  assert.equal(isNotFoundError('DMR não encontrada para o período informado.'), true);
  assert.equal(isNotFoundError('Erro HTTP 404 ao acessar API'), true);
  assert.equal(isNotFoundError({ status: 404 }), true);
});

test('CONTROLE NEGATIVO: outras falhas NÃO viram "não encontrado"', () => {
  assert.equal(isNotFoundError('Erro HTTP 500 ao acessar API'), false);
  assert.equal(isNotFoundError({ status: 403, message: 'Acesso negado.' }), false);
  assert.equal(isNotFoundError('Tempo esgotado ao acessar API.'), false);
  assert.equal(isNotFoundError('Sessão expirada. Faça login novamente.'), false);
  assert.equal(isNotFoundError(null), false);
  assert.equal(isNotFoundError(''), false);
});

test('mensagem do manifesto inexistente é pt-BR, sem id interno e com saída', () => {
  const info = describeDetailLoadError(
    { status: 404, message: 'Manifesto man_01JQ8ZK2QY3T4 was not found.' },
    'manifest'
  );

  assert.equal(info.notFound, true);
  assert.equal(info.title, 'Manifesto não encontrado');
  const shown = `${info.title} ${info.message} ${info.hint} ${info.code}`;
  assert.doesNotMatch(shown, /man_01JQ8ZK2QY3T4/, 'o id interno não pode chegar ao operador');
  assert.doesNotMatch(shown, /was not found|not found/i, 'a tela não pode falar inglês');
  assert.match(shown, /listagem de manifestos/, 'precisa dizer por onde voltar');
});

test('mensagem da DMR inexistente segue o MESMO padrão', () => {
  const info = describeDetailLoadError('DMR dmr_9f8e7d6c5b4a não encontrada.', 'dmr');

  assert.equal(info.notFound, true);
  assert.equal(info.title, 'Declaração não encontrada');
  const shown = `${info.title} ${info.message} ${info.hint}`;
  assert.doesNotMatch(shown, /dmr_9f8e7d6c5b4a/);
  assert.match(shown, /lista de DMRs/);
});

test('erro que não é 404 preserva a informação, mas sem identificador interno', () => {
  const info = describeDetailLoadError(
    {
      status: 502,
      message: 'Falha ao consultar a CETESB para man_01JQ8ZK2QY3T4.',
      correlationId: 'corr-123'
    },
    'manifest'
  );

  assert.equal(info.notFound, false);
  assert.equal(info.title, 'Não foi possível carregar o manifesto');
  assert.match(info.message, /Falha ao consultar a CETESB/);
  assert.doesNotMatch(info.message, /man_01JQ8ZK2QY3T4/);
  assert.equal(info.code, 'corr-123');
});

test('sem erro, não há descritor (a tela não inventa falha)', () => {
  assert.equal(describeDetailLoadError(null, 'manifest'), null);
  assert.equal(describeDetailLoadError('', 'dmr'), null);
});

test('redação atinge ids internos e UUID, e preserva códigos de suporte', () => {
  assert.equal(
    redactInternalIds('Manifesto man_01JQ8ZK2QY3T4 was not found.'),
    'Manifesto was not found.'
  );
  assert.equal(
    redactInternalIds('Registro 3f2504e0-4f89-11d3-9a0c-0305e82c3301 ausente'),
    'Registro ausente'
  );
  // Código de erro em CAIXA ALTA continua visível — é o que o suporte usa.
  assert.equal(
    redactInternalIds('MANIFEST_CANCEL_NOT_CONFIRMED'),
    'MANIFEST_CANCEL_NOT_CONFIRMED'
  );
  assert.equal(redactInternalIds(''), '');
});
