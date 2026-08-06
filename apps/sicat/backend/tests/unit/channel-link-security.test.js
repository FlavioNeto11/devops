import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { config, setConfigOverride } from '../../src/lib/config.js';
import { hashPassword, verifyPassword } from '../../src/lib/sicat-security.js';
import { lockChannelLinkUserScope } from '../../src/repositories/conversation-channel-link-repo.js';
import { maskChannelUserKey } from '../../src/services/conversation/channel/whatsapp/types.js';
import { setWhatsAppProviderOverrideForTests } from '../../src/services/conversation/channel/whatsapp/index.js';
import {
  cancelChannelLinkChallengeService,
  confirmChannelLinkService,
  listChannelLinksService,
  removeChannelLinkService,
  resendChannelLinkChallengeService,
  resetChannelLinkDispatchLimiterForTests,
  sanitizeDeliveryError,
  setChannelLinkRepositoriesForTests,
  startChannelLinkService
} from '../../src/services/conversation-channel-link-service.js';

/**
 * INVARIANTES DE SEGURANÇA do OTP de vínculo (fase 2 da cadeia `whatsapp-channel-sicat`).
 *
 * O arquivo irmão (`channel-link-service.test.js`) cobre helpers puros: canonicalização, máscara,
 * geração de código, DTOs. Nenhum deles quebra se a guarda de segurança sumir do fluxo — dá para
 * apagar `and attempt_count < max_attempts` do consume, trocar `consumed_at is null` por `true` no
 * close, ou remover `and user_id = $2` do lookup, e aquela suíte continua inteira verde enquanto o
 * OTP vira decoração (palpites infinitos, replay dentro do TTL, leitura do desafio de outra conta).
 *
 * Aqui as regras são exercitadas de ponta a ponta SEM POSTGRES, pelo seam
 * `setChannelLinkRepositoriesForTests`. Duas coisas o seam NÃO consegue provar, e por isso existem
 * os testes de CONTRATO DE SQL no fim do arquivo (padrão do `har-gateway-structural-validator`):
 * o `where` atômico dos statements e o predicado do `on conflict`. Um double que imita o SQL provaria
 * o double, não o banco — o texto do statement é o que precisa ser travado.
 *
 * Regra de escrita destes casos: nenhum teste pode passar por acidente. O harness recusa qualquer
 * chamada de persistência que o teste não tenha declarado (nada de no-op silencioso), toda rejeição é
 * capturada e inspecionada (nada de `assert` dentro de callback que nunca roda), e todo caso que
 * afirma "X não aconteceu" também afirma que o fluxo CHEGOU ao ponto em que X aconteceria.
 *
 * **Critério de aceitação de cada caso (verificação adversarial, rodada 3): um teste só vale se
 * FALHAR quando a guarda que ele protege cai.** Duas armadilhas que já derrubaram esta suíte e que
 * não podem voltar:
 *  - **o double que concorda consigo mesmo.** Um `impl` que reimplementa em JavaScript a regra que o
 *    SQL deveria ter (ex.: devolver o registro só quando `input.userId === OWNER`) prova o double, não
 *    o código. O escopo por usuário mora nos PARÂMETROS enviados ao statement, e é lá que ele é
 *    conferido (seção 14);
 *  - **o `includes()` por cláusula.** Detecta DELEÇÃO, nunca NEUTRALIZAÇÃO: `and attempt_count <
 *    max_attempts or true` mantém a cláusula literal intacta e desliga a guarda. Por isso o `where`
 *    dos statements guardados é comparado INTEIRO (seção 13).
 */

const OWNER = 'usr_owner';
const OTHER_USER = 'usr_other';
const CHALLENGE_ID = 'cvfy_test';
const LINK_ID = 'cclk_test';
const PHONE = '5511987654321';
const PHONE_MASKED = maskChannelUserKey(PHONE);
const CODE = '000042';
/** scrypt é caro (dezenas de ms); os hashes fixos são calculados uma vez só. */
const CODE_HASH = hashPassword(CODE);
const WRONG_CODE = '999999';

/** Sentinela de `PoolClient`: só serve para distinguir "dentro da transação" de "no pool". */
const FAKE_CLIENT = { __fakePoolClient: true };

const OVERRIDDEN_CONFIG_KEYS = [
  'channelLinkAllowTransfer',
  'channelLinkMaxPerUser',
  'channelLinkVictimShieldDistinctUsers',
  'whatsappProvider'
];

/** Métodos de persistência do seam. `withTransaction`/`insertAccessAdminAudit` têm tratamento próprio. */
const REPO_METHODS = [
  'listConversationChannelLinksByUser',
  'countConversationChannelLinksByUser',
  'findConversationChannelLinkById',
  'findConversationChannelLinkForUpdate',
  'claimConversationChannelLink',
  'deleteConversationChannelLinkById',
  'lockChannelLinkUserScope',
  'insertChannelVerification',
  'rotateChannelVerificationCode',
  'consumeChannelVerificationAttempt',
  'closeChannelVerification',
  'closeLiveChannelVerificationsByUser',
  'closeLiveChannelVerificationsByPhoneExcept',
  'findChannelVerificationById',
  'findLiveChannelVerificationById',
  'findLiveChannelVerificationByUser',
  'countDistinctChallengersForPhone',
  'markChannelVerificationDelivery',
  'sweepExpiredChannelVerifications'
];

// ---------------------------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------------------------

/**
 * Double da camada de persistência que REGISTRA A ORDEM das chamadas.
 *
 * Método não declarado pelo teste LANÇA em vez de devolver `undefined`: se o service passar a tocar
 * um repositório que o caso não previu, o teste quebra alto em vez de seguir com um valor neutro que
 * mascararia a mudança de comportamento.
 */
function createHarness(impls = {}, order = []) {
  const calls = [];
  const audits = [];
  const repositories = {};

  for (const name of REPO_METHODS) {
    repositories[name] = async (...args) => {
      calls.push({ name, args });
      order.push(name);
      const impl = impls[name];
      if (typeof impl !== 'function') {
        throw new Error(`[harness] chamada de persistência não declarada por este teste: ${name}`);
      }
      return impl(...args);
    };
  }

  repositories.withTransaction = async (fn) => {
    calls.push({ name: 'withTransaction', args: [] });
    order.push('tx:begin');
    try {
      const result = await fn(FAKE_CLIENT);
      order.push('tx:commit');
      return result;
    } catch (error) {
      order.push('tx:rollback');
      throw error;
    }
  };

  repositories.insertAccessAdminAudit = async (entry) => {
    calls.push({ name: 'insertAccessAdminAudit', args: [entry] });
    order.push('insertAccessAdminAudit');
    audits.push(entry);
  };

  setChannelLinkRepositoriesForTests(repositories);

  return {
    calls,
    order,
    audits,
    /** Todas as listas de argumentos de um método, na ordem em que foi chamado. */
    argsOf(name) {
      return calls.filter((call) => call.name === name).map((call) => call.args);
    },
    countOf(name) {
      return calls.filter((call) => call.name === name).length;
    }
  };
}

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

function challengeRecord(overrides = {}) {
  const now = Date.now();
  return {
    id: CHALLENGE_ID,
    channelType: 'whatsapp',
    externalUserKey: PHONE,
    userId: OWNER,
    codeHash: CODE_HASH,
    attemptCount: 1,
    maxAttempts: 5,
    sendCount: 1,
    maxSends: 3,
    lastSentAt: new Date(now - 10 * 60_000).toISOString(),
    expiresAt: new Date(now + 5 * 60_000).toISOString(),
    consumedAt: null,
    outcome: null,
    deliveryStatus: 'sent',
    providerName: 'twilio',
    providerMessageId: 'SM_1',
    deliveryError: null,
    correlationId: null,
    metadata: {},
    createdAt: new Date(now - 60_000).toISOString(),
    updatedAt: new Date(now - 60_000).toISOString(),
    ...overrides
  };
}

function linkRecord(overrides = {}) {
  return {
    id: LINK_ID,
    channelType: 'whatsapp',
    externalUserKey: PHONE,
    userId: OWNER,
    integrationAccountId: null,
    verificationStatus: 'verified',
    verifiedAt: new Date().toISOString(),
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

/**
 * Instrumenta a LEITURA de `codeHash`. É o proxy exato de "`verifyPassword` foi chamado": o service
 * não tem outro motivo para tocar esse campo, e a comparação do código é a única coisa que precisa
 * dele. Sem isto não há como observar a ordem entre cobrar a tentativa e comparar o código.
 */
function withHashReadProbe(record, order) {
  const value = record.codeHash;
  const copy = { ...record };
  Object.defineProperty(copy, 'codeHash', {
    enumerable: true,
    configurable: true,
    get() {
      order.push('codeHash:read');
      return value;
    }
  });
  return copy;
}

/** Captura a rejeição para inspecionar fora de callback — nada de `assert` que pode não rodar. */
async function captureRejection(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail('esperava rejeição, mas a promessa resolveu');
  return null;
}

// ---------------------------------------------------------------------------------------------
// Leitor de fonte — usado pelos testes de contrato de SQL (seções 13 e 14)
// ---------------------------------------------------------------------------------------------

/**
 * Um mini-leitor de fonte, e não um parser de verdade: os repositórios seguem um formato rígido
 * (`run(client, `…sql…`, [ …params… ])`), e é só isso que precisa ser lido. Se algum dia essa forma
 * mudar, os `assert.ok` abaixo acusam em vez de devolver silêncio.
 */

/** Corpo bruto (sem normalizar) de uma função exportada, do cabeçalho ao próximo `export` de topo. */
function extractRawFunction(source, fnName) {
  const start = source.indexOf(`export async function ${fnName}(`);
  assert.ok(start >= 0, `função ${fnName} não existe mais no repositório`);
  const end = source.indexOf('\nexport ', start + 1);
  return end === -1 ? source.slice(start) : source.slice(start, end);
}

/** Comentários `--` fora, espaços colapsados, minúsculas. */
function normalizeSql(sql) {
  return sql.replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Conteúdo do grupo balanceado que começa em `openIndex` (`[`, `(` ou `{`), ignorando delimitadores
 * dentro de string/template — senão um `'não'` no SQL ou o `${userId}` do advisory lock desbalanceia
 * a contagem.
 */
function sliceBalanced(text, openIndex) {
  let depth = 0;
  let quote = null;
  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === '\\') index += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') quote = char;
    else if ('([{'.includes(char)) depth += 1;
    else if (')]}'.includes(char)) {
      depth -= 1;
      if (depth === 0) return text.slice(openIndex + 1, index);
    }
  }
  assert.fail(`grupo iniciado em ${openIndex} não fecha`);
  return '';
}

/** Divide por vírgulas de PRIMEIRO nível: `JSON.stringify(a || {})` continua sendo uma entrada só. */
function splitTopLevelCommas(text) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let current = '';
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      current += char;
      if (char === '\\') {
        current += text[index + 1] ?? '';
        index += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"' || char === '`') quote = char;
    else if ('([{'.includes(char)) depth += 1;
    else if (')]}'.includes(char)) depth -= 1;
    else if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts.map((part) => part.replace(/\s+/g, ' ').trim()).filter((part) => part.length > 0);
}

/** Impls do caminho FELIZ do confirm: sem vínculo prévio, desafio válido, claim aceito. */
function happyConfirmImpls(overrides = {}) {
  return {
    consumeChannelVerificationAttempt: async () => challengeRecord(),
    lockChannelLinkUserScope: async () => undefined,
    findConversationChannelLinkForUpdate: async () => null,
    countConversationChannelLinksByUser: async () => 0,
    closeChannelVerification: async () => challengeRecord({ consumedAt: new Date().toISOString(), outcome: 'verified' }),
    claimConversationChannelLink: async () => linkRecord(),
    closeLiveChannelVerificationsByPhoneExcept: async () => 0,
    ...overrides
  };
}

/** Impls do caminho FELIZ do start: nenhum vínculo, escudo tranquilo, insert e entrega OK. */
function happyStartImpls(overrides = {}) {
  return {
    listConversationChannelLinksByUser: async () => [],
    countDistinctChallengersForPhone: async () => 0,
    countConversationChannelLinksByUser: async () => 0,
    sweepExpiredChannelVerifications: async () => 0,
    lockChannelLinkUserScope: async () => undefined,
    closeLiveChannelVerificationsByUser: async () => 0,
    // Ecoa o que o service mandou gravar (id, hash e TELEFONE): é a linha do desafio que decide para
    // ONDE o código é despachado, então um fixture com número fixo esconderia um despacho para o
    // número errado.
    insertChannelVerification: async (_client, input) =>
      challengeRecord({ id: input.id, codeHash: input.codeHash, externalUserKey: input.externalUserKey }),
    markChannelVerificationDelivery: async (_client, input) =>
      challengeRecord({ deliveryStatus: input.deliveryStatus }),
    ...overrides
  };
}

beforeEach(() => {
  resetChannelLinkDispatchLimiterForTests();
});

afterEach(() => {
  setChannelLinkRepositoriesForTests(null);
  setWhatsAppProviderOverrideForTests(null);
  resetChannelLinkDispatchLimiterForTests();
  for (const key of OVERRIDDEN_CONFIG_KEYS) setConfigOverride(key, undefined);
});

// ---------------------------------------------------------------------------------------------
// 1. Ordem: cobrar a tentativa ANTES de comparar o código
// ---------------------------------------------------------------------------------------------

describe('confirm — a tentativa é cobrada ANTES de comparar o código', () => {
  it('o primeiro toque na persistência é o consume, e o hash só é lido depois — inclusive com o código CERTO', async () => {
    // O caso do código CERTO é o que importa: se a comparação vier antes do consume, o palpite
    // BEM-SUCEDIDO não custa tentativa — e nem o malsucedido, porque o atacante só precisa que o
    // caminho de sucesso não cobre para descobrir que acertou sem gastar cota.
    // O array de ordem é criado ANTES do harness porque a impl do consume precisa escrever nele.
    const order = [];
    const harness = createHarness(
      happyConfirmImpls({
        consumeChannelVerificationAttempt: async () => withHashReadProbe(challengeRecord(), order)
      }),
      order
    );

    const result = await confirmChannelLinkService(OWNER, CHALLENGE_ID, { code: CODE });

    assert.equal(result.transferred, false);
    assert.equal(result.link.id, LINK_ID);

    assert.equal(
      harness.order[0],
      'consumeChannelVerificationAttempt',
      `a primeira ida à persistência deveria ser o consume; foi ${harness.order[0]}`
    );
    const consumeAt = harness.order.indexOf('consumeChannelVerificationAttempt');
    const hashAt = harness.order.indexOf('codeHash:read');
    assert.ok(hashAt >= 0, 'o hash nunca foi lido — o código não chegou a ser comparado');
    assert.ok(consumeAt < hashAt, `consume (${consumeAt}) precisa vir antes da leitura do hash (${hashAt})`);
    assert.equal(harness.countOf('consumeChannelVerificationAttempt'), 1, 'a tentativa é cobrada exatamente uma vez');

    // O fechamento EXCLUSIVO do passo (4) é escopado pelo usuário. `userId: null` faria o `where`
    // virar `($2::text is null or …)` = verdadeiro, e o portão de corrida do confirm passaria a
    // fechar o desafio de QUALQUER dono — inclusive um de outra conta com o mesmo id.
    const [closeArgs] = harness.argsOf('closeChannelVerification');
    assert.equal(closeArgs[0], FAKE_CLIENT, 'o consumo exclusivo tem de commitar junto com o vínculo');
    assert.equal(closeArgs[1].userId, OWNER);
    assert.equal(closeArgs[1].id, CHALLENGE_ID);
    assert.equal(closeArgs[1].outcome, 'verified');
  });

  it('o código ERRADO também custa exatamente uma tentativa, cobrada antes da comparação', async () => {
    const order = [];
    const harness = createHarness(
      { consumeChannelVerificationAttempt: async () => withHashReadProbe(challengeRecord({ attemptCount: 2 }), order) },
      order
    );

    const error = await captureRejection(confirmChannelLinkService(OWNER, CHALLENGE_ID, { code: WRONG_CODE }));

    assert.equal(error.code, 'CHANNEL_LINK_CODE_INVALID');
    assert.equal(error.status, 400);
    assert.equal(error.errors.attemptsRemaining, 3);
    assert.equal(harness.order[0], 'consumeChannelVerificationAttempt');
    assert.ok(harness.order.indexOf('codeHash:read') > 0);
    assert.equal(harness.countOf('consumeChannelVerificationAttempt'), 1);
  });
});

// ---------------------------------------------------------------------------------------------
// 2. Escopo por usuário
// ---------------------------------------------------------------------------------------------

describe('confirm — desafio é escopado por usuário', () => {
  /** Modela o `and user_id = $2` dos statements: outra conta simplesmente não enxerga a linha. */
  function scopedImpls(extra = {}) {
    return {
      consumeChannelVerificationAttempt: async (_client, input) =>
        (input.userId === OWNER ? challengeRecord() : null),
      findChannelVerificationById: async (_client, _id, userId) =>
        (userId === OWNER ? challengeRecord() : null),
      ...extra
    };
  }

  it('o código CORRETO de um desafio de OUTRA conta é recusado com CODE_INVALID — nunca 404, nunca o hash', async () => {
    const harness = createHarness(scopedImpls());

    const error = await captureRejection(
      confirmChannelLinkService(OTHER_USER, CHALLENGE_ID, { code: CODE })
    );

    assert.equal(error.code, 'CHANNEL_LINK_CODE_INVALID');
    assert.equal(error.status, 400);

    // 404 seria um oráculo (diria "este id não existe PARA VOCÊ", distinguindo id inventado de id
    // real de outra conta). Asserção pelo CÓDIGO e não pelo status: `notEqual(status, 404)` logo
    // depois de `equal(status, 400)` é trivialmente verdadeira — não existe mutação que faça a
    // segunda falhar sem a primeira já ter falhado.
    assert.notEqual(error.code, 'CHANNEL_LINK_CHALLENGE_NOT_FOUND');

    // O `userId` do autenticado tem de chegar ao statement — é ele que faz o escopo existir.
    // ⚠️ Isto NÃO prova o escopo: o impl acima devolve `null` para quem não é o dono porque o TESTE
    // decidiu assim. O que prova é a seção 14 (alinhamento entre `$2` e `input.userId` na FONTE do
    // repositório) — sem ela, trocar os parâmetros para `[input.id, input.id]` passa aqui em silêncio.
    const [consumeArgs] = harness.argsOf('consumeChannelVerificationAttempt');
    assert.equal(consumeArgs[1].id, CHALLENGE_ID);
    assert.equal(consumeArgs[1].userId, OTHER_USER);

    // Nada do desafio alheio vaza: nem o hash, nem o telefone, nem o dono.
    const serialized = JSON.stringify({ message: error.message, code: error.code, errors: error.errors });
    assert.ok(!serialized.includes('scrypt_v1'));
    assert.ok(!serialized.includes(CODE_HASH));
    assert.ok(!serialized.includes(PHONE));
    assert.ok(!serialized.includes(OWNER));
  });

  it('CONTROLE: o MESMO código e o MESMO desafio funcionam para o dono (o teste acima não passa por acaso)', async () => {
    createHarness(happyConfirmImpls(scopedImpls()));

    const result = await confirmChannelLinkService(OWNER, CHALLENGE_ID, { code: CODE });

    assert.equal(result.link.id, LINK_ID);
    assert.equal(result.transferred, false);
  });
});

// ---------------------------------------------------------------------------------------------
// 3. Expiração
// ---------------------------------------------------------------------------------------------

describe('confirm — desafio expirado', () => {
  it('fecha com outcome `expired` e devolve CHANNEL_LINK_CODE_EXPIRED', async () => {
    const expired = challengeRecord({ expiresAt: new Date(Date.now() - 1000).toISOString() });
    const harness = createHarness({
      // O `and expires_at > now()` do consume é o que devolve zero linhas aqui.
      consumeChannelVerificationAttempt: async () => null,
      findChannelVerificationById: async () => expired,
      closeChannelVerification: async () => expired
    });

    const error = await captureRejection(confirmChannelLinkService(OWNER, CHALLENGE_ID, { code: CODE }));

    assert.equal(error.code, 'CHANNEL_LINK_CODE_EXPIRED');
    assert.equal(error.status, 400);

    const [closeArgs] = harness.argsOf('closeChannelVerification');
    assert.equal(closeArgs[0], null, 'o fechamento do expirado roda no pool, fora de transação');
    assert.equal(closeArgs[1].outcome, 'expired');
    assert.equal(closeArgs[1].userId, OWNER);
    // O código expirado NÃO pode ser reaproveitado num vínculo.
    assert.equal(harness.countOf('claimConversationChannelLink'), 0);
  });
});

// ---------------------------------------------------------------------------------------------
// 4. Teto de palpites
// ---------------------------------------------------------------------------------------------

describe('confirm — teto de palpites', () => {
  it('o quinto palpite errado fecha com `exhausted` e devolve ATTEMPTS_EXCEEDED com attemptsRemaining 0', async () => {
    // `attemptCount: 5` é o valor DEPOIS do incremento do consume — o quinto e último palpite.
    const harness = createHarness({
      consumeChannelVerificationAttempt: async () => challengeRecord({ attemptCount: 5, maxAttempts: 5 }),
      closeChannelVerification: async () => challengeRecord({ outcome: 'exhausted' })
    });

    const error = await captureRejection(confirmChannelLinkService(OWNER, CHALLENGE_ID, { code: WRONG_CODE }));

    assert.equal(error.code, 'CHANNEL_LINK_ATTEMPTS_EXCEEDED');
    assert.equal(error.status, 429);
    assert.equal(error.errors.attemptsRemaining, 0);

    const [closeArgs] = harness.argsOf('closeChannelVerification');
    assert.equal(closeArgs[1].outcome, 'exhausted');
    assert.equal(closeArgs[1].userId, OWNER);
  });

  it('FRONTEIRA: o quarto palpite errado NÃO fecha o desafio e ainda anuncia 1 tentativa', async () => {
    // Sem este contraste, um `>=` trocado por `>` (ou o fechamento movido para o palpite errado
    // qualquer) passaria despercebido: o caso acima sozinho não distingue as duas coisas.
    const harness = createHarness({
      consumeChannelVerificationAttempt: async () => challengeRecord({ attemptCount: 4, maxAttempts: 5 })
    });

    const error = await captureRejection(confirmChannelLinkService(OWNER, CHALLENGE_ID, { code: WRONG_CODE }));

    assert.equal(error.code, 'CHANNEL_LINK_CODE_INVALID');
    assert.equal(error.errors.attemptsRemaining, 1);
    assert.equal(harness.countOf('closeChannelVerification'), 0, 'o desafio ainda tem um palpite — não pode fechar');
  });
});

// ---------------------------------------------------------------------------------------------
// 5. Consumo exclusivo
// ---------------------------------------------------------------------------------------------

describe('confirm — consumo exclusivo do desafio', () => {
  it('quando o close perde a corrida e o vínculo já é do usuário, o confirm é idempotente e NÃO audita verificação', async () => {
    const mine = linkRecord({ userId: OWNER, verificationStatus: 'verified' });
    const harness = createHarness(
      happyConfirmImpls({
        findConversationChannelLinkForUpdate: async () => mine,
        // `rowCount = 0`: a requisição concorrente com o mesmo código fechou primeiro.
        closeChannelVerification: async () => null
      })
    );

    const result = await confirmChannelLinkService(OWNER, CHALLENGE_ID, { code: CODE });

    assert.equal(result.transferred, false);
    assert.equal(result.link.id, LINK_ID);
    assert.equal(result.link.phone, PHONE);
    // Nada é reescrito: o vencedor da corrida já gravou tudo.
    assert.equal(harness.countOf('claimConversationChannelLink'), 0);
    // E a trilha não ganha um segundo `channel_link.verified` para a MESMA prova de posse.
    assert.equal(harness.audits.length, 0, `auditoria duplicada: ${JSON.stringify(harness.audits)}`);
  });

  it('quando o close perde a corrida e o vínculo NÃO é do usuário, o replay é recusado com CODE_INVALID', async () => {
    // Este é o outro lado do idempotente: sem a checagem de dono, "perdi a corrida" viraria sucesso
    // para qualquer um que replicasse o código dentro do TTL.
    const harness = createHarness(
      happyConfirmImpls({
        findConversationChannelLinkForUpdate: async () => linkRecord({ userId: OTHER_USER }),
        closeChannelVerification: async () => null
      })
    );
    setConfigOverride('channelLinkAllowTransfer', true);

    const error = await captureRejection(confirmChannelLinkService(OWNER, CHALLENGE_ID, { code: CODE }));

    assert.equal(error.code, 'CHANNEL_LINK_CODE_INVALID');
    assert.equal(harness.countOf('claimConversationChannelLink'), 0);
    assert.ok(harness.order.includes('tx:rollback'), 'a transação tem de reverter');
  });
});

// ---------------------------------------------------------------------------------------------
// 6. Rotação no reenvio
// ---------------------------------------------------------------------------------------------

describe('resend — rotação do código', () => {
  it('rotaciona o codeHash, casa com o código DESPACHADO e NÃO manda nenhum campo de tentativa', async () => {
    const fake = createFakeProvider();
    setWhatsAppProviderOverrideForTests(fake.provider);

    const live = challengeRecord({ attemptCount: 2, codeHash: CODE_HASH });
    const harness = createHarness({
      findLiveChannelVerificationById: async () => live,
      rotateChannelVerificationCode: async (_client, input) =>
        challengeRecord({
          codeHash: input.codeHash,
          expiresAt: input.expiresAt,
          attemptCount: 2,
          sendCount: 2,
          lastSentAt: new Date().toISOString()
        }),
      markChannelVerificationDelivery: async () =>
        challengeRecord({ attemptCount: 2, sendCount: 2, deliveryStatus: 'sent' })
    });

    const dto = await resendChannelLinkChallengeService(OWNER, CHALLENGE_ID, 'corr_resend');

    const [rotateArgs] = harness.argsOf('rotateChannelVerificationCode');
    const rotateInput = rotateArgs[1];

    // Rotacionar de verdade: hash novo, e o antigo morre.
    assert.notEqual(rotateInput.codeHash, CODE_HASH);
    assert.ok(rotateInput.codeHash.startsWith('scrypt_v1$'), 'o código continua guardado como scrypt salgado');
    assert.equal(verifyPassword(CODE, rotateInput.codeHash), false, 'o código ANTIGO não pode validar contra o hash novo');

    // O hash gravado é o do código que REALMENTE foi despachado (guarda contra enviar um código e
    // guardar o hash de outro — que deixaria o desafio impossível de confirmar).
    assert.equal(fake.calls.sendTemplate.length, 1);
    const dispatchedCode = fake.calls.sendTemplate[0].variables[0];
    assert.equal(typeof dispatchedCode, 'string');
    assert.equal(verifyPassword(dispatchedCode, rotateInput.codeHash), true);
    // O que vai para a coluna é o HASH, nunca o código: `codeHash = code` faria um dump da tabela
    // entregar todos os OTPs vivos em texto puro, e as duas asserções acima (`startsWith` e
    // `verifyPassword`) já cairiam — esta é a afirmação direta do mesmo fato.
    assert.notEqual(rotateInput.codeHash, dispatchedCode);
    assert.ok(!rotateInput.codeHash.includes(dispatchedCode), 'o código em claro está DENTRO do hash');

    // NENHUM campo de tentativa vai no update: zerar `attempt_count` no reenvio transformaria o
    // reenvio no bypass do teto de palpites.
    assert.deepEqual(Object.keys(rotateInput).sort(), ['codeHash', 'expiresAt', 'id', 'userId']);
    assert.equal(rotateInput.userId, OWNER, 'a rotação é escopada pelo dono do desafio');

    // E o contador segue de pé na resposta: 2 palpites já gastos de 5.
    assert.equal(dto.attemptsRemaining, 3);
  });
});

// ---------------------------------------------------------------------------------------------
// 7. Transferência bloqueada queima o código (correção C1)
// ---------------------------------------------------------------------------------------------

describe('confirm — transferência bloqueada QUEIMA o código', () => {
  it('sinaliza dentro da transação e fecha com `conflict` FORA dela (o rollback não desfaz o fechamento)', async () => {
    setConfigOverride('channelLinkAllowTransfer', false);
    const harness = createHarness(
      happyConfirmImpls({
        findConversationChannelLinkForUpdate: async () => linkRecord({ userId: OTHER_USER }),
        closeChannelVerification: async () => challengeRecord({ outcome: 'conflict' })
      })
    );

    const error = await captureRejection(confirmChannelLinkService(OWNER, CHALLENGE_ID, { code: CODE }));

    assert.equal(error.code, 'CHANNEL_LINK_TRANSFER_BLOCKED');
    assert.equal(error.status, 409);

    const closeArgs = harness.argsOf('closeChannelVerification');
    assert.equal(closeArgs.length, 1);
    assert.equal(
      closeArgs[0][0],
      null,
      'o fechamento tem de rodar no POOL: dentro da transação ele seria desfeito e o código continuaria vivo até o TTL'
    );
    assert.equal(closeArgs[0][1].outcome, 'conflict');
    assert.ok(
      harness.order.indexOf('closeChannelVerification') > harness.order.indexOf('tx:commit'),
      `o fechamento tem de vir DEPOIS da transação: ${harness.order.join(' → ')}`
    );
    assert.equal(harness.countOf('claimConversationChannelLink'), 0, 'nada pode ser gravado numa transferência barrada');
  });

  it('quando o predicado do `on conflict` barra a troca, a transação REVERTE e o desafio é refechado como `conflict`', async () => {
    // Caminho diferente do anterior: aqui o passo (4) JÁ fechou o desafio como `verified` dentro da
    // transação. Sinalizar por retorno commitaria um desafio "verificado" sem vínculo nenhum — por
    // isso este ramo lança para forçar o rollback.
    setConfigOverride('channelLinkAllowTransfer', true);
    const harness = createHarness(
      happyConfirmImpls({
        findConversationChannelLinkForUpdate: async () => linkRecord({ userId: OTHER_USER }),
        closeChannelVerification: async (_client, input) => challengeRecord({ outcome: input.outcome }),
        claimConversationChannelLink: async () => null
      })
    );

    const error = await captureRejection(confirmChannelLinkService(OWNER, CHALLENGE_ID, { code: CODE }));

    assert.equal(error.code, 'CHANNEL_LINK_TRANSFER_BLOCKED');
    assert.equal(error.status, 409);

    assert.ok(harness.order.includes('tx:rollback'), 'a transação precisa reverter o `verified` prematuro');
    assert.ok(!harness.order.includes('tx:commit'), 'commitar aqui deixaria um desafio verificado sem vínculo');

    const closeArgs = harness.argsOf('closeChannelVerification');
    assert.equal(closeArgs.length, 2);
    // (4) dentro da transação, com o client — e revertido.
    assert.equal(closeArgs[0][0], FAKE_CLIENT);
    assert.equal(closeArgs[0][1].outcome, 'verified');
    assert.equal(closeArgs[0][1].userId, OWNER, 'o consumo exclusivo é escopado pelo dono do desafio');
    // refeito fora, no pool, com o outcome correto — este sobrevive.
    assert.equal(closeArgs[1][0], null);
    assert.equal(closeArgs[1][1].outcome, 'conflict');
    assert.equal(closeArgs[1][1].userId, OWNER);
    assert.ok(
      harness.order.lastIndexOf('closeChannelVerification') > harness.order.indexOf('tx:rollback'),
      `o refechamento tem de vir depois do rollback: ${harness.order.join(' → ')}`
    );
  });

  it('CONTROLE: com transferência permitida e claim aceito, a posse TRANSFERE e o desafio fecha como `verified`', async () => {
    setConfigOverride('channelLinkAllowTransfer', true);
    const harness = createHarness(
      happyConfirmImpls({
        findConversationChannelLinkForUpdate: async () => linkRecord({ userId: OTHER_USER }),
        claimConversationChannelLink: async () => linkRecord({ userId: OWNER })
      })
    );

    const result = await confirmChannelLinkService(OWNER, CHALLENGE_ID, { code: CODE }, 'corr_transfer');

    assert.equal(result.transferred, true);
    assert.ok(harness.order.includes('tx:commit'));
    const [claimArgs] = harness.argsOf('claimConversationChannelLink');
    assert.equal(claimArgs[1].userId, OWNER);
    assert.equal(claimArgs[1].allowTransfer, true);
    // O dono anterior é identificado só na TRILHA, nunca na resposta.
    const reassigned = harness.audits.find((entry) => entry.actionType === 'channel_link.reassigned');
    assert.ok(reassigned, 'transferência sem trilha de reatribuição');
    assert.equal(reassigned.targetUserId, OTHER_USER);
    assert.ok(!JSON.stringify(result).includes(OTHER_USER), 'a resposta não pode identificar o dono anterior');
  });
});

// ---------------------------------------------------------------------------------------------
// 7b. Serialização por usuário: o advisory lock é o PRIMEIRO passo do bloco transacional
// ---------------------------------------------------------------------------------------------

describe('advisory lock — ordem de aquisição dentro da transação', () => {
  /**
   * Apagar `lockChannelLinkUserScope` da transação não fazia NENHUM teste falhar, e reabre o TOCTOU
   * do teto de vínculos: com o número ainda inexistente o `for update` do passo (1) não trava nada, e
   * duas confirmações concorrentes de telefones DIFERENTES leem o mesmo `count` e gravam as duas.
   *
   * A ORDEM também é a guarda: advisory (usuário) → linha (telefone), sempre. Inverter abre ciclo de
   * deadlock entre duas confirmações cruzadas — e um deadlock só aparece sob concorrência real, ou
   * seja, em produção.
   */
  function assertLockIsFirstInTransaction(order, nextStep) {
    const beginAt = order.indexOf('tx:begin');
    assert.ok(beginAt >= 0, 'a transação nem chegou a abrir');
    const lockAt = order.indexOf('lockChannelLinkUserScope');
    assert.ok(lockAt >= 0, `o advisory lock nunca foi adquirido: ${order.join(' → ')}`);
    assert.equal(
      order[beginAt + 1],
      'lockChannelLinkUserScope',
      `o primeiro passo dentro da transação tem de ser o advisory lock; foi ${order[beginAt + 1]}`
    );
    const nextAt = order.indexOf(nextStep);
    assert.ok(nextAt >= 0, `${nextStep} não aconteceu — o caso não chegou onde deveria`);
    assert.ok(lockAt < nextAt, `advisory (${lockAt}) antes da linha/escrita (${nextAt}): ${order.join(' → ')}`);
  }

  it('confirm: lock ANTES do `for update` da linha do telefone, e exatamente uma vez', async () => {
    const harness = createHarness(happyConfirmImpls());

    await confirmChannelLinkService(OWNER, CHALLENGE_ID, { code: CODE });

    assertLockIsFirstInTransaction(harness.order, 'findConversationChannelLinkForUpdate');
    assert.equal(harness.countOf('lockChannelLinkUserScope'), 1);
    const [lockArgs] = harness.argsOf('lockChannelLinkUserScope');
    assert.equal(lockArgs[0], FAKE_CLIENT, 'o lock é `_xact_`: fora da transação ele morreria no ato');
    assert.equal(lockArgs[1], OWNER, 'a chave do lock é o usuário — é o escopo que o teto de vínculos usa');
  });

  it('start: lock ANTES de fechar os vivos e de inserir o desafio novo', async () => {
    const fake = createFakeProvider();
    setWhatsAppProviderOverrideForTests(fake.provider);
    const harness = createHarness(happyStartImpls());

    await startChannelLinkService(OWNER, { phone: PHONE }, 'corr_lock_start');

    assertLockIsFirstInTransaction(harness.order, 'insertChannelVerification');
    assert.ok(
      harness.order.indexOf('lockChannelLinkUserScope') <
        harness.order.indexOf('closeLiveChannelVerificationsByUser'),
      `sem o lock, dois start concorrentes fecham os vivos um do outro: ${harness.order.join(' → ')}`
    );
    const [lockArgs] = harness.argsOf('lockChannelLinkUserScope');
    assert.equal(lockArgs[0], FAKE_CLIENT);
    assert.equal(lockArgs[1], OWNER);
  });
});

// ---------------------------------------------------------------------------------------------
// 7c. Os três fechamentos em massa — revogação de códigos que continuariam válidos
// ---------------------------------------------------------------------------------------------

describe('fechamentos em massa de desafios vivos', () => {
  /**
   * As três chamadas podiam ser apagadas, uma a uma, sem quebrar nenhum teste. O dano de cada uma:
   *  (a) confirm: os códigos que OUTRAS contas receberam para o número continuam válidos DEPOIS da
   *      troca de dono — e na fase 3 um `from` verificado É identidade;
   *  (b) remove: desvincular deixa código válido circulando, e a revogação imediata (aparelho
   *      roubado, chip devolvido) deixa de ser imediata;
   *  (c) start: vários desafios vivos ao mesmo tempo — a UI perde o `pendingChallenge` único e o
   *      índice único vivo passa a colidir.
   */
  it('(a) confirm: fecha como `superseded` os desafios das OUTRAS contas para o mesmo número', async () => {
    const harness = createHarness(happyConfirmImpls());

    await confirmChannelLinkService(OWNER, CHALLENGE_ID, { code: CODE });

    assert.equal(harness.countOf('closeLiveChannelVerificationsByPhoneExcept'), 1);
    const [args] = harness.argsOf('closeLiveChannelVerificationsByPhoneExcept');
    assert.equal(args[0], FAKE_CLIENT, 'a revogação tem de commitar junto com o vínculo');
    assert.deepEqual(args[1], {
      channelType: 'whatsapp',
      externalUserKey: PHONE,
      // O próprio vencedor é preservado — fechar o desafio dele aqui seria fechar o que acabou de
      // provar posse.
      exceptUserId: OWNER,
      outcome: 'superseded'
    });
    // E acontece DEPOIS de o vínculo existir: revogar antes e falhar o claim deixaria todo mundo sem
    // código e sem vínculo.
    assert.ok(
      harness.order.indexOf('claimConversationChannelLink') <
        harness.order.indexOf('closeLiveChannelVerificationsByPhoneExcept')
    );
  });

  it('(b) remove: fecha como `cancelled` os vivos do usuário NAQUELE número, dentro da transação', async () => {
    const harness = createHarness({
      findConversationChannelLinkById: async () => linkRecord(),
      deleteConversationChannelLinkById: async () => linkRecord(),
      closeLiveChannelVerificationsByUser: async () => 0
    });

    await removeChannelLinkService(OWNER, LINK_ID, 'corr_remove_close');

    assert.equal(harness.countOf('closeLiveChannelVerificationsByUser'), 1);
    const [args] = harness.argsOf('closeLiveChannelVerificationsByUser');
    assert.equal(args[0], FAKE_CLIENT, 'fora da transação, o delete poderia commitar sem a revogação');
    assert.deepEqual(args[1], {
      userId: OWNER,
      channelType: 'whatsapp',
      externalUserKey: PHONE,
      outcome: 'cancelled'
    });
    assert.ok(
      harness.order.indexOf('deleteConversationChannelLinkById') <
        harness.order.indexOf('closeLiveChannelVerificationsByUser')
    );
  });

  it('(c) start: fecha como `superseded` TODOS os vivos do usuário antes de abrir o novo', async () => {
    const fake = createFakeProvider();
    setWhatsAppProviderOverrideForTests(fake.provider);
    const harness = createHarness(happyStartImpls());

    await startChannelLinkService(OWNER, { phone: PHONE }, 'corr_supersede');

    assert.equal(harness.countOf('closeLiveChannelVerificationsByUser'), 1);
    const [args] = harness.argsOf('closeLiveChannelVerificationsByUser');
    assert.equal(args[0], FAKE_CLIENT);
    // SEM `externalUserKey`: o fechamento é de TODOS os números do usuário, senão sobra um desafio
    // vivo para o número anterior e a UI passa a ter dois `pendingChallenge`.
    assert.deepEqual(args[1], { userId: OWNER, channelType: 'whatsapp', outcome: 'superseded' });
    assert.ok(
      harness.order.indexOf('closeLiveChannelVerificationsByUser') <
        harness.order.indexOf('insertChannelVerification')
    );
  });
});

// ---------------------------------------------------------------------------------------------
// 7d. O código vai para o banco como HASH — nunca em claro
// ---------------------------------------------------------------------------------------------

describe('start — o que é persistido é o hash scrypt, não o código', () => {
  it('o `codeHash` do insert é scrypt salgado, casa com o código DESPACHADO e não o contém', async () => {
    // O double já recebia `input.codeHash` e não afirmava NADA sobre ele: trocar
    // `hashPassword(code)` por `code` deixava a suíte inteira verde enquanto um dump da tabela
    // entregava todos os OTPs vivos em texto puro.
    const fake = createFakeProvider();
    setWhatsAppProviderOverrideForTests(fake.provider);
    const harness = createHarness(happyStartImpls());

    await startChannelLinkService(OWNER, { phone: PHONE }, 'corr_hash');

    const [insertArgs] = harness.argsOf('insertChannelVerification');
    const { codeHash } = insertArgs[1];
    assert.equal(fake.calls.sendTemplate.length, 1, 'sem despacho não há código para comparar');
    const dispatchedCode = fake.calls.sendTemplate[0].variables[0];

    assert.equal(typeof codeHash, 'string');
    assert.ok(codeHash.startsWith('scrypt_v1$'), `o código não foi hasheado: ${codeHash}`);
    assert.notEqual(codeHash, dispatchedCode);
    assert.ok(!codeHash.includes(dispatchedCode), 'o código em claro está DENTRO do valor persistido');
    // E é o hash do código que REALMENTE saiu: guardar o hash de outro código deixaria o desafio
    // impossível de confirmar (falha silenciosa, só visível para o usuário).
    assert.equal(verifyPassword(dispatchedCode, codeHash), true);
    // Nenhum campo do insert carrega o código — `metadata` guarda o que o usuário digitou no campo
    // do TELEFONE, e nada mais.
    assert.ok(
      !JSON.stringify(insertArgs[1].metadata || {}).includes(dispatchedCode),
      'o código vazou para o metadata do desafio'
    );
  });
});

// ---------------------------------------------------------------------------------------------
// 7e. Teto de vínculos no CONFIRM — recusa depois da posse provada deixa rastro (correção A5)
// ---------------------------------------------------------------------------------------------

describe('confirm — teto de vínculos', () => {
  it('recusa com MAX_LINKS_REACHED, AUDITA a negativa e NÃO fecha o desafio', async () => {
    setConfigOverride('channelLinkMaxPerUser', 3);
    // `closeChannelVerification` fica INTENCIONALMENTE fora das impls: o harness lança em chamada não
    // declarada, então este caso prova por construção que o desafio não é queimado aqui.
    const harness = createHarness({
      consumeChannelVerificationAttempt: async () => challengeRecord(),
      lockChannelLinkUserScope: async () => undefined,
      findConversationChannelLinkForUpdate: async () => null,
      countConversationChannelLinksByUser: async () => 3
    });

    const error = await captureRejection(
      confirmChannelLinkService(OWNER, CHALLENGE_ID, { code: CODE }, 'corr_max_links')
    );

    assert.equal(error.code, 'CHANNEL_LINK_MAX_LINKS_REACHED');
    assert.equal(error.status, 409);

    // Este era o ÚNICO caminho de recusa do fluxo sem trilha: uma conta comprometida provava posse de
    // N números seguidos sem produzir um único evento.
    const denied = harness.audits.filter((entry) => entry.actionStatus === 'denied');
    assert.equal(denied.length, 1, `esperava exatamente uma negativa auditada: ${JSON.stringify(harness.audits)}`);
    assert.equal(denied[0].actionType, 'channel_link.failed');
    assert.equal(denied[0].reason, 'max_links_reached');
    assert.equal(denied[0].actorUserId, OWNER);
    assert.equal(denied[0].correlationId, 'corr_max_links');
    assert.equal(denied[0].metadata.phoneMasked, PHONE_MASKED);
    assert.equal(denied[0].metadata.verificationId, CHALLENGE_ID);
    assert.equal(denied[0].metadata.maxLinksPerUser, 3);

    // A trilha sobrevive porque a recusa é SINALIZADA por retorno e o throw acontece FORA: lançar
    // dentro de `withTransaction` reverteria a própria auditoria.
    assert.ok(harness.order.includes('tx:commit'), 'a recusa é sinalizada por retorno, não por throw');
    assert.ok(
      harness.order.indexOf('insertAccessAdminAudit') > harness.order.indexOf('tx:commit'),
      `a auditoria tem de rodar fora da transação: ${harness.order.join(' → ')}`
    );

    // Nada foi gravado, e o desafio segue VIVO de propósito — o usuário remove um número e confirma o
    // MESMO código em seguida.
    assert.equal(harness.countOf('claimConversationChannelLink'), 0);
    assert.equal(harness.countOf('closeChannelVerification'), 0, 'o código não pode ser queimado nesta recusa');
  });

  it('CONTROLE: re-verificar um número que JÁ é seu não conta contra o teto', async () => {
    // Sem este contraste, mover a checagem para fora do `if (!alreadyMine)` (ou trocar `>=` por `>`)
    // passaria despercebido: o caso acima sozinho não distingue as duas coisas.
    setConfigOverride('channelLinkMaxPerUser', 3);
    const harness = createHarness(
      happyConfirmImpls({
        findConversationChannelLinkForUpdate: async () => linkRecord({ userId: OWNER }),
        countConversationChannelLinksByUser: async () => {
          throw new Error('o teto não pode ser consultado quando o número já é do próprio usuário');
        }
      })
    );

    const result = await confirmChannelLinkService(OWNER, CHALLENGE_ID, { code: CODE });

    assert.equal(result.transferred, false);
    assert.equal(harness.countOf('countConversationChannelLinksByUser'), 0);
    assert.equal(harness.countOf('claimConversationChannelLink'), 1);
  });
});

// ---------------------------------------------------------------------------------------------
// 8. Escudo da vítima (correção C2)
// ---------------------------------------------------------------------------------------------

describe('start — escudo da vítima', () => {
  it('o dono JÁ VERIFICADO do número pula o escudo (ele é quem o escudo protege)', async () => {
    const fake = createFakeProvider();
    setWhatsAppProviderOverrideForTests(fake.provider);

    const harness = createHarness(
      happyStartImpls({
        listConversationChannelLinksByUser: async () => [
          linkRecord({ userId: OWNER, externalUserKey: PHONE, verificationStatus: 'verified' })
        ],
        countDistinctChallengersForPhone: async () => {
          throw new Error('o escudo não deveria consultar o contador para o dono já verificado');
        }
      })
    );

    const dto = await startChannelLinkService(OWNER, { phone: PHONE }, 'corr_own');

    // Chegou ao fim: sem isto o "não consultou" seria verdade por ter falhado antes.
    assert.equal(fake.calls.sendTemplate.length, 1);
    assert.equal(dto.phoneMasked, PHONE_MASKED);
    assert.equal(harness.countOf('countDistinctChallengersForPhone'), 0);
  });

  it('o limiar conta só TERCEIROS e dispara ACIMA do configurado — N passa, N+1 tranca', async () => {
    const fake = createFakeProvider();
    setWhatsAppProviderOverrideForTests(fake.provider);
    setConfigOverride('channelLinkVictimShieldDistinctUsers', 3);

    // Exatamente no limiar: passa.
    const allowed = createHarness(happyStartImpls({ countDistinctChallengersForPhone: async () => 3 }));
    const dto = await startChannelLinkService(OWNER, { phone: PHONE }, 'corr_shield_ok');
    assert.equal(dto.phoneMasked, PHONE_MASKED);
    assert.equal(fake.calls.sendTemplate.length, 1);

    // O próprio solicitante NUNCA entra na conta — é o `user_id <> $4`.
    const [countArgs] = allowed.argsOf('countDistinctChallengersForPhone');
    assert.equal(countArgs[1].exceptUserId, OWNER);
    assert.equal(countArgs[1].externalUserKey, PHONE);
    assert.ok(
      Number.isFinite(countArgs[1].windowHours) && countArgs[1].windowHours > 0,
      `windowHours precisa ser número finito (NaN vira erro de SQL no make_interval): ${countArgs[1].windowHours}`
    );

    // Um a mais: tranca.
    const blocked = createHarness(happyStartImpls({ countDistinctChallengersForPhone: async () => 4 }));
    const error = await captureRejection(startChannelLinkService(OWNER, { phone: PHONE }, 'corr_shield_block'));

    assert.equal(error.status, 429);
    // Genérico DE PROPÓSITO: um código específico ("número já usado", "bloqueado pelo dono") viraria
    // oráculo de titularidade — quem pede o código descobriria de graça se o número é de alguém.
    assert.equal(error.code, 'CHANNEL_LINK_RATE_LIMITED');
    assert.ok(
      !/vinculad|outra conta|pertence|já existe|dono/i.test(error.message),
      `a mensagem revela titularidade: ${error.message}`
    );
    assert.equal(blocked.countOf('insertChannelVerification'), 0, 'nada é criado quando o escudo tranca');
    assert.equal(fake.calls.sendTemplate.length, 1, 'nenhuma mensagem paga a mais foi despachada');
  });
});

// ---------------------------------------------------------------------------------------------
// 8b. Limitador de TELEFONE — o balde que está LIGADO ao service (correção A1)
// ---------------------------------------------------------------------------------------------

describe('start — limitador de telefone (o balde real do módulo)', () => {
  /**
   * A suíte anterior construía um `createRateLimiter(6, …)` PRÓPRIO e exercitava a biblioteca —
   * neutralizar a checagem dentro do `start` não fazia nenhum teste falhar. Estes casos chamam
   * `startChannelLinkService` de verdade, então quem responde é o `DISPATCH_PHONE_RATE_LIMIT` do
   * módulo. O `beforeEach` global zera o balde entre casos (`resetChannelLinkDispatchLimiterForTests`).
   */
  function ownedLinksImpl(ownerStatus) {
    // O double só FORNECE o dado (o dono tem, ou não tem, vínculo verificado neste número). Quem
    // decide pular o balde é o service — a guarda continua sendo do código, não do teste.
    return async (_client, userId) =>
      (userId === OWNER && ownerStatus
        ? [linkRecord({ userId: OWNER, externalUserKey: PHONE, verificationStatus: ownerStatus })]
        : []);
  }

  it('o 7º despacho para o MESMO número leva 429 CHANNEL_LINK_RATE_LIMITED — e outro número segue livre', async () => {
    const fake = createFakeProvider();
    setWhatsAppProviderOverrideForTests(fake.provider);
    const harness = createHarness(happyStartImpls());

    for (let index = 0; index < 6; index += 1) {
      const dto = await startChannelLinkService(OWNER, { phone: PHONE }, `corr_${index}`);
      assert.equal(dto.phoneMasked, PHONE_MASKED, `despacho ${index + 1} deveria passar`);
    }

    const error = await captureRejection(startChannelLinkService(OWNER, { phone: PHONE }, 'corr_7'));
    assert.equal(error.status, 429);
    assert.equal(error.code, 'CHANNEL_LINK_RATE_LIMITED');
    assert.ok(error.errors.retryAfterSeconds > 0 && error.errors.retryAfterSeconds <= 3600);

    // Chegou a acontecer 6 vezes e parou na 7ª — o corte é do balde, não de uma falha anterior.
    assert.equal(fake.calls.sendTemplate.length, 6);
    assert.equal(harness.countOf('insertChannelVerification'), 6);

    // A chave é por telefone: trancar um número não pode trancar a plataforma inteira. A prova é o
    // DESTINO do 7º despacho (o DTO devolvido vem do fixture do harness e não distingue número).
    await startChannelLinkService(OWNER, { phone: '5511911112222' }, 'corr_other');
    assert.equal(fake.calls.sendTemplate.length, 7);
    assert.equal(fake.calls.sendTemplate[6].to, '5511911112222');
  });

  it('o balde ENVENENADO por um atacante não tranca o dono JÁ VERIFICADO do número (DoS de vinculação)', async () => {
    const fake = createFakeProvider();
    setWhatsAppProviderOverrideForTests(fake.provider);
    createHarness(happyStartImpls({ listConversationChannelLinksByUser: ownedLinksImpl('verified') }));

    // UMA conta de atacante gasta os 6 hits do balde deste telefone.
    for (let index = 0; index < 6; index += 1) {
      await startChannelLinkService(OTHER_USER, { phone: PHONE }, `corr_attack_${index}`);
    }
    const attackerBlocked = await captureRejection(
      startChannelLinkService(OTHER_USER, { phone: PHONE }, 'corr_attack_7')
    );
    assert.equal(attackerBlocked.code, 'CHANNEL_LINK_RATE_LIMITED', 'o atacante PRECISA ser contido');

    // O dono verificado do número passa mesmo com o balde estourado: cobrar dele um escudo que existe
    // para PROTEGÊ-LO transformava o escudo em arma — 429 por uma hora, em janela renovável, ao custo
    // de uma conta descartável. Quem contém o atacante é o teto por USUÁRIO (8/h, na rota).
    const dto = await startChannelLinkService(OWNER, { phone: PHONE }, 'corr_owner');
    assert.equal(dto.phoneMasked, PHONE_MASKED);
    assert.equal(fake.calls.sendTemplate.length, 7, 'o dono chegou até o despacho');
  });

  it('CONTROLE: o bypass é SÓ do dono verificado — vínculo `pending` no mesmo número continua barrado', async () => {
    // Sem este contraste, `if (true)` no lugar de `if (!isOwnVerifiedNumber)` (bypass incondicional,
    // que desliga o escudo para todo mundo) passaria pelo caso acima.
    const fake = createFakeProvider();
    setWhatsAppProviderOverrideForTests(fake.provider);
    createHarness(happyStartImpls({ listConversationChannelLinksByUser: ownedLinksImpl('pending') }));

    for (let index = 0; index < 6; index += 1) {
      await startChannelLinkService(OTHER_USER, { phone: PHONE }, `corr_attack_${index}`);
    }

    const error = await captureRejection(startChannelLinkService(OWNER, { phone: PHONE }, 'corr_pending'));
    assert.equal(error.status, 429);
    assert.equal(error.code, 'CHANNEL_LINK_RATE_LIMITED');
    assert.equal(fake.calls.sendTemplate.length, 6, 'nenhum despacho a mais para o dono não verificado');
  });

  it('a titularidade é resolvida ANTES de qualquer balde — é a primeira ida ao banco do start', async () => {
    // A ordem é a correção inteira: consultar o vínculo DEPOIS de cobrar o balde deixaria o dono
    // trancado antes de o service saber que é ele.
    const fake = createFakeProvider();
    setWhatsAppProviderOverrideForTests(fake.provider);
    const harness = createHarness(happyStartImpls());

    await startChannelLinkService(OWNER, { phone: PHONE }, 'corr_order');

    assert.equal(
      harness.order[0],
      'listConversationChannelLinksByUser',
      `a resolução de titularidade tem de ser a primeira consulta; foi ${harness.order[0]}`
    );
    assert.ok(
      harness.order.indexOf('listConversationChannelLinksByUser') <
        harness.order.indexOf('countDistinctChallengersForPhone'),
      `titularidade antes do escudo da vítima: ${harness.order.join(' → ')}`
    );
    const [linkArgs] = harness.argsOf('listConversationChannelLinksByUser');
    assert.equal(linkArgs[1], OWNER, 'a consulta é do PRÓPRIO autenticado — não é oráculo de enumeração');
  });
});

// ---------------------------------------------------------------------------------------------
// 9. Reenvio com palpites esgotados (correção C4)
// ---------------------------------------------------------------------------------------------

describe('resend — palpites esgotados', () => {
  it('NÃO despacha mensagem, fecha com `exhausted` e devolve ATTEMPTS_EXCEEDED', async () => {
    const fake = createFakeProvider();
    setWhatsAppProviderOverrideForTests(fake.provider);

    const harness = createHarness({
      findLiveChannelVerificationById: async () =>
        challengeRecord({ attemptCount: 5, maxAttempts: 5, sendCount: 1, maxSends: 3 }),
      closeChannelVerification: async () => challengeRecord({ outcome: 'exhausted' })
    });

    const error = await captureRejection(resendChannelLinkChallengeService(OWNER, CHALLENGE_ID, 'corr_resend'));

    assert.equal(error.code, 'CHANNEL_LINK_ATTEMPTS_EXCEEDED');
    assert.equal(error.status, 429);
    assert.equal(error.errors.attemptsRemaining, 0);

    // O ponto do C4: reenviar aqui gastaria mensagem PAGA por um código que o consume já recusaria
    // (`attempt_count < max_attempts`).
    assert.equal(fake.calls.sendTemplate.length, 0, 'mensagem paga despachada para um código inconfirmável');
    assert.equal(fake.calls.sendText.length, 0);
    assert.equal(harness.countOf('rotateChannelVerificationCode'), 0, 'não pode nem rotacionar/renovar o TTL');

    const [closeArgs] = harness.argsOf('closeChannelVerification');
    assert.equal(closeArgs[1].outcome, 'exhausted');
  });

  it('CONTROLE: com palpites sobrando o mesmo desafio reenvia normalmente', async () => {
    const fake = createFakeProvider();
    setWhatsAppProviderOverrideForTests(fake.provider);

    createHarness({
      findLiveChannelVerificationById: async () => challengeRecord({ attemptCount: 4, maxAttempts: 5 }),
      rotateChannelVerificationCode: async (_client, input) =>
        challengeRecord({ codeHash: input.codeHash, attemptCount: 4, sendCount: 2 }),
      markChannelVerificationDelivery: async () => challengeRecord({ attemptCount: 4, sendCount: 2 })
    });

    const dto = await resendChannelLinkChallengeService(OWNER, CHALLENGE_ID, 'corr_ok');

    assert.equal(fake.calls.sendTemplate.length, 1);
    assert.equal(dto.attemptsRemaining, 1);
  });
});

// ---------------------------------------------------------------------------------------------
// 10. Falha de entrega
// ---------------------------------------------------------------------------------------------

describe('start — falha de entrega', () => {
  it('falha do provedor fecha o desafio com `send_failed` e devolve 502 com correlationId', async () => {
    const fake = createFakeProvider({
      sendTemplate: () => {
        throw new Error('63016 failed to send message');
      }
    });
    setWhatsAppProviderOverrideForTests(fake.provider);

    const harness = createHarness(
      happyStartImpls({
        markChannelVerificationDelivery: async () => challengeRecord({ deliveryStatus: 'failed' }),
        closeChannelVerification: async () => challengeRecord({ outcome: 'send_failed' })
      })
    );

    const error = await captureRejection(startChannelLinkService(OWNER, { phone: PHONE }, 'corr_delivery'));

    assert.equal(error.status, 502);
    assert.equal(error.code, 'CHANNEL_LINK_DELIVERY_FAILED');
    assert.equal(error.errors.correlationId, 'corr_delivery');

    const [markArgs] = harness.argsOf('markChannelVerificationDelivery');
    assert.equal(markArgs[1].deliveryStatus, 'failed');
    assert.match(markArgs[1].deliveryError, /63016/);

    // Sem fechar, o índice único vivo ficaria ocupado por um código que ninguém recebeu e o usuário
    // travaria até o TTL vencer, sem entender por quê.
    const [closeArgs] = harness.argsOf('closeChannelVerification');
    assert.equal(closeArgs[1].outcome, 'send_failed');
  });

  it('canal desligado continua 503 WHATSAPP_CHANNEL_DISABLED — nunca colapsa em 502', async () => {
    setWhatsAppProviderOverrideForTests(null);
    setConfigOverride('whatsappProvider', 'disabled');

    const harness = createHarness(
      happyStartImpls({
        markChannelVerificationDelivery: async () => challengeRecord({ deliveryStatus: 'failed' }),
        closeChannelVerification: async () => challengeRecord({ outcome: 'send_failed' })
      })
    );

    const error = await captureRejection(startChannelLinkService(OWNER, { phone: PHONE }, 'corr_disabled'));

    // Colapsar em 502 diria ao operador "o WhatsApp está instável, tente de novo" quando o problema é
    // configuração — e a tela repetiria a tentativa para sempre.
    assert.equal(error.code, 'WHATSAPP_CHANNEL_DISABLED');
    assert.equal(error.status, 503);
    // Pelo CÓDIGO, não pelo status: `notEqual(status, 502)` depois de `equal(status, 503)` não tem
    // mutação que o faça falhar sozinho.
    assert.notEqual(error.code, 'CHANNEL_LINK_DELIVERY_FAILED');
    // Mesmo assim o desafio órfão é limpo.
    const [closeArgs] = harness.argsOf('closeChannelVerification');
    assert.equal(closeArgs[1].outcome, 'send_failed');
  });
});

// ---------------------------------------------------------------------------------------------
// 11. Ramos que falham ANTES de tocar o banco
// ---------------------------------------------------------------------------------------------

describe('validação barata — nada toca a persistência', () => {
  /** Harness sem NENHUMA impl: qualquer ida à persistência estoura o teste. */
  function strictHarness() {
    return createHarness();
  }

  it('código malformado no confirm devolve CODE_MALFORMED 400 e não consome tentativa', async () => {
    const malformed = ['12345', '1234567', '12 3456', '12345a', 123456, null, undefined, {}, ['123456']];

    for (const code of malformed) {
      const harness = strictHarness();
      const error = await captureRejection(confirmChannelLinkService(OWNER, CHALLENGE_ID, { code }));
      assert.equal(error.code, 'CHANNEL_LINK_CODE_MALFORMED', `entrada ${JSON.stringify(code)} deveria ser malformada`);
      assert.equal(error.status, 400);
      assert.equal(harness.calls.length, 0, `entrada ${JSON.stringify(code)} tocou a persistência: ${harness.order.join(', ')}`);
    }
  });

  it('espaço nas BORDAS é aparado de propósito (colar do WhatsApp) e segue para o consume', async () => {
    // Documenta a diferença deliberada: ' 123456 ' é o mesmo código; '12 3456' não é.
    const harness = createHarness({ consumeChannelVerificationAttempt: async () => null, findChannelVerificationById: async () => null });

    const error = await captureRejection(confirmChannelLinkService(OWNER, CHALLENGE_ID, { code: `  ${CODE}  ` }));

    assert.equal(error.code, 'CHANNEL_LINK_CODE_INVALID');
    assert.equal(harness.countOf('consumeChannelVerificationAttempt'), 1);
  });

  it('identificador vazio devolve 404 antes de qualquer consulta', async () => {
    for (const [label, run] of [
      ['confirm', () => confirmChannelLinkService(OWNER, '   ', { code: CODE })],
      ['resend', () => resendChannelLinkChallengeService(OWNER, '')],
      ['cancel', () => cancelChannelLinkChallengeService(OWNER, '  ')]
    ]) {
      const harness = strictHarness();
      const error = await captureRejection(run());
      assert.equal(error.status, 404, `${label} deveria ser 404`);
      assert.equal(error.code, 'CHANNEL_LINK_CHALLENGE_NOT_FOUND', `${label} com código errado`);
      assert.equal(harness.calls.length, 0, `${label} tocou a persistência`);
    }

    const harness = strictHarness();
    const error = await captureRejection(removeChannelLinkService(OWNER, ''));
    assert.equal(error.status, 404);
    assert.equal(error.code, 'CHANNEL_LINK_NOT_FOUND');
    assert.equal(harness.calls.length, 0);
  });

  it('canal não suportado e telefone inválido falham antes da persistência', async () => {
    const unsupported = strictHarness();
    const listError = await captureRejection(listChannelLinksService(OWNER, { channelType: 'telegram' }));
    assert.equal(listError.code, 'CHANNEL_LINK_CHANNEL_UNSUPPORTED');
    assert.equal(listError.status, 400);
    assert.equal(unsupported.calls.length, 0);

    const badChannel = strictHarness();
    const startChannelError = await captureRejection(
      startChannelLinkService(OWNER, { channelType: 'sms', phone: PHONE })
    );
    assert.equal(startChannelError.code, 'CHANNEL_LINK_CHANNEL_UNSUPPORTED');
    assert.equal(badChannel.calls.length, 0);

    const badPhone = strictHarness();
    const phoneError = await captureRejection(startChannelLinkService(OWNER, { phone: '1' }));
    assert.equal(phoneError.code, 'CHANNEL_LINK_PHONE_INVALID');
    assert.equal(phoneError.status, 400);
    assert.equal(badPhone.calls.length, 0, 'telefone inválido não pode nem consumir cota do limitador de banco');
  });
});

// ---------------------------------------------------------------------------------------------
// 12. Auditoria nunca carrega telefone em claro
// ---------------------------------------------------------------------------------------------

describe('auditoria — telefone só mascarado, código nunca', () => {
  /**
   * Confere TODA a entrada de auditoria (não só o `metadata`): `reason` e `correlationId` também são
   * campos livres. Exige pelo menos uma entrada — senão o caso passaria por não ter auditado nada.
   */
  function assertAuditsClean(audits, extraForbidden = []) {
    assert.ok(audits.length > 0, 'o cenário não gravou auditoria nenhuma — a asserção seria vazia');
    for (const entry of audits) {
      const json = JSON.stringify(entry);
      assert.ok(!json.includes(PHONE), `telefone em claro na auditoria ${entry.actionType}: ${json}`);
      // O miolo do número também não pode escapar por outro campo.
      assert.ok(!json.includes('98765'), `miolo do telefone vazou em ${entry.actionType}: ${json}`);
      assert.ok(json.includes(PHONE_MASKED), `auditoria ${entry.actionType} sem o telefone mascarado: ${json}`);
      for (const forbidden of extraForbidden) {
        assert.ok(!json.includes(forbidden), `valor proibido "${forbidden}" na auditoria ${entry.actionType}: ${json}`);
      }
    }
  }

  it('start bem-sucedido: mascarado, e o código despachado não aparece', async () => {
    const fake = createFakeProvider();
    setWhatsAppProviderOverrideForTests(fake.provider);
    const harness = createHarness(happyStartImpls());

    await startChannelLinkService(OWNER, { phone: PHONE }, 'corr_audit_start');

    const dispatchedCode = fake.calls.sendTemplate[0].variables[0];
    assertAuditsClean(harness.audits, [dispatchedCode]);
    assert.ok(harness.audits.some((entry) => entry.actionType === 'channel_link.started'));
  });

  it('falha de entrega: o eco do destinatário na mensagem do provedor é REDIGIDO antes de virar trilha', async () => {
    // O Twilio devolve literalmente `The 'To' number +5511987654321 is not a valid phone number`. Sem
    // redação, o ÚNICO lugar que carrega o telefone em claro na trilha é justamente o caminho de erro.
    const fake = createFakeProvider({
      sendTemplate: () => {
        throw new Error(`The 'To' number +${PHONE} is not a valid phone number`);
      }
    });
    setWhatsAppProviderOverrideForTests(fake.provider);

    const harness = createHarness(
      happyStartImpls({
        markChannelVerificationDelivery: async () => challengeRecord({ deliveryStatus: 'failed' }),
        closeChannelVerification: async () => challengeRecord({ outcome: 'send_failed' })
      })
    );

    await captureRejection(startChannelLinkService(OWNER, { phone: PHONE }, 'corr_audit_fail'));

    assertAuditsClean(harness.audits);
    // E a mesma string vai para a coluna `delivery_error`, lida pelo suporte.
    const [markArgs] = harness.argsOf('markChannelVerificationDelivery');
    assert.ok(!markArgs[1].deliveryError.includes(PHONE), `delivery_error com telefone em claro: ${markArgs[1].deliveryError}`);
    assert.ok(markArgs[1].deliveryError.includes('4321'), 'os 4 últimos dígitos são úteis ao suporte e devem sobreviver');
  });

  it('confirm com transferência: as duas entradas saem mascaradas', async () => {
    setConfigOverride('channelLinkAllowTransfer', true);
    const harness = createHarness(
      happyConfirmImpls({
        findConversationChannelLinkForUpdate: async () => linkRecord({ userId: OTHER_USER }),
        claimConversationChannelLink: async () => linkRecord({ userId: OWNER })
      })
    );

    await confirmChannelLinkService(OWNER, CHALLENGE_ID, { code: CODE }, 'corr_audit_confirm');

    assertAuditsClean(harness.audits, [CODE, CODE_HASH]);
    assert.equal(harness.audits.length, 2);
  });

  it('transferência bloqueada, reenvio esgotado, cancelamento e remoção: todos mascarados', async () => {
    setConfigOverride('channelLinkAllowTransfer', false);
    const blocked = createHarness(
      happyConfirmImpls({
        findConversationChannelLinkForUpdate: async () => linkRecord({ userId: OTHER_USER }),
        closeChannelVerification: async () => challengeRecord({ outcome: 'conflict' })
      })
    );
    await captureRejection(confirmChannelLinkService(OWNER, CHALLENGE_ID, { code: CODE }, 'corr_blocked'));
    assertAuditsClean(blocked.audits, [CODE]);

    const exhausted = createHarness({
      findLiveChannelVerificationById: async () => challengeRecord({ attemptCount: 5, maxAttempts: 5 }),
      closeChannelVerification: async () => challengeRecord({ outcome: 'exhausted' })
    });
    await captureRejection(resendChannelLinkChallengeService(OWNER, CHALLENGE_ID, 'corr_exhausted'));
    assertAuditsClean(exhausted.audits);

    const cancelled = createHarness({
      closeChannelVerification: async () => challengeRecord({ outcome: 'cancelled' })
    });
    await cancelChannelLinkChallengeService(OWNER, CHALLENGE_ID, { reason: 'digitei errado' }, 'corr_cancel');
    assertAuditsClean(cancelled.audits);

    const removed = createHarness({
      findConversationChannelLinkById: async () => linkRecord(),
      deleteConversationChannelLinkById: async () => linkRecord(),
      closeLiveChannelVerificationsByUser: async () => 0
    });
    await removeChannelLinkService(OWNER, LINK_ID, 'corr_remove');
    assertAuditsClean(removed.audits);
  });

  it('sanitizeDeliveryError redige qualquer sequência longa de dígitos, preservando os 4 últimos', () => {
    const sanitized = sanitizeDeliveryError(new Error(`recipient ${PHONE} rejected`));
    assert.ok(!sanitized.includes(PHONE));
    assert.ok(sanitized.includes('4321'));
    // Códigos curtos de provedor continuam legíveis — a redação não pode cegar o suporte.
    assert.equal(sanitizeDeliveryError(Object.assign(new Error('rejected'), { code: 63016 })), '63016: rejected');
  });

  it('o telefone FORMATADO também é redigido — e o controle negativo prova que quem redige é o número conhecido', () => {
    // O limiar genérico (`\d{7,}`) não enxerga `(11) 98765-4321`: as corridas têm 2, 5 e 4 dígitos.
    // Como aqui sabemos QUAL número foi despachado, a redação compara por sufixo em vez de adivinhar
    // formato.
    const formatted = [
      `The 'To' number (11) 98765-4321 is not a valid phone number`,
      `The 'To' number +55 11 98765-4321 is not a valid phone number`,
      'destino 55 (11) 98765.4321 recusado',
      'destino 11987654321 recusado',
      'destino 987654321 recusado'
    ];

    for (const message of formatted) {
      const sanitized = sanitizeDeliveryError(new Error(message), PHONE);
      assert.ok(!sanitized.includes('98765'), `miolo do telefone vazou: ${sanitized}`);
      assert.ok(sanitized.includes('4321'), `os 4 últimos dígitos somem e o suporte fica cego: ${sanitized}`);
    }

    // CONTROLE NEGATIVO: sem o número conhecido, o limiar genérico comprovadamente NÃO pega o
    // formatado. É o que prova que a camada nova é a que está redigindo — sem este caso, um
    // `redactKnownPhone` transformado em no-op continuaria passando por conta do limiar genérico.
    const withoutKnownKey = sanitizeDeliveryError(
      new Error(`The 'To' number (11) 98765-4321 is not a valid phone number`)
    );
    assert.ok(
      withoutKnownKey.includes('98765'),
      `o limiar genérico já pegava o formatado — o controle negativo perdeu o sentido: ${withoutKnownKey}`
    );

    // E a redação não pode ficar gulosa a ponto de comer o diagnóstico: código do provedor sobrevive.
    assert.equal(
      sanitizeDeliveryError(Object.assign(new Error('rejected'), { code: 63016 }), PHONE),
      '63016: rejected'
    );
  });

  it('o eco FORMATADO do provedor não chega à trilha nem à coluna `delivery_error`', () => {
    // Nível de fluxo (o unitário acima não prova a FIAÇÃO): é o `dispatchAndRecord` que precisa passar
    // `challenge.externalUserKey` como número conhecido. Sem esse argumento, o texto abaixo ia em
    // claro para a auditoria e para a coluna que o suporte lê.
    const fake = createFakeProvider({
      sendTemplate: () => {
        throw new Error(`The 'To' number (11) 98765-4321 is not a valid phone number`);
      }
    });
    setWhatsAppProviderOverrideForTests(fake.provider);

    const harness = createHarness(
      happyStartImpls({
        markChannelVerificationDelivery: async () => challengeRecord({ deliveryStatus: 'failed' }),
        closeChannelVerification: async () => challengeRecord({ outcome: 'send_failed' })
      })
    );

    return captureRejection(startChannelLinkService(OWNER, { phone: PHONE }, 'corr_formatted')).then(() => {
      assertAuditsClean(harness.audits);
      const [markArgs] = harness.argsOf('markChannelVerificationDelivery');
      assert.ok(
        !markArgs[1].deliveryError.includes('98765'),
        `delivery_error com o miolo do telefone: ${markArgs[1].deliveryError}`
      );
      assert.ok(markArgs[1].deliveryError.includes('4321'));
    });
  });
});

// ---------------------------------------------------------------------------------------------
// 13. Contrato de SQL — as guardas moram no texto do statement
// ---------------------------------------------------------------------------------------------

describe('contrato de SQL dos repositórios de vínculo', () => {
  /**
   * Por que o `where` é comparado INTEIRO, e não cláusula a cláusula.
   *
   * A versão anterior usava `includes()` por cláusula. Isso detecta DELEÇÃO e é cego para
   * NEUTRALIZAÇÃO: `and attempt_count < max_attempts or true` mantém o literal procurado, passa no
   * `includes`, e desliga a guarda. O mesmo vale para `and consumed_at is null or true` no close e
   * para ` or true` no predicado do `on conflict`. Como este arquivo é a ÚNICA cobertura de 6 das 10
   * guardas (as outras moram no banco, que não sobe aqui), o teste tinha de deixar de ser um
   * detector de ausência e passar a ser um congelamento: qualquer ADIÇÃO ao `where` quebra.
   *
   * O custo é assumido: mudar um `where` guardado obriga a mudar este arquivo no mesmo PR. É o ponto.
   */
  const VERIFICATION_REPO = new URL(
    '../../src/repositories/conversation-channel-verification-repo.ts',
    import.meta.url
  );
  const LINK_REPO = new URL('../../src/repositories/conversation-channel-link-repo.ts', import.meta.url);

  let verificationSource = '';
  let linkSource = '';

  before(() => {
    verificationSource = readFileSync(VERIFICATION_REPO, 'utf8');
    linkSource = readFileSync(LINK_REPO, 'utf8');
  });

  /** Corpo de uma função exportada: do cabeçalho até o próximo `export` de topo de arquivo. */
  function extractFunction(source, fnName) {
    const start = source.indexOf(`export async function ${fnName}(`);
    assert.ok(start >= 0, `função ${fnName} não existe mais no repositório`);
    const end = source.indexOf('\nexport ', start + 1);
    return (end === -1 ? source.slice(start) : source.slice(start, end)).replace(/\s+/g, ' ');
  }

  /**
   * Statement da função, normalizado: comentários fora, espaços colapsados, minúsculas. Os comentários
   * `//` do JavaScript são removidos ANTES de procurar a crase — o corpo de `insertChannelVerification`
   * começa com um comentário que contém crases e a busca ingênua pegaria o texto do comentário.
   */
  function extractSql(source, fnName) {
    const body = extractRawFunction(source, fnName).replace(/^[ \t]*\/\/.*$/gm, '');
    const open = body.indexOf('`');
    assert.ok(open >= 0, `${fnName} não tem statement SQL`);
    const close = body.indexOf('`', open + 1);
    assert.ok(close > open, `${fnName} tem crase desbalanceada`);
    const sql = body.slice(open + 1, close);
    // Interpolação em SQL é injeção: nenhum statement deste fluxo monta texto com `${}`.
    assert.ok(!sql.includes('${'), `${fnName} interpola valor no texto do SQL — use placeholder`);
    return normalizeSql(sql);
  }

  /** Cláusula `where` completa, do `where` até o primeiro terminador de statement. */
  function whereOf(source, fnName) {
    const sql = extractSql(source, fnName);
    const at = sql.indexOf(' where ');
    assert.ok(at >= 0, `${fnName} não tem cláusula where`);
    const rest = sql.slice(at + ' where '.length);
    let cut = rest.length;
    for (const terminator of [' returning ', ' order by ', ' limit ', ' for update']) {
      const found = rest.indexOf(terminator);
      if (found >= 0 && found < cut) cut = found;
    }
    return rest.slice(0, cut).trim();
  }

  function assertWhere(source, fnName, expected) {
    assert.equal(
      whereOf(source, fnName),
      expected,
      `o \`where\` de ${fnName} mudou. Qualquer ADIÇÃO (inclusive um \` or true\`) neutraliza uma ` +
        'guarda que só existe aqui — reveja a mudança antes de atualizar esta expectativa'
    );
  }

  function assertClauses(source, fnName, clauses) {
    const body = extractFunction(source, fnName);
    for (const clause of clauses) {
      assert.ok(
        body.includes(clause),
        `${fnName} perdeu a cláusula obrigatória \`${clause}\` — a guarda deixou de existir no banco`
      );
    }
  }

  function assertAbsent(source, fnName, forbidden) {
    const body = extractFunction(source, fnName);
    for (const clause of forbidden) {
      assert.ok(!body.includes(clause), `${fnName} passou a mexer em \`${clause}\``);
    }
  }

  it('CONTROLE NEGATIVO: o congelamento acusa DELEÇÃO **e** NEUTRALIZAÇÃO da cláusula', () => {
    // Sem este caso não há prova de que o verificador enxerga: um typo no nome da função ou uma
    // expectativa escrita errada faria todos os casos abaixo passarem sem verificar nada.
    const deleted = verificationSource.replace('and attempt_count < max_attempts', 'and true');
    assert.notEqual(deleted, verificationSource, 'a cláusula alvo do controle mudou de forma — ajuste o controle');
    assert.throws(
      () => assertWhere(deleted, 'consumeChannelVerificationAttempt', WHERE.consumeChannelVerificationAttempt),
      /o `where` de consumeChannelVerificationAttempt mudou/
    );

    // A mutação que o `includes` por cláusula NÃO pegava: o literal continua lá, e a guarda morreu.
    const neutralized = verificationSource.replace(
      'and attempt_count < max_attempts',
      'and attempt_count < max_attempts or true'
    );
    assert.notEqual(neutralized, verificationSource);
    assert.doesNotThrow(
      () => assertClauses(neutralized, 'consumeChannelVerificationAttempt', ['and attempt_count < max_attempts']),
      'o `includes` por cláusula deveria ser cego a isto — é a razão de existir do congelamento'
    );
    assert.throws(
      () => assertWhere(neutralized, 'consumeChannelVerificationAttempt', WHERE.consumeChannelVerificationAttempt),
      /o `where` de consumeChannelVerificationAttempt mudou/
    );

    assert.throws(() => extractFunction(verificationSource, 'funcaoQueNaoExiste'), /não existe mais/);
  });

  /**
   * O `where` de cada statement guardado, LITERAL. Cada linha é uma guarda que não tem outra
   * cobertura possível sem Postgres — o comentário diz o que se perde ao afrouxá-la.
   */
  const WHERE = {
    // Cobra a tentativa e filtra tudo no MESMO statement: `expires_at`/`attempt_count` avaliados aqui
    // (e não em JS depois de ler a linha) é o que fecha o TOCTOU do contador de OTP.
    consumeChannelVerificationAttempt:
      'id = $1 and user_id = $2 and consumed_at is null and expires_at > now() and attempt_count < max_attempts',
    // `consumed_at is null` é o portão de corrida do confirm: quem devolve linha ganhou.
    closeChannelVerification: 'id = $1 and ($2::text is null or user_id = $2) and consumed_at is null',
    // Sem `send_count < max_sends`, o reenvio vira torneira aberta de mensagem paga.
    rotateChannelVerificationCode: 'id = $1 and user_id = $2 and consumed_at is null and send_count < max_sends',
    findChannelVerificationById: 'id = $1 and user_id = $2',
    findLiveChannelVerificationById: 'id = $1 and user_id = $2 and consumed_at is null',
    findLiveChannelVerificationByUser:
      'user_id = $1 and channel_type = $2 and consumed_at is null and expires_at > now() and ($3::text is null or external_user_key = $3)',
    closeLiveChannelVerificationsByUser:
      'user_id = $1 and channel_type = $2 and consumed_at is null and ($4::text is null or external_user_key = $4) and ($5::text is null or id <> $5)',
    // `user_id <> $3`: fechar TODOS incluiria o desafio de quem acabou de provar posse.
    closeLiveChannelVerificationsByPhoneExcept:
      'channel_type = $1 and external_user_key = $2 and user_id <> $3 and consumed_at is null',
    // As três exclusões são o que impede o escudo de trancar a própria vítima. `send_failed` é o único
    // outcome terminal em que NENHUMA mensagem chegou ao aparelho; `cancelled` NÃO entra (o start já
    // despachou antes do cancelamento — excluí-lo seria um jeito barato de zerar o próprio rastro).
    countDistinctChallengersForPhone:
      "channel_type = $1 and external_user_key = $2 and created_at > now() - make_interval(hours => $3::int) and user_id <> $4 and (outcome is null or outcome <> 'verified') and (outcome is null or outcome <> 'send_failed')",
    // O predicado do `on conflict` é o cinto de segurança da POSSE: sem ele o upsert troca o dono de
    // um número em silêncio e o OTP vira decoração.
    claimConversationChannelLink:
      'conversation_channel_links.user_id is null or conversation_channel_links.user_id = excluded.user_id or $6::boolean',
    findConversationChannelLinkById: 'id = $1 and user_id = $2',
    deleteConversationChannelLinkById: 'id = $1 and user_id = $2',
    // O teto conta só o que está verificado — `pending` não ocupa vaga.
    countConversationChannelLinksByUser: "user_id = $1 and channel_type = $2 and verification_status = 'verified'",
    listConversationChannelLinksByUser: 'user_id = $1 and channel_type = $2',
    findConversationChannelLinkForUpdate: 'channel_type = $1 and external_user_key = $2'
  };

  it('os `where` dos statements de VERIFICAÇÃO estão congelados', () => {
    for (const fnName of [
      'consumeChannelVerificationAttempt',
      'closeChannelVerification',
      'rotateChannelVerificationCode',
      'findChannelVerificationById',
      'findLiveChannelVerificationById',
      'findLiveChannelVerificationByUser',
      'closeLiveChannelVerificationsByUser',
      'closeLiveChannelVerificationsByPhoneExcept',
      'countDistinctChallengersForPhone'
    ]) {
      assertWhere(verificationSource, fnName, WHERE[fnName]);
    }
  });

  it('os `where` dos statements de VÍNCULO estão congelados', () => {
    for (const fnName of [
      'claimConversationChannelLink',
      'findConversationChannelLinkById',
      'deleteConversationChannelLinkById',
      'countConversationChannelLinksByUser',
      'listConversationChannelLinksByUser',
      'findConversationChannelLinkForUpdate'
    ]) {
      assertWhere(linkSource, fnName, WHERE[fnName]);
    }
  });

  it('as cláusulas de MUTAÇÃO (fora do where) fazem o que dizem', () => {
    // Incremento e leitura no mesmo statement: ler para conferir e escrever depois devolveria N
    // palpites paralelos a N requisições concorrentes.
    assertClauses(verificationSource, 'consumeChannelVerificationAttempt', [
      'attempt_count = attempt_count + 1',
      'returning *'
    ]);
    assertClauses(verificationSource, 'rotateChannelVerificationCode', [
      'send_count = send_count + 1',
      'code_hash = $3'
    ]);
    // Zerar as tentativas no reenvio transformaria o reenvio no bypass do teto de palpites.
    assertAbsent(verificationSource, 'rotateChannelVerificationCode', ['attempt_count']);
    assertClauses(verificationSource, 'countDistinctChallengersForPhone', ['count(distinct user_id)']);
    assertClauses(linkSource, 'findConversationChannelLinkForUpdate', ['for update']);
  });

  it('a conta de integração é zerada na TRANSFERÊNCIA e preservada na re-verificação do próprio dono', () => {
    // Era `integration_account_id = null` INCONDICIONAL: zerava a escolha de conta do próprio dono a
    // cada re-verificação (perda de estado silenciosa, sem transferência nenhuma). Mas preservar
    // sempre era pior: `resolveChannelPrincipal` prioriza o `integration_account_id` do vínculo, e o
    // novo dono entraria no canal amarrado à conta CETESB de outra pessoa. O `case` é o que separa os
    // dois casos — linha órfã (`user_id` null) nunca é "igual" e portanto cai no `else`, que zera.
    const sql = extractSql(linkSource, 'claimConversationChannelLink');
    assert.ok(
      sql.includes(
        'integration_account_id = case when conversation_channel_links.user_id = excluded.user_id ' +
          'then conversation_channel_links.integration_account_id else null end'
      ),
      `a zeragem condicional da conta de integração mudou de forma: ${sql}`
    );
    // O `null` incondicional (a forma antiga, que era o bug) não pode voltar.
    assert.ok(!/integration_account_id = null[ ,]/.test(sql), 'a zeragem voltou a ser incondicional');
  });

  it('o advisory lock é a variante `try` e a recusa 409 mora no repositório', () => {
    // `pg_advisory_xact_lock` (bloqueante) esperaria COM A CONEXÃO DO POOL NA MÃO: 10 confirmações
    // concorrentes do mesmo usuário prenderiam as 10 conexões e TODA a API passaria a estourar o
    // `connectionTimeout` — disputa local virando indisponibilidade global.
    assert.equal(
      extractSql(linkSource, 'lockChannelLinkUserScope'),
      'select pg_try_advisory_xact_lock(hashtext($1)) as acquired'
    );
    const body = extractFunction(linkSource, 'lockChannelLinkUserScope');
    assert.ok(!body.includes('pg_advisory_xact_lock('), 'a variante BLOQUEANTE voltou');
    // A recusa mora aqui, e não no chamador: devolver `false` para o service conferir seria uma guarda
    // que dá para esquecer — e esquecê-la permitiria duas transações no mesmo escopo, em silêncio.
    assert.ok(body.includes("code: 'CHANNEL_LINK_CONCURRENT_OPERATION'"), 'a recusa saiu do repositório');
  });
});

// ---------------------------------------------------------------------------------------------
// 13b. Recusa do advisory lock — código REAL do repositório, com client falso
// ---------------------------------------------------------------------------------------------

describe('lockChannelLinkUserScope — try-lock não bloqueia, recusa', () => {
  /**
   * Este é o único ponto do arquivo em que o código de um repositório roda de verdade: a função não
   * depende de nenhuma tabela, só do retorno de UM statement. Um `client` falso é suficiente, e o que
   * se exercita é a decisão REAL — não um double que a reimplementa.
   */
  function fakeClient(rows) {
    const seen = [];
    return {
      seen,
      client: {
        async query(text, params) {
          seen.push({ text: text.replace(/\s+/g, ' ').trim(), params });
          return { rows, rowCount: rows.length };
        }
      }
    };
  }

  it('quando o lock NÃO é adquirido, devolve 409 com código estável e retentável', async () => {
    const { client, seen } = fakeClient([{ acquired: false }]);

    const error = await captureRejection(lockChannelLinkUserScope(client, OWNER));

    assert.equal(error.status, 409);
    assert.equal(error.code, 'CHANNEL_LINK_CONCURRENT_OPERATION');
    // A espera é ZERO: um round-trip e devolve. O preço explícito é o cliente repetir.
    assert.equal(seen.length, 1);
    assert.match(seen[0].text, /pg_try_advisory_xact_lock/);
    // Chave namespaced para não colidir com nenhum outro advisory lock do processo.
    assert.deepEqual(seen[0].params, [`channel_link:${OWNER}`]);
  });

  it('CONTROLE: com o lock adquirido a função resolve em silêncio', async () => {
    const { client } = fakeClient([{ acquired: true }]);
    await lockChannelLinkUserScope(client, OWNER);
  });

  it('resultado ambíguo é tratado como NÃO adquirido (fail-closed)', async () => {
    // `rows` vazio, `acquired` nulo/ausente ou qualquer coisa que não seja `true` significa que não
    // sabemos se temos o lock — e prosseguir sem ele é exatamente o TOCTOU que o lock existe para
    // fechar. `!== true` (e não `=== false`) é o que faz esses casos caírem do lado seguro.
    for (const rows of [[], [{}], [{ acquired: null }], [{ acquired: 'f' }], [{ acquired: 0 }]]) {
      const { client } = fakeClient(rows);
      const error = await captureRejection(lockChannelLinkUserScope(client, OWNER));
      assert.equal(
        error.code,
        'CHANNEL_LINK_CONCURRENT_OPERATION',
        `retorno ${JSON.stringify(rows)} deveria falhar fechado`
      );
    }
  });
});

// ---------------------------------------------------------------------------------------------
// 14. Alinhamento placeholder ↔ parâmetro — o escopo por usuário que nenhum double prova
// ---------------------------------------------------------------------------------------------

describe('parâmetros dos statements batem com os placeholders', () => {
  /**
   * TESTE FEIO, E NECESSÁRIO. Ele lê a FONTE do repositório e confere que o array de parâmetros está
   * alinhado com os `$n` do statement.
   *
   * O motivo é concreto: trocar `[input.id, input.userId]` por `[input.id, input.id]` em
   * `consumeChannelVerificationAttempt` não fazia NENHUM teste falhar. O texto `and user_id = $2`
   * continua literal (o contrato de SQL passa) e o teste comportamental usa um double que decide o
   * escopo em JavaScript — o double concorda consigo mesmo. Em produção, `$2` receberia o
   * `challengeId`, o predicado nunca casaria e o confirm morreria SEMPRE; na variante com a ordem
   * invertida, qualquer usuário confirmaria o desafio de qualquer outro.
   *
   * Nenhum double consegue cobrir isto: o alinhamento só é observável no texto do módulo ou contra um
   * Postgres de verdade. **A prova definitiva é o teste de integração da fase 7** — este aqui é o que
   * dá para ter enquanto ela não existe, e é barato o bastante para valer a feiura.
   */
  const VERIFICATION_REPO = new URL(
    '../../src/repositories/conversation-channel-verification-repo.ts',
    import.meta.url
  );
  const LINK_REPO = new URL('../../src/repositories/conversation-channel-link-repo.ts', import.meta.url);

  let verificationSource = '';
  let linkSource = '';

  before(() => {
    verificationSource = readFileSync(VERIFICATION_REPO, 'utf8');
    linkSource = readFileSync(LINK_REPO, 'utf8');
  });

  /** SQL + array de parâmetros de uma função do repositório, como estão escritos na fonte. */
  function extractCall(source, fnName) {
    const body = extractRawFunction(source, fnName).replace(/^[ \t]*\/\/.*$/gm, '');
    const open = body.indexOf('`');
    assert.ok(open >= 0, `${fnName} não tem statement SQL`);
    const close = body.indexOf('`', open + 1);
    const sql = normalizeSql(body.slice(open + 1, close));
    const after = body.slice(close + 1);
    const arrayAt = after.indexOf('[');
    assert.ok(arrayAt >= 0, `${fnName} não passa array de parâmetros`);
    const params = splitTopLevelCommas(sliceBalanced(after, arrayAt));
    return { sql, params };
  }

  /** `$3` → `{input.windowHours}`; o cast (`::int`, `::jsonb`) é preservado de propósito. */
  function resolvePlaceholders(text, params) {
    return text.replace(/\$(\d+)/g, (match, index) => {
      const param = params[Number(index) - 1];
      assert.ok(param !== undefined, `placeholder ${match} sem parâmetro correspondente`);
      return `{${param}}`;
    });
  }

  function placeholderOf(where, column) {
    const found = new RegExp(`(?:^|[\\s(])${column}\\s*(?:=|<>)\\s*\\$(\\d+)`).exec(where);
    assert.ok(found, `não achei a comparação de \`${column}\` no where: ${where}`);
    return Number(found[1]);
  }

  /**
   * Cada entrada declara o array de parâmetros LITERAL e a qual expressão cada coluna escopada está
   * amarrada. A segunda parte é o que pega a INVERSÃO (`[input.userId, input.id]`), que mantém o
   * conjunto de parâmetros e troca o significado dos dois.
   */
  const SCOPED_STATEMENTS = [
    {
      repo: 'verification',
      fn: 'consumeChannelVerificationAttempt',
      params: ['input.id', 'input.userId'],
      bindings: { id: 'input.id', user_id: 'input.userId' }
    },
    {
      repo: 'verification',
      fn: 'closeChannelVerification',
      params: ['input.id', 'input.userId || null', 'input.outcome', 'JSON.stringify(input.metadataPatch || {})'],
      bindings: { id: 'input.id', user_id: 'input.userId || null' }
    },
    {
      repo: 'verification',
      fn: 'rotateChannelVerificationCode',
      params: ['input.id', 'input.userId', 'input.codeHash', 'input.expiresAt'],
      bindings: { id: 'input.id', user_id: 'input.userId' }
    },
    {
      repo: 'verification',
      fn: 'findChannelVerificationById',
      params: ['id', 'userId'],
      bindings: { id: 'id', user_id: 'userId' }
    },
    {
      repo: 'verification',
      fn: 'findLiveChannelVerificationById',
      params: ['id', 'userId'],
      bindings: { id: 'id', user_id: 'userId' }
    },
    {
      repo: 'verification',
      fn: 'findLiveChannelVerificationByUser',
      params: ['userId', 'channelType', 'externalUserKey'],
      bindings: { user_id: 'userId', channel_type: 'channelType', external_user_key: 'externalUserKey' }
    },
    {
      repo: 'verification',
      fn: 'closeLiveChannelVerificationsByUser',
      params: [
        'input.userId',
        'input.channelType',
        'input.outcome',
        'input.externalUserKey || null',
        'input.exceptId || null'
      ],
      bindings: { user_id: 'input.userId', channel_type: 'input.channelType' }
    },
    {
      repo: 'verification',
      fn: 'closeLiveChannelVerificationsByPhoneExcept',
      params: ['input.channelType', 'input.externalUserKey', 'input.exceptUserId', 'input.outcome'],
      // `user_id <> $3` amarrado ao `exceptUserId`: se `$3` virasse o dono, a função fecharia
      // justamente o desafio de quem acabou de provar posse e pouparia os das outras contas.
      bindings: {
        channel_type: 'input.channelType',
        external_user_key: 'input.externalUserKey',
        user_id: 'input.exceptUserId'
      }
    },
    {
      repo: 'verification',
      fn: 'countDistinctChallengersForPhone',
      params: ['input.channelType', 'input.externalUserKey', 'input.windowHours', 'input.exceptUserId'],
      bindings: {
        channel_type: 'input.channelType',
        external_user_key: 'input.externalUserKey',
        user_id: 'input.exceptUserId'
      }
    },
    {
      repo: 'link',
      fn: 'findConversationChannelLinkById',
      params: ['id', 'userId'],
      bindings: { id: 'id', user_id: 'userId' }
    },
    {
      repo: 'link',
      fn: 'deleteConversationChannelLinkById',
      params: ['id', 'userId'],
      bindings: { id: 'id', user_id: 'userId' }
    },
    {
      repo: 'link',
      fn: 'listConversationChannelLinksByUser',
      params: ['userId', 'channelType'],
      bindings: { user_id: 'userId', channel_type: 'channelType' }
    },
    {
      repo: 'link',
      fn: 'countConversationChannelLinksByUser',
      params: ['userId', 'channelType'],
      bindings: { user_id: 'userId', channel_type: 'channelType' }
    },
    {
      repo: 'link',
      fn: 'findConversationChannelLinkForUpdate',
      params: ['channelType', 'externalUserKey'],
      bindings: { channel_type: 'channelType', external_user_key: 'externalUserKey' }
    },
    {
      repo: 'link',
      fn: 'claimConversationChannelLink',
      params: [
        'input.id',
        'input.channelType',
        'input.externalUserKey',
        'input.userId',
        'JSON.stringify(input.metadata || {})',
        'input.allowTransfer'
      ],
      // O `where` do `on conflict` compara colunas com `excluded`, sem `$n` — a amarração relevante
      // aqui é `$6::boolean` = `allowTransfer`, conferida no caso próprio abaixo.
      bindings: {}
    }
  ];

  function sourceFor(repo) {
    return repo === 'verification' ? verificationSource : linkSource;
  }

  function assertAlignment(source, spec) {
    const { sql, params } = extractCall(source, spec.fn);
    assert.deepEqual(
      params,
      spec.params,
      `${spec.fn}: o array de parâmetros mudou. Trocar/inverter uma entrada aqui não altera nenhuma ` +
        'cláusula do statement — nenhum double consegue enxergar essa mudança'
    );
    for (const [column, expected] of Object.entries(spec.bindings)) {
      const position = placeholderOf(sql, column);
      assert.equal(
        params[position - 1],
        expected,
        `${spec.fn}: a coluna \`${column}\` está comparada com $${position}, que recebe ` +
          `\`${params[position - 1]}\` — deveria receber \`${expected}\``
      );
    }
  }

  it('CONTROLE NEGATIVO: o verificador acusa a troca de parâmetro que passou despercebida', () => {
    // A mutação exata da rodada 2: `$2` deixa de receber o usuário e passa a receber o id do desafio.
    const doctored = verificationSource.replace('[input.id, input.userId]', '[input.id, input.id]');
    assert.notEqual(doctored, verificationSource, 'a forma do array mudou — ajuste o controle');

    const spec = SCOPED_STATEMENTS.find((entry) => entry.fn === 'consumeChannelVerificationAttempt');
    assert.throws(() => assertAlignment(doctored, spec), /o array de parâmetros mudou/);

    // E a inversão, que mantém o conjunto de parâmetros: é a variante em que QUALQUER usuário
    // confirma o desafio de QUALQUER outro. Só a amarração coluna↔parâmetro pega esta.
    const swapped = verificationSource.replace('[input.id, input.userId]', '[input.userId, input.id]');
    assert.throws(
      () => assertAlignment(swapped, { ...spec, params: ['input.userId', 'input.id'] }),
      /a coluna `id` está comparada com \$1/
    );
  });

  it('todo statement escopado amarra `$n` ao parâmetro certo', () => {
    for (const spec of SCOPED_STATEMENTS) {
      assertAlignment(sourceFor(spec.repo), spec);
    }
  });

  it('os INSERTs alinham coluna a coluna com os valores', () => {
    // Um insert desalinhado é pior que um where errado: grava o valor certo na coluna errada e o
    // banco aceita (todas essas colunas são `text`). `code_hash` recebendo o `user_id` deixaria o
    // desafio inconfirmável; `user_id` recebendo o `code_hash` daria o vínculo a um dono inexistente.
    assertInsertAlignment(verificationSource, 'insertChannelVerification', {
      id: '{input.id}',
      channel_type: '{input.channelType}',
      external_user_key: '{input.externalUserKey}',
      user_id: '{input.userId}',
      code_hash: '{input.codeHash}',
      // `attempt_count` nasce em 0 e `send_count` em 1: conta-se a TENTATIVA de envio, não o sucesso —
      // senão um provedor instável vira loop infinito de retry pago.
      attempt_count: '0',
      max_attempts: '{input.maxAttempts}',
      send_count: '1',
      max_sends: '{input.maxSends}',
      last_sent_at: 'now()',
      expires_at: '{input.expiresAt}',
      delivery_status: "'pending'",
      correlation_id: '{input.correlationId || null}',
      metadata: '{JSON.stringify(input.metadata || {})}::jsonb'
    });

    assertInsertAlignment(linkSource, 'claimConversationChannelLink', {
      id: '{input.id}',
      channel_type: '{input.channelType}',
      external_user_key: '{input.externalUserKey}',
      user_id: '{input.userId}',
      // A linha nasce SEM conta de integração: ela é escolhida depois do vínculo, nunca herdada.
      integration_account_id: 'null',
      // Nasce já `verified`. Gravar `pending` no start deixaria qualquer conta OCUPAR a linha única do
      // telefone de outra pessoa só pedindo um código.
      verification_status: "'verified'",
      verified_at: 'now()',
      metadata: '{JSON.stringify(input.metadata || {})}::jsonb'
    });
  });

  it('a autorização de transferência do `on conflict` é o parâmetro de transferência, e nada mais', () => {
    // `$6::boolean` no predicado é o que permite a troca de dono. Amarrado ao parâmetro errado (ou a
    // um literal `true`), o cinto de segurança do repositório deixa de existir.
    const { sql, params } = extractCall(linkSource, 'claimConversationChannelLink');
    const where = sql.slice(sql.indexOf(' where '));
    assert.ok(where.includes('$6::boolean'), `o predicado perdeu o parâmetro de transferência: ${where}`);
    assert.equal(resolvePlaceholders('$6', params), '{input.allowTransfer}');
    assert.ok(!/\bor\s+true\b/.test(where), 'a autorização de transferência virou literal');
  });

  function assertInsertAlignment(source, fnName, expected) {
    const { sql, params } = extractCall(source, fnName);
    const columnsAt = sql.indexOf('(');
    const columns = splitTopLevelCommas(sliceBalanced(sql, columnsAt)).map((name) => name.trim());
    const valuesAt = sql.indexOf('(', sql.indexOf(' values '));
    const values = splitTopLevelCommas(sliceBalanced(sql, valuesAt));

    assert.equal(
      columns.length,
      values.length,
      `${fnName}: ${columns.length} colunas para ${values.length} valores — o insert está desalinhado`
    );
    const actual = Object.fromEntries(
      columns.map((column, index) => [column, resolvePlaceholders(values[index], params)])
    );
    assert.deepEqual(actual, expected, `${fnName}: a correspondência coluna ↔ valor mudou`);
  }
});

// ---------------------------------------------------------------------------------------------
// 15. Default do escudo (o getter que ficava sem cobertura)
// ---------------------------------------------------------------------------------------------

describe('defaults do escudo da vítima', () => {
  it('channelLinkVictimShieldWindowHours é número finito — `NaN` estouraria o make_interval em runtime', () => {
    // Sem default coberto, `Number(undefined)` = NaN chega ao `make_interval(hours => $3::int)` e o
    // start morre com erro de SQL em produção, com a suíte inteira verde.
    const windowHours = Number(config.channelLinkVictimShieldWindowHours);
    assert.ok(Number.isFinite(windowHours), `windowHours não é finito: ${config.channelLinkVictimShieldWindowHours}`);
    assert.ok(Number.isInteger(windowHours), 'o parâmetro é `$3::int` — fração seria truncada em silêncio');
    assert.ok(windowHours > 0);
    assert.equal(windowHours, 24);
  });
});
