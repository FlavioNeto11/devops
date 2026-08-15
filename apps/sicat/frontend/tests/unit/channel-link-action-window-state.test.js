/**
 * Estado da "janela de ação" do WhatsApp (cadeia whatsapp-channel-sicat, fase 05).
 *
 * A view não é importável em node:test (`.vue` + Vuetify), então a lógica que
 * decide vive em `src/features/channel-link/actionWindowState.js` e é ELA que
 * está coberta aqui (regra da casa, apps/sicat/CLAUDE.md §11).
 *
 * O que estes testes travam, na ordem em que quebrariam a operação:
 *  - os clamps ESPELHADOS do backend (se divergirem, o formulário promete uma
 *    duração/orçamento que o servidor corta em silêncio);
 *  - o DTO normalizado (o telefone chega SEMPRE mascarado — a tela exibe como veio);
 *  - o contador de orçamento e o relógio h:mm:ss (a janela dura horas; `m:ss`
 *    mostraria "480:00");
 *  - a tradução dos códigos de erro estáveis da fase 05, incluindo os dois 409
 *    que NÃO são falha (sem vínculo verificado; janela já encerrada).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTION_WINDOW_ERROR_MESSAGES,
  ACTION_WINDOW_LIMITS,
  buildBudgetOptions,
  buildHoursOptions,
  buildWindowOpenedMessage,
  clampWindowBudgetInput,
  clampWindowHoursInput,
  describeWindowAccount,
  describeWindowBudget,
  formatWindowClock,
  hasVerifiedChannelLink,
  isWindowMissingError,
  isWindowNoVerifiedLinkError,
  normalizeActionWindow,
  resolveActionWindowError,
  resolveWindowExpiry
} from '../../src/features/channel-link/actionWindowState.js';

// --- Clamps espelhados do backend -------------------------------------------
//
// A verdade é `clampWindowHours`/`clampWindowBudget` do backend
// (whatsapp-action-ticket-service.ts) sobre os defaults de `lib/config.ts`:
// horas 4/8, orçamento 10/20. A cópia da tela existe só para desenhar os
// controles — mas se os números divergirem, o formulário oferece o que o
// servidor corta em silêncio.

test('limites espelham os defaults do backend (horas 4/8, orçamento 10/20)', () => {
  assert.deepEqual(
    { ...ACTION_WINDOW_LIMITS },
    { defaultHours: 4, maxHours: 8, defaultBudget: 10, maxBudget: 20 }
  );
});

test('clamp de horas: inválido vira default, excesso vira teto, fração arredonda para baixo', () => {
  assert.equal(clampWindowHoursInput(undefined), 4);
  assert.equal(clampWindowHoursInput('abc'), 4);
  assert.equal(clampWindowHoursInput(0), 4);
  assert.equal(clampWindowHoursInput(-2), 4);
  assert.equal(clampWindowHoursInput(3), 3);
  assert.equal(clampWindowHoursInput(6.9), 6);
  assert.equal(clampWindowHoursInput(99), 8);
});

test('clamp de orçamento: inválido vira default, excesso vira teto', () => {
  assert.equal(clampWindowBudgetInput(null), 10);
  assert.equal(clampWindowBudgetInput(0), 10);
  assert.equal(clampWindowBudgetInput(7), 7);
  assert.equal(clampWindowBudgetInput(500), 20);
});

test('opções dos seletores cobrem 1..teto com rótulos singulares/plurais', () => {
  const hours = buildHoursOptions();
  assert.equal(hours.length, 8);
  assert.deepEqual(hours[0], { value: 1, label: '1 hora' });
  assert.deepEqual(hours[7], { value: 8, label: '8 horas' });

  const budget = buildBudgetOptions();
  assert.equal(budget.length, 20);
  assert.deepEqual(budget[0], { value: 1, label: '1 ação' });
  assert.deepEqual(budget[19], { value: 20, label: '20 ações' });
});

// --- DTO normalizado ---------------------------------------------------------

test('normalizeActionWindow: sem id não há janela', () => {
  assert.equal(normalizeActionWindow(null), null);
  assert.equal(normalizeActionWindow({}), null);
  assert.equal(normalizeActionWindow({ maskedUserKey: '+55 11 ****-0032' }), null);
});

test('normalizeActionWindow preserva o telefone MASCARADO como veio e saneia contadores', () => {
  const window = normalizeActionWindow({
    id: 'win-1',
    maskedUserKey: '+55 11 ****-0032',
    integrationAccountId: 'acc-9',
    expiresAt: '2026-08-08T18:00:00.000Z',
    actionsUsed: -3,
    actionsBudget: '10',
    openedAt: '2026-08-08T14:00:00.000Z'
  });

  assert.equal(window.id, 'win-1');
  assert.equal(window.maskedUserKey, '+55 11 ****-0032');
  assert.equal(window.integrationAccountId, 'acc-9');
  assert.equal(window.actionsUsed, 0, 'contador negativo não existe — vira zero');
  assert.equal(window.actionsBudget, 10);
});

test('hasVerifiedChannelLink: só `verified` conta — pending não abre janela', () => {
  assert.equal(hasVerifiedChannelLink([]), false);
  assert.equal(hasVerifiedChannelLink(null), false);
  assert.equal(hasVerifiedChannelLink([{ verificationStatus: 'pending' }]), false);
  assert.equal(
    hasVerifiedChannelLink([{ verificationStatus: 'pending' }, { verificationStatus: 'VERIFIED' }]),
    true
  );
});

// --- Relógio e expiração -----------------------------------------------------

test('formatWindowClock: h:mm:ss acima de 1 h, m:ss abaixo, nunca negativo', () => {
  assert.equal(formatWindowClock(0), '0:00');
  assert.equal(formatWindowClock(-5), '0:00');
  assert.equal(formatWindowClock(59), '0:59');
  assert.equal(formatWindowClock(3599), '59:59');
  assert.equal(formatWindowClock(3600), '1:00:00');
  assert.equal(formatWindowClock(4 * 3600 + 5 * 60 + 7), '4:05:07');
  assert.equal(formatWindowClock(8 * 3600), '8:00:00');
});

test('resolveWindowExpiry: contagem viva, expirada e desconhecida', () => {
  const now = Date.parse('2026-08-08T14:00:00.000Z');

  const unknown = resolveWindowExpiry(null, now);
  assert.equal(unknown.known, false);
  assert.equal(unknown.label, '');

  const alive = resolveWindowExpiry('2026-08-08T18:00:00.000Z', now);
  assert.equal(alive.expired, false);
  assert.equal(alive.secondsRemaining, 4 * 3600);
  assert.equal(alive.label, 'Expira em 4:00:00.');

  const dead = resolveWindowExpiry('2026-08-08T13:59:59.000Z', now);
  assert.equal(dead.expired, true);
  assert.equal(dead.secondsRemaining, 0);
  assert.equal(dead.label, 'A liberação expirou.');
});

// --- Orçamento ---------------------------------------------------------------

test('describeWindowBudget: restante, esgotado e percentual', () => {
  const fresh = describeWindowBudget({ actionsUsed: 0, actionsBudget: 10 });
  assert.equal(fresh.remaining, 10);
  assert.equal(fresh.exhausted, false);
  assert.equal(fresh.label, 'Restam 10 de 10 ações.');
  assert.equal(fresh.percentUsed, 0);

  const one = describeWindowBudget({ actionsUsed: 9, actionsBudget: 10 });
  assert.equal(one.label, 'Resta 1 de 10 ações.');
  assert.equal(one.percentUsed, 90);

  const spent = describeWindowBudget({ actionsUsed: 10, actionsBudget: 10 });
  assert.equal(spent.exhausted, true);
  assert.equal(spent.remaining, 0);
  assert.equal(spent.label, 'Orçamento esgotado — as 10 ações foram usadas.');
  assert.equal(spent.percentUsed, 100);

  // Contador do banco maior que o orçamento (corrida) não vira "restam -2".
  const over = describeWindowBudget({ actionsUsed: 12, actionsBudget: 10 });
  assert.equal(over.remaining, 0);
  assert.equal(over.exhausted, true);
});

// --- Conta fixada -----------------------------------------------------------

test('describeWindowAccount: nome da sessão SÓ quando os ids batem', () => {
  const window = { integrationAccountId: 'acc-1' };

  assert.equal(
    describeWindowAccount(window, { integrationAccountId: 'acc-1', accountName: 'Transportadora X' }),
    'Transportadora X'
  );
  // Ids diferentes: afirmar o nome da conta ATUAL seria mentir sobre a conta presa à janela.
  assert.equal(
    describeWindowAccount(window, { integrationAccountId: 'acc-2', accountName: 'Transportadora X' }),
    'Outra conta CETESB — a que estava ativa quando a liberação foi aberta.'
  );
  assert.equal(
    describeWindowAccount(window, {}),
    'Conta CETESB que estava ativa quando a liberação foi aberta.'
  );
  assert.equal(
    describeWindowAccount({ integrationAccountId: null }, {}),
    'Conta CETESB fixada na abertura da liberação.'
  );
});

test('buildWindowOpenedMessage usa o DTO clampado (validade + orçamento)', () => {
  const message = buildWindowOpenedMessage({
    actionsBudget: 10,
    actionsUsed: 0,
    expiresAt: '2026-08-08T18:30:00.000Z'
  });
  assert.match(message, /orçamento de 10 ações/);
  assert.match(message, /até \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}\./);

  assert.equal(buildWindowOpenedMessage({}), 'Ações liberadas pelo WhatsApp.');
});

// --- Erros estáveis da fase 05 ----------------------------------------------

function problem(code) {
  return { payload: { code } };
}

test('códigos da fase 05 têm mensagem própria e prioridade sobre `detail` do servidor', () => {
  for (const code of Object.keys(ACTION_WINDOW_ERROR_MESSAGES)) {
    const resolved = resolveActionWindowError({ payload: { code }, detail: 'detalhe cru do servidor' });
    assert.equal(resolved.code, code);
    assert.equal(resolved.message, ACTION_WINDOW_ERROR_MESSAGES[code]);
  }
});

test('códigos fora da fase 05 delegam ao resolvedor da fase 02 (429 com contagem, correlationId)', () => {
  const resolved = resolveActionWindowError({
    payload: { code: 'CHANNEL_LINK_RATE_LIMITED', errors: { retryAfterSeconds: 90 } },
    correlationId: 'corr-77'
  });
  assert.equal(resolved.code, 'CHANNEL_LINK_RATE_LIMITED');
  assert.match(resolved.message, /Tente de novo em 1:30\./);
  assert.equal(resolved.detail, 'Código de suporte: corr-77');
});

test('os dois 409 que NÃO são falha são distinguíveis', () => {
  assert.equal(isWindowNoVerifiedLinkError(problem('CHANNEL_ACTION_WINDOW_NO_VERIFIED_LINK')), true);
  assert.equal(isWindowNoVerifiedLinkError(problem('CHANNEL_ACTION_WINDOW_NOT_FOUND')), false);
  assert.equal(isWindowMissingError(problem('CHANNEL_ACTION_WINDOW_NOT_FOUND')), true);
  assert.equal(isWindowMissingError(problem('CHANNEL_LINK_CHALLENGE_NOT_FOUND')), false);
});
