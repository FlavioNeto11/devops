/**
 * Estado do diálogo "Liberar número do escudo anti-spam" (tela de Acessos).
 * Domínio explicado em `src/features/access-admin/shieldWaiverState.js` — a
 * view não é importável em node:test, então é o módulo puro que está coberto.
 *
 * O que estes testes travam, na ordem em que quebrariam a operação:
 *  - o telefone em CLARO nunca sai nas superfícies de eco (preview/confirmação);
 *  - a canonicalização segue a mesma do vínculo (divergir do backend liberaria
 *    o número errado — o escudo continuaria trancando a vítima);
 *  - o motivo é obrigatório e com limites (é o que a auditoria lê depois);
 *  - o payload do POST carrega o contrato pareado com a unidade B1;
 *  - as frases de erro falam com o ADMIN, não com o dono do número.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  WAIVER_CHANNEL_TYPE,
  WAIVER_REASON_MAX_LENGTH,
  WAIVER_REASON_MIN_LENGTH,
  buildShieldWaiverPayload,
  buildWaiverConfirmMessage,
  resolveShieldWaiverError,
  validateShieldWaiverForm
} from '../../src/features/access-admin/shieldWaiverState.js';

const VALID_REASON = 'Posse confirmada por ligação com o titular.';

// ---------------------------------------------------------------------------
// Máscara: o número em claro não sai das superfícies de eco
// ---------------------------------------------------------------------------

test('phoneMasked mascara o número válido e cala em número incompleto', () => {
  const form = validateShieldWaiverForm({ phone: '(11) 91234-5678', reason: VALID_REASON });
  assert.equal(form.phoneMasked, '+55 11 ****-5678');
  // O trecho do assinante que a máscara deve engolir não pode aparecer.
  assert.ok(!form.phoneMasked.includes('91234'));

  // Nunca ecoa número pela metade: sem validar, sem máscara.
  const partial = validateShieldWaiverForm({ phone: '11 9123', reason: VALID_REASON });
  assert.equal(partial.phoneMasked, '');
});

test('buildWaiverConfirmMessage ecoa só a forma mascarada recebida', () => {
  const message = buildWaiverConfirmMessage('+55 11 ****-5678');
  assert.ok(message.includes('+55 11 ****-5678'));
  assert.ok(message.includes('escudo anti-spam'));

  // Sem máscara conhecida, a mensagem continua neutra — nunca inventa um número.
  const fallback = buildWaiverConfirmMessage('');
  assert.ok(fallback.includes('o número informado'));
});

// ---------------------------------------------------------------------------
// Validação do formulário
// ---------------------------------------------------------------------------

test('validateShieldWaiverForm canonicaliza o telefone como o vínculo', () => {
  const form = validateShieldWaiverForm({ phone: '(11) 91234-5678', reason: VALID_REASON });
  assert.equal(form.valid, true);
  assert.equal(form.digits, '5511912345678');
  assert.equal(form.errors.phone, '');
  assert.equal(form.errors.reason, '');
});

test('validateShieldWaiverForm recusa telefone incompleto', () => {
  const form = validateShieldWaiverForm({ phone: '11 9123', reason: VALID_REASON });
  assert.equal(form.valid, false);
  assert.ok(form.errors.phone.length > 0);
});

test('validateShieldWaiverForm exige motivo com tamanho mínimo e máximo', () => {
  const missing = validateShieldWaiverForm({ phone: '11912345678', reason: '   ' });
  assert.equal(missing.valid, false);
  assert.ok(missing.errors.reason.includes('auditoria'));

  const short = validateShieldWaiverForm({ phone: '11912345678', reason: 'ok' });
  assert.equal(short.valid, false);
  assert.ok(short.errors.reason.includes(String(WAIVER_REASON_MIN_LENGTH)));

  const long = validateShieldWaiverForm({
    phone: '11912345678',
    reason: 'x'.repeat(WAIVER_REASON_MAX_LENGTH + 1)
  });
  assert.equal(long.valid, false);
  assert.ok(long.errors.reason.includes(String(WAIVER_REASON_MAX_LENGTH)));
});

test('validateShieldWaiverForm apara o motivo antes de validar e de enviar', () => {
  const form = validateShieldWaiverForm({ phone: '11912345678', reason: `  ${VALID_REASON}  ` });
  assert.equal(form.valid, true);
  assert.equal(form.reason, VALID_REASON);
});

// ---------------------------------------------------------------------------
// Payload do POST — contrato pareado com a unidade B1
// ---------------------------------------------------------------------------

test('buildShieldWaiverPayload carrega canal, telefone canônico e motivo', () => {
  const form = validateShieldWaiverForm({ phone: '(11) 91234-5678', reason: VALID_REASON });
  const payload = buildShieldWaiverPayload(form);
  assert.deepEqual(payload, {
    channelType: WAIVER_CHANNEL_TYPE,
    phone: '5511912345678',
    reason: VALID_REASON
  });
});

// ---------------------------------------------------------------------------
// Tradução de erros — frases para o ADMIN, não para o dono do número
// ---------------------------------------------------------------------------

test('resolveShieldWaiverError traduz código conhecido em voz de admin', () => {
  const resolved = resolveShieldWaiverError({
    status: 400,
    payload: { code: 'CHANNEL_LINK_PHONE_INVALID' }
  });
  assert.equal(resolved.code, 'CHANNEL_LINK_PHONE_INVALID');
  assert.ok(resolved.message.includes('Número inválido'));
  // O mapa de channel-links fala com o dono ("Sua sessão", "Você errou") — se
  // uma frase dessas vazar para cá, o admin age sobre a conta errada.
  assert.ok(!resolved.message.includes('Sua '));
  assert.ok(!resolved.message.includes('Você '));
});

test('resolveShieldWaiverError cai no problem+json e depois no fallback próprio', () => {
  const withDetail = resolveShieldWaiverError({
    status: 409,
    detail: 'Número não está trancado pelo escudo.',
    payload: { code: 'SHIELD_WAIVER_NOT_SHIELDED' }
  });
  assert.equal(withDetail.message, 'Número não está trancado pelo escudo.');
  assert.equal(withDetail.code, 'SHIELD_WAIVER_NOT_SHIELDED');

  const bare = resolveShieldWaiverError({ status: 500 });
  assert.ok(bare.message.includes('escudo anti-spam'));

  const withCorrelation = resolveShieldWaiverError({ status: 500, correlationId: 'req_abc' });
  assert.ok(withCorrelation.detail.includes('req_abc'));
});

// ---------------------------------------------------------------------------
// Regra da casa: feedback só por useNotification (nunca v-snackbar inline)
// ---------------------------------------------------------------------------

test('nenhuma view usa v-snackbar inline', () => {
  const viewsDir = new URL('../../src/views/', import.meta.url);
  const viewFiles = readdirSync(viewsDir, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.vue'));
  assert.ok(viewFiles.length > 0, 'esperava encontrar as views da SPA');

  for (const name of viewFiles) {
    const source = readFileSync(new URL(name, viewsDir), 'utf8');
    assert.ok(
      !source.includes('v-snackbar'),
      `${name}: feedback deve ir por useNotification, não por v-snackbar inline`
    );
  }
});
