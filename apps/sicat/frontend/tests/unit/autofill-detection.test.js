/**
 * Autofill do navegador × rótulo flutuante do login.
 *
 * O rótulo "E-mail" ficava impresso SOBRE o endereço preenchido pelo Chrome
 * porque o autofill não dispara os eventos que o v-model escuta. O único sinal
 * disponível é o `animationstart` da animação pendurada em `:-webkit-autofill`;
 * estes testes travam a tradução desse sinal em estado do formulário —
 * inclusive o sufixo de escopo que o compilador do Vue cola no nome da animação.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTOFILL_ANIMATION_CANCEL,
  AUTOFILL_ANIMATION_START,
  matchAutofillAnimation,
  reduceAutofillState,
  resolveAutofillFieldKey
} from '../../src/lib/autofill-detection.js';

test('reconhece a animação de autofill mesmo com o sufixo de escopo do Vue', () => {
  assert.equal(matchAutofillAnimation(AUTOFILL_ANIMATION_START), 'start');
  assert.equal(matchAutofillAnimation(`${AUTOFILL_ANIMATION_START}-7ba5bd90`), 'start');
  assert.equal(matchAutofillAnimation(`${AUTOFILL_ANIMATION_CANCEL}-7ba5bd90`), 'cancel');
});

test('CONTROLE NEGATIVO: animação alheia não vira autofill', () => {
  // O painel de login tem transições da Vuetify (expand, ripple) borbulhando
  // pelo mesmo ouvinte: nenhuma delas pode ligar o rótulo flutuante.
  assert.equal(matchAutofillAnimation('v-ripple'), null);
  assert.equal(matchAutofillAnimation('expand-transition'), null);
  assert.equal(matchAutofillAnimation(''), null);
  assert.equal(matchAutofillAnimation(undefined), null);
});

test('a chave do campo sai de data-autofill-key e cai para o name', () => {
  assert.equal(resolveAutofillFieldKey({ dataset: { autofillKey: 'password' }, name: 'current-password' }), 'password');
  assert.equal(resolveAutofillFieldKey({ dataset: {}, name: 'email' }), 'email');
  assert.equal(resolveAutofillFieldKey(null), '');
});

test('acha a chave na RAIZ do campo (a Vuetify não repassa data-* ao input)', () => {
  // `filterInputAttrs` da Vuetify manda `data-*` para o `.v-input`, não para o
  // `<input>` que dispara o animationstart — por isso subimos com closest().
  const inputElement = {
    dataset: {},
    name: '',
    closest(selector) {
      return selector === '[data-autofill-key]' ? { dataset: { autofillKey: 'password' } } : null;
    }
  };

  assert.equal(resolveAutofillFieldKey(inputElement), 'password');
});

test('preencher liga o campo; desfazer desliga só aquele campo', () => {
  const filled = reduceAutofillState({}, {
    animationName: `${AUTOFILL_ANIMATION_START}-abc123`,
    target: { dataset: { autofillKey: 'email' } }
  });
  assert.deepEqual(filled, { email: true });

  const both = reduceAutofillState(filled, {
    animationName: `${AUTOFILL_ANIMATION_START}-abc123`,
    target: { dataset: { autofillKey: 'password' } }
  });
  assert.deepEqual(both, { email: true, password: true });

  const cleared = reduceAutofillState(both, {
    animationName: `${AUTOFILL_ANIMATION_CANCEL}-abc123`,
    target: { dataset: { autofillKey: 'password' } }
  });
  assert.deepEqual(cleared, { email: true, password: false });
});

test('evento irrelevante devolve o MESMO objeto (sem re-render à toa)', () => {
  const state = { email: true };

  assert.equal(reduceAutofillState(state, { animationName: 'v-ripple', target: { name: 'email' } }), state);
  assert.equal(reduceAutofillState(state, { animationName: `${AUTOFILL_ANIMATION_START}-x`, target: null }), state);
  // Repetir o mesmo estado também não cria objeto novo.
  assert.equal(
    reduceAutofillState(state, { animationName: `${AUTOFILL_ANIMATION_START}-x`, target: { name: 'email' } }),
    state
  );
});
