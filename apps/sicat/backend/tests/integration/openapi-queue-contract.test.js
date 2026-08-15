import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

/**
 * Caminhos derivados da LOCALIZAÇÃO DESTE ARQUIVO, não de `process.cwd()`.
 *
 * `examples/` mudou de `backend/examples` para a raiz do workspace no refactor de monorepo
 * (`266849cd`) e este teste continuou apontando para o lugar antigo: dois dos quatro casos falhavam
 * com `ENOENT` desde então, dentro de um gate de CI (`npm run test:contract`) que ninguém percebeu
 * estar vermelho. Amarrar ao arquivo torna a resolução independente de onde o runner é invocado.
 */
const testDir = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(testDir, '../..');
const openapiFile = path.join(backendDir, 'openapi/mtr_automacao_openapi_interna.yaml');
const examplesDir = path.resolve(backendDir, '../examples');

function loadOpenApi() {
  const raw = fs.readFileSync(openapiFile, 'utf8');
  return YAML.parse(raw);
}

test('Contrato OpenAPI - JobResource.status cobre retry_wait e dlq', () => {
  const doc = loadOpenApi();
  const enumValues = doc?.components?.schemas?.JobResource?.properties?.status?.enum;

  assert.ok(Array.isArray(enumValues), 'JobResource.status.enum deve existir');
  for (const required of ['queued', 'running', 'retry_wait', 'succeeded', 'failed', 'dlq']) {
    assert.ok(enumValues.includes(required), `Enum de JobResource.status deve conter ${required}`);
  }
});

test('Contrato OpenAPI - CommandAccepted mantém padrão assíncrono', () => {
  const doc = loadOpenApi();

  const commandStatusEnum = doc?.components?.schemas?.CommandAccepted?.properties?.status?.enum;
  assert.ok(Array.isArray(commandStatusEnum), 'CommandAccepted.status.enum deve existir');
  assert.ok(commandStatusEnum.includes('queued'), 'CommandAccepted.status deve aceitar queued');

  const commandEndpoints = [
    '/v1/manifestos/{id}/submit',
    '/v1/manifestos/{id}/print',
    '/v1/manifestos/{id}/cancel',
    '/v1/catalog-sync',
    '/v1/cadastros',
    '/v1/transporte/transportadores/{partyId}/verificar-rntrc'
  ];

  for (const endpoint of commandEndpoints) {
    const schemaRef = doc?.paths?.[endpoint]?.post?.responses?.['202']?.content?.['application/json']?.schema?.$ref;
    assert.strictEqual(
      schemaRef,
      '#/components/schemas/CommandAccepted',
      `${endpoint} deve responder 202 com schema CommandAccepted`
    );
  }
});

test('Contrato OpenAPI - exemplo de job é compatível com enum de status', () => {
  const doc = loadOpenApi();
  const enumValues = doc?.components?.schemas?.JobResource?.properties?.status?.enum || [];

  const filePath = path.join(examplesDir, 'get_v1_jobs_jobId_response.json');
  const example = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  assert.ok(example.jobId, 'Exemplo de job deve ter jobId');
  assert.ok(example.correlationId, 'Exemplo de job deve ter correlationId');
  assert.ok(example.links?.audit, 'Exemplo de job deve ter link de auditoria');
  assert.ok(enumValues.includes(example.status), `Status do exemplo (${example.status}) deve existir no enum`);
});

test('Contrato OpenAPI - exemplos de comando mantêm campos obrigatórios', () => {
  const files = [
    'post_v1_manifestos_id_submit_response.json',
    'post_v1_manifestos_id_cancel_response.json',
    'post_v1_catalog-sync_response.json'
  ];

  for (const file of files) {
    const body = JSON.parse(fs.readFileSync(path.join(examplesDir, file), 'utf8'));

    assert.ok(body.commandId, `${file} deve conter commandId`);
    assert.ok(body.jobId, `${file} deve conter jobId`);
    assert.ok(body.correlationId, `${file} deve conter correlationId`);
    assert.ok(body.submittedAt, `${file} deve conter submittedAt`);
    assert.ok(body.links?.job, `${file} deve conter links.job`);
    assert.ok(body.links?.entity, `${file} deve conter links.entity`);
    assert.ok(body.links?.audit, `${file} deve conter links.audit`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Cadeia `whatsapp-channel-sicat` — fase 7.
//
// As 16 operações das famílias Conversations, SICAT Channel Links e WhatsApp Channel ficaram fora do
// contrato desde a fase 0; esta fase as publica. Os casos abaixo gravam em CÓDIGO as invariantes que
// um revisor bem-intencionado é mais propenso a "consertar" — cada um existe porque desfazê-lo
// quebraria comportamento real, não estilo.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** As 16 operações publicadas, na ordem em que o Express as registra. */
const CHAIN_OPERATIONS = [
  ['/v1/conversations/tools', 'get', 'conversationListTools'],
  ['/v1/conversations/artifacts/{artifactId}', 'get', 'conversationGetArtifact'],
  ['/v1/conversations/artifacts/{artifactId}/content', 'get', 'conversationDownloadArtifact'],
  ['/v1/conversations/feedback', 'post', 'conversationSubmitFeedback'],
  ['/v1/conversations/turns', 'post', 'conversationCreateTurn'],
  ['/v1/sicat/channel-links', 'get', 'channelLinkList'],
  ['/v1/sicat/channel-links', 'post', 'channelLinkStart'],
  ['/v1/sicat/channel-links/whatsapp/action-window', 'post', 'whatsappActionWindowOpen'],
  ['/v1/sicat/channel-links/whatsapp/action-window', 'get', 'whatsappActionWindowGet'],
  ['/v1/sicat/channel-links/whatsapp/action-window/{windowId}', 'delete', 'whatsappActionWindowRevoke'],
  ['/v1/sicat/channel-links/challenges/{challengeId}/resend', 'post', 'channelLinkResendChallenge'],
  ['/v1/sicat/channel-links/challenges/{challengeId}/confirm', 'post', 'channelLinkConfirmChallenge'],
  ['/v1/sicat/channel-links/challenges/{challengeId}', 'delete', 'channelLinkCancelChallenge'],
  ['/v1/sicat/channel-links/{linkId}', 'delete', 'channelLinkRemove'],
  ['/v1/channels/whatsapp/webhook', 'get', 'whatsappWebhookVerify'],
  ['/v1/channels/whatsapp/webhook', 'post', 'whatsappWebhookReceive']
];

const WEBHOOK_PATH = '/v1/channels/whatsapp/webhook';

/** Operações da cadeia sob `sicatAuthMiddleware` — tudo menos as duas do webhook público. */
const BEARER_OPERATIONS = CHAIN_OPERATIONS.filter(([specPath]) => specPath !== WEBHOOK_PATH);

test('Contrato OpenAPI - cadeia whatsapp-channel publica as 16 operações com operationId único', () => {
  const doc = loadOpenApi();
  const seen = new Set();

  for (const [specPath, method, operationId] of CHAIN_OPERATIONS) {
    const operation = doc?.paths?.[specPath]?.[method];
    assert.ok(operation, `${method.toUpperCase()} ${specPath} deve existir no contrato`);
    assert.strictEqual(
      operation.operationId,
      operationId,
      `${method.toUpperCase()} ${specPath} deve declarar operationId ${operationId}`
    );
    seen.add(operationId);
  }

  assert.strictEqual(seen.size, CHAIN_OPERATIONS.length, 'operationId da cadeia deve ser único');

  // Colisão com o resto do documento derruba o `SwaggerParser.validate` do `validate:openapi`.
  const allIds = [];
  for (const methods of Object.values(doc.paths)) {
    for (const operation of Object.values(methods)) {
      if (operation?.operationId) allIds.push(operation.operationId);
    }
  }
  assert.strictEqual(
    allIds.length,
    new Set(allIds).size,
    'nenhum operationId pode se repetir no documento inteiro'
  );
});

test('Contrato OpenAPI - 202 de channel-links NÃO é CommandAccepted', () => {
  const doc = loadOpenApi();

  // O 202 aqui significa "o ENVIO da mensagem foi aceito pelo provedor" — não existe job, não existe
  // `/v1/jobs/{jobId}`, não existe `commandId`. Promovê-lo a `CommandAccepted` (ou acrescentar estes
  // paths à lista `commandEndpoints` acima e à gêmea em `scripts/validate-openapi.js`) documentaria
  // um acompanhamento assíncrono que a plataforma não oferece nesta superfície.
  for (const endpoint of [
    '/v1/sicat/channel-links',
    '/v1/sicat/channel-links/challenges/{challengeId}/resend'
  ]) {
    const ref = doc?.paths?.[endpoint]?.post?.responses?.['202']?.content?.['application/json']?.schema?.$ref;
    assert.notStrictEqual(
      ref,
      '#/components/schemas/CommandAccepted',
      `${endpoint} NÃO é comando assíncrono da fila`
    );
    assert.strictEqual(
      ref,
      '#/components/schemas/ChannelLinkChallenge',
      `${endpoint} deve responder 202 com ChannelLinkChallenge`
    );
  }
});

test('Contrato OpenAPI - webhook do WhatsApp é público (security vazio)', () => {
  const doc = loadOpenApi();

  // Regressão de SEGURANÇA na direção oposta da usual: pôr `bearerAuth` aqui não "endurece" nada —
  // derruba o canal, porque nem o Meta nem o Twilio mandam Bearer. A autenticidade é o HMAC sobre o
  // corpo cru, e o `authMiddleware` global isenta o prefixo `/v1/channels/` por contrato.
  assert.deepStrictEqual(doc?.security, [{ bearerAuth: [] }], 'a raiz do documento exige Bearer');

  for (const method of ['get', 'post']) {
    assert.deepStrictEqual(
      doc?.paths?.[WEBHOOK_PATH]?.[method]?.security,
      [],
      `${method.toUpperCase()} ${WEBHOOK_PATH} deve sobrescrever a segurança da raiz com []`
    );
  }

  // O gate não é a presença do header — é o HMAC. Por isso os dois headers de assinatura são
  // OPCIONAIS (só um deles chega, conforme `WHATSAPP_PROVIDER`) e não viram `securityScheme`.
  const headers = (doc?.paths?.[WEBHOOK_PATH]?.post?.parameters || [])
    .filter((parameter) => parameter.in === 'header');
  const headerNames = headers.map((parameter) => parameter.name).sort();
  assert.deepStrictEqual(headerNames, ['X-Hub-Signature-256', 'X-Twilio-Signature']);
  for (const parameter of headers) {
    assert.notStrictEqual(parameter.required, true, `${parameter.name} não pode ser obrigatório`);
  }
});

test('Contrato OpenAPI - GET do webhook devolve text/plain com o desafio cru', () => {
  const doc = loadOpenApi();
  const responses = doc?.paths?.[WEBHOOK_PATH]?.get?.responses;
  const okContent = responses?.['200']?.content;

  // `res.json(challenge)` REPROVA a verificação do Meta: ele compara byte a byte e as aspas do JSON
  // quebram a comparação. Nada no gerador de operações enxergaria essa troca — ele só lê o código de
  // status —, então este caso é o único sinal automático.
  assert.ok(okContent?.['text/plain'], '200 do GET deve declarar text/plain');
  assert.strictEqual(okContent['text/plain'].schema?.type, 'string');
  assert.strictEqual(
    okContent['application/json'],
    undefined,
    '200 do GET NÃO pode declarar application/json'
  );

  // 403/404 saem com corpo VAZIO — problem+json entregaria `instance` e `correlationId` a um anônimo.
  for (const status of ['403', '404']) {
    assert.ok(responses?.[status], `GET do webhook deve declarar ${status}`);
    assert.strictEqual(
      responses[status].content,
      undefined,
      `${status} do GET do webhook não tem corpo`
    );
  }
});

test('Contrato OpenAPI - POST do webhook absorve tudo em 200 e não declara 429', () => {
  const doc = loadOpenApi();
  const responses = doc?.paths?.[WEBHOOK_PATH]?.post?.responses;

  assert.ok(responses?.['200'], 'POST do webhook deve declarar 200');
  assert.strictEqual(responses['200'].content, undefined, '200 do POST responde com corpo vazio');

  // O teto global da rota responde 200 e DESCARTA o lote: não-2xx sustentado faz o Meta desativar o
  // webhook. Declarar 429 aqui documentaria uma resposta que o código nunca emite nesta rota.
  assert.strictEqual(responses['429'], undefined, 'POST do webhook NÃO responde 429');

  assert.deepStrictEqual(
    Object.keys(responses).sort(),
    ['200', '403', '404', '500'],
    'não-2xx do POST do webhook é exatamente 403 (assinatura), 404 (canal desligado) e 500 (infra)'
  );
  for (const status of ['403', '404', '500']) {
    assert.strictEqual(responses[status].content, undefined, `${status} do POST não tem corpo`);
  }

  const bodyContent = doc?.paths?.[WEBHOOK_PATH]?.post?.requestBody?.content;
  assert.ok(bodyContent?.['application/x-www-form-urlencoded'], 'Twilio manda form-urlencoded');
  assert.ok(bodyContent?.['application/json'], 'Meta manda JSON');
});

test('Contrato OpenAPI - 401 da cadeia não promete o campo `code`', () => {
  const doc = loadOpenApi();

  // `sicatAuthMiddleware` chama `createProblem` SEM `code`, e `createProblem` só inclui o campo se
  // ele for truthy. Apontar estes 401 para `Problem` (que exige `code`) documentaria um campo que
  // nunca chega. Trocar isso exige mudar o middleware — e aí os 24 outros 401 do documento entram na
  // conta.
  for (const [specPath, method] of BEARER_OPERATIONS) {
    const unauthorized = doc?.paths?.[specPath]?.[method]?.responses?.['401'];
    assert.ok(unauthorized, `${method.toUpperCase()} ${specPath} deve declarar 401`);
    assert.strictEqual(
      unauthorized.content?.['application/problem+json']?.schema?.$ref,
      '#/components/schemas/UnauthorizedProblem',
      `${method.toUpperCase()} ${specPath} deve usar UnauthorizedProblem no 401`
    );
  }

  const required = doc?.components?.schemas?.UnauthorizedProblem?.required || [];
  assert.ok(!required.includes('code'), 'UnauthorizedProblem não pode exigir `code`');
  assert.ok(
    (doc?.components?.schemas?.Problem?.required || []).includes('code'),
    'o schema Problem herdado continua exigindo `code` — é por isso que existe o UnauthorizedProblem'
  );
});

test('Contrato OpenAPI - todo 429 da cadeia declara Retry-After e errors como OBJETO', () => {
  const doc = loadOpenApi();
  const withRateLimit = [];

  for (const [specPath, method] of CHAIN_OPERATIONS) {
    const rateLimited = doc?.paths?.[specPath]?.[method]?.responses?.['429'];
    if (!rateLimited) continue;
    withRateLimit.push(`${method} ${specPath}`);

    assert.ok(
      rateLimited.headers?.['Retry-After'],
      `429 de ${method.toUpperCase()} ${specPath} deve declarar o header Retry-After`
    );
    assert.strictEqual(
      rateLimited.content?.['application/problem+json']?.schema?.$ref,
      '#/components/schemas/CodedProblem',
      `429 de ${method.toUpperCase()} ${specPath} deve usar CodedProblem`
    );
  }

  assert.strictEqual(withRateLimit.length, 4, `esperado 4 operações com 429, veio ${withRateLimit.join(', ')}`);

  // `Problem.errors` é ARRAY de {field,message}; os 429/400 desta cadeia emitem `errors` como OBJETO
  // (`retryAfterSeconds`, `attemptsRemaining`, `correlationId`). Reaproveitar `Problem` seria mentira.
  assert.strictEqual(doc?.components?.schemas?.CodedProblem?.properties?.errors?.type, 'object');
  assert.strictEqual(doc?.components?.schemas?.Problem?.properties?.errors?.type, 'array');
});

test('Contrato OpenAPI - turno conversacional aceita JSON e multipart', () => {
  const doc = loadOpenApi();
  const content = doc?.paths?.['/v1/conversations/turns']?.post?.requestBody?.content;

  assert.ok(content?.['application/json'], 'turno textual continua em application/json');
  assert.ok(content?.['multipart/form-data'], 'turno com anexos usa multipart/form-data');

  const multipart = doc?.components?.schemas?.ConversationTurnMultipartRequest;
  assert.strictEqual(multipart?.properties?.files?.maxItems, 20, 'o limite real do middleware é 20 arquivos');

  // O escopo do artefato passou a sair do PRINCIPAL na fase 0: omitir os query params antigos pulava
  // a checagem inteira, então eles foram REMOVIDOS do código. Redeclará-los aqui reviveria o bug na
  // cabeça de quem lê o contrato.
  for (const specPath of [
    '/v1/conversations/artifacts/{artifactId}',
    '/v1/conversations/artifacts/{artifactId}/content'
  ]) {
    const queryNames = (doc?.paths?.[specPath]?.get?.parameters || [])
      .filter((parameter) => parameter.in === 'query')
      .map((parameter) => parameter.name);
    assert.deepStrictEqual(queryNames, [], `${specPath} não aceita query params de escopo`);
  }
});

test('Contrato OpenAPI - examples da cadeia existem, parseiam e não vazam segredo do vínculo', () => {
  const keys = [
    'get_v1_conversations_tools',
    'get_v1_conversations_artifacts_artifactId',
    'get_v1_conversations_artifacts_artifactId_content',
    'post_v1_conversations_feedback',
    'post_v1_conversations_turns',
    'get_v1_sicat_channel-links',
    'post_v1_sicat_channel-links',
    'post_v1_sicat_channel-links_challenges_challengeId_resend',
    'post_v1_sicat_channel-links_challenges_challengeId_confirm',
    'delete_v1_sicat_channel-links_challenges_challengeId',
    'delete_v1_sicat_channel-links_linkId',
    'post_v1_sicat_channel-links_whatsapp_action-window',
    'get_v1_sicat_channel-links_whatsapp_action-window',
    'delete_v1_sicat_channel-links_whatsapp_action-window_windowId',
    'get_v1_channels_whatsapp_webhook',
    'post_v1_channels_whatsapp_webhook'
  ];

  let parsed = 0;
  for (const key of keys) {
    for (const kind of ['request', 'response']) {
      const filePath = path.join(examplesDir, `${key}_${kind}.json`);
      assert.ok(fs.existsSync(filePath), `${key}_${kind}.json deve existir em examples/`);
      JSON.parse(fs.readFileSync(filePath, 'utf8'));
      parsed++;
    }
  }
  assert.strictEqual(parsed, 32, 'a cadeia publica 16 operações × request + response');

  // O DTO do desafio nunca carrega o código, o hash, o id da mensagem do provedor nem o erro de
  // entrega. Um exemplo que os mostrasse viraria documentação de vazamento.
  const forbidden = ['code', 'codeHash', 'providerName', 'providerMessageId', 'deliveryError', 'metadata'];
  for (const key of [
    'post_v1_sicat_channel-links',
    'post_v1_sicat_channel-links_challenges_challengeId_resend'
  ]) {
    const challenge = JSON.parse(
      fs.readFileSync(path.join(examplesDir, `${key}_response.json`), 'utf8')
    );
    for (const field of forbidden) {
      assert.ok(
        !(field in challenge),
        `${key}_response.json não pode expor \`${field}\` do desafio`
      );
    }
    assert.match(
      challenge.phoneMasked,
      /^\+\d{2} \d{2} \*{4}-\d{4}$/,
      `${key}_response.json deve mascarar o telefone como maskChannelUserKey faz`
    );
  }

  const windowDto = JSON.parse(
    fs.readFileSync(path.join(examplesDir, 'post_v1_sicat_channel-links_whatsapp_action-window_response.json'), 'utf8')
  );
  assert.ok(!('externalUserKey' in windowDto), 'a janela de ação nunca devolve o E.164 cru');
});
