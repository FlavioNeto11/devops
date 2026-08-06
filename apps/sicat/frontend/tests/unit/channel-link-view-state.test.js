/**
 * Estado da tela "WhatsApp do assistente" (cadeia whatsapp-channel-sicat, fase 02).
 *
 * A view não é importável em node:test (`.vue` + Vuetify), então a lógica que
 * decide vive em `src/features/channel-link/channelLinkState.js` e é ELA que está
 * coberta aqui. Regra da casa (apps/sicat/CLAUDE.md §11): grep no bundle não prova
 * nada — prova é código-fonte mais teste.
 *
 * O que estes testes travam, na ordem em que quebrariam a operação:
 *  - a canonicalização do telefone (se ela divergir do backend, a fase 3 fica MUDA:
 *    a mensagem chega e não casa com nenhum vínculo, sem erro visível);
 *  - o código de 6 dígitos como STRING (perder o zero à esquerda faz ~10% dos
 *    códigos falharem de forma intermitente);
 *  - a máscara (o telefone de terceiro nunca pode sair inteiro da tela);
 *  - a tradução dos códigos de erro estáveis e para onde a tela vai depois deles.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CHANNEL_LINK_ERROR_MESSAGES,
  CHANNEL_LINK_STAGE,
  DEFAULT_COUNTRY_CODE,
  OTP_CODE_LENGTH,
  buildChallengeBanner,
  canAddMoreLinks,
  canonicalizePhoneDigits,
  describeAttempts,
  describeLinkRow,
  describeLinkStatus,
  extractRetryAfterSeconds,
  formatCountdown,
  formatPhoneBr,
  isChallengeMissingError,
  maskPhone,
  normalizeLimits,
  resolveChannelLinkError,
  resolveExpiryState,
  resolveResendState,
  resolveStage,
  resolveStageAfterError,
  sanitizeOtpInput,
  secondsUntil,
  validateOtpInput,
  validatePhoneInput
} from '../../src/features/channel-link/channelLinkState.js';

// --- Canonicalização do telefone -------------------------------------------
//
// A regra existe DUAS vezes: `canonicalizeChannelUserKey` (backend, AUTORITATIVA —
// é ela que grava `external_user_key`) e `canonicalizePhoneDigits` (esta tela). Se
// as duas divergirem, a falha é SILENCIOSA: a tela valida e exibe um número, o
// backend grava outra chave, e na fase 3 a mensagem chega e não casa com vínculo
// nenhum. Por isso as expectativas NÃO são escritas aqui: vivem no fixture
// versionado abaixo, e a suíte do backend
// (backend/tests/unit/channel-link-service.test.js) itera sobre o MESMO arquivo.
// Mexeu na heurística de um lado só? O outro lado quebra na hora.

const PHONE_FIXTURE_URL = new URL(
  '../../../tests/fixtures/phone-canonicalization.json',
  import.meta.url
);
const phoneFixture = JSON.parse(readFileSync(PHONE_FIXTURE_URL, 'utf8'));

test('o DDI padrão da tela é o MESMO que o fixture pina para o backend', () => {
  // Sem este pin, `expected` do fixture continua batendo (as duas suítes chamariam
  // cada uma o SEU default) e a divergência de DDI passaria em silêncio — que é
  // exatamente a falha que o arquivo compartilhado existe para impedir. O backend já
  // pina o seu lado; este é o lado da tela.
  assert.equal(
    DEFAULT_COUNTRY_CODE,
    phoneFixture.defaultCountryCode,
    'o DDI padrão da tela divergiu do fixture compartilhado — backend e frontend gravariam chaves diferentes'
  );
});

test('canonicalização da tela casa com o fixture compartilhado', () => {
  assert.ok(
    Array.isArray(phoneFixture.cases) && phoneFixture.cases.length >= 10,
    'o fixture compartilhado sumiu ou encolheu — ele é a única lista de expectativas'
  );

  // O DDI vem do FIXTURE, não do default implícito da tela: é o fixture que manda.
  const options = { defaultCountryCode: phoneFixture.defaultCountryCode };

  for (const { input, expected, nota } of phoneFixture.cases) {
    const canonical = canonicalizePhoneDigits(input, options);
    assert.equal(
      canonical,
      expected,
      `divergiu do fixture em ${JSON.stringify(input)} — ${nota}`
    );

    // Idempotência vale para TODO caso: a fase 3 reaplica a regra ao `from` do
    // webhook, que já vem canônico.
    assert.equal(
      canonicalizePhoneDigits(canonical, options),
      canonical,
      `reaplicar mudou o resultado de ${JSON.stringify(input)}`
    );
  }
});

test('o fixture cobre as fronteiras que a heurística do nono dígito decide', () => {
  // Guarda contra alguém "consertar" um teste apagando o caso incômodo do fixture.
  const inputs = phoneFixture.cases.map((item) => String(item.input ?? ''));
  const lengths = new Set(inputs.map((value) => value.replace(/\D/g, '').length));

  for (const length of [10, 11, 12, 13]) {
    assert.ok(lengths.has(length), `o fixture perdeu o caso de ${length} dígitos`);
  }
  assert.ok(
    inputs.some((value) => value.startsWith('whatsapp:')),
    'o fixture perdeu o caso com prefixo de provedor (`whatsapp:`)'
  );
  assert.ok(
    phoneFixture.cases.some((item) => item.expected === ''),
    'o fixture perdeu o caso que NÃO vira chave (entrada sem dígito)'
  );
});

test('entrada nula não vira chave (o fixture só expressa string)', () => {
  assert.equal(canonicalizePhoneDigits(null), '');
  assert.equal(canonicalizePhoneDigits(undefined), '');
});

// --- Validação do telefone --------------------------------------------------

test('telefone válido devolve os dígitos canonicalizados', () => {
  const result = validatePhoneInput(' (11) 99999-9999 ');
  assert.equal(result.valid, true);
  assert.equal(result.digits, '5511999999999');
  assert.equal(result.message, '');
});

test('telefone curto é barrado ANTES de gastar mensagem paga', () => {
  const result = validatePhoneInput('1');
  assert.equal(result.valid, false);
  assert.match(result.message, /incompleto/i);
});

test('telefone longo demais é barrado', () => {
  const result = validatePhoneInput('1234567890123456');
  assert.equal(result.valid, false);
  assert.match(result.message, /longo demais/i);
});

test('campo vazio pede o número, não acusa formato', () => {
  const result = validatePhoneInput('   ');
  assert.equal(result.valid, false);
  assert.match(result.message, /Informe o número/i);
});

// --- Máscara e exibição -----------------------------------------------------

test('máscara esconde o miolo e mantém os 4 últimos dígitos', () => {
  assert.equal(maskPhone('5511999999999'), '+55 11 ****-9999');
  assert.equal(maskPhone('551133334444'), '+55 11 ****-4444');
});

test('máscara cobre comprimentos fora da faixa BR sem vazar o número', () => {
  assert.equal(maskPhone('123456789012345'), '***********2345');
  assert.equal(maskPhone('123'), '***');
  assert.equal(maskPhone(''), '');
});

test('o dono vê o PRÓPRIO número por extenso e formatado', () => {
  assert.equal(formatPhoneBr('5511999999999'), '+55 (11) 99999-9999');
  assert.equal(formatPhoneBr('551133334444'), '+55 (11) 3333-4444');
  assert.equal(formatPhoneBr('351912345678'), '+351912345678');
});

// --- Código OTP -------------------------------------------------------------

test('o campo do código aceita colagem com espaços e corta no sexto dígito', () => {
  assert.equal(sanitizeOtpInput('1 2 3 4 5 6'), '123456');
  assert.equal(sanitizeOtpInput('123456789'), '123456');
  assert.equal(sanitizeOtpInput('abc12'), '12');
});

test('código com zeros à esquerda continua STRING de 6 caracteres', () => {
  const result = validateOtpInput('000042');
  assert.equal(result.valid, true);
  assert.equal(result.code, '000042');
  assert.equal(typeof result.code, 'string');
  assert.equal(result.code.length, OTP_CODE_LENGTH);
});

test('código incompleto não vai ao servidor (não queima tentativa)', () => {
  const short = validateOtpInput('123');
  assert.equal(short.valid, false);
  assert.match(short.message, /6 dígitos/);

  const empty = validateOtpInput('');
  assert.equal(empty.valid, false);
  assert.match(empty.message, /Digite o código/i);
});

// --- Etapa da tela ----------------------------------------------------------

test('desafio vivo leva a tela direto ao campo do código (sobrevive ao F5)', () => {
  assert.equal(resolveStage(null), CHANNEL_LINK_STAGE.PHONE);
  assert.equal(resolveStage({}), CHANNEL_LINK_STAGE.PHONE);
  assert.equal(resolveStage({ challengeId: 'cvfy_1' }), CHANNEL_LINK_STAGE.CODE);
});

// --- Contagem regressiva ----------------------------------------------------

test('a contagem regressiva é m:ss e nunca fica negativa', () => {
  assert.equal(formatCountdown(600), '10:00');
  assert.equal(formatCountdown(59), '0:59');
  assert.equal(formatCountdown(0), '0:00');
  assert.equal(formatCountdown(-30), '0:00');
  assert.equal(formatCountdown('abc'), '0:00');
});

test('segundos restantes saem de um instante ISO', () => {
  const now = Date.parse('2026-08-06T10:00:00.000Z');
  assert.equal(secondsUntil('2026-08-06T10:01:30.000Z', now), 90);
  assert.equal(secondsUntil('2026-08-06T09:59:00.000Z', now), 0);
  assert.equal(secondsUntil('', now), 0);
  assert.equal(secondsUntil('data inválida', now), 0);
});

test('expiração vira rótulo legível e marca o vencimento', () => {
  const now = Date.parse('2026-08-06T10:00:00.000Z');

  const alive = resolveExpiryState('2026-08-06T10:09:58.000Z', now);
  assert.equal(alive.known, true);
  assert.equal(alive.expired, false);
  assert.match(alive.label, /expira em 9:58/);

  const dead = resolveExpiryState('2026-08-06T09:50:00.000Z', now);
  assert.equal(dead.expired, true);
  assert.match(dead.label, /expirou/i);

  assert.deepEqual(resolveExpiryState(null, now), {
    known: false,
    expired: false,
    secondsRemaining: 0,
    label: ''
  });
});

// --- Reenvio ----------------------------------------------------------------

test('reenvio fica travado durante o cooldown, com o tempo no rótulo', () => {
  const now = Date.parse('2026-08-06T10:00:00.000Z');
  const state = resolveResendState(
    { attemptsRemaining: 3, sendsRemaining: 2, canResendAt: '2026-08-06T10:00:45.000Z' },
    now
  );

  assert.equal(state.enabled, false);
  assert.equal(state.reason, 'cooldown');
  assert.equal(state.secondsRemaining, 45);
  assert.equal(state.label, 'Reenviar em 0:45');
});

test('passado o cooldown o reenvio libera e informa quantos envios sobraram', () => {
  const now = Date.parse('2026-08-06T10:01:00.000Z');
  const state = resolveResendState(
    { attemptsRemaining: 3, sendsRemaining: 2, canResendAt: '2026-08-06T10:00:45.000Z' },
    now
  );

  assert.equal(state.enabled, true);
  assert.equal(state.label, 'Reenviar código');
  assert.match(state.hint, /2 vezes/);
});

test('sem envios restantes o botão morre mesmo sem cooldown', () => {
  const state = resolveResendState(
    { attemptsRemaining: 3, sendsRemaining: 0, canResendAt: null },
    Date.now()
  );
  assert.equal(state.enabled, false);
  assert.equal(state.reason, 'exhausted');
});

// Botão-armadilha: com PALPITES zerados e ENVIOS sobrando, o backend recusa o reenvio
// com 429 `CHANNEL_LINK_ATTEMPTS_EXCEEDED` — que está em `CHALLENGE_GONE_CODES` e
// portanto DESTRÓI o desafio na tela. Habilitar o botão nesse estado é convidar o
// operador a perder o desafio. As três combinações abaixo (folga de cooldown, dentro
// do cooldown e envios também zerados) têm de convergir para o MESMO motivo terminal,
// como em `resendBlockedReason` do backend.
test('palpites zerados desabilitam o reenvio mesmo com envios sobrando e cooldown vencido', () => {
  const now = Date.parse('2026-08-06T10:01:00.000Z');
  const state = resolveResendState(
    { attemptsRemaining: 0, sendsRemaining: 2, canResendAt: '2026-08-06T10:00:45.000Z' },
    now
  );

  assert.equal(
    state.enabled,
    false,
    'clicar aqui devolveria 429 CHANNEL_LINK_ATTEMPTS_EXCEEDED e mataria o desafio'
  );
  assert.equal(state.reason, 'attempts_exhausted');
  assert.equal(state.secondsRemaining, 0);
  assert.doesNotMatch(state.label, /Reenviar/i, 'o rótulo não pode convidar ao reenvio');
  // A saída é recomeçar pelo número — pedir código novo não resolveria nada.
  assert.match(state.hint, /informe o número de novo|recomece/i);
});

test('palpites zerados vencem o cooldown e o limite de envios como motivo do bloqueio', () => {
  const now = Date.parse('2026-08-06T10:00:00.000Z');

  const dentroDoCooldown = resolveResendState(
    { attemptsRemaining: 0, sendsRemaining: 2, canResendAt: '2026-08-06T10:00:45.000Z' },
    now
  );
  assert.equal(dentroDoCooldown.enabled, false);
  assert.equal(dentroDoCooldown.reason, 'attempts_exhausted');

  const semEnvios = resolveResendState(
    { attemptsRemaining: 0, sendsRemaining: 0, canResendAt: null },
    now
  );
  assert.equal(semEnvios.enabled, false);
  assert.equal(semEnvios.reason, 'attempts_exhausted');
});

test('DTO sem `attemptsRemaining` não mata o botão (ausência ≠ zero)', () => {
  // O campo vem no DTO. Se um dia sumir, o certo é confiar no backend (que recusa o
  // reenvio) e não travar a tela para sempre — mas o valor 0 EXPLÍCITO trava.
  const now = Date.parse('2026-08-06T10:01:00.000Z');
  const semCampo = resolveResendState(
    { sendsRemaining: 2, canResendAt: '2026-08-06T10:00:45.000Z' },
    now
  );
  assert.equal(semCampo.enabled, true);
  assert.equal(semCampo.reason, '');

  const nulo = resolveResendState(
    { attemptsRemaining: null, sendsRemaining: 2, canResendAt: null },
    now
  );
  assert.equal(nulo.enabled, true);
});

// --- Tentativas e banner ----------------------------------------------------

test('tentativas restantes concordam em número e avisam quando acabam', () => {
  assert.equal(describeAttempts(5), 'Restam 5 tentativas.');
  assert.equal(describeAttempts(1), 'Resta 1 tentativa.');
  assert.match(describeAttempts(0), /Sem tentativas/);
  assert.match(describeAttempts(undefined), /Sem tentativas/);
});

test('o banner do desafio mostra o número MASCARADO, o prazo e as tentativas', () => {
  const now = Date.parse('2026-08-06T10:00:00.000Z');
  const banner = buildChallengeBanner(
    {
      challengeId: 'cvfy_1',
      phoneMasked: '+55 11 ****-9999',
      expiresAt: '2026-08-06T10:09:58.000Z',
      attemptsRemaining: 5
    },
    now
  );

  assert.equal(banner.tone, 'info');
  assert.match(banner.message, /\+55 11 \*\*\*\*-9999/);
  assert.match(banner.message, /9:58/);
  assert.match(banner.message, /Restam 5 tentativas/);
  assert.doesNotMatch(banner.message, /\d{6}/, 'o código jamais pode aparecer no banner');
});

test('banner vira aviso quando o desafio já expirou; some quando não há desafio', () => {
  const now = Date.parse('2026-08-06T10:00:00.000Z');
  const expired = buildChallengeBanner(
    { challengeId: 'cvfy_1', phoneMasked: '+55 11 ****-9999', expiresAt: '2026-08-06T09:50:00.000Z' },
    now
  );

  assert.equal(expired.tone, 'warning');
  assert.match(expired.title, /expirou/i);
  assert.equal(buildChallengeBanner(null, now), null);
});

// --- Lista de vínculos ------------------------------------------------------

test('situação do vínculo vira rótulo e tom da badge', () => {
  assert.deepEqual(describeLinkStatus('verified'), { label: 'Verificado', tone: 'success' });
  assert.deepEqual(describeLinkStatus('pending'), { label: 'Aguardando confirmação', tone: 'warning' });
  assert.equal(describeLinkStatus('').tone, 'neutral');
});

test('linha da tabela mostra o número do dono por extenso e a data formatada', () => {
  const row = describeLinkRow({
    id: 'cclk_1',
    channelType: 'whatsapp',
    phone: '5511999999999',
    verificationStatus: 'verified',
    verifiedAt: '2026-08-06T13:45:00.000Z'
  });

  assert.equal(row.id, 'cclk_1');
  assert.equal(row.phoneDisplay, '+55 (11) 99999-9999');
  assert.equal(row.phoneMasked, '+55 11 ****-9999');
  assert.equal(row.statusLabel, 'Verificado');
  assert.equal(row.statusTone, 'success');
  assert.match(row.verifiedAtLabel, /^06\/08\/2026/);
});

test('vínculo sem data de verificação não inventa data', () => {
  const row = describeLinkRow({ id: 'cclk_2', phone: '5511999999999', verificationStatus: 'pending' });
  assert.equal(row.verifiedAtLabel, '—');
});

// --- Limites ----------------------------------------------------------------

test('limites ausentes ou inválidos caem no default da tela', () => {
  assert.deepEqual(normalizeLimits(null), {
    maxLinksPerUser: 3,
    otpTtlSeconds: 600,
    maxAttempts: 5,
    resendCooldownSeconds: 60
  });
  assert.equal(normalizeLimits({ maxLinksPerUser: 0 }).maxLinksPerUser, 3);
  assert.equal(normalizeLimits({ maxLinksPerUser: 5 }).maxLinksPerUser, 5);
});

test('o teto de números por usuário fecha o botão antes de gastar mensagem', () => {
  const limits = { maxLinksPerUser: 2 };
  assert.equal(canAddMoreLinks([], limits), true);
  assert.equal(canAddMoreLinks([{ id: 'a' }], limits), true);
  assert.equal(canAddMoreLinks([{ id: 'a' }, { id: 'b' }], limits), false);
});

// --- Erros ------------------------------------------------------------------

test('código estável do backend vira frase de operador, com código de suporte', () => {
  const resolved = resolveChannelLinkError({
    status: 400,
    detail: 'invalid code',
    correlationId: 'corr_123',
    payload: { code: 'CHANNEL_LINK_CODE_INVALID' }
  });

  assert.equal(resolved.code, 'CHANNEL_LINK_CODE_INVALID');
  assert.match(resolved.message, /Código incorreto/);
  assert.equal(resolved.correlationId, 'corr_123');
  assert.match(resolved.detail, /corr_123/);
});

test('429 carrega a espera no corpo e a mensagem diz quanto falta', () => {
  const error = {
    status: 429,
    payload: { code: 'CHANNEL_LINK_RESEND_TOO_SOON', errors: { retryAfterSeconds: 45 } }
  };

  assert.equal(extractRetryAfterSeconds(error), 45);
  assert.match(resolveChannelLinkError(error).message, /0:45/);
});

test('erro desconhecido preserva o detail do problem+json', () => {
  const resolved = resolveChannelLinkError(
    { status: 500, detail: 'boom', payload: { code: 'ALGO_NOVO' } },
    'Falha ao confirmar o código.'
  );
  assert.equal(resolved.message, 'boom');
});

test('erro sem nada usa o fallback da ação', () => {
  assert.equal(
    resolveChannelLinkError(null, 'Falha ao enviar o código.').message,
    'Falha ao enviar o código.'
  );
});

test('erro que MATA o desafio devolve a tela ao campo do telefone', () => {
  for (const code of [
    'CHANNEL_LINK_CHALLENGE_NOT_FOUND',
    'CHANNEL_LINK_CODE_EXPIRED',
    'CHANNEL_LINK_ATTEMPTS_EXCEEDED',
    'CHANNEL_LINK_TRANSFER_BLOCKED'
  ]) {
    assert.equal(
      resolveStageAfterError({ payload: { code } }),
      CHANNEL_LINK_STAGE.PHONE,
      `${code} precisa devolver o operador ao campo do telefone`
    );
  }
});

test('o 409 de pedido em andamento tem frase curada e NÃO derruba o desafio', () => {
  // `CHANNEL_LINK_CHALLENGE_IN_FLIGHT` é o 409 do `start` quando duas requisições
  // correm juntas. Sem entrada no dicionário a tela mostrava a frase crua do backend.
  const code = 'CHANNEL_LINK_CHALLENGE_IN_FLIGHT';
  const cruaDoBackend = 'Já existe um pedido de código em andamento para este número. Tente novamente em instantes.';

  const curada = CHANNEL_LINK_ERROR_MESSAGES[code];
  assert.equal(typeof curada, 'string', `${code} precisa de frase de operador curada`);
  assert.notEqual(curada, cruaDoBackend, 'a frase curada não pode ser a cópia literal do detail do backend');

  const resolved = resolveChannelLinkError(
    { status: 409, detail: cruaDoBackend, payload: { code } },
    'Falha ao enviar o código.'
  );
  assert.equal(resolved.code, code);
  assert.equal(resolved.message, curada, 'o detail cru do backend venceu a frase curada');

  // O desafio segue VIVO: repetir a ação resolve. Derrubar a etapa jogaria fora o
  // desafio que a requisição concorrente acabou de criar.
  assert.equal(
    resolveStageAfterError({ payload: { code } }),
    null,
    'CHALLENGE_IN_FLIGHT não pode entrar em CHALLENGE_GONE_CODES'
  );
  assert.equal(isChallengeMissingError({ payload: { code } }), false);
});

test('código errado e limite de reenvio NÃO derrubam a etapa do código', () => {
  // O desafio continua vivo: derrubar a etapa jogaria fora o código que já chegou.
  assert.equal(resolveStageAfterError({ payload: { code: 'CHANNEL_LINK_CODE_INVALID' } }), null);
  assert.equal(resolveStageAfterError({ payload: { code: 'CHANNEL_LINK_RESEND_EXHAUSTED' } }), null);
  assert.equal(resolveStageAfterError({ payload: { code: 'CHANNEL_LINK_RATE_LIMITED' } }), null);
});

test('cancelar um desafio que já morreu é sucesso silencioso, não erro', () => {
  assert.equal(
    isChallengeMissingError({ payload: { code: 'CHANNEL_LINK_CHALLENGE_NOT_FOUND' } }),
    true
  );
  assert.equal(isChallengeMissingError({ payload: { code: 'CHANNEL_LINK_CODE_INVALID' } }), false);
});
