/**
 * Principal conversacional para os testes de `conversation-service.processTurn`.
 *
 * POR QUE ISTO EXISTE
 * -------------------
 * `processTurn` exige um `ConversationPrincipal` montado NO SERVIDOR — ver
 * `src/services/conversation/conversation-principal.ts`. Desde o endurecimento que tirou canal,
 * usuário e conta CETESB do CORPO da requisição, `buildConversationContext` lê identidade SÓ do
 * principal e IGNORA deliberadamente `body.context.integrationAccountId`, `.sessionContextId`,
 * `.userId` e `.requestedBy` (eram o vetor de escalação de privilégio).
 *
 * Os sete arquivos de teste que exercitam `processTurn` continuavam declarando a identidade apenas
 * pelo `body` — o formato anterior ao endurecimento. Como são `.js`, o TypeScript nunca checou a
 * chamada, e `principal` chegava `undefined`: toda chamada morria em
 * `buildConversationContext` com `TypeError: Cannot read properties of undefined (reading 'channel')`,
 * ANTES de qualquer lógica sob teste.
 *
 * PERMISSÕES PLENAS DE PROPÓSITO
 * ------------------------------
 * O principal de teste recebe o catálogo inteiro (`listCatalogPermissionKeys()`). Estas suítes medem
 * planejamento, telemetria, memória e fallback de provider — não o gate de RBAC, que tem suíte
 * própria (`tests/unit/conversation-permission-gate.test.js`). Um principal sem chaves faria o gate
 * bloquear as tools e mascararia exatamente o que se quer observar aqui. Quem precisar exercitar o
 * gate passa `permissionKeys` explicitamente.
 */

import { listCatalogPermissionKeys } from '../../src/lib/conversation-permission-catalog.js';

/**
 * @param {object} [overrides] Campos do principal. `integrationAccountId`/`sessionContextId` aceitam
 *   `null` explícito (usuário sem conta ativa / sem bootstrap de sessão) — por isso a checagem é
 *   `=== undefined`, não `||`.
 */
export function buildTestPrincipal(overrides = {}) {
  const channel = overrides.channel || 'inapp';
  const userId = overrides.userId || 'usr_test';
  const integrationAccountId =
    overrides.integrationAccountId === undefined ? 'acc_test' : overrides.integrationAccountId;
  const sessionContextId =
    overrides.sessionContextId === undefined ? 'scx_test' : overrides.sessionContextId;

  return {
    channel,
    userId,
    integrationAccountId,
    sessionContextId,
    // Mesma derivação de `buildChannelSessionKey` em conversation-principal.ts: é ela que faz o
    // upsert reaproveitar a linha de sessão do mesmo (canal, usuário, conta).
    channelSessionKey:
      overrides.channelSessionKey || [channel, userId, integrationAccountId || 'no-account'].join(':'),
    permissionKeys: overrides.permissionKeys || listCatalogPermissionKeys(),
    requestedBy: overrides.requestedBy || 'qa_tester'
  };
}

/**
 * Deriva o principal a partir do `body` que o próprio caso de teste montou.
 *
 * Os testes de integração variam a conta por caso (conta A × conta B, isolamento de memória) usando
 * `body.context.integrationAccountId`. Como o serviço não lê mais essa origem, esta função traduz a
 * intenção do caso — "este turno é DESTE usuário, NESTA conta" — para a origem que o serviço lê de
 * fato. O `body.context` segue existindo e carregando contexto de TELA, que continua vindo do corpo.
 *
 * ⚠️ Aqui os ausentes viram `null`, NÃO os defaults de `buildTestPrincipal`. Nos testes de
 * integração há banco de verdade: `conversation_sessions.session_context_id` e
 * `.integration_account_id` têm FK, e um id sintético que ninguém inseriu derruba toda a cadeia de
 * escritas do turno (sessão → mensagens → trilhas → action logs) em violação de chave estrangeira —
 * que `persistSafely` engole, deixando o turno terminar em `failed` sem dizer por quê.
 *
 * ⚠️ `body.conversationSessionId` entra na `channelSessionKey`. Quem decide QUAL conversa é a de um
 * turno passou a ser a `channelSessionKey` do principal: o upsert de `conversation_sessions` casa
 * por `(channel_type, channel_session_key)` e o serviço adota o id que o banco DEVOLVEU, ignorando
 * o id declarado pelo cliente. Sem isto, todos os casos de um mesmo arquivo — mesmo usuário, mesma
 * conta — colapsariam numa ÚNICA sessão: um caso leria o histórico e a última seleção de manifestos
 * do caso anterior. Nos testes, o `conversationSessionId` declarado É a identidade da conversa;
 * dobrá-lo na chave preserva essa intenção sem reabrir a porta que o endurecimento fechou (o corpo
 * segue sem poder dizer QUEM é o usuário nem em QUAL conta ele está).
 */
export function buildTestPrincipalFromBody(body = {}, overrides = {}) {
  const context = body.context || {};
  const channel = body.channel || 'inapp';
  const userId = overrides.userId || 'usr_test';
  const integrationAccountId =
    overrides.integrationAccountId !== undefined
      ? overrides.integrationAccountId
      : context.integrationAccountId ?? null;

  return buildTestPrincipal({
    channel,
    userId,
    integrationAccountId,
    sessionContextId: context.sessionContextId ?? null,
    requestedBy: context.requestedBy,
    channelSessionKey: [
      channel,
      userId,
      integrationAccountId || 'no-account',
      body.conversationSessionId || 'default'
    ].join(':'),
    ...overrides
  });
}
