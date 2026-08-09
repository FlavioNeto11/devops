import test from 'node:test';
import assert from 'node:assert';
import {
  MANIFEST_SUBMIT_UNCONFIRMED_STATUS,
  RECONCILABLE_MANIFEST_SUBMIT_STATUSES,
  TRANSIENT_MANIFEST_SUBMIT_STATUSES,
  buildManifestSubmitConfirmedExternalStatus,
  buildManifestSubmitFailureExternalStatus,
  isManifestSubmitUnconfirmedStatus,
  isReconcilableManifestSubmitStatus,
  isTransientManifestSubmitStatus
} from '../../src/lib/manifest-submit-status.js';

// A regra que este arquivo protege: a mensagem só pode mandar reenviar quando o
// sistema SABE que o MTR não nasceu. Instruir reenvio sob incerteza é o gatilho
// exato do MTR duplicado na CETESB.

// Fragmentos que constituem uma INSTRUÇÃO de reenvio. "NÃO reenvie" contém a
// substring "reenvie", então casar por "reenvi" daria falso positivo — daí a
// lista ser de instruções completas.
const RESEND_INSTRUCTIONS = [
  /realize novo envio/i,
  /reenfileire o envio/i,
  /reenvie o manifesto/i
];

function instructsResend(message) {
  return RESEND_INSTRUCTIONS.some((pattern) => pattern.test(message));
}

test('vocabulário: RECONCILABLE = transientes + submit_unconfirmed', () => {
  assert.deepEqual([...TRANSIENT_MANIFEST_SUBMIT_STATUSES], ['queued_submit', 'submitting', 'processing']);
  assert.equal(MANIFEST_SUBMIT_UNCONFIRMED_STATUS, 'submit_unconfirmed');

  // Sem `submit_unconfirmed` no conjunto reconciliável, um manifesto rebaixado
  // para "não sei" sairia do radar da varredura e ficaria preso para sempre.
  assert.ok(
    RECONCILABLE_MANIFEST_SUBMIT_STATUSES.includes('submit_unconfirmed'),
    'submit_unconfirmed PRECISA ser reconciliável, senão o rebaixamento vira um beco sem saída'
  );
  for (const status of TRANSIENT_MANIFEST_SUBMIT_STATUSES) {
    assert.ok(RECONCILABLE_MANIFEST_SUBMIT_STATUSES.includes(status));
  }
});

test('predicados de status normalizam caixa/espaço e distinguem transiente de não-confirmado', () => {
  assert.equal(isTransientManifestSubmitStatus('  SUBMITTING '), true);
  assert.equal(isTransientManifestSubmitStatus('submit_unconfirmed'), false, 'não-confirmado NÃO é transiente');
  assert.equal(isReconcilableManifestSubmitStatus('submit_unconfirmed'), true);
  assert.equal(isManifestSubmitUnconfirmedStatus('SUBMIT_UNCONFIRMED'), true);

  // Controle negativo: estados alheios ao submit não podem entrar em nenhum conjunto.
  for (const alheio of ['draft', 'submitted', 'cancelled', 'failed', 'received', '']) {
    assert.equal(isTransientManifestSubmitStatus(alheio), false, `${alheio} não é transiente de submit`);
    assert.equal(isReconcilableManifestSubmitStatus(alheio), false, `${alheio} não é reconciliável`);
  }
});

test('certeza `confirmed-absent` PODE mandar reenviar — o sistema perguntou e o MTR não está lá', () => {
  const message = buildManifestSubmitFailureExternalStatus({
    certainty: 'confirmed-absent',
    terminalAction: 'dlq',
    technicalCause: 'Resíduo informado com unidade incorreta!'
  });

  assert.ok(instructsResend(message), `deveria instruir reenvio: ${message}`);
  assert.match(message, /DLQ/i);
  assert.match(message, /Causa técnica: Resíduo informado com unidade incorreta!/);
});

test('certeza `unknown` NUNCA manda reenviar — é a guarda contra o MTR duplicado', () => {
  for (const terminalAction of ['dlq', 'failed', 'cancelled', 'orphan', null]) {
    const message = buildManifestSubmitFailureExternalStatus({
      certainty: 'unknown',
      terminalAction,
      detail: 'job de submit não encontrado',
      technicalCause: 'socket hang up'
    });

    assert.equal(
      instructsResend(message),
      false,
      `desfecho desconhecido (terminalAction=${terminalAction}) não pode instruir reenvio: ${message}`
    );
    assert.match(message, /NÃO reenvie/, 'precisa desaconselhar o reenvio explicitamente');
    assert.match(message, /segundo MTR/i, 'precisa dizer POR QUE não reenviar');
    assert.match(message, /Detalhe: job de submit não encontrado/);
    assert.match(message, /Causa técnica: socket hang up/);
  }
});

test('DLQ aparece no texto apenas quando a ação terminal é DLQ', () => {
  const dlq = buildManifestSubmitFailureExternalStatus({ certainty: 'unknown', terminalAction: 'DLQ' });
  const failed = buildManifestSubmitFailureExternalStatus({ certainty: 'unknown', terminalAction: 'failed' });

  assert.match(dlq, /DLQ/i);
  assert.doesNotMatch(failed, /DLQ/i, 'controle negativo: ação `failed` não pode falar em DLQ');
});

test('mensagem de confirmação identifica o MTR encontrado', () => {
  assert.match(
    buildManifestSubmitConfirmedExternalStatus({ manNumero: 'SP-777', manCodigo: 42 }),
    /confirmado na CETESB.*SP-777/i
  );
  // Cai para manCodigo quando não há número.
  assert.match(buildManifestSubmitConfirmedExternalStatus({ manNumero: null, manCodigo: 42 }), /42/);
  // Sem identidade nenhuma continua sendo uma confirmação — nunca uma falha.
  const semIdentidade = buildManifestSubmitConfirmedExternalStatus();
  assert.match(semIdentidade, /confirmado na CETESB/i);
  assert.equal(instructsResend(semIdentidade), false);
});
