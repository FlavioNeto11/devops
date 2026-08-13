/**
 * Testes da máquina de estados do agregado `TransportOperation` (PR-A4).
 *
 * Matriz EXAUSTIVA: os pares (status, comando) PERMITIDOS são listados aqui de forma
 * INDEPENDENTE do módulo sob teste (não importamos `TRANSPORT_TRANSITIONS` para montar a
 * expectativa — isso tornaria o teste um espelho que nunca acusa drift). Todo par FORA dessa
 * lista, dentre as 13×13 combinações, precisa ser rejeitado.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { AppError } from '../../src/lib/problem.js';
import {
  TRANSPORT_OPERATION_STATUSES,
  TRANSPORT_TRANSITION_COMMANDS,
  assertTransition,
  getTransition,
  isTerminalStatus,
  listAvailableCommands
} from '../../src/lib/transport/transport-state-machine.js';

// [from, command, to] — os 23 pares permitidos do grafo (espelha
// docs/04-arquitetura/transporte-sicat.md §3, escrito à mão para o teste ser uma prova
// independente, não um espelho da implementação).
const ALLOWED = [
  // Fase A — proposta e contrato
  ['draft', 'submit_validation', 'validating'],
  ['validating', 'approve_validation', 'ready_for_contract'],
  ['validating', 'reject_validation', 'blocked'],
  ['blocked', 'reopen', 'draft'],
  ['ready_for_contract', 'contract', 'contracted'],
  ['draft', 'cancel', 'cancelled'],
  ['validating', 'cancel', 'cancelled'],
  ['blocked', 'cancel', 'cancelled'],
  ['ready_for_contract', 'cancel', 'cancelled'],
  ['contracted', 'cancel', 'cancelled'],
  // Fases C/E — CIOT, fiscal, liberação, viagem, conclusão (sem rota neste PR)
  ['contracted', 'request_ciot', 'ciot_pending'],
  ['ciot_pending', 'confirm_ciot', 'ciot_registered'],
  ['ciot_registered', 'confirm_fiscal', 'fiscal_pending'],
  ['fiscal_pending', 'release', 'ready_for_release'],
  ['ready_for_release', 'start_transit', 'in_transit'],
  ['in_transit', 'request_completion', 'completion_pending'],
  ['completion_pending', 'complete', 'completed'],
  ['ciot_pending', 'cancel', 'cancelled'],
  ['ciot_registered', 'cancel', 'cancelled'],
  ['fiscal_pending', 'cancel', 'cancelled'],
  ['ready_for_release', 'cancel', 'cancelled'],
  ['in_transit', 'cancel', 'cancelled'],
  ['completion_pending', 'cancel', 'cancelled']
];

const ALLOWED_KEYS = new Set(ALLOWED.map(([from, command]) => `${from}:${command}`));
const ALLOWED_MAP = new Map(ALLOWED.map(([from, command, to]) => [`${from}:${command}`, to]));

describe('transport-state-machine — grafo completo', () => {
  it('tem exatamente 13 estados e 13 comandos declarados', () => {
    assert.strictEqual(TRANSPORT_OPERATION_STATUSES.length, 13);
    assert.strictEqual(TRANSPORT_TRANSITION_COMMANDS.length, 13);
  });

  it('a lista de permitidos usada pelo teste tem 23 pares (controle do medidor)', () => {
    // Sem esta guarda, um erro de digitação que reduzisse ALLOWED para menos entradas faria a
    // "matriz exaustiva" abaixo passar por vacuidade em boa parte das combinações.
    assert.strictEqual(ALLOWED.length, 23);
    assert.strictEqual(ALLOWED_KEYS.size, 23, 'não pode haver (from, command) duplicado em ALLOWED');
  });

  it('matriz exaustiva 13×13: cada célula é permitida ou proibida conforme o grafo', () => {
    const divergencias = [];

    for (const from of TRANSPORT_OPERATION_STATUSES) {
      for (const command of TRANSPORT_TRANSITION_COMMANDS) {
        const key = `${from}:${command}`;
        const transition = getTransition(from, command);

        if (ALLOWED_KEYS.has(key)) {
          const expectedTo = ALLOWED_MAP.get(key);
          if (!transition || transition.to !== expectedTo) {
            divergencias.push(`${key} deveria levar a "${expectedTo}", achou ${JSON.stringify(transition)}`);
          }
        } else if (transition) {
          divergencias.push(`${key} deveria ser proibido, mas o grafo permite ir a "${transition.to}"`);
        }
      }
    }

    assert.deepStrictEqual(divergencias, []);
  });

  it('assertTransition devolve a transição para um par permitido', () => {
    const transition = assertTransition('draft', 'submit_validation');
    assert.strictEqual(transition.from, 'draft');
    assert.strictEqual(transition.to, 'validating');
    assert.strictEqual(transition.command, 'submit_validation');
    assert.strictEqual(transition.requiredGate, null);
    assert.strictEqual(transition.phase, 'A');
  });

  it('assertTransition lança 409 TRANSPORT_INVALID_TRANSITION para par fora do grafo', () => {
    assert.throws(
      () => assertTransition('draft', 'complete'),
      (err) => {
        assert.ok(err instanceof AppError, 'erro deve ser AppError');
        assert.strictEqual(err.statusCode, 409);
        assert.strictEqual(err.code, 'TRANSPORT_INVALID_TRANSITION');
        return true;
      }
    );
  });

  it('gates declarados batem com o programa (GATE_PROPOSAL/GATE_CONTRACT/GATE_CIOT/GATE_FISCAL/...)', () => {
    assert.strictEqual(getTransition('validating', 'approve_validation')?.requiredGate, 'GATE_PROPOSAL');
    assert.strictEqual(getTransition('ready_for_contract', 'contract')?.requiredGate, 'GATE_CONTRACT');
    assert.strictEqual(getTransition('contracted', 'request_ciot')?.requiredGate, 'GATE_CIOT');
    assert.strictEqual(getTransition('ciot_registered', 'confirm_fiscal')?.requiredGate, 'GATE_FISCAL');
    assert.strictEqual(getTransition('fiscal_pending', 'release')?.requiredGate, 'GATE_RELEASE');
    assert.strictEqual(getTransition('ready_for_release', 'start_transit')?.requiredGate, 'GATE_PRE_BOARDING');
    assert.strictEqual(getTransition('in_transit', 'request_completion')?.requiredGate, 'GATE_IN_TRANSIT');
    assert.strictEqual(getTransition('completion_pending', 'complete')?.requiredGate, 'GATE_COMPLETION');
    // As transições SEM gate expostas neste PR.
    assert.strictEqual(getTransition('draft', 'submit_validation')?.requiredGate, null);
    assert.strictEqual(getTransition('draft', 'cancel')?.requiredGate, null);
  });
});

describe('transport-state-machine — estados terminais', () => {
  it('completed e cancelled são terminais (nenhum comando sai deles)', () => {
    assert.strictEqual(isTerminalStatus('completed'), true);
    assert.strictEqual(isTerminalStatus('cancelled'), true);

    for (const command of TRANSPORT_TRANSITION_COMMANDS) {
      assert.strictEqual(getTransition('completed', command), null, `completed:${command} deveria ser null`);
      assert.strictEqual(getTransition('cancelled', command), null, `cancelled:${command} deveria ser null`);
    }
  });

  it('nenhum outro dos 13 estados é terminal', () => {
    for (const status of TRANSPORT_OPERATION_STATUSES) {
      if (status === 'completed' || status === 'cancelled') continue;
      assert.strictEqual(isTerminalStatus(status), false, `${status} não deveria ser terminal`);
    }
  });
});

describe('transport-state-machine — listAvailableCommands', () => {
  it('default (sem opts) só considera fase A', () => {
    assert.deepStrictEqual(listAvailableCommands('draft'), ['submit_validation', 'cancel']);
    assert.deepStrictEqual(
      listAvailableCommands('validating'),
      ['approve_validation', 'reject_validation', 'cancel']
    );
    assert.deepStrictEqual(listAvailableCommands('blocked'), ['reopen', 'cancel']);
    assert.deepStrictEqual(listAvailableCommands('ready_for_contract'), ['contract', 'cancel']);
    // `contracted` só tem `cancel` na fase A — `request_ciot` é fase C, fora do default.
    assert.deepStrictEqual(listAvailableCommands('contracted'), ['cancel']);
  });

  it('estados de fase C+ não têm comando algum no default (fase A)', () => {
    for (const status of ['ciot_pending', 'ciot_registered', 'fiscal_pending', 'ready_for_release', 'in_transit', 'completion_pending']) {
      assert.deepStrictEqual(listAvailableCommands(status), [], `${status} não deveria ter comando na fase A`);
    }
  });

  it('estados terminais nunca têm comando disponível, em fase alguma', () => {
    assert.deepStrictEqual(listAvailableCommands('completed', { phases: ['A', 'B', 'C', 'D', 'E', 'F'] }), []);
    assert.deepStrictEqual(listAvailableCommands('cancelled', { phases: ['A', 'B', 'C', 'D', 'E', 'F'] }), []);
  });

  it('opts.phases amplia a busca além da fase A', () => {
    assert.deepStrictEqual(listAvailableCommands('contracted', { phases: ['A', 'C'] }), ['cancel', 'request_ciot']);
    assert.deepStrictEqual(listAvailableCommands('ciot_pending', { phases: ['C'] }), ['confirm_ciot', 'cancel']);
  });
});
