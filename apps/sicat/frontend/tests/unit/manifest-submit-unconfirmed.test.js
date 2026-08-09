/**
 * "ENVIEI E NÃO SEI SE CHEGOU" — o terceiro estado do envio na tela de MTR.
 *
 * `submit_unconfirmed` é o status interno de um submit despachado para a CETESB
 * cujo desfecho o SICAT NÃO conhece. Não é `failed` (aí sabemos que não nasceu)
 * nem `submitted` (aí sabemos que nasceu).
 *
 * Dois jeitos de a tela mentir, e este arquivo trava os dois:
 *   1. ESCONDER — sem entrada própria no mapa, a chave caía no fallback por
 *      substring, virava tom `neutral` (cinza de rascunho) e rótulo
 *      'Submit Unconfirmed'; o operador não via que existe um MTR possivelmente
 *      órfão na CETESB.
 *   2. MENTIR — jogá-la no balde de falha faria a tela afirmar que falhou, e
 *      ainda abriria "Reenviar"/"Remover", que é como nasce o MTR duplicado.
 *
 * Cada asserção de bloqueio vem em par com um CONTROLE (mesmo manifesto em
 * status confirmado) que precisa continuar LIBERADO — um teste que só sabe
 * dizer `false` não prova nada.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MANIFEST_STATUS_SUBMIT_UNCONFIRMED,
  resolveManifestSituationLabel,
  resolveManifestStatusTone,
  resolveStatusLabel,
  resolveStatusTone
} from '../../src/lib/status-map.js';
import {
  canCancelManifest,
  canPrintManifest,
  canReceiveOperationalManifest,
  canRecoverManifest,
  canRemoveManifest,
  canReplicateManifest,
  canSubmitManifest,
  canUseManifestForCdf,
  describeCancelManifestRestriction,
  describeCdfManifestRestriction,
  describePrintManifestRestriction,
  describeReceiveManifestRestriction,
  describeReplicateManifestRestriction,
  describeSubmitManifestRestriction,
  isErrorManifest,
  isSubmitUnconfirmedManifest,
  resolveManifestStatusLabel
} from '../../src/features/mtr/list/manifestHelpers.js';

const UNCONFIRMED = MANIFEST_STATUS_SUBMIT_UNCONFIRMED;

/**
 * Linha da lista COM identidade externa (hash, número e código) e snapshot
 * utilizável. É de propósito o cenário mais PERMISSIVO possível: é nele que os
 * ramos genéricos dos predicados liberavam a ação. Um fixture magro (sem hash)
 * passaria pelos guards antigos e não provaria nada.
 */
function manifest(overrides = {}) {
  return {
    id: 'mtr_u5',
    manifestNumber: '123456789',
    externalCode: '987654',
    externalHashCode: 'HASH-ABC',
    status: 'submitted',
    externalStatus: 'Salvo',
    ...overrides
  };
}

const unconfirmed = () => manifest({ status: UNCONFIRMED, externalStatus: '' });

// ---------------------------------------------------------------------------
// Badge: tom e rótulo
// ---------------------------------------------------------------------------

test('o token do estado é o combinado com o backend', () => {
  assert.equal(UNCONFIRMED, 'submit_unconfirmed');
});

test('tom do badge é WARNING — nem cinza que esconde, nem vermelho que mente', () => {
  assert.equal(resolveManifestStatusTone(UNCONFIRMED), 'warning');
  assert.equal(resolveStatusTone('manifest', UNCONFIRMED), 'warning');
  // Os dois erros possíveis, nomeados:
  assert.notEqual(resolveManifestStatusTone(UNCONFIRMED), 'neutral', 'cinza esconderia o problema');
  assert.notEqual(resolveManifestStatusTone(UNCONFIRMED), 'error', 'vermelho afirmaria uma falha que não sabemos que houve');
  assert.notEqual(resolveManifestStatusTone(UNCONFIRMED), 'success', 'verde afirmaria um envio que não sabemos que chegou');
});

test('rótulo fala como operador, não como máquina', () => {
  assert.equal(resolveStatusLabel('manifest', UNCONFIRMED), 'Envio sem confirmação');
  assert.equal(resolveManifestSituationLabel({ status: UNCONFIRMED }), 'Envio sem confirmação');
  assert.equal(resolveManifestStatusLabel(unconfirmed()), 'Envio sem confirmação');
  // O humanizador devolvia 'Submit Unconfirmed': jargão em inglês na coluna Situação.
  assert.doesNotMatch(resolveStatusLabel('manifest', UNCONFIRMED), /_|unconfirmed/i);
});

test('situação vinda da CETESB continua tendo precedência sobre o status interno', () => {
  // Se o SIGOR já disse algo, é esse vocabulário que o operador vê.
  const withMirror = manifest({ status: UNCONFIRMED, externalStatus: 'Recebido' });
  assert.equal(resolveManifestStatusLabel(withMirror), 'Recebido');
});

// ---------------------------------------------------------------------------
// Identificação do estado
// ---------------------------------------------------------------------------

test('isSubmitUnconfirmedManifest casa o status interno EXATO, e só ele', () => {
  assert.equal(isSubmitUnconfirmedManifest(unconfirmed()), true);
  assert.equal(isSubmitUnconfirmedManifest({ status: 'SUBMIT_UNCONFIRMED' }), true, 'caixa não importa');
  assert.equal(isSubmitUnconfirmedManifest({ status: `  ${UNCONFIRMED} ` }), true, 'espaço em volta não importa');

  // Controle negativo: vizinhos que NÃO são o estado novo.
  assert.equal(isSubmitUnconfirmedManifest({ status: 'submitted' }), false);
  assert.equal(isSubmitUnconfirmedManifest({ status: 'submitting' }), false);
  assert.equal(isSubmitUnconfirmedManifest({ status: 'failed' }), false);
  assert.equal(isSubmitUnconfirmedManifest({}), false);
  assert.equal(isSubmitUnconfirmedManifest(null), false);
  // Texto livre da CETESB NÃO promove um manifesto ao estado novo.
  assert.equal(
    isSubmitUnconfirmedManifest({ status: 'submitted', externalStatus: 'submit_unconfirmed' }),
    false,
    'o token vale como status INTERNO; casar no externalStatus abriria falso positivo'
  );
});

// ---------------------------------------------------------------------------
// Predicados de ação — o que o operador PODE fazer
// ---------------------------------------------------------------------------

test('NÃO é falha — e por isso Reenviar e Remover seguem fechados', () => {
  const target = unconfirmed();
  // Esta trinca anda junta: `isErrorManifest` é a chave dos outros dois.
  assert.equal(isErrorManifest(target), false, 'classificar como erro seria afirmar que não nasceu');
  assert.equal(canRecoverManifest(target), false, '"Reenviar" reexecuta o submit → MTR duplicado');
  assert.equal(canRemoveManifest(target), false, 'remover a linha local apaga o rastro do órfão');

  // Controle: uma falha DE VERDADE continua abrindo as duas ações.
  const reallyFailed = manifest({ status: 'failed', externalStatus: '', manifestNumber: '', externalCode: '' });
  assert.equal(isErrorManifest(reallyFailed), true);
  assert.equal(canRecoverManifest(reallyFailed), true, 'se isto virar false, o bloqueio vazou para o caso legítimo');
  assert.equal(canRemoveManifest(reallyFailed), true);
});

test('Replicar fica BLOQUEADO — é assim que nasce o MTR duplicado', () => {
  assert.equal(canReplicateManifest(unconfirmed()), false);
  assert.equal(canReplicateManifest(manifest()), true, 'controle: envio confirmado segue replicável');
});

test('Submeter fica BLOQUEADO', () => {
  // HONESTIDADE sobre esta asserção: medido por mutação, é o ÚNICO guard novo
  // que sobrevive à própria remoção — hoje o `return` final de
  // `canSubmitManifest` só aceita 'draft'/'pending_submission', então o estado
  // novo já cairia fora por acidente. O guard fica como intenção declarada (e
  // trava quem um dia acrescentar 'submit' àquela lista); este teste trava o
  // RESULTADO, não o guard. Os outros cinco predicados matam a mutação.
  assert.equal(canSubmitManifest(unconfirmed()), false);
  // Controle: rascunho sem identidade externa continua submetível.
  const draft = manifest({ status: 'draft', externalStatus: '', externalHashCode: '', manifestNumber: '', externalCode: '' });
  assert.equal(canSubmitManifest(draft), true, 'controle: rascunho segue submetível');
});

test('Cancelar fica BLOQUEADO mesmo com hash — não se cancela o que não se sabe se existe', () => {
  const target = unconfirmed();
  assert.ok(String(target.externalHashCode).trim(), 'o fixture tem hash de propósito: é o caso que vazava');
  assert.equal(canCancelManifest(target), false);
  assert.equal(canCancelManifest(manifest()), true, 'controle: enviado com hash segue cancelável');
});

test('Imprimir fica BLOQUEADO — papel circula com a carga', () => {
  assert.equal(canPrintManifest(unconfirmed()), false);
  assert.equal(canPrintManifest(manifest()), true, 'controle: enviado com hash segue imprimível');
});

test('Receber (baixa operacional) fica BLOQUEADO', () => {
  const target = unconfirmed();
  assert.ok(target.manifestNumber && target.externalCode, 'o fixture tem snapshot: é o caso que vazava');
  assert.equal(canReceiveOperationalManifest(target), false);
  assert.equal(canReceiveOperationalManifest(manifest()), true, 'controle: enviado segue recebível');
});

test('Gerar CDF fica BLOQUEADO mesmo se o espelho já trouxe "Recebido"', () => {
  // Caso sutil: `canUseManifestForCdf` lê o externalStatus CRU junto do status
  // interno, então um 'Recebido' no espelho liberava o certificado antes de a
  // reconciliação fechar a dúvida sobre o envio.
  const mirroredAsReceived = manifest({ status: UNCONFIRMED, externalStatus: 'Recebido' });
  assert.equal(canUseManifestForCdf(mirroredAsReceived), false);

  const confirmedReceived = manifest({ status: 'submitted', externalStatus: 'Recebido' });
  assert.equal(canUseManifestForCdf(confirmedReceived), true, 'controle: recebido confirmado segue gerando CDF');
});

// ---------------------------------------------------------------------------
// Explicações — o operador precisa entender POR QUE está bloqueado
// ---------------------------------------------------------------------------

test('toda ação bloqueada explica o mesmo motivo, em linguagem de operador', () => {
  const target = unconfirmed();
  const messages = {
    replicar: describeReplicateManifestRestriction(target),
    submeter: describeSubmitManifestRestriction(target),
    cancelar: describeCancelManifestRestriction(target),
    imprimir: describePrintManifestRestriction(target),
    receber: describeReceiveManifestRestriction(target),
    cdf: describeCdfManifestRestriction(target)
  };

  for (const [action, message] of Object.entries(messages)) {
    assert.match(message, /sem confirmação/i, `"${action}" precisa nomear o estado`);
    assert.match(message, /Atualizar da CETESB/, `"${action}" precisa oferecer a saída — bloqueio sem saída vira beco`);
    assert.doesNotMatch(message, /_|unconfirmed/i, `"${action}" não pode vazar o token de máquina`);
  }

  // As duas ações que duplicam MTR precisam dizer a consequência, não só "não pode".
  assert.match(messages.replicar, /duplicad/i);
  assert.match(messages.submeter, /duplicad/i);
});

test('as explicações antigas MENTIRIAM sobre este estado — por isso o guard vem antes', () => {
  const target = unconfirmed();

  // "manifesto ainda nao registrado no SIGOR": pode estar registrado. É o que não se sabe.
  assert.doesNotMatch(describeCancelManifestRestriction(target), /nao registrado no SIGOR/i);
  // "imprima apos o envio ao SIGOR": o envio JÁ saiu.
  assert.doesNotMatch(describePrintManifestRestriction(target), /apos o envio/i);
  // "Ainda não sincronizado com a CETESB": sugere que nada saiu daqui.
  assert.doesNotMatch(describeCdfManifestRestriction(target), /Ainda não sincronizado/i);
  assert.doesNotMatch(describeReceiveManifestRestriction(target), /Ainda não sincronizado/i);

  // Controle negativo: para quem NÃO está neste estado, as frases antigas seguem valendo.
  const noHashDraft = manifest({ status: 'draft', externalStatus: '', externalHashCode: '' });
  assert.match(describeCancelManifestRestriction(noHashDraft), /nao registrado no SIGOR/i);
  assert.match(describePrintManifestRestriction(noHashDraft), /apos o envio/i);
  const unsynced = { id: 'mtr_x', status: 'submitted' };
  assert.match(describeCdfManifestRestriction(unsynced), /Ainda não sincronizado/i);
  assert.match(describeReceiveManifestRestriction(unsynced), /Ainda não sincronizado/i);
});

test('as novas explicações não engolem os motivos já existentes', () => {
  // Controle negativo do medidor: se os guards tivessem sido postos no topo sem
  // condição, TODA mensagem viraria a de "sem confirmação".
  assert.match(describeReplicateManifestRestriction(manifest({ status: 'cancelled' })), /cancelado/i);
  assert.match(describeReplicateManifestRestriction(manifest({ status: 'processing' })), /processamento/i);
  assert.match(describeSubmitManifestRestriction(manifest()), /já está registrado/i);
  assert.match(describeCdfManifestRestriction(manifest({ status: 'cancelled' })), /cancelado/i);
});
