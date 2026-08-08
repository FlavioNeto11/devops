/**
 * ELEGIBILIDADE (código) × HABILITAÇÃO (runtime) — fase 5 da cadeia `whatsapp-channel-sicat`.
 *
 * Duas listas, com papéis opostos e ordem de avaliação que importa:
 *
 *  · `WHATSAPP_ELIGIBLE_ACTIONS` — o que o AI Control Center PODE ligar. É teto de código: um
 *    `PATCH /v1/ai-control/runtime/tools/:tool` com `allowChannels: ['whatsapp']` numa tool fora
 *    desta tabela não adiciona canal nenhum. Admin comprometido, ou clique errado, não INVENTA
 *    elegibilidade.
 *  · `CHANNEL_HARD_DENY` — o que nenhum PATCH abre, avaliada **DEPOIS** do overlay. Inverter a ordem
 *    (aplicar a recusa antes do overlay) faria um PATCH em `cancel_manifest` reabrir o cancelamento;
 *    é a mutação (d) do plano de teste.
 *
 * O critério da separação NÃO é o `riskLevel` do catálogo — ele está comprovadamente desalinhado
 * (`cdf.generate_from_manifest_selection` é R3 e exige `manifest.read`, a chave que o papel-piso
 * `sicat.reader` concede a todo auto-cadastro público). O critério é a IRREVERSIBILIDADE do efeito
 * externo:
 *
 *  N1 — nada muda de estado na CETESB: 2ª via de documento que já existe (`print`) e rascunhos
 *       locais (`replicate_segmented`, `jobId: null`). O código de 6 dígitos aqui é desambiguador e
 *       anti-replay, **não** segundo fator: ele chega pelo mesmo fio que a pergunta.
 *  N2 — nasce MTR real na CETESB e a única compensação é o cancelamento, que este desenho recusa.
 *       Exige, além do ticket, uma JANELA DE AÇÃO aberta na sessão web autenticada.
 *
 * ⚠️ N2 NÃO É LIBERADO NESTA FASE. O desenho condiciona `submit` ao aviso de conclusão
 * (`whatsapp.outbound_notice`): hoje quem age pelo canal não recebe o desfecho — `buildBatchActionFamily`
 * responde literalmente "me pergunte de novo daqui a pouco". Confirmar uma emissão irreversível num
 * canal onde o desfecho é invisível é defeito, não detalhe de fase 6. O aviso exige costurar a
 * conclusão dos jobs `manifest.submit` de volta ao ticket, o que passa pelo dispatcher — fora do
 * alcance desta fase. Por isso o portão é EXPLÍCITO e desligado (`whatsappActionNoticeEnabled`), e
 * não uma omissão: a maquinaria de N2 (janela, débito de crédito, revogação) está inteira e testada,
 * faltando apenas o aviso e o flip.
 */

import { config } from '../../../../lib/config.js';
import type { ConversationChannel } from '../../conversation-context-service.js';

export type WhatsAppActionTier = 'N1' | 'N2';

export type WhatsAppEligibleAction = {
  tier: WhatsAppActionTier;
  /**
   * Teto de itens do lote NO CANAL. Para os intents é o mesmo valor de `BATCH_LIMITS_BY_INTENT`
   * (a policy continua sendo quem aplica); para as tools DIRETAS é 1 — ver
   * `WHATSAPP_DIRECT_TOOL_MAX_ITEMS` abaixo.
   */
  maxItems: number;
};

/**
 * Chave = `toolName` para tool direta, `intent` para o orquestrador. Congelada: um `push` acidental
 * em runtime seria elevação de privilégio silenciosa.
 */
export const WHATSAPP_ELIGIBLE_ACTIONS: Readonly<Record<string, WhatsAppEligibleAction>> = Object.freeze({
  print_manifest: { tier: 'N1', maxItems: 1 },
  'manifest.batch_print_selected': { tier: 'N1', maxItems: 5 },
  'manifest.replicate_segmented': { tier: 'N1', maxItems: 2 },
  submit_manifest: { tier: 'N2', maxItems: 1 },
  'manifest.batch_submit_selected': { tier: 'N2', maxItems: 3 }
});

/**
 * Recusa permanente, com os dez nomes por extenso. Cada bloco tem motivo próprio:
 *
 *  · cancelamento (3 chaves) — `POST /api/mtr/manifesto/cancelaManifesto` não tem inverso no gateway
 *    nem no contrato capturado; desfazer é emitir OUTRO MTR, com número, data e trilha novos. Some-se
 *    a seleção cega: `cancel_recent_excluding_first` decide por linguagem natural quais MTRs morrem, e
 *    no celular não há a lista para conferir.
 *  · CDF (3 chaves) — as três exigem apenas `manifest.read` (`READ_ONLY_TOOLS`), chave do papel-piso
 *    concedida a todo auto-cadastro público, e uma delas EMITE certificado na CETESB. Step-up sobre a
 *    chave errada é teatro. Reavaliar só depois da fase 4.6.
 *  · `manifest.receive_with_receipt` — registra recebimento com recibo na CETESB, sem inverso e sem
 *    contexto visual. Primeira candidata a promoção depois que o mecanismo rodar em produção.
 *  · `manifest.create_from_payload` — conferir gerador, resíduo, transportador, motorista e placa
 *    montados pelo LLM sobre texto livre, por mensagem, não é conferência.
 *  · `manifest.create_draft` — A ARMADILHA SILENCIOSA DA FASE. É `requiresConfirmation: false` e
 *    `isAction: true`: no instante em que `allowActions` deixa de ser o literal `false`, é a ÚNICA
 *    ação que passaria sem nenhuma confirmação. Está aqui EXPLICITAMENTE, nunca por omissão.
 *  · `replicate_manifest` (direto) — `normalizeBatchCount` aceita `count` até 100 e
 *    `BATCH_LIMITS_BY_INTENT` não alcança tool sem intent. Quem quer replicar usa
 *    `manifest.replicate_segmented` (<= 2), que passa pelo teto.
 */
export const CHANNEL_HARD_DENY: ReadonlySet<string> = new Set<string>([
  'cancel_manifest',
  'manifest.batch_cancel_selected',
  'manifest.cancel_recent_excluding_first',
  'cdf.generate_from_manifest_selection',
  'enqueue_cdf_download',
  'cdf.download_batch_selected',
  'manifest.receive_with_receipt',
  'manifest.create_from_payload',
  'manifest.create_draft',
  'replicate_manifest'
]);

/**
 * INVARIANTE ESTRUTURAL, verificada NO IMPORT: as duas listas são DISJUNTAS.
 *
 * É ela — e não a ordem de avaliação — que garante hoje que a recusa vence. Dito sem maquiagem: com
 * as listas disjuntas, aplicar `CHANNEL_HARD_DENY` antes ou depois do overlay produz EXATAMENTE o
 * mesmo resultado, porque o overlay só adiciona `whatsapp` a chave elegível e nenhuma chave elegível
 * é recusada. A ordem em `resolveEffectiveAllowChannels` existe para que a recusa continue vencendo
 * SE alguém um dia relaxar a invariante; esta checagem existe para que ninguém relaxe por engano e
 * fique dependendo da ordem sem saber.
 *
 * Falhar no import é o desfecho certo: a alternativa é um processo que sobe com uma chave de
 * cancelamento elegível no WhatsApp.
 */
for (const key of Object.keys(WHATSAPP_ELIGIBLE_ACTIONS)) {
  if (CHANNEL_HARD_DENY.has(key)) {
    throw new Error(
      `[whatsapp-action-eligibility] "${key}" está em WHATSAPP_ELIGIBLE_ACTIONS e em CHANNEL_HARD_DENY. `
      + 'As listas têm de ser disjuntas — decida se a ação é elegível no canal ou recusada por desenho.'
    );
  }
}

/**
 * TOOL DIRETA EM CANAL EXTERNO AGE SOBRE EXATAMENTE 1 ITEM.
 *
 * `BATCH_LIMITS_BY_INTENT` é aplicado sob `if (effectivePolicy.isAction && intent)` e `intent` é `''`
 * fora do orquestrador — ou seja, tool direta NUNCA tem teto de lote. Lote passa obrigatoriamente
 * pelos intents, que são os únicos com limite por canal.
 */
export const WHATSAPP_DIRECT_TOOL_MAX_ITEMS = 1;

/** Canais em que estas regras valem. Hoje só um; a lista existe para o dia em que houver outro. */
const EXTERNAL_CHANNELS: ReadonlySet<ConversationChannel> = new Set<ConversationChannel>(['whatsapp']);

export function isExternalConversationChannel(channel: ConversationChannel): boolean {
  return EXTERNAL_CHANNELS.has(channel);
}

/** Chave canônica da matriz: `intent` quando orquestrado, `toolName` no resto. */
export function resolveWhatsAppActionKey(toolName: string, intent?: string | null): string {
  if (toolName === 'orchestrate_manifest_operation') {
    return String(intent || '');
  }
  return String(toolName || '');
}

/**
 * Consulta SEM cair no protótipo (`map['constructor']` devolveria uma função herdada, verdadeira o
 * bastante para passar por um `|| null` — o mesmo defeito que `lookupOwn` fecha no policy-service).
 */
export function getWhatsAppEligibleAction(key: string): WhatsAppEligibleAction | null {
  if (!key) return null;
  return Object.prototype.hasOwnProperty.call(WHATSAPP_ELIGIBLE_ACTIONS, key)
    ? (WHATSAPP_ELIGIBLE_ACTIONS[key] ?? null)
    : null;
}

export function isWhatsAppHardDenied(key: string): boolean {
  return Boolean(key) && CHANNEL_HARD_DENY.has(key);
}

/** Disjuntor de ambiente. Ver `config.whatsappActionsEnabled`. */
export function resolveWhatsAppActionsEnabled(): boolean {
  return config.whatsappActionsEnabled === true;
}

/** Portão do N2 (aviso de conclusão). Ver `config.whatsappActionNoticeEnabled`. */
export function resolveWhatsAppOutboundNoticeEnabled(): boolean {
  return config.whatsappActionNoticeEnabled === true;
}

/**
 * Nível exigido pela ação, ou `null` se ela não é elegível no canal.
 */
export function resolveWhatsAppActionTier(key: string): WhatsAppActionTier | null {
  return getWhatsAppEligibleAction(key)?.tier ?? null;
}

/**
 * RESOLUÇÃO EFETIVA DE CANAIS.
 *
 *   base     = overlay ? (código ∩ overlay) : código        ← o overlay só RESTRINGE…
 *   somados  = overlay ∩ {whatsapp se elegível}             ← …exceto por ADICIONAR canal elegível
 *   efetivo  = (base ∪ somados) \ CHANNEL_HARD_DENY         ← recusa por ÚLTIMO
 *
 * As duas primeiras linhas são o desenho: revogação nunca é bloqueada (o operador desliga qualquer
 * coisa) e a liberação é limitada pela elegibilidade de código.
 *
 * ⚠️ Sobre a terceira, sem maquiagem: com as duas listas DISJUNTAS (invariante verificada no import),
 * a posição da recusa NÃO é observável — o overlay só adiciona `whatsapp` a chave elegível, e nenhuma
 * elegível é recusada. Quem impede um PATCH de reabrir cancelamento HOJE é a ausência da chave em
 * `WHATSAPP_ELIGIBLE_ACTIONS`, não a ordem. A recusa fica por último para continuar vencendo se a
 * invariante for relaxada, e para cobrir a segunda porta: default de CÓDIGO que já traga `whatsapp`.
 */
export function resolveEffectiveAllowChannels(input: {
  key: string;
  codeChannels: readonly ConversationChannel[];
  /** `null` = não há linha em `ai_tools` para esta chave (o default de código vale inteiro). */
  overlayChannels: readonly ConversationChannel[] | null;
}): ConversationChannel[] {
  const code = new Set<ConversationChannel>(input.codeChannels);
  const effective = new Set<ConversationChannel>();

  if (input.overlayChannels) {
    for (const channel of input.overlayChannels) {
      if (code.has(channel)) effective.add(channel);
    }
    if (input.overlayChannels.includes('whatsapp') && getWhatsAppEligibleAction(input.key)) {
      effective.add('whatsapp');
    }
  } else {
    for (const channel of code) effective.add(channel);
  }

  if (isWhatsAppHardDenied(input.key)) {
    effective.delete('whatsapp');
  }

  // Ordem estável (a do canal), para que o DTO do painel não oscile entre chamadas.
  return (['whatsapp', 'native_chat', 'inapp'] as ConversationChannel[]).filter((channel) => effective.has(channel));
}
