/**
 * ORQUESTRAÇÃO DO FLUXO DE CONFIRMAÇÃO NO WHATSAPP (fase 5).
 *
 * Duas metades, e a invariante que as separa:
 *
 *  · **Emissão** (`tryIssueWhatsAppActionTicket`) — roda quando o turno voltou `blocked` com
 *    `CONFIRMATION_REQUIRED`. Congela `toolCall.name` + `toolCall.arguments` NA LINHA do ticket, junto
 *    dos snapshots de conta/sessão, e devolve a prévia com o código de 6 dígitos.
 *  · **Resgate** (`runWhatsAppConfirmationRescue`) — roda ANTES do planner, sem LLM. O servidor monta
 *    o `toolRequest` A PARTIR DO TICKET, com `confirmed: true`.
 *
 * ┌─ INVARIANTE CENTRAL DA FASE ──────────────────────────────────────────────────────────────────┐
 * │ O CLIENTE NOMEIA O TICKET (6 dígitos), NUNCA A FERRAMENTA. Nenhum caminho deste canal deriva   │
 * │ `toolRequest` do texto da pessoa — só da linha do ticket, que o servidor escreveu. É a mesma   │
 * │ invariante de `whatsapp-turn-service` ("o texto do usuário é DADO"), agora reescrita nestes    │
 * │ termos e coberta por teste. Se um dia `toolRequest` for derivado do texto aqui, é regressão de │
 * │ segurança, não refinamento.                                                                    │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Todo este módulo só é alcançado com `WHATSAPP_ACTIONS_ENABLED=true` (disjuntor de ambiente, default
 * `false`). Com ele desligado, `whatsapp-turn-service` continua mandando `allowActions: false`, o
 * turno para em `ACTIONS_DISABLED` antes de `CONFIRMATION_REQUIRED`, e o canal é byte-a-byte o de hoje.
 */

import { config } from '../../../../lib/config.js';
import { findManifestById } from '../../../../repositories/manifest-repo.js';
import { evaluateConversationPolicy } from '../../conversation-policy-service.js';
import type { ConversationContext } from '../../conversation-context-service.js';
import type { ConversationPrincipal } from '../../conversation-principal.js';
import {
  getWhatsAppEligibleAction,
  resolveWhatsAppActionKey,
  resolveWhatsAppOutboundNoticeEnabled,
  type WhatsAppEligibleAction
} from './whatsapp-action-eligibility.js';
import type { WhatsAppConfirmationUtterance } from './whatsapp-confirmation-grammar.js';
import {
  buildManifestIdentityLabel,
  buildWhatsAppAlreadyUsedText,
  buildWhatsAppAttemptsExhaustedText,
  buildWhatsAppCancelledTicketText,
  buildWhatsAppConfirmationPreview,
  buildWhatsAppConfirmedText,
  buildWhatsAppConflictText,
  buildWhatsAppDeclinedText,
  buildWhatsAppDispatchBlockedText,
  buildWhatsAppDispatchRetryLead,
  buildWhatsAppExpiredTicketText,
  buildWhatsAppOtherPhoneTicketText,
  buildWhatsAppStepUpRequiredText,
  buildWhatsAppN2NoticeMissingText,
  buildWhatsAppVagueYesText,
  buildWhatsAppWrongCodeText,
  collectActionManifestIds,
  extractConferibleItemLabels
} from './whatsapp-confirmation-texts.js';
import { buildWhatsAppCreatePreview } from './whatsapp-create-preview.js';
import { buildWhatsAppReceiveConference, WHATSAPP_RECEIVE_ACTION_KEY } from './whatsapp-receive-preview.js';
import { enqueueWhatsAppOutboundNotice } from './whatsapp-outbound-notice-service.js';
import {
  closeWhatsAppActionTicket,
  debitWhatsAppActionTicketSend,
  debitWhatsAppActionWindow,
  findLiveWhatsAppActionTicket,
  findLiveWhatsAppActionWindow,
  fingerprintActionArgs,
  inspectRecentWhatsAppActionTicket,
  issueWhatsAppActionTicket,
  patchWhatsAppActionTicketMetadata,
  redeemWhatsAppActionTicket,
  type IssuedWhatsAppActionTicket,
  type WhatsAppActionTicket,
  type WhatsAppBindingConflict
} from './whatsapp-action-ticket-service.js';

type LooseRecord = Record<string, unknown>;

// ---------------------------------------------------------------------------------------------
// Seam de leitura — SÓ para testes (mesmo molde de `setWhatsAppActionTicketRepositoriesForTests`)
// ---------------------------------------------------------------------------------------------

/**
 * A resolução da identidade conferível é a correção CENTRAL desta fase: sem ela nenhum intent de lote
 * emite ticket. Ela depende de uma leitura de banco (`findManifestById`), e um `import` estático torna
 * o caminho inteiro inalcançável por teste de unidade — a alternativa seria abrir conexão com o
 * Postgres dentro da suíte, ou não cobrir a entrega da fase. As duas são inaceitáveis.
 *
 * O override é TOTAL (`ConfirmationRepositories | null`), nunca `Partial`: um spread sobre o default
 * faria uma chave ausente cair no repositório REAL, e o desfecho do teste passaria a depender de haver
 * banco na máquina — a mesma armadilha que o seam do ticket-service documenta.
 */
export type ConfirmationRepositories = {
  findManifestById: typeof findManifestById;
};

const DEFAULT_CONFIRMATION_REPOSITORIES: ConfirmationRepositories = { findManifestById };

let confirmationRepositories: ConfirmationRepositories = DEFAULT_CONFIRMATION_REPOSITORIES;

export function setWhatsAppConfirmationRepositoriesForTests(overrides: ConfirmationRepositories | null): void {
  confirmationRepositories = overrides ?? DEFAULT_CONFIRMATION_REPOSITORIES;
}

export type ConfirmationTurnOutput = {
  status: string;
  responseText?: string;
  policy?: { reasonCode?: string | null } | null;
  toolCall?: { name: string; arguments: LooseRecord } | null;
  context?: { integrationAccountId?: string | null; sessionContextId?: string | null } | null;
  conversationSessionId?: string | null;
  conversationTurnId?: string | null;
  /** `ConversationStructuredResult` do turno. Só é lido para extrair `jobId` para a trilha. */
  result?: unknown;
};

export type ConfirmationFlowResult = {
  /** Texto ÚNICO. Quem chama passa pelo funil de higiene (`composeWhatsAppNotice`). */
  text: string;
  outcome: string;
  conversationTurnId?: string | null;
};

/**
 * O vínculo, como o fluxo de confirmação precisa dele.
 *
 * `channelLinkId` entrou na fase 6 e é o id OPACO da linha em `conversation_channel_links`. Ele é o
 * que vai para o `payload` do job de aviso — TELEFONE NUNCA VAI: o destinatário é relido no envio, e é
 * isso que faz a revogação do vínculo calar o canal na hora.
 */
export type ConfirmationLink = { userId: string; externalUserKey: string; channelLinkId: string };

export type ConfirmationFlowDependencies = {
  processTurn: (input: LooseRecord) => Promise<ConfirmationTurnOutput & LooseRecord>;
};

// ---------------------------------------------------------------------------------------------
// Emissão
// ---------------------------------------------------------------------------------------------

/**
 * Chave da criação na matriz do canal. `whatsapp-create-preview` não exporta constante equivalente à
 * `WHATSAPP_RECEIVE_ACTION_KEY` (ele serve os dois modos e não se amarra a uma chave), então ela vive
 * aqui — e um teste prende que ela existe em `WHATSAPP_ELIGIBLE_ACTIONS`, para o literal não derivar.
 */
export const WHATSAPP_CREATE_ACTION_KEY = 'manifest.create_from_payload';

/**
 * Manchete em português de operação. É o que a pessoa lê em negrito antes do código, e o que volta
 * em toda mensagem de erro do ticket — por isso vive numa tabela, não numa interpolação de intent.
 *
 * ⚠️ FALTAR AQUI É FALHA SILENCIOSA. `buildActionHeadline` devolve `null` para chave sem entrada, e
 * `tryIssueWhatsAppActionTicket` trata `null` como "não é caso de ticket": a ação some do canal sem
 * erro, sem log e sem teste vermelho. Toda chave de `WHATSAPP_ELIGIBLE_ACTIONS` PRECISA de manchete —
 * é o que o teste "toda chave elegível tem manchete" prende.
 */
const ACTION_HEADLINES: Readonly<Record<string, (count: number) => string>> = Object.freeze({
  print_manifest: () => '2a via de 1 MTR',
  'manifest.batch_print_selected': (count) => `2a via de ${count} MTR${count === 1 ? '' : 's'}`,
  'manifest.replicate_segmented': (count) => `Replicar em ${count} rascunho${count === 1 ? '' : 's'}`,
  submit_manifest: () => 'Emitir 1 MTR na CETESB',
  'manifest.batch_submit_selected': (count) => `Emitir ${count} MTR${count === 1 ? '' : 's'} na CETESB`,
  // As duas promovidas na unidade D4. Sem `count`: `maxItems: 1` nas duas.
  [WHATSAPP_RECEIVE_ACTION_KEY]: () => 'Dar baixa (receber) em 1 MTR',
  [WHATSAPP_CREATE_ACTION_KEY]: () => 'Criar 1 MTR no SICAT'
});

export function buildActionHeadline(key: string, count: number): string | null {
  if (!Object.prototype.hasOwnProperty.call(ACTION_HEADLINES, key)) return null;
  return ACTION_HEADLINES[key]?.(Math.max(1, count)) ?? null;
}

const IRREVERSIBLE_WARNING =
  'Emitir cria o MTR de verdade. O unico jeito de desfazer e cancelar - e cancelar nao tem volta e nao da para fazer por aqui.';

/**
 * O PARÁGRAFO QUE DIZ O QUE A CONFIRMAÇÃO PROVOCA — um por ação, porque as ações provocam coisas
 * DIFERENTES e o texto de `submit` mente sobre as outras duas:
 *
 *  · `submit_*` — nasce MTR na CETESB; desfazer só cancelando, e cancelar não tem volta.
 *  · `manifest.receive_with_receipt` — `null` de propósito: o bloco de conferência da prévia de baixa
 *    JÁ termina em "Registrar a baixa gera o recibo do MTR na CETESB e nao da para desfazer por aqui."
 *    Repetir aqui daria dois avisos para o mesmo efeito.
 *  · `manifest.create_from_payload` — o efeito REAL é rascunho LOCAL (`createManifestDraftRecord`:
 *    `status:'draft'`, `externalStatus:'pending_submission'`, `externalReference: null`). Dizer aqui
 *    "cria o MTR de verdade" seria falso, e falso para MAIS grave — a pessoa acharia que já emitiu.
 *
 * ⚠️ A RESOLUÇÃO É POR CHAVE, E SÓ DEPOIS POR TIER — a ordem inversa custou o aviso da criação. Esta
 * função peneirava `tier !== 'N2'` na primeira linha, de modo que a reclassificação da criação para
 * N1 apagaria `CREATE_EFFECT_NOTE` da prévia SEM nenhum teste vermelho: a pessoa passaria a confirmar
 * a criação sem ler onde o MTR nasce. A nota da criação não é consequência do tier, é consequência do
 * que a ação FAZ — e o que ela faz não mudou. `IRREVERSIBLE_WARNING`, esse sim, é do tier: ele fala de
 * efeito na CETESB e só vale para quem tem um.
 */
const CREATE_EFFECT_NOTE =
  'Isso cria o MTR como rascunho no SICAT, com estes dados. Ele so vira MTR de verdade na CETESB quando voce mandar emitir.';

function resolveEffectNote(key: string, tier: WhatsAppEligibleAction['tier']): string | null {
  if (key === WHATSAPP_CREATE_ACTION_KEY) return CREATE_EFFECT_NOTE;
  if (key === WHATSAPP_RECEIVE_ACTION_KEY) return null;
  if (tier !== 'N2') return null;
  return IRREVERSIBLE_WARNING;
}

/**
 * ┌─ N2 ABERTO EM 2026-08-09. O QUE SE SABE E O QUE NÃO SE SABE ESTÁ NA TABELA ABAIXO ────────────┐
 * │ ⚠️ ESTE COMENTÁRIO FOI REESCRITO NA FASE 6. A versão anterior afirmava que "o aviso NÃO ENTROU │
 * │ — `whatsapp.outbound_notice` não existe como job, handler ou chamada de saída". Isso deixou de │
 * │ ser verdade, e comentário obsoleto afirmando propriedade que o código não tem é exatamente     │
 * │ como esta cadeia já errou quatro vezes.                                                        │
 * │                                                                                                │
 * │ O QUE EXISTE AGORA: `whatsapp.outbound_notice` é job, tem handler, tem raia, tem retry próprio,│
 * │ tem textos e é exercitado por N1 em toda 2ª via confirmada. Sucesso, falha, DLQ e prazo vencido│
 * │ chegam ao telefone.                                                                            │
 * │                                                                                                │
 * │ POR QUE O PORTÃO CONTINUA FECHADO — e não é falta de tempo:                                    │
 * │  1. O aviso NÃO CONSEGUE DISTINGUIR "o MTR não foi criado" de "o MTR foi criado e eu perdi a   │
 * │     resposta". Um `manifest.submit` pode falhar DEPOIS de a CETESB ter criado o MTR (timeout na│
 * │     resposta, erro de parse, o pod morrendo entre o POST e o commit) e `lastErrorCode` não     │
 * │     distingue "não chegou lá" de "chegou e eu não soube". Para emissão irreversível essa é a   │
 * │     ÚNICA informação que importa. O melhor aviso possível para o pior desfecho de uma emissão  │
 * │     é "vá conferir no SICAT" — que é o que o canal já entrega hoje SEM aviso nenhum. Os textos │
 * │     N2 existem, testados, em `whatsapp-notice-texts.ts`, e servem justamente para tornar isso  │
 * │     legível. Fazer melhor exige RECONCILIAÇÃO com a CETESB (uma consulta pós-falha que responda│
 * │     se o MTR nasceu), que não existe neste repo e é escopo próprio.                            │
 * │  2. O ponto cego do aviso coincide com o pior desfecho: um `submit` que vai para a DLQ é o mais│
 * │     provável de terminar FORA da janela de 24 h, onde este desenho não empurra nada (o caminho │
 * │     de template foi recusado — ver `whatsapp-outbound-notice-service`) e a dívida só paga se a │
 * │     pessoa voltar.                                                                             │
 * │  3. Nada disto rodou contra provedor real: `WHATSAPP_PROVIDER=disabled` é o default, a migration│
 * │     020 nunca foi aplicada e a prova disponível é teste com doubles.                            │
 * │                                                                                                │
 * │ O PORTÃO AGORA TEM TRÊS TRANCAS, e a terceira não pode ser mal configurada:                     │
 * │  (i)   este literal, que nenhuma env contradiz;                                                 │
 * │  (ii)  `config.whatsappActionNoticeEnabled`, que continua NÃO BASTANDO;                         │
 * │  (iii) a INVARIANTE DE IMPORT de `whatsapp-outbound-notice-service.ts` — a operação tem de estar│
 * │        em `CHANNEL_LANE_OPERATIONS`, sob pena de o processo não subir. Sem a raia, numa         │
 * │        instalação `WORKER_LANE=default`+`channel` o aviso não seria reivindicado por ninguém, e │
 * │        N2 estaria liberado num canal onde o desfecho é invisível. Um portão que não PODE ser mal│
 * │        configurado vale mais que um que depende de alguém configurar certo.                     │
 * │                                                                                                │
 * │ ══════════ PORTÃO ABERTO EM 2026-08-09, POR DECISÃO EXPLÍCITA DO OPERADOR ══════════            │
 * │                                                                                                │
 * │ Estado REAL de cada evidência no momento da abertura — escrito como está, não como convém:      │
 * │                                                                                                │
 * │  E1 execução real ponta a ponta em sandbox, em sucesso E em falha                               │
 * │     ✅ PARCIAL. Sucesso PROVADO contra o sandbox Twilio real: webhook assinado do número        │
 * │        vinculado → `enqueued=1` → job `whatsapp.inbound_message` succeeded em 24,5 s → resposta │
 * │        com 50 manifestos reais da CETESB entregue no aparelho (status `read`).                  │
 * │     ❌ NÃO provado: o caminho de AÇÃO (só o de consulta rodou) nem o caminho de FALHA.          │
 * │                                                                                                │
 * │  E2 `WORKER_LANE=channel` no ar, com a raia `default` separada                                  │
 * │     ✅ SATISFEITA em 2026-08-09. Deployment `sicat-worker-channel` (`WORKER_LANE=channel`) no   │
 * │        ar, e `sicat-worker` restrito a `default` — subidos em DOIS commits, a raia nova primeiro│
 * │        e o corte do antigo só depois dela Ready, para não haver janela sem consumidor.          │
 * │        PROVADO em produção: uma mensagem injetada com assinatura legítima foi processada pela   │
 * │        raia do canal (23,0 s) e a raia `default` NÃO processou nada — separação real, não       │
 * │        presumida. Um turno de LLM deixou de ficar na frente de `manifest.submit` na fila.       │
 * │                                                                                                │
 * │  E3 `dispatchStatus` carimbado, verificado numa linha real                                      │
 * │     ❌ pendente — o mecanismo existe (`recordDispatchOutcome`), falta a evidência numa linha.   │
 * │                                                                                                │
 * │  E4 decisão sobre a cauda fora da janela de 24 h                                                │
 * │     ❌ pendente — sem template UTILITY aprovado, emissão que termine fora da janela NÃO é       │
 * │        empurrada ao usuário. Ele verá o desfecho pelo navegador, não pelo canal.                │
 * │                                                                                                │
 * │  E5 "o MTR nasceu na CETESB?" depois de uma falha de `manifest.submit`                          │
 * │     ✅ SATISFEITA — Track C integrado: marcador de correlação gravado no `manObservacao` antes  │
 * │        do PUT, reconciliador que consulta a CETESB, estado `submit_unconfirmed` para o "não     │
 * │        sei", costura da linha órfã e job de varredura.                                          │
 * │                                                                                                │
 * │ O PORTÃO TRANCAVA TRÊS AÇÕES — `submit_manifest`, `manifest.batch_submit_selected` e            │
 * │ `manifest.receive_with_receipt`. As três criam registro na CETESB sem inverso, que é o critério │
 * │ inteiro de N2. Elas continuam exigindo: janela de ação aberta na sessão web autenticada,        │
 * │ prévia de conferência que RECUSA quando não consegue montar a lista, ticket e código de 6       │
 * │ dígitos. O que mudou é só que o desfecho passa a ser avisado pelo canal.                        │
 * │                                                                                                │
 * │ ROLLBACK, em ordem de rapidez: (1) revogar `allowChannels` no AI Control Center — segundos,     │
 * │ sem deploy; (2) `WHATSAPP_ACTION_NOTICE_ENABLED=false` — minutos, via git; (3) este literal de  │
 * │ volta a `false` — exige build. A (1) é a alavanca de incidente.                                 │
 * │                                                                                                 │
 * │ ⚠️ ERAM QUATRO. `manifest.create_from_payload` foi trancada aqui por engano: a unidade que a     │
 * │ promoveu afirmou que ela "cria registro real na CETESB sem inverso", e não cria — é `insert`    │
 * │ local de rascunho, `jobId: null`, gateway nenhum (a cadeia está por extenso em                  │
 * │ `whatsapp-action-eligibility.ts`). Reclassificada para N1, ela não passa mais por este portão e │
 * │ PASSA A FUNCIONAR de fato quando um admin ligar a chave no AI Control Center. O passo           │
 * │ irreversível continua sendo o `submit`, que é N2 e segue aqui.                                  │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 */
const WHATSAPP_OUTBOUND_NOTICE_IMPLEMENTED = true;

/** Teto de itens resolvidos por prévia. Acima disso a lista já é "e mais N" e o custo é de banco. */
const MAX_RESOLVED_IDENTITY_ITEMS = 10;

/**
 * Emite o ticket a partir de um turno `blocked / CONFIRMATION_REQUIRED`.
 *
 * O TICKET SÓ É CRIADO DEPOIS DE TODAS AS GUARDAS PASSAREM — e "todas" inclui as que a policy NÃO
 * aplica na emissão. Chegar aqui garante permissão, conta CETESB e elegibilidade de canal; NÃO
 * garante o teto de lote, porque `BATCH_LIMIT_EXCEEDED` só é avaliado com `confirmed: true`, isto é,
 * depois de a pessoa digitar o código. Por isso a ordem desta função é, rigorosamente:
 *
 *   1. resolver a IDENTIDADE conferível (leitura, nenhuma escrita);
 *   2. conferir o teto de lote do canal;
 *   3. conferir a completude da identidade;
 *   4. [N2] conferir a janela;
 *   5. SÓ ENTÃO emitir, e renderizar a prévia.
 *
 * Nada é escrito enquanto o desfecho ainda puder ser "não emite". Nunca se faz alguém digitar um
 * código para receber um "não", e nunca se destrói um pedido pendente por uma tentativa que se
 * autocancela em seguida.
 *
 * `null` = não é caso de ticket (deixe o composer responder como hoje).
 */
export async function tryIssueWhatsAppActionTicket(input: {
  output: ConfirmationTurnOutput;
  principal: ConversationPrincipal;
  link: ConfirmationLink;
  correlationId: string | null;
}): Promise<ConfirmationFlowResult | null> {
  const toolCall = input.output.toolCall;
  if (!toolCall?.name) return null;

  const intent = typeof toolCall.arguments?.intent === 'string' ? toolCall.arguments.intent : '';
  const key = resolveWhatsAppActionKey(toolCall.name, intent);
  const eligible = getWhatsAppEligibleAction(key);
  if (!eligible) return null;

  const rawArgs = (toolCall.arguments || {}) as LooseRecord;

  // ── CONFERÊNCIA DEDICADA (recebimento / criação), ANTES DE QUALQUER ESCRITA ────────────────────
  // As duas chaves promovidas na unidade D4 não têm identidade conferível pela via genérica: a baixa
  // precisa mostrar resíduo e quantidade (que não estão nos argumentos) e a criação não tem
  // manifesto nenhum para resolver — `resolveActionIdentity` devolveria zero rótulo e o canal
  // recusaria tudo em silêncio. Quem monta a conferência delas são os módulos dedicados, e a recusa
  // deles é FINAL: `canIssueTicket:false` / `ok:false` ⇒ NENHUM ticket, exatamente como identidade
  // incompleta.
  const conference = await resolveActionConference(key, rawArgs);
  if (conference && !conference.ok) {
    console.warn(
      `[whatsapp-confirm] conferencia dedicada RECUSADA para "${key}" (${conference.reason}) — nenhum ticket criado.`
    );
    return null;
  }

  // ── IDENTIDADE CONFERÍVEL, ANTES DE QUALQUER ESCRITA ──────────────────────────────────────────
  // Toda decisão que pode terminar em "não emite" acontece AQUI, antes de o banco ser tocado. A
  // versão anterior inseria a linha, montava a prévia, descobria que não havia rótulo e fechava o
  // ticket recém-criado como `cancelled`: duas linhas de lixo por tentativa e — muito pior — o
  // `superseded` do início já tinha DESTRUÍDO em silêncio o ticket legítimo que estava pendente.
  const identity = conference
    ? { labels: conference.labels, requestedCount: conference.labels.length, effectCount: 1 }
    : await resolveActionIdentity(rawArgs);
  const headline = buildActionHeadline(key, identity.effectCount || 1);
  if (!headline) return null;

  if (identity.effectCount > eligible.maxItems) {
    // TETO DE LOTE CONFERIDO NA EMISSÃO. A policy só avalia `BATCH_LIMIT_EXCEEDED` com
    // `confirmed: true`, ou seja, DEPOIS de a pessoa digitar o código — e o texto devolvido lá diz
    // "alguma coisa mudou no seu SICAT", que é falso: nada mudou, o pedido nunca foi admissível. É
    // aqui que `WHATSAPP_ELIGIBLE_ACTIONS.maxItems`, até então declarado e nunca lido, passa a valer.
    return {
      text: buildWhatsAppBatchTooLargeText({
        headline,
        requested: identity.effectCount,
        maxItems: eligible.maxItems
      }),
      outcome: 'whatsapp_inbound_action_batch_too_large'
    };
  }

  if (identity.labels.length === 0 || identity.labels.length !== identity.requestedCount) {
    // Duas recusas com a mesma causa: a prévia não consegue mostrar, item a item, o que será
    // executado. Zero rótulos é o caso óbvio. Rótulos DE MENOS é o traiçoeiro — listar 3 MTRs e
    // executar 5 é pior que não listar nenhum, porque parece conferência. Nenhum ticket é criado, e
    // a pessoa recebe a resposta de sempre (vai ao navegador), com o pedido pendente anterior
    // INTACTO.
    console.warn(
      `[whatsapp-confirm] identidade conferivel INCOMPLETA para "${key}" `
      + `(${identity.labels.length}/${identity.requestedCount}) — nenhum ticket criado.`
    );
    return null;
  }

  const labels = identity.labels;

  // ── N2: JANELA DE AÇÃO ────────────────────────────────────────────────────────────────────────
  let stepUpWindowId: string | null = null;
  let windowLine: string | null = null;
  if (eligible.tier === 'N2') {
    // PORTÃO DO N2 — DUAS TRANCAS, E SÓ UMA ABRIU.
    //
    // ⚠️ ESTE COMENTÁRIO FOI CORRIGIDO EM 2026-08-09. Ele dizia "sem o aviso de conclusão, nenhuma
    // ação N2 sai — e nenhuma env o abre", e as duas metades deixaram de ser verdade no mesmo
    // commit: `WHATSAPP_OUTBOUND_NOTICE_IMPLEMENTED` foi para `true` (o registro da decisão, com o
    // estado real de E1–E5, está no bloco daquela constante), então os dois `submit` e o recebimento
    // PASSAM por aqui e emitem ticket.
    //
    // O que continua trancando, e é o que os testes prendem:
    //  (i)  `resolveWhatsAppOutboundNoticeEnabled()` — a env `WHATSAPP_ACTION_NOTICE_ENABLED`, que
    //       segue valendo e é a alavanca de rollback nº 2 (git, sem build);
    //  (ii) a JANELA DE AÇÃO, logo abaixo — que passou a ser a guarda que sustenta o N2 sozinha.
    // O texto da recusa varia por ação: o verbo de `submit` mentiria no recebimento.
    //
    // A CRIAÇÃO NÃO CHEGA MAIS AQUI: ela é N1 (rascunho local, gateway nenhum) e segue pelo caminho
    // de baixo, emitindo ticket. A conferência FAIL-CLOSED dela continua valendo — é a guarda de
    // `resolveActionConference` acima, não este portão, que a sustenta.
    if (!WHATSAPP_OUTBOUND_NOTICE_IMPLEMENTED || !resolveWhatsAppOutboundNoticeEnabled()) {
      return {
        text: buildWhatsAppN2NoticeMissingText(key),
        outcome: 'whatsapp_inbound_action_notice_missing'
      };
    }

    const window = await findLiveWhatsAppActionWindow(input.link);
    if (!window || window.actionsUsed >= window.actionsBudget) {
      // NENHUM TICKET É CRIADO: se não existe nada pendente, não existe nada que a vítima possa ser
      // induzida a confirmar.
      return {
        text: buildWhatsAppStepUpRequiredText(input.correlationId),
        outcome: 'whatsapp_inbound_stepup_required'
      };
    }
    if ((window.integrationAccountId ?? null) !== (input.principal.integrationAccountId ?? null)) {
      return {
        text: buildWhatsAppStepUpRequiredText(input.correlationId),
        outcome: 'whatsapp_inbound_stepup_account_mismatch'
      };
    }
    stepUpWindowId = window.id;
    windowLine = `Liberacao ativa - esta seria a ${window.actionsUsed + 1}a de ${window.actionsBudget} acoes.`;
  }

  // A PARTIR DAQUI a emissão está decidida. O `superseded` do ticket anterior (dentro de
  // `issueWhatsAppActionTicket`) só acontece porque um pedido novo, válido e conferível vai ocupar o
  // lugar dele — nunca mais por uma tentativa que se autocancela em seguida.
  const previous = await findLiveWhatsAppActionTicket(input.link);
  const frozenArgs = { ...rawArgs };

  const issued = await issueWhatsAppActionTicket({
    userId: input.link.userId,
    externalUserKey: input.link.externalUserKey,
    binding: {
      toolName: toolCall.name,
      intent,
      // `frozenArgs` continua sendo EXATAMENTE o que o LLM pediu: é o `toolRequest.arguments` do
      // despacho e a entrada do `argsFingerprint`. A identidade humana viaja ao lado, em `itemLabels`.
      frozenArgs,
      argsFingerprint: fingerprintActionArgs(frozenArgs),
      humanSummary: headline,
      itemLabels: labels,
      snapshotAccountId: input.principal.integrationAccountId,
      snapshotSessionContextId: input.principal.sessionContextId,
      conversationSessionId: input.output.conversationSessionId ?? null,
      riskTier: eligible.tier,
      // OPERAÇÕES, não linhas de conferência. `itemCount` vira "Coloquei as N operações na fila" em
      // `buildWhatsAppConfirmedText`: nas chaves com conferência dedicada os rótulos são as LINHAS do
      // bloco (resíduos, entidades) e são várias para UMA operação — usar `labels.length` ali diria
      // "as 6 operações" para uma única criação.
      itemCount: conference ? identity.effectCount : labels.length,
      previewCorrelationId: input.correlationId,
      stepUpWindowId
    }
  });
  if (!issued) return null;

  const preview = renderTicketPreview({
    issued,
    key,
    headline,
    labels,
    principal: input.principal,
    supersededSummary: previous?.humanSummary ?? null,
    windowLine,
    tier: eligible.tier,
    conferenceBlock: conference?.block ?? null
  });

  if (!preview) {
    // Rede de segurança, não caminho esperado: a decisão de não emitir já foi tomada lá em cima. Se
    // a prévia ainda assim não puder ser montada (código fora do formato), o ticket é descartado e o
    // fato é gritado no log — a alternativa seria deixar a pessoa com um pedido pendente que ela não
    // consegue confirmar e que, pelo índice único vivo, bloqueia qualquer pedido novo por 300 s.
    console.error(
      `[whatsapp-confirm] previa INESPERADAMENTE vazia para o ticket ${issued.ticket.id} — descartado. `
      + 'A guarda de identidade a montante deveria ter impedido a emissao.'
    );
    await closeWhatsAppActionTicket({ id: issued.ticket.id, userId: issued.ticket.userId, outcome: 'cancelled' });
    return null;
  }

  return {
    text: preview,
    outcome: 'whatsapp_inbound_confirmation_pending',
    conversationTurnId: input.output.conversationTurnId ?? null
  };
}

/** Ponto único de renderização da prévia — usado na emissão e na REEMISSÃO por falha de despacho. */
function renderTicketPreview(input: {
  issued: IssuedWhatsAppActionTicket;
  key: string;
  headline: string;
  labels: string[];
  principal: ConversationPrincipal;
  supersededSummary: string | null;
  windowLine: string | null;
  tier: WhatsAppEligibleAction['tier'];
  /** Bloco pronto das prévias dedicadas. `null` = lista genérica de rótulos (o caminho de sempre). */
  conferenceBlock?: string | null;
}): string | null {
  return buildWhatsAppConfirmationPreview({
    headline: input.headline,
    items: input.labels.map((label) => ({ label })),
    accountLabel: resolveAccountLabel(input.principal),
    code: input.issued.code,
    ttlSeconds: resolveTtlSeconds(input.issued.ticket.expiresAt),
    ticketId: input.issued.ticket.id,
    supersededSummary: input.supersededSummary,
    windowLine: input.windowLine,
    irreversibleWarning: resolveEffectNote(input.key, input.tier),
    conferenceBlock: input.conferenceBlock ?? null
  });
}

// ---------------------------------------------------------------------------------------------
// Conferência dedicada (unidade D4) — recebimento e criação
// ---------------------------------------------------------------------------------------------

type ActionConference =
  | { ok: true; block: string; labels: string[] }
  | { ok: false; reason: string };

/**
 * LIGA AS PRÉVIAS DEDICADAS AO FLUXO. `null` = a chave não tem conferência própria (siga a via
 * genérica). Nenhuma decisão de política mora aqui: o módulo de prévia decide se dá para conferir, e
 * esta função só traduz o veredito para o formato que a emissão consome.
 */
async function resolveActionConference(key: string, args: LooseRecord): Promise<ActionConference | null> {
  if (key === WHATSAPP_RECEIVE_ACTION_KEY) {
    const conference = await buildWhatsAppReceiveConference(args);
    if (!conference.canIssueTicket) return { ok: false, reason: conference.reason };
    return {
      ok: true,
      block: conference.text,
      // O rótulo do manifesto PRIMEIRO: é ele que a reemissão e o aviso de conclusão mostram quando o
      // bloco já não existe. As linhas de resíduo vão junto para que a identidade congelada seja a
      // mesma que a pessoa conferiu.
      labels: [conference.manifestLabel, ...conference.residueLines]
    };
  }

  if (key === WHATSAPP_CREATE_ACTION_KEY) {
    // `handleManifestCreateFromPayload` executa `{...snapshotPayload, ...args.payload}` — o snapshot
    // é um blob base64url que só ELE decodifica. Com snapshot presente, a prévia veria menos do que
    // a execução faria, e mostrar menos do que se executa é o defeito de "listar 3 e executar 5".
    // Recusa, sem tentar decodificar aqui: duplicar o parser seria uma segunda verdade a divergir.
    if (hasEncodedCreationSnapshot(args)) return { ok: false, reason: 'creation_snapshot_not_conferible' };

    const preview = await buildWhatsAppCreatePreview({
      mode: 'complete',
      payload: asRecord(args.payload),
      // A conta CETESB sai UMA vez, na cauda do ticket (`resolveAccountLabel`) — passar aqui também
      // renderizaria a linha duas vezes.
      accountLabel: null
    });
    if (!preview.ok) return { ok: false, reason: preview.blocker };
    return { ok: true, block: preview.text, labels: preview.itemLabels };
  }

  return null;
}

/**
 * `true` quando os argumentos trazem snapshot de criação NA FORMA QUE O DISPATCHER DECODIFICA
 * (`toNullableString`: string/number/boolean não vazios). Objeto solto em `selectionSnapshot` não
 * decodifica lá e não muda o payload executado, então também não recusa aqui.
 */
function hasEncodedCreationSnapshot(args: LooseRecord): boolean {
  for (const value of [args.creationSnapshot, args.selectionSnapshot]) {
    if (typeof value === 'string' && value.trim()) return true;
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return true;
  }
  return false;
}

type ActionIdentity = {
  /** Rótulos humanos, um por manifesto DISTINTO tocado. Só entra o que foi resolvido contra o banco. */
  labels: string[];
  /** Quantos manifestos distintos a ação toca. É o que a prévia precisa listar item a item. */
  requestedCount: number;
  /**
   * Quantos EFEITOS a ação produz. Igual a `requestedCount` na regra geral e diferente em
   * `manifest.replicate_segmented`, onde um mesmo manifesto de origem vira N rascunhos: lá o teto do
   * canal (e a manchete "Replicar em N rascunhos") falam de RÉPLICAS, não de origens.
   */
  effectCount: number;
};

/**
 * IDENTIDADE CONFERÍVEL A PARTIR DOS ARGUMENTOS REAIS DO ORQUESTRADOR.
 *
 * O que chega em `toolCall.arguments` é id interno (`man_<hex>`) em `manifestIds` /
 * `selectionSnapshot.selectedManifestIds` / `segments[].sourceManifestId` — nunca número de MTR. O
 * extrator de rótulos descarta id interno, e com razão; o defeito era descartar sem RESOLVER, o que
 * deixava todo intent de lote sem rótulo nenhum e, por consequência, sem prévia e sem ticket.
 *
 * Quem chama exige `labels.length === requestedCount`: resolver de menos é pior que não resolver,
 * porque listar 3 e executar 5 PARECE conferência.
 */
async function resolveActionIdentity(args: LooseRecord): Promise<ActionIdentity> {
  const manifestIds = collectActionManifestIds(args);
  const effectCount = Array.isArray(args.segments) && args.segments.length > 0
    ? args.segments.length
    : manifestIds.length;

  if (manifestIds.length === 0) {
    // Nenhum id: a ação foi nomeada por número (`manifestNumber`) ou por rótulo já pronto. O extrator
    // continua sendo a fonte, e continua descartando id interno.
    const labels = extractConferibleItemLabels(args);
    return { labels, requestedCount: labels.length, effectCount: effectCount || labels.length };
  }

  if (manifestIds.length > MAX_RESOLVED_IDENTITY_ITEMS) {
    // Acima do teto de resolução nem se consulta o banco: nenhum intent elegível tem `maxItems` perto
    // disso, então o desfecho já está decidido (lote excedido) e sem rótulo nenhum.
    return { labels: [], requestedCount: manifestIds.length, effectCount };
  }

  const labels: string[] = [];
  for (const manifestId of manifestIds) {
    const label = await resolveManifestLabel(manifestId);
    if (label) labels.push(label);
  }

  return { labels: [...new Set(labels)], requestedCount: manifestIds.length, effectCount };
}

/**
 * Um id interno vira "MTR 202600123456 - NOVA IT AMBIENTAL (12/03/2026)".
 *
 * Leitura LOCAL (`findManifestById`), nunca `getManifest`: aquele reconcilia estado e pode acionar o
 * gateway CETESB — uma chamada externa no meio da montagem de uma prévia, com o turno já bloqueado.
 * Falha de banco devolve `null`, e `null` faz a emissão ser recusada (fail-closed).
 */
async function resolveManifestLabel(manifestId: string): Promise<string | null> {
  try {
    const manifest = await confirmationRepositories.findManifestById(manifestId);
    if (!manifest) return null;

    const externalReference = asRecord(manifest.externalReference);
    const payload = asRecord(manifest.payload);
    const generator = asRecord(payload.generator);

    return buildManifestIdentityLabel({
      manifestNumber: toScalarString(externalReference.manNumero),
      generatorDescription: toScalarString(generator.description),
      expeditionDate: toScalarString(payload.expeditionDate)
    });
  } catch (error) {
    console.error(
      `[whatsapp-confirm] falha ao resolver a identidade do manifesto: ${(error as Error)?.message || 'desconhecida'}`
    );
    return null;
  }
}

function asRecord(value: unknown): LooseRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as LooseRecord) : {};
}

function toScalarString(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Lote acima do teto do CANAL. Diz o número real pedido e o teto — sem isso a pessoa não sabe em
 * quantos pedaços dividir.
 */
function buildWhatsAppBatchTooLargeText(input: {
  headline: string;
  requested: number;
  maxItems: number;
}): string {
  return [
    `Por aqui eu faço no maximo ${input.maxItems} por vez, e voce pediu ${input.requested} (*${input.headline}*). *Nada foi executado.*`,
    '',
    `Me peca em partes de ate ${input.maxItems}, ou faca de uma vez no SICAT pelo navegador.`
  ].join('\n');
}

/**
 * Rótulo da conta CETESB. O principal só carrega o id — sem NOME não se afirma a conta na prévia:
 * dizer "Conta CETESB: acct_9f2c" é pior que omitir, porque parece conferência e não é.
 */
function resolveAccountLabel(principal: ConversationPrincipal): string | null {
  const label = (principal as unknown as { integrationAccountLabel?: unknown }).integrationAccountLabel;
  return typeof label === 'string' && label.trim() ? label.trim() : null;
}

function resolveTtlSeconds(expiresAt: string | null): number {
  const parsed = expiresAt ? Date.parse(expiresAt) : NaN;
  if (!Number.isFinite(parsed)) return 300;
  return Math.max(60, Math.round((parsed - Date.now()) / 1000));
}

// ---------------------------------------------------------------------------------------------
// Resgate
// ---------------------------------------------------------------------------------------------

/**
 * O TURNO DE RESGATE NÃO PASSA PELO LLM. `null` = a mensagem não é resgate (siga o fluxo normal).
 */
export async function runWhatsAppConfirmationRescue(input: {
  utterance: WhatsAppConfirmationUtterance;
  principal: ConversationPrincipal;
  link: ConfirmationLink;
  correlationId: string | null;
  dependencies: ConfirmationFlowDependencies;
}): Promise<ConfirmationFlowResult | null> {
  if (input.utterance.kind === 'none') return null;

  const live = await findLiveWhatsAppActionTicket(input.link);
  if (!live) {
    // ┌─ SEM TICKET VIVO ≠ SEM TICKET ────────────────────────────────────────────────────────────┐
    // │ `findLiveChannelVerificationByUser` filtra `consumed_at is null and expires_at > now()`.   │
    // │ Depois da queima ou dos 300 s a linha simplesmente SOME do find — e "sumiu" era tratado    │
    // │ como "isso é texto comum", jogando os 6 dígitos no planner. Consequências verificadas: as  │
    // │ frases obrigatórias ("ja foi usada as 14:32", "expirou e *nada foi executado*") eram       │
    // │ inalcançáveis, e o código em claro ia para o provedor de LLM e para os vetores do turno —  │
    // │ armazenamento durável, não trânsito.                                                       │
    // └────────────────────────────────────────────────────────────────────────────────────────────┘
    if (input.utterance.kind !== 'code') {
      // "sim"/"NAO" sem nada pendente são texto comum, e continuam sendo. `cancelar` isolado só
      // significa "desistir" QUANDO há algo pendente.
      return null;
    }
    return resolveDeadTicketOutcome(input.link);
  }

  if (input.utterance.kind === 'decline') {
    await closeWhatsAppActionTicket({ id: live.id, userId: live.userId, outcome: 'cancelled' });
    return { text: buildWhatsAppDeclinedText(), outcome: 'whatsapp_inbound_confirmation_declined' };
  }

  if (input.utterance.kind === 'vague_yes') {
    // NÃO conta tentativa de código — não pode consumir palpite. Gasta uma SAÍDA do ticket.
    if (await isTicketSendBudgetExhausted(live)) {
      return { text: '', outcome: 'whatsapp_inbound_confirmation_muted' };
    }
    return {
      text: buildWhatsAppVagueYesText({ headline: live.humanSummary }),
      outcome: 'whatsapp_inbound_confirmation_vague_yes'
    };
  }

  const verdict = await redeemWhatsAppActionTicket({
    code: input.utterance.code,
    context: {
      userId: input.principal.userId,
      externalUserKey: input.link.externalUserKey,
      integrationAccountId: input.principal.integrationAccountId,
      sessionContextId: input.principal.sessionContextId
    },
    confirmCorrelationId: input.correlationId,
    revalidate: (ticket) => revalidateTicket(ticket, input.principal, input.link)
  });

  switch (verdict.status) {
    case 'no_ticket':
      return null;
    case 'expired':
      return {
        text: buildWhatsAppExpiredTicketText({ headline: verdict.ticket.humanSummary, ttlSeconds: 300 }),
        outcome: 'whatsapp_inbound_confirmation_expired'
      };
    case 'already_used':
      return {
        text: buildWhatsAppAlreadyUsedText({ ticketId: verdict.ticket.id, usedAt: verdict.usedAt }),
        outcome: 'whatsapp_inbound_confirmation_replayed'
      };
    case 'attempts_exhausted':
      return {
        text: buildWhatsAppAttemptsExhaustedText(),
        outcome: 'whatsapp_inbound_confirmation_exhausted'
      };
    case 'wrong_code':
      // Código errado também é mensagem PAGA de saída: debita. Sem isto, quem erra (ou um número
      // comprometido em loop) recebe resposta de graça até o TTL.
      if (await isTicketSendBudgetExhausted(verdict.ticket)) {
        return { text: '', outcome: 'whatsapp_inbound_confirmation_muted' };
      }
      return {
        text: buildWhatsAppWrongCodeText({
          headline: verdict.ticket.humanSummary,
          attemptsRemaining: verdict.attemptsRemaining
        }),
        outcome: 'whatsapp_inbound_confirmation_wrong_code'
      };
    case 'conflict':
      return {
        text: buildWhatsAppConflictText({ conflict: verdict.conflict, ticketId: verdict.ticket.id }),
        outcome: 'whatsapp_inbound_confirmation_conflict'
      };
    case 'authorized':
      return dispatchConfirmedAction(verdict.ticket, input);
  }
}

/**
 * O DESFECHO DE UM CÓDIGO SEM TICKET VIVO.
 *
 * `null` só quando NÃO EXISTE linha recente deste usuário. Nesse caso os 6 dígitos são, de fato, texto
 * comum (uma quantidade, um número que ela leu em algum lugar) e recusá-los deterministicamente
 * tornaria o canal incapaz de responder sobre um número qualquer. O resíduo é estreito de propósito:
 * TODO código que este servidor emitiu deixa linha, então todo código REAL cai na classificação
 * acima — nenhum deles vira prompt de LLM.
 */
async function resolveDeadTicketOutcome(link: ConfirmationLink): Promise<ConfirmationFlowResult | null> {
  const recent = await inspectRecentWhatsAppActionTicket(link);

  switch (recent.status) {
    case 'none':
      return null;
    case 'other_phone':
      return {
        text: buildWhatsAppOtherPhoneTicketText(),
        outcome: 'whatsapp_inbound_confirmation_other_phone'
      };
    case 'already_used':
      return {
        text: buildWhatsAppAlreadyUsedText({ ticketId: recent.ticket.id, usedAt: recent.usedAt }),
        outcome: 'whatsapp_inbound_confirmation_replayed'
      };
    case 'attempts_exhausted':
      return {
        text: buildWhatsAppAttemptsExhaustedText(),
        outcome: 'whatsapp_inbound_confirmation_exhausted'
      };
    case 'cancelled':
      return {
        text: buildWhatsAppCancelledTicketText({ headline: recent.ticket.humanSummary }),
        outcome: 'whatsapp_inbound_confirmation_cancelled'
      };
    case 'conflict':
      return {
        text: buildWhatsAppConflictText({ conflict: 'unknown', ticketId: recent.ticket.id }),
        outcome: 'whatsapp_inbound_confirmation_conflict'
      };
    case 'expired':
      return {
        text: buildWhatsAppExpiredTicketText({
          headline: recent.ticket.humanSummary,
          // O prazo CONTRATADO, não o que sobrou (que é negativo — a linha já venceu). A frase é
          // "ela vale N minutos", explicando por que venceu.
          ttlSeconds: resolveConfiguredTtlSeconds()
        }),
        outcome: 'whatsapp_inbound_confirmation_expired'
      };
  }
}

/**
 * DÉBITO REAL DA SAÍDA PAGA. `true` = orçamento estourado, responda com SILÊNCIO.
 *
 * Antes isto era `live.sendCount >= live.maxSends` sobre um contador que NINGUÉM incrementava:
 * `insertChannelVerification` grava `send_count = 1` fixo e o único statement que somava era o do
 * reenvio de OTP de vínculo. `1 >= 4` é sempre falso, então o teto — nomeado no desenho como um dos
 * três freios contra a espiral de custo — nunca disparava: respondia-se a todo "sim" até o TTL.
 *
 * O `send_count < max_sends` agora mora no `where` do `update`, junto com o incremento: é o Postgres
 * que decide, não um `if` que duas mensagens concorrentes atravessam juntas.
 */
async function isTicketSendBudgetExhausted(ticket: WhatsAppActionTicket): Promise<boolean> {
  const verdict = await debitWhatsAppActionTicketSend({ id: ticket.id, userId: ticket.userId });
  if (verdict === 'exhausted') {
    console.warn(`[whatsapp-confirm] orcamento de saidas esgotado no ticket ${ticket.id} — silencio`);
    return true;
  }
  if (verdict === 'unmetered') {
    console.warn(`[whatsapp-confirm] saida do ticket ${ticket.id} NAO foi medida — respondendo assim mesmo`);
  }
  return false;
}

function resolveConfiguredTtlSeconds(): number {
  const seconds = Number(config.whatsappActionTicketTtlSeconds);
  return Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 300;
}

/**
 * REVALIDAÇÃO NA QUEIMA — nunca congelada na emissão.
 *
 * `evaluateConversationPolicy` roda DE NOVO, com `confirmed: true`: é isso que faz uma revogação no
 * AI Control Center alcançar tickets ainda não resgatados, apesar do cache de 30 s do registro de
 * runtime. E o débito da janela (N2) é atômico, com `attempt_count < max_attempts` no próprio `where`.
 */
async function revalidateTicket(
  ticket: WhatsAppActionTicket,
  principal: ConversationPrincipal,
  link: ConfirmationLink
): Promise<WhatsAppBindingConflict | null> {
  const decision = evaluateConversationPolicy({
    toolName: ticket.toolName,
    toolArgs: ticket.frozenArgs,
    channel: 'whatsapp',
    confirmed: true,
    allowActions: true,
    context: {
      channel: 'whatsapp',
      userId: principal.userId,
      integrationAccountId: principal.integrationAccountId,
      sessionContextId: principal.sessionContextId,
      channelSessionKey: principal.channelSessionKey,
      permissionKeys: principal.permissionKeys,
      requestedBy: principal.requestedBy,
      correlationId: ticket.previewCorrelationId || '',
      conversationSessionId: ticket.conversationSessionId || '',
      conversationTurnId: '',
      manifestId: null,
      jobId: null,
      auditCorrelationId: null,
      idempotencyKey: null,
      metadata: {}
    } satisfies ConversationContext
  });

  if (!decision.allowed) return 'policy_denied';

  if (ticket.riskTier === 'N2') {
    if (!ticket.stepUpWindowId) return 'window_missing';
    const window = await findLiveWhatsAppActionWindow(link);
    if (!window || window.id !== ticket.stepUpWindowId) return 'window_missing';
    if ((window.integrationAccountId ?? null) !== (principal.integrationAccountId ?? null)) return 'window_missing';
    const debited = await debitWhatsAppActionWindow({ id: window.id, userId: window.userId });
    if (!debited) return 'window_exhausted';
  }

  return null;
}

/**
 * DESPACHO. O `toolRequest` é montado AQUI, no servidor, a partir de `frozenArgs` — o texto da pessoa
 * (6 dígitos) nomeia o TICKET, nunca a ferramenta.
 *
 * ┌─ A QUEIMA VEM ANTES DO DESPACHO, E CONTINUA VINDO ────────────────────────────────────────────┐
 * │ A alternativa — despachar e só então queimar — admite EXECUÇÃO DUPLA: duas mensagens com o     │
 * │ mesmo código atravessariam o despacho antes de qualquer uma fechar a linha, e execução dupla é │
 * │ exatamente o defeito que este mecanismo existe para impedir. A ordem fica.                     │
 * │                                                                                                │
 * │ O que muda é o que acontece QUANDO O DESPACHO NÃO ACONTECE. Antes, o código só trocava a       │
 * │ mensagem: a linha ficava `verified` (que nesta sobrecarga semântica é lida como "executado") e │
 * │ a pessoa perdia a confirmação por uma falha que não era dela. Agora:                           │
 * │                                                                                                │
 * │  · o desfecho REAL do despacho é gravado em `metadata.dispatchStatus` (+ `dispatchedJobs`), de │
 * │    modo que `verified` deixa de ser prova de execução para quem lê a trilha;                   │
 * │  · falha NÃO-TERMINAL (`failed`: indisponibilidade, timeout) REEMITE o pedido automaticamente. │
 * │    Reemitir NÃO reabre janela de replay — o código antigo morreu com a linha, e o novo é outro │
 * │    segredo, com TTL, tentativas e orçamento próprios;                                          │
 * │  · falha TERMINAL (`blocked`: a política recusou) NÃO reemite. Remontar produziria o mesmo     │
 * │    "não" e faria a pessoa digitar um código para receber a recusa de novo.                     │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 */
async function dispatchConfirmedAction(
  ticket: WhatsAppActionTicket,
  input: {
    principal: ConversationPrincipal;
    link: ConfirmationLink;
    correlationId: string | null;
    dependencies: ConfirmationFlowDependencies;
  }
): Promise<ConfirmationFlowResult> {
  const output = await input.dependencies.processTurn({
    body: {
      message: '',
      context: {},
      metadata: { source: 'whatsapp', confirmationTicketId: ticket.id },
      options: { allowActions: true },
      toolRequest: {
        name: ticket.toolName,
        arguments: ticket.frozenArgs,
        confirmed: true
      }
    },
    principal: input.principal,
    // O job HERDA o correlationId da PRÉVIA (onde a intenção foi formada, com a frase humana). Sem
    // esta costura a trilha PARTE EM DOIS.
    correlationId: ticket.previewCorrelationId || input.correlationId,
    headers: {},
    idempotencyKey: ticket.id,
    userContent: null,
    ingestManifest: null
  });

  if (output.status === 'blocked') {
    await recordDispatchOutcome(ticket, { dispatchStatus: 'blocked' });
    return {
      text: buildWhatsAppDispatchBlockedText({ ticketId: ticket.id }),
      outcome: 'whatsapp_inbound_confirmation_blocked',
      conversationTurnId: output.conversationTurnId ?? null
    };
  }

  if (output.status === 'failed') {
    await recordDispatchOutcome(ticket, { dispatchStatus: 'failed' });
    const retry = await reissueAfterFailedDispatch(ticket, input);
    return {
      text: retry,
      outcome: 'whatsapp_inbound_confirmation_failed',
      conversationTurnId: output.conversationTurnId ?? null
    };
  }

  const dispatchedJobs = extractDispatchedJobIds(output.result);
  await recordDispatchOutcome(ticket, { dispatchStatus: 'dispatched', dispatchedJobs });

  // ── AVISO DE CONCLUSÃO (fase 6) ───────────────────────────────────────────────────────────────
  // O aviso nasce AQUI, e não no desfecho: esta é a única linha do sistema que tem, ao mesmo tempo, o
  // ticket, o vínculo e a lista de jobs recém-enfileirados. Enfileirar aqui dispensa o envelope
  // atravessando `conversation-service` + dispatcher — e a corrida que esse caminho tem.
  const noticeEnqueued = await enqueueWhatsAppOutboundNotice({
    ticketId: ticket.id,
    userId: ticket.userId,
    channelLinkId: input.link.channelLinkId,
    riskTier: ticket.riskTier,
    actionKey: resolveWhatsAppActionKey(ticket.toolName, ticket.intent),
    headline: ticket.humanSummary,
    itemCount: Math.max(1, ticket.itemCount),
    labels: ticket.itemLabels,
    dispatchedJobIds: dispatchedJobs,
    correlationId: ticket.previewCorrelationId || input.correlationId,
    integrationAccountId: input.principal.integrationAccountId,
    sessionContextId: input.principal.sessionContextId
  });

  return {
    text: buildWhatsAppConfirmedText({
      headline: ticket.humanSummary,
      itemCount: Math.max(1, ticket.itemCount),
      ticketId: ticket.id,
      // ┌─ PROMESSA SOLDADA AO MECANISMO ────────────────────────────────────────────────────────┐
      // │ O texto só promete aviso quando o JOB DE AVISO EXISTE. `false` (INSERT falhou, ou nada │
      // │ foi despachado — `manifest.replicate_segmented` é síncrono e devolve `jobId: null`)    │
      // │ devolve as duas linhas de hoje, palavra por palavra. Não existe caminho em que a       │
      // │ mensagem diga "te aviso" sem mecanismo por trás — foi exatamente esse o defeito que a  │
      // │ fase 5 teve de corrigir depois de já ter escrito o texto.                               │
      // └────────────────────────────────────────────────────────────────────────────────────────┘
      noticeEnqueued
    }),
    outcome: 'whatsapp_inbound_confirmation_executed',
    conversationTurnId: output.conversationTurnId ?? null
  };
}

/**
 * A LINHA DO TICKET É O LIVRO DE REGISTRO desta ação — `conversation_action_logs` passa por
 * `persistSafely`, que ENGOLE a exceção, e falha silenciosa não pode ser a prova de que alguém
 * autorizou uma ação externa. Sem este patch, `verified` seria a única coisa escrita, e `verified`
 * significa apenas QUEIMADO.
 */
async function recordDispatchOutcome(
  ticket: WhatsAppActionTicket,
  patch: { dispatchStatus: string; dispatchedJobs?: string[] }
): Promise<void> {
  await patchWhatsAppActionTicketMetadata({
    id: ticket.id,
    userId: ticket.userId,
    metadataPatch: {
      dispatchStatus: patch.dispatchStatus,
      dispatchedAt: new Date().toISOString(),
      ...(patch.dispatchedJobs && patch.dispatchedJobs.length > 0 ? { dispatchedJobs: patch.dispatchedJobs } : {})
    }
  });
}

/**
 * REEMISSÃO APÓS FALHA NÃO-TERMINAL. A identidade conferida é a MESMA (vem de `itemLabels`, congelada
 * na emissão) — não se resolve nada de novo contra o banco, então o que a pessoa confere é
 * exatamente o que ela já tinha conferido. O código é novo.
 *
 * Se a reemissão também falhar, a mensagem ainda diz o essencial: nada foi executado.
 */
async function reissueAfterFailedDispatch(
  ticket: WhatsAppActionTicket,
  input: { principal: ConversationPrincipal; link: ConfirmationLink; correlationId: string | null }
): Promise<string> {
  const lead = buildWhatsAppDispatchRetryLead({ headline: ticket.humanSummary });
  const askAgain = `\nMe peca de novo daqui a pouco que eu monto outra.\nProtocolo: ${ticket.id}`;

  // N2 NÃO é reemitido: o crédito da janela já foi debitado na queima e uma segunda confirmação o
  // debitaria de novo — duas ações de orçamento para uma ação executada. (Hoje N2 nem chega aqui:
  // ver `WHATSAPP_OUTBOUND_NOTICE_IMPLEMENTED`.)
  if (ticket.riskTier !== 'N1' || ticket.itemLabels.length === 0) {
    return `${lead}${askAgain}`;
  }

  const issued = await issueWhatsAppActionTicket({
    userId: input.link.userId,
    externalUserKey: input.link.externalUserKey,
    binding: {
      toolName: ticket.toolName,
      intent: ticket.intent,
      frozenArgs: ticket.frozenArgs,
      argsFingerprint: fingerprintActionArgs(ticket.frozenArgs),
      humanSummary: ticket.humanSummary,
      itemLabels: ticket.itemLabels,
      // Snapshot do contexto de AGORA: a amarração do ticket novo tem de valer contra o mundo em que
      // ele será resgatado, não contra o do ticket que falhou.
      snapshotAccountId: input.principal.integrationAccountId,
      snapshotSessionContextId: input.principal.sessionContextId,
      conversationSessionId: ticket.conversationSessionId,
      riskTier: ticket.riskTier,
      itemCount: ticket.itemCount,
      previewCorrelationId: input.correlationId,
      stepUpWindowId: null
    }
  });
  if (!issued) return `${lead}${askAgain}`;

  const preview = renderTicketPreview({
    issued,
    key: resolveWhatsAppActionKey(ticket.toolName, ticket.intent),
    headline: ticket.humanSummary,
    labels: ticket.itemLabels,
    principal: input.principal,
    supersededSummary: null,
    windowLine: null,
    // Sem `conferenceBlock`: o bloco não é congelado no ticket, e remontá-lo aqui resolveria o banco
    // de novo — a reemissão existe justamente para NÃO reconferir nada. Só N1 chega aqui (guarda
    // acima), e desde a reclassificação da criação uma chave N1 TEM conferência dedicada: o que ela
    // recebe na reemissão é a lista genérica montada sobre os MESMOS `itemLabels` que a prévia
    // dedicada congelou ("Gerador: …", "Residuo: …"), truncada em 3 + "e mais N". Continua sendo
    // conferível e continua sendo o que a pessoa já conferiu; o que não se faz é ler o banco de novo.
    //
    // `tier: 'N1'` aqui é o tier REAL de quem chega — e não apaga o aviso de efeito da criação:
    // `resolveEffectNote` resolve por CHAVE antes de olhar o tier, justamente para que a reemissão
    // não entregue um "confirme" sem dizer que o MTR nasce como rascunho.
    tier: 'N1'
  });
  if (!preview) {
    await closeWhatsAppActionTicket({ id: issued.ticket.id, userId: issued.ticket.userId, outcome: 'cancelled' });
    return `${lead}${askAgain}`;
  }

  return `${lead}${preview}`;
}

/**
 * Ids de job criados pelo despacho, para a trilha. Varredura RASA e limitada do resultado
 * estruturado: a pergunta que o suporte faz é "quais jobs esta confirmação despachou?", e a resposta
 * não pode depender de conhecer a forma exata de cada `ConversationStructuredResult`.
 */
function extractDispatchedJobIds(result: unknown): string[] {
  const found = new Set<string>();

  const walk = (value: unknown, depth: number): void => {
    if (found.size >= 20 || depth > 4 || !value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const entry of value.slice(0, 50)) walk(entry, depth + 1);
      return;
    }
    for (const [key, entry] of Object.entries(value as LooseRecord)) {
      if (key === 'jobId' && typeof entry === 'string' && entry.trim()) {
        found.add(entry.trim());
        continue;
      }
      walk(entry, depth + 1);
    }
  };

  walk(result, 0);
  return [...found];
}
