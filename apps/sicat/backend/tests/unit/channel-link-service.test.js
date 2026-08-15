import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { config, setConfigOverride } from '../../src/lib/config.js';
import { createRateLimiter } from '../../src/lib/rate-limit.js';
import { hashPassword, verifyPassword } from '../../src/lib/sicat-security.js';
import {
  canonicalizeChannelUserKey,
  maskChannelUserKey
} from '../../src/services/conversation/channel/whatsapp/types.js';
import { setWhatsAppProviderOverrideForTests } from '../../src/services/conversation/channel/whatsapp/index.js';
import {
  buildDispatchPhoneRateKey,
  dispatchChannelLinkOtp,
  evaluateChallengeState,
  generateOtpCode,
  isValidOtpCodeFormat,
  requireChannelUserKey,
  requireSupportedChannel,
  retryAfterSeconds,
  sanitizeDeliveryError,
  toChallengeDto,
  toChannelLinkDto
} from '../../src/services/conversation-channel-link-service.js';

/**
 * Fase 2 da cadeia `whatsapp-channel-sicat` — vínculo telefone ↔ usuário por OTP.
 *
 * Estes casos cobrem a lógica PURA e o caminho de despacho (com provedor fake). O que exige Postgres
 * — consumo atômico da tentativa, consumo exclusivo, transferência de posse sob lock — é garantido
 * pelo `where` dos statements do repositório e fica para o teste de integração da fase 7; aqui a
 * regra é não escrever teste que precise de banco.
 *
 * O que estes casos protegem, em ordem de dano:
 *  - a canonicalização do telefone é a MESMA no cadastro e no webhook (a fase 3 depende dela); se
 *    divergir, o usuário fica mudo no canal sem nenhum erro visível;
 *  - o código nunca atravessa a fronteira HTTP;
 *  - o envio é por `sendTemplate` e NUNCA por `sendText` (texto livre é recusado pela Meta fora da
 *    janela de 24 h — passaria no sandbox Twilio e falharia 100% em produção);
 *  - zeros à esquerda sobrevivem (perdê-los faz ~10% dos códigos falharem de forma intermitente).
 */

function createFakeProvider(overrides = {}) {
  const calls = { sendText: [], sendTemplate: [], sendMedia: [] };
  return {
    calls,
    provider: {
      name: 'twilio',
      verifyWebhookSignature: () => true,
      parseInboundMessages: () => [],
      handleVerificationChallenge: () => null,
      async sendText(input) {
        calls.sendText.push(input);
        return { providerMessageId: 'SM_text' };
      },
      async sendMedia(input) {
        calls.sendMedia.push(input);
        return { providerMessageId: 'SM_media' };
      },
      async sendTemplate(input) {
        calls.sendTemplate.push(input);
        if (overrides.sendTemplate) return overrides.sendTemplate(input);
        return { providerMessageId: 'SM_template' };
      }
    }
  };
}

afterEach(() => {
  setWhatsAppProviderOverrideForTests(null);
});

/**
 * Fixture COMPARTILHADO com o frontend. A mesma regra é implementada dos dois lados
 * (`canonicalizeChannelUserKey` aqui, `canonicalizePhoneDigits` em
 * `frontend/src/features/channel-link/channelLinkState.js`) e, se divergirem, a falha é SILENCIOSA:
 * a tela valida e exibe um número, o backend grava outra chave, e na fase 3 a mensagem do WhatsApp
 * chega sem casar com vínculo nenhum. As duas suítes iteram sobre esta MESMA lista.
 */
const PHONE_FIXTURE_URL = new URL('../../../tests/fixtures/phone-canonicalization.json', import.meta.url);
const phoneFixture = JSON.parse(readFileSync(PHONE_FIXTURE_URL, 'utf8'));

describe('canonicalizeChannelUserKey', () => {
  it('canonicalização do backend casa com o fixture compartilhado', () => {
    assert.ok(Array.isArray(phoneFixture.cases) && phoneFixture.cases.length >= 17, 'o fixture encolheu');

    for (const testCase of phoneFixture.cases) {
      const actual = canonicalizeChannelUserKey(testCase.input, phoneFixture.defaultCountryCode);
      assert.equal(
        actual,
        testCase.expected,
        `DIVERGÊNCIA com o fixture para ${JSON.stringify(testCase.input)}: ${testCase.nota}`
      );
      // Ponto fixo para TODOS os casos, não só os marcados: a chave canônica volta ao webhook da
      // fase 3 e é recanonicalizada lá.
      assert.equal(
        canonicalizeChannelUserKey(actual, phoneFixture.defaultCountryCode),
        actual,
        `não idempotente para ${JSON.stringify(testCase.input)}`
      );
    }
  });

  it('o DDI padrão do fixture é o mesmo da configuração, e é o default da função', () => {
    // Se `channelLinkDefaultCountryCode` mudar sem o fixture mudar junto, as expectativas passam a
    // descrever uma regra que o serviço não aplica mais.
    assert.equal(phoneFixture.defaultCountryCode, config.channelLinkDefaultCountryCode);
    assert.equal(canonicalizeChannelUserKey('11999999999'), canonicalizeChannelUserKey('11999999999', '55'));
  });

  it('o fixture cobre as fronteiras que a heurística do nono dígito decide', () => {
    // Guarda contra alguém apagar do fixture justamente o caso incômodo.
    const digitsOf = (value) => String(value).replace(/\D/g, '');
    const lengths = new Set(phoneFixture.cases.map((testCase) => digitsOf(testCase.input).length));
    for (const length of [10, 11, 12, 13]) {
      assert.ok(lengths.has(length), `o fixture perdeu o caso de ${length} dígitos`);
    }
    assert.ok(
      phoneFixture.cases.some((testCase) => String(testCase.input).startsWith('whatsapp:')),
      'o fixture perdeu o prefixo de provedor (caminho real do webhook)'
    );
    assert.ok(
      phoneFixture.cases.some((testCase) => testCase.expected === ''),
      'o fixture perdeu o caso que resulta em chave vazia'
    );
  });

  it('entrada nula não vira chave (o JSON não expressa `null`/`undefined`)', () => {
    assert.equal(canonicalizeChannelUserKey(null), '');
    assert.equal(canonicalizeChannelUserKey(undefined), '');
  });
});

describe('maskChannelUserKey', () => {
  it('mostra no máximo os 4 últimos dígitos', () => {
    assert.equal(maskChannelUserKey('5511999999999'), '+55 11 ****-9999');
    assert.equal(maskChannelUserKey('551133334444'), '+55 11 ****-4444');
  });

  it('aplica o mesmo formato a qualquer E.164 de 12–13 dígitos', () => {
    assert.equal(maskChannelUserKey('4915112345678'), '+49 15 ****-5678');
  });

  it('degrada com segurança fora de 12–13 dígitos', () => {
    // Comprimentos que não casam com DDI+DDD caem no mascaramento genérico.
    assert.equal(maskChannelUserKey('44791112345'), '*******2345');
    assert.equal(maskChannelUserKey('123'), '***');
    assert.equal(maskChannelUserKey(''), '');
  });

  it('nunca deixa passar mais do que os 4 últimos dígitos do número', () => {
    const phone = '5511987654321';
    const masked = maskChannelUserKey(phone);
    assert.ok(!masked.includes(phone));
    assert.ok(masked.endsWith('4321'));
    // O miolo do número (98765) não pode aparecer em lugar nenhum.
    assert.ok(!masked.includes('98765'));
  });
});

describe('generateOtpCode', () => {
  it('devolve sempre 6 caracteres, como string', () => {
    for (let index = 0; index < 500; index += 1) {
      const code = generateOtpCode();
      assert.equal(typeof code, 'string');
      assert.equal(code.length, 6);
      assert.match(code, /^\d{6}$/);
    }
  });

  it('preserva zeros à esquerda (o `padStart` não é cosmético)', () => {
    // ~10% dos sorteios caem abaixo de 100.000. Em 500 amostras, não ver nenhum código começando
    // com zero significaria que o zero está sendo perdido — não azar.
    const codes = Array.from({ length: 500 }, () => generateOtpCode());
    assert.ok(codes.some((code) => code.startsWith('0')), 'nenhum código com zero à esquerda em 500 amostras');
    assert.ok(codes.every((code) => code.length === 6));
  });

  it('não repete o mesmo código em sequência (CSPRNG, não constante)', () => {
    const unique = new Set(Array.from({ length: 200 }, () => generateOtpCode()));
    assert.ok(unique.size > 150, `entropia suspeita: ${unique.size} códigos distintos em 200`);
  });
});

describe('isValidOtpCodeFormat', () => {
  it('aceita exatamente 6 dígitos, inclusive com zeros à esquerda', () => {
    assert.equal(isValidOtpCodeFormat('123456'), true);
    assert.equal(isValidOtpCodeFormat('000042'), true);
  });

  it('recusa tudo o mais — inclusive número, que perderia o zero à esquerda', () => {
    assert.equal(isValidOtpCodeFormat('12345'), false);
    assert.equal(isValidOtpCodeFormat('1234567'), false);
    assert.equal(isValidOtpCodeFormat('12345a'), false);
    assert.equal(isValidOtpCodeFormat(' 123456 '), false);
    assert.equal(isValidOtpCodeFormat(123456), false);
    assert.equal(isValidOtpCodeFormat(null), false);
  });
});

describe('armazenamento do código (hashPassword/verifyPassword)', () => {
  it('faz round-trip com código de zeros à esquerda', () => {
    const code = '000042';
    const hash = hashPassword(code);
    assert.equal(verifyPassword(code, hash), true);
    assert.equal(verifyPassword('42', hash), false);
    assert.equal(verifyPassword('000043', hash), false);
  });

  it('é SALGADO — dois hashes do mesmo código são diferentes', () => {
    // É o que impede que um dump do banco vire tabela de pré-computação: com 10^6 possibilidades,
    // um sha256 sem salt inverteria todos os desafios vivos de uma vez.
    const first = hashPassword('123456');
    const second = hashPassword('123456');
    assert.notEqual(first, second);
    assert.equal(verifyPassword('123456', first), true);
    assert.equal(verifyPassword('123456', second), true);
  });

  it('nunca guarda o código em claro dentro do hash', () => {
    const hash = hashPassword('987654');
    assert.ok(!hash.includes('987654'));
    assert.ok(hash.startsWith('scrypt_v1$'));
  });
});

describe('evaluateChallengeState', () => {
  const now = Date.parse('2026-08-06T12:00:00.000Z');

  function baseChallenge(overrides = {}) {
    return {
      consumedAt: null,
      expiresAt: new Date(now + 5 * 60_000).toISOString(),
      attemptCount: 0,
      maxAttempts: 5,
      sendCount: 1,
      maxSends: 3,
      lastSentAt: new Date(now - 120_000).toISOString(),
      ...overrides
    };
  }

  it('desafio novo está vivo, com tentativas e envios sobrando', () => {
    const state = evaluateChallengeState(baseChallenge(), { now, resendCooldownSeconds: 60 });
    assert.equal(state.status, 'live');
    assert.equal(state.attemptsRemaining, 5);
    assert.equal(state.sendsRemaining, 2);
    assert.equal(state.resendBlockedReason, null);
  });

  it('expira na fronteira: `expires_at === now` já é expirado', () => {
    const state = evaluateChallengeState(
      baseChallenge({ expiresAt: new Date(now).toISOString() }),
      { now, resendCooldownSeconds: 60 }
    );
    assert.equal(state.status, 'expired');
    assert.equal(state.resendBlockedReason, 'expired');
  });

  it('esgota na fronteira: `attempt_count === max_attempts` já é esgotado', () => {
    const state = evaluateChallengeState(
      baseChallenge({ attemptCount: 5 }),
      { now, resendCooldownSeconds: 60 }
    );
    assert.equal(state.status, 'exhausted');
    assert.equal(state.attemptsRemaining, 0);
  });

  it('fechado vence expirado e esgotado (não há volta para vivo)', () => {
    const state = evaluateChallengeState(
      baseChallenge({
        consumedAt: new Date(now - 1000).toISOString(),
        expiresAt: new Date(now - 1).toISOString(),
        attemptCount: 5
      }),
      { now, resendCooldownSeconds: 60 }
    );
    assert.equal(state.status, 'closed');
    assert.equal(state.resendBlockedReason, 'closed');
  });

  it('bloqueia o reenvio durante o cooldown e libera depois', () => {
    const blocked = evaluateChallengeState(
      baseChallenge({ lastSentAt: new Date(now - 10_000).toISOString() }),
      { now, resendCooldownSeconds: 60 }
    );
    assert.equal(blocked.resendBlockedReason, 'cooldown');
    assert.equal(blocked.canResendAt, new Date(now + 50_000).toISOString());
    assert.equal(retryAfterSeconds(blocked.canResendAt, now), 50);

    const released = evaluateChallengeState(
      baseChallenge({ lastSentAt: new Date(now - 61_000).toISOString() }),
      { now, resendCooldownSeconds: 60 }
    );
    assert.equal(released.resendBlockedReason, null);
  });

  it('bloqueia o reenvio quando o teto de envios estourou', () => {
    const state = evaluateChallengeState(
      baseChallenge({ sendCount: 3, lastSentAt: new Date(now - 600_000).toISOString() }),
      { now, resendCooldownSeconds: 60 }
    );
    assert.equal(state.sendsRemaining, 0);
    assert.equal(state.resendBlockedReason, 'exhausted');
  });

  it('nunca devolve contador negativo', () => {
    const state = evaluateChallengeState(
      baseChallenge({ attemptCount: 9, maxAttempts: 5, sendCount: 7, maxSends: 3 }),
      { now, resendCooldownSeconds: 60 }
    );
    assert.equal(state.attemptsRemaining, 0);
    assert.equal(state.sendsRemaining, 0);
  });
});

describe('validação de entrada', () => {
  it('rejeita telefone curto ANTES de qualquer trabalho caro', () => {
    assert.throws(
      () => requireChannelUserKey('1'),
      (error) => error.code === 'CHANNEL_LINK_PHONE_INVALID' && error.status === 400
    );
    assert.throws(
      () => requireChannelUserKey(''),
      (error) => error.code === 'CHANNEL_LINK_PHONE_INVALID'
    );
    assert.throws(
      () => requireChannelUserKey('5511999999999123'),
      (error) => error.code === 'CHANNEL_LINK_PHONE_INVALID'
    );
  });

  it('aceita o formato humano e devolve a chave canônica', () => {
    assert.equal(requireChannelUserKey('(11) 99999-9999'), '5511999999999');
    assert.equal(requireChannelUserKey('+55 11 99999-9999'), '5511999999999');
  });

  it('só aceita canais que esta fase sabe verificar', () => {
    assert.equal(requireSupportedChannel(undefined), 'whatsapp');
    assert.equal(requireSupportedChannel('WhatsApp'), 'whatsapp');
    assert.throws(
      () => requireSupportedChannel('telegram'),
      (error) => error.code === 'CHANNEL_LINK_CHANNEL_UNSUPPORTED' && error.status === 400
    );
  });
});

describe('DTOs — o código e o hash nunca atravessam a fronteira HTTP', () => {
  const challenge = {
    id: 'cvfy_abcdef',
    channelType: 'whatsapp',
    externalUserKey: '5511987654321',
    userId: 'usr_abc',
    codeHash: 'scrypt_v1$c2FsdA$aGFzaA',
    attemptCount: 1,
    maxAttempts: 5,
    sendCount: 1,
    maxSends: 3,
    lastSentAt: '2026-08-06T12:00:00.000Z',
    expiresAt: '2026-08-06T12:10:00.000Z',
    consumedAt: null,
    outcome: null,
    deliveryStatus: 'sent',
    providerName: 'twilio',
    providerMessageId: 'SMxxxxxxxx',
    deliveryError: 'erro anterior',
    correlationId: 'corr_test',
    metadata: { rawInput: '(11) 98765-4321' },
    createdAt: '2026-08-06T12:00:00.000Z',
    updatedAt: '2026-08-06T12:00:00.000Z'
  };

  it('o DTO do desafio expõe apenas o contrato', () => {
    const dto = toChallengeDto(challenge, Date.parse('2026-08-06T12:05:00.000Z'));
    assert.deepEqual(Object.keys(dto).sort(), [
      'attemptsRemaining',
      'canResendAt',
      'challengeId',
      'channelType',
      'correlationId',
      'deliveryStatus',
      'expiresAt',
      'phoneMasked',
      'sendsRemaining'
    ]);
    assert.equal(dto.phoneMasked, '+55 11 ****-4321');
    assert.equal(dto.attemptsRemaining, 4);
    assert.equal(dto.sendsRemaining, 2);
  });

  it('serializado, o DTO não contém hash, dados de provedor, telefone cru nem 6 dígitos seguidos', () => {
    // Um `AppError` com `errors` populado é serializado inteiro pelo `createProblem`: o mapper é a
    // única barreira entre a linha do desafio e a resposta.
    const serialized = JSON.stringify(toChallengeDto(challenge, Date.parse('2026-08-06T12:05:00.000Z')));
    assert.ok(!serialized.includes('codeHash'));
    assert.ok(!serialized.includes('scrypt_v1'));
    assert.ok(!serialized.includes('providerMessageId'));
    assert.ok(!serialized.includes('SMxxxxxxxx'));
    assert.ok(!serialized.includes('deliveryError'));
    assert.ok(!serialized.includes('metadata'));
    assert.ok(!serialized.includes('rawInput'));
    assert.ok(!serialized.includes('5511987654321'));
    assert.ok(!/\d{6}/.test(serialized), `sequência de 6 dígitos vazou: ${serialized}`);
  });

  it('o DTO do vínculo mostra o número inteiro ao DONO, mas nunca o `metadata`', () => {
    const dto = toChannelLinkDto({
      id: 'cclk_1',
      channelType: 'whatsapp',
      externalUserKey: '5511987654321',
      userId: 'usr_abc',
      integrationAccountId: 'iacc_1',
      verificationStatus: 'verified',
      verifiedAt: '2026-08-06T12:00:00.000Z',
      metadata: { verificationId: 'cvfy_abcdef', segredo: 'nao-vaza' },
      createdAt: '2026-08-06T11:00:00.000Z',
      updatedAt: '2026-08-06T12:00:00.000Z'
    });

    assert.deepEqual(Object.keys(dto).sort(), [
      'channelType',
      'createdAt',
      'id',
      'phone',
      'phoneMasked',
      'verificationStatus',
      'verifiedAt'
    ]);
    // O dono precisa distinguir até 3 números na lista — o número é dele.
    assert.equal(dto.phone, '5511987654321');
    assert.equal(dto.phoneMasked, '+55 11 ****-4321');
    assert.ok(!JSON.stringify(dto).includes('nao-vaza'));
    assert.ok(!JSON.stringify(dto).includes('iacc_1'));
  });
});

describe('despacho do OTP', () => {
  it('envia por `sendTemplate` e NUNCA por `sendText`', async () => {
    // A Meta Cloud API recusa texto livre fora da janela de 24 h, e quem está se vinculando pela
    // primeira vez nunca escreveu ao número de negócio: `sendText` passaria no sandbox Twilio e
    // falharia 100% em produção.
    const fake = createFakeProvider();
    setWhatsAppProviderOverrideForTests(fake.provider);

    const result = await dispatchChannelLinkOtp({ to: '5511999999999', code: '000042' });

    assert.equal(fake.calls.sendText.length, 0);
    assert.equal(fake.calls.sendMedia.length, 0);
    assert.equal(fake.calls.sendTemplate.length, 1);
    assert.equal(result.providerName, 'twilio');
    assert.equal(result.providerMessageId, 'SM_template');
  });

  it('passa EXATAMENTE uma variável — o código, como string, com o zero à esquerda', () => {
    const fake = createFakeProvider();
    setWhatsAppProviderOverrideForTests(fake.provider);

    return dispatchChannelLinkOtp({ to: '5511999999999', code: '000042' }).then(() => {
      const call = fake.calls.sendTemplate[0];
      assert.equal(call.to, '5511999999999');
      assert.deepEqual(call.variables, ['000042']);
      assert.equal(typeof call.variables[0], 'string');
      assert.equal(call.languageCode, config.whatsappLinkOtpTemplateLanguage);
      assert.equal(call.templateName, config.whatsappLinkOtpTemplate);
    });
  });

  it('propaga a falha do provedor (é o que leva o desafio a `send_failed`)', async () => {
    const fake = createFakeProvider({
      sendTemplate: () => {
        throw new Error('63016 failed to send freeform message');
      }
    });
    setWhatsAppProviderOverrideForTests(fake.provider);

    await assert.rejects(
      dispatchChannelLinkOtp({ to: '5511999999999', code: '123456' }),
      /63016/
    );
    assert.equal(fake.calls.sendText.length, 0);
  });

  it('falha com `WHATSAPP_CHANNEL_DISABLED` quando o canal está desligado', async () => {
    setWhatsAppProviderOverrideForTests(null);
    setConfigOverride('whatsappProvider', 'disabled');

    await assert.rejects(
      dispatchChannelLinkOtp({ to: '5511999999999', code: '123456' }),
      (error) => error.code === 'WHATSAPP_CHANNEL_DISABLED' && error.status === 503
    );

    setConfigOverride('whatsappProvider', undefined);
  });
});

describe('sanitizeDeliveryError', () => {
  it('guarda código + frase curta, nunca o corpo inteiro da resposta', () => {
    const error = new Error('  Twilio  rejeitou\n a mensagem  ');
    error.code = 63016;
    const sanitized = sanitizeDeliveryError(error);
    assert.equal(sanitized, '63016: Twilio rejeitou a mensagem');
  });

  it('trunca payload gigante e nunca devolve string vazia', () => {
    const sanitized = sanitizeDeliveryError(new Error('x'.repeat(5000)));
    assert.equal(sanitized.length, 240);
    assert.equal(sanitizeDeliveryError(null), 'unknown_delivery_error');
    assert.equal(sanitizeDeliveryError(undefined), 'unknown_delivery_error');
  });
});

describe('limitadores', () => {
  it('a chave do balde de telefone é por canal + número canônico', () => {
    assert.equal(
      buildDispatchPhoneRateKey('whatsapp', '5511999999999'),
      'link:dispatch:phone:whatsapp:5511999999999'
    );
    // Dois canais não compartilham orçamento, e dois números tampouco.
    assert.notEqual(
      buildDispatchPhoneRateKey('whatsapp', '5511999999999'),
      buildDispatchPhoneRateKey('whatsapp', '5511999999998')
    );
  });

  it('a política de 6 despachos/hora por telefone bloqueia o 7º com `Retry-After` útil', () => {
    // 6/h é o teto natural do usuário legítimo: start + 2 reenvios = 3; um ciclo cancelado e
    // refeito = 6. O 7º é abuso (ou bombing de um número que não é do solicitante).
    const limiter = createRateLimiter(6, 60 * 60 * 1000);
    const key = buildDispatchPhoneRateKey('whatsapp', '5511999999999');

    for (let index = 0; index < 6; index += 1) {
      assert.equal(limiter.check(key).allowed, true, `despacho ${index + 1} deveria passar`);
    }

    const blocked = limiter.check(key);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.remaining, 0);
    assert.ok(blocked.retryAfterSeconds > 0 && blocked.retryAfterSeconds <= 3600);

    // Outro número não é afetado — a proteção é da vítima, não uma trava global.
    assert.equal(limiter.check(buildDispatchPhoneRateKey('whatsapp', '5511988888888')).allowed, true);
  });
});

describe('defaults de configuração', () => {
  it('mantém os defaults decididos pelo operador', () => {
    assert.equal(Number(config.channelLinkOtpTtlSeconds), 600);
    assert.equal(Number(config.channelLinkOtpMaxAttempts), 5);
    assert.equal(Number(config.channelLinkOtpMaxSends), 3);
    assert.equal(Number(config.channelLinkOtpResendCooldownSeconds), 60);
    assert.equal(Number(config.channelLinkMaxPerUser), 3);
    assert.equal(Number(config.channelLinkVictimShieldDistinctUsers), 3);
    // A janela do escudo vai para `make_interval(hours => $3::int)`: `Number(undefined)` = NaN
    // estouraria o start com erro de SQL em runtime, com a suíte inteira verde.
    assert.equal(Number(config.channelLinkVictimShieldWindowHours), 24);
    assert.ok(Number.isInteger(Number(config.channelLinkVictimShieldWindowHours)));
    assert.equal(config.channelLinkAllowTransfer, true);
    assert.equal(config.channelLinkDefaultCountryCode, '55');
  });

  it('o texto do template combina com o TTL (acoplamento assumido) e não pede clique', () => {
    const template = String(config.whatsappLinkOtpTemplate);
    assert.ok(template.includes('{{1}}'), 'template precisa da variável posicional do código');
    // O TTL aparece LITERAL no texto: mudar `channelLinkOtpTtlSeconds` obriga a mudar a frase.
    assert.ok(template.includes('10 minutos'), 'texto e TTL saíram de sincronia');
    assert.ok(!/https?:\/\//.test(template), 'link em OTP treina a vítima a clicar');
    // A mensagem pode chegar num aparelho que não é do solicitante — é justamente o que se testa.
    assert.ok(!template.toLowerCase().includes('e-mail'));
  });
});
