/**
 * ELEGIBILIDADE DE AÇÃO na lista de MTR.
 *
 * O bug que estes testes impedem: manifesto RECEBIDO mantém o status INTERNO
 * `submitted`; sem o bloqueio por "receb" o `status.includes('submit')`
 * reabilitava "Cancelar" — e em lote aparecia "Cancelar (20)" para 20
 * manifestos já recebidos (cuja próxima etapa é o CDF, não o cancelamento).
 *
 * Nota de nomenclatura: a função de recebimento chama-se
 * `canReceiveOperationalManifest` no código (não `canReceiveManifest`).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canCancelManifest,
  canReceiveOperationalManifest,
  canUseManifestForCdf,
  describeCancelManifestRestriction,
  describeReceiveManifestRestriction
} from '../../src/features/mtr/list/manifestHelpers.js';

/** Linha da lista já sincronizada com a CETESB (tem hash/numero/codigo). */
function manifest(overrides = {}) {
  return {
    id: 'mtr_1',
    manifestNumber: '123456789',
    externalCode: '987654',
    externalHashCode: 'HASH-ABC',
    status: 'submitted',
    externalStatus: 'Salvo',
    ...overrides
  };
}

test('manifesto RECEBIDO não pode ser cancelado nem recebido de novo', () => {
  // Estado real da CETESB: status interno continua 'submitted'.
  const received = manifest({ status: 'submitted', externalStatus: 'Recebido' });

  assert.equal(canCancelManifest(received), false, 'recebido não volta a ser cancelado');
  assert.equal(canReceiveOperationalManifest(received), false, 'recebido não é recebido duas vezes');
  // O próximo passo dele é o certificado.
  assert.equal(canUseManifestForCdf(received), true);
});

test('variantes do termo "receb" da CETESB também bloqueiam', () => {
  for (const externalStatus of ['Recebido', 'RECEBIDO', 'recebido parcialmente', 'Recebimento confirmado', 'receb']) {
    const received = manifest({ externalStatus });
    assert.equal(canCancelManifest(received), false, `"${externalStatus}" deveria bloquear cancelamento`);
    assert.equal(canReceiveOperationalManifest(received), false, `"${externalStatus}" deveria bloquear recebimento`);
  }
});

test('manifesto submetido e AINDA NÃO recebido pode ser cancelado e recebido', () => {
  const pending = manifest({ status: 'submitted', externalStatus: 'Salvo' });

  assert.equal(canCancelManifest(pending), true);
  assert.equal(canReceiveOperationalManifest(pending), true);
  assert.equal(canUseManifestForCdf(pending), false, 'sem recebimento não há CDF');
});

test('cancelado e com falha não habilitam cancelar nem receber', () => {
  const cancelled = manifest({ status: 'submitted', externalStatus: 'Cancelado' });
  const failed = manifest({ status: 'failed', externalStatus: '' });
  const dlq = manifest({ status: 'dlq', externalStatus: '' });

  for (const item of [cancelled, failed, dlq]) {
    assert.equal(canCancelManifest(item), false);
    assert.equal(canReceiveOperationalManifest(item), false);
  }
});

test('rascunho e em processamento não habilitam cancelar nem receber', () => {
  for (const status of ['draft', 'queued', 'queued_submit', 'processing']) {
    const item = manifest({ status, externalStatus: '' });
    assert.equal(canCancelManifest(item), false, `status ${status} não cancela`);
    assert.equal(canReceiveOperationalManifest(item), false, `status ${status} não recebe`);
  }
});

test('sem hash da CETESB não há cancelamento (nada registrado no SIGOR)', () => {
  const local = manifest({ externalHashCode: '' });
  assert.equal(canCancelManifest(local), false);
});

test('sem identificador nenhum, nada é acionável', () => {
  const orphan = { status: 'submitted', externalStatus: 'Salvo' };
  assert.equal(canCancelManifest(orphan), false);
  assert.equal(canReceiveOperationalManifest(orphan), false);
});

test('ação em LOTE: "Cancelar (N)" só conta os que realmente podem cancelar', () => {
  // Regressão relatada: lote de recebidos exibia "Cancelar (20)".
  const selection = [
    ...Array.from({ length: 20 }, (_, index) => manifest({ id: `rec_${index}`, externalStatus: 'Recebido' })),
    manifest({ id: 'pend_1', externalStatus: 'Salvo' })
  ];

  const cancellable = selection.filter((item) => canCancelManifest(item));
  assert.equal(cancellable.length, 1, 'apenas o não-recebido pode ser cancelado');
  assert.equal(cancellable[0].id, 'pend_1');

  const receivable = selection.filter((item) => canReceiveOperationalManifest(item));
  assert.equal(receivable.length, 1);
});

test('quando bloqueado, a tela explica o motivo em pt-BR (sem termo cru)', () => {
  const received = manifest({ externalStatus: 'Recebido' });
  assert.match(describeCancelManifestRestriction(received), /já foi recebido/i);
  assert.match(describeReceiveManifestRestriction(received), /já foi recebido/i);
  assert.match(describeCancelManifestRestriction(manifest({ externalStatus: 'Cancelado' })), /cancelado/i);
});
