/**
 * Compositor da resposta que sai pelo WhatsApp.
 *
 * **Isto não é o renderer da fase 4.** Aqui não se formata `ConversationStructuredResult`; aqui se
 * decide QUAL texto pode sair. A diferença importa porque a saída crua do motor conversacional foi
 * escrita para uma tela de navegador e, entregue como está no WhatsApp, produz mensagens ativamente
 * PIORES que o silêncio:
 *
 *  - `buildBlockedResponse` emite prévia de ação sensível com a instrução `responda "confirmo
 *    <intent>"` — que NUNCA funciona neste canal (a confirmação é fase 5) — e a emite até para
 *    intents de CONSULTA cujo nome contém a substring `manifest`;
 *  - o fallback de provedor indisponível carrega `reasonCode=PROVIDER_UNAVAILABLE
 *    correlationId=corr_…` literalmente no corpo do texto;
 *  - `INTEGRATION_ACCOUNT_REQUIRED` manda "selecione uma conta ativa **no chat**", apontando para
 *    uma UI que não existe aqui.
 *
 * Por isso a regra é **allowlist, não blocklist**: só `responded`/`executed` entregam texto do LLM.
 * Todo o resto passa por um mapa próprio, e `reasonCode` desconhecido cai num genérico — nunca no
 * `responseText`. Uma blocklist falharia aberto no primeiro `reasonCode` novo.
 */

import { config } from '../../../../lib/config.js';

/** Subconjunto de `ProcessTurnOutput` que o compositor precisa — evita acoplar ao tipo inteiro. */
export type ComposableTurnOutput = {
  status: 'responded' | 'blocked' | 'executed' | 'failed';
  responseText: string;
  policy?: { reasonCode?: string | null } | null;
};

export type WhatsAppDisposition =
  | 'process_turn'
  | 'greeting'
  | 'ignore_silent'
  | 'sticker'
  | 'unsupported_audio'
  | 'unsupported_media'
  | 'unsupported_location';

export type ReplyContext = {
  correlationId?: string | null;
  /** Havia mídia e só a legenda foi considerada. */
  mediaIgnored?: boolean;
  /** A mensagem do usuário passou do teto e foi cortada na entrada. */
  textTruncated?: boolean;
};

const MENU = [
  '• meus MTRs de hoje',
  '• MTR 123456',
  '• meus CDFs deste mês',
  '• status do último job'
].join('\n');

const ACCOUNT_REQUIRED_TEXT = [
  'Achei seu cadastro, mas não há uma conta CETESB ativa selecionada — sem ela eu não consigo consultar MTR, CDF nem jobs.',
  '',
  'A conta é escolhida no SICAT pelo navegador, no seletor no topo da tela. Depois de escolher, é só me chamar aqui de novo.'
].join('\n');

const READ_ONLY_TEXT = [
  'Por aqui eu só consulto. Emitir, imprimir, cancelar MTR e gerar CDF ficam no SICAT pelo navegador, onde dá para revisar tudo antes de confirmar.',
  '',
  'Mas posso te ajudar a achar: tente "meus MTRs de hoje", "MTR 123456" ou "meus CDFs deste mês".'
].join('\n');

const DONT_UNDERSTAND_TEXT = ['Não entendi o que você precisa. Tente assim:', MENU].join('\n');

/**
 * Mapa de `policy.reasonCode` → texto próprio, aplicado ANTES de qualquer olhada em `responseText`.
 * Cada entrada existe porque o texto original é enganoso neste canal, não porque é feio.
 */
const BLOCKED_TEXTS: Record<string, string> = {
  INTEGRATION_ACCOUNT_REQUIRED: ACCOUNT_REQUIRED_TEXT,
  CHANNEL_BLOCKED: READ_ONLY_TEXT,
  // Não deveriam ocorrer com `allowActions:false` + policy read-only; mapeados defensivamente porque
  // para quem está no WhatsApp os três significam exatamente a mesma coisa.
  ACTIONS_DISABLED: READ_ONLY_TEXT,
  AI_CONTROL_READONLY: READ_ONLY_TEXT,
  CONFIRMATION_REQUIRED: READ_ONLY_TEXT,
  // Sem citar a chave de permissão: o admin acha pelo correlationId no log.
  PERMISSION_DENIED: 'Seu perfil no SICAT não tem permissão para essa operação. Fale com o administrador da sua conta.',
  TOOL_NOT_SUPPORTED: DONT_UNDERSTAND_TEXT,
  INTENT_NOT_SUPPORTED: DONT_UNDERSTAND_TEXT,
  CONVERSATION_TOOL_UNSUPPORTED: DONT_UNDERSTAND_TEXT,
  BATCH_LIMIT_EXCEEDED: 'São itens demais de uma vez para o WhatsApp. Peça um período menor (ex.: "MTRs de ontem") ou veja a lista completa no SICAT.',
  CROSS_ACCOUNT_VIOLATION: 'Esse registro não pertence à conta que está ativa no seu SICAT. Troque a conta no navegador e me chame de novo.',
  SESSION_SCOPE_MISMATCH: 'Esse registro não pertence à conta que está ativa no seu SICAT. Troque a conta no navegador e me chame de novo.'
};

const BLOCKED_FALLBACK_TEXT = 'Não consigo fazer isso por aqui. Tente pelo SICAT no navegador.';

/** `failed` cujo `responseText` cita provedor de LLM e reasonCode interno — nunca sai cru. */
const OPAQUE_FAILURE_REASON_CODES = new Set(['PROVIDER_UNAVAILABLE', 'INVALID_LLM_PROVIDER']);

/**
 * Nomes de tool do registro conversacional. Aparecem em prévias e mensagens de erro do motor e não
 * significam nada para quem está no WhatsApp — pior, expõem a superfície interna.
 */
const TOOL_NAMES = [
  'orchestrate_manifest_operation',
  'list_manifests',
  'get_manifest_details',
  'list_manifest_documents',
  'list_cdf_certificates',
  'get_job_status',
  'list_jobs',
  'get_audit_trail',
  'search_partners',
  'get_operations_overview',
  'list_dmr',
  'list_mtr_provisorio',
  'get_dashboard_overview'
];

function buildProtocolLine(correlationId?: string | null): string {
  const trimmed = String(correlationId || '').trim();
  return trimmed ? `\n\nProtocolo: ${trimmed}` : '';
}

/**
 * Remove vazamento de vocabulário interno.
 *
 * A ordem importa: o `confirmo <intent>` é removido junto da frase que o introduz, senão sobra uma
 * instrução decapitada ("basta responder .") mais confusa que o original.
 */
export function sanitizeWhatsAppLeakage(text: string): string {
  let output = String(text ?? '');

  output = output.replace(/responda\s*[:"'“”]*\s*confirmo\s+[a-z0-9_.]+[."'“”]*/gi, 'confirme pelo SICAT no navegador');
  output = output.replace(/\bconfirmo\s+[a-z0-9_]+\.[a-z0-9_]+\b/gi, '');
  output = output.replace(/\breasonCode\s*=\s*[A-Za-z0-9_]+\.?/g, '');
  output = output.replace(/\bcorrelationId\s*=\s*\S+/g, '');
  for (const toolName of TOOL_NAMES) {
    output = output.replace(new RegExp(`\\b${toolName}\\b`, 'g'), 'consulta');
  }

  return output;
}

/**
 * Higiene de markdown. O WhatsApp entende `*negrito*` e `_itálico_`; `**assim**` aparece LITERAL na
 * tela, com os asteriscos. Cabeçalhos `##` e bullets `- ` idem.
 */
export function applyWhatsAppMarkdownHygiene(text: string): string {
  return String(text ?? '')
    .replace(/\*\*([^*]+)\*\*/g, '*$1*')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n');
}

/**
 * Truncagem em `whatsappReplyMaxChars`.
 *
 * NÃO é estética: acima de ~4096 caracteres o provedor REJEITA a mensagem e o usuário fica MUDO —
 * o pior desfecho possível, porque nem erro ele vê. O sufixo é honesto (diz que cortou e o que fazer)
 * e cabe DENTRO do teto, senão a própria correção estouraria o limite.
 */
export function truncateWhatsAppReply(text: string, maxChars = config.whatsappReplyMaxChars): string {
  const value = String(text ?? '');
  const limit = Number(maxChars);
  if (!Number.isFinite(limit) || limit <= 0 || value.length <= limit) return value;

  const suffix = '\n\n[...] A resposta era longa e foi cortada aqui. Peça um período menor ou veja a lista completa no SICAT.';
  const room = Math.max(0, limit - suffix.length);
  return `${value.slice(0, room).trimEnd()}${suffix}`;
}

function buildFooters(ctx: ReplyContext): string {
  const notes: string[] = [];
  if (ctx.mediaIgnored) {
    notes.push('Obs.: não consigo abrir arquivos por aqui; considerei só o texto da sua mensagem.');
  }
  if (ctx.textTruncated) {
    notes.push(`Obs.: sua mensagem era longa; considerei os primeiros ${config.whatsappInboundMaxTextChars} caracteres.`);
  }
  if (notes.length === 0) return '';
  // Rodapé, não cabeçalho: a resposta útil fica no topo. E na MESMA mensagem — uma segunda mensagem
  // custa e polui a conversa.
  return `\n\n—\n${notes.join('\n')}`;
}

/** Pipeline final, comum a todo texto que sai pelo canal. */
function finalize(text: string, ctx: ReplyContext): string {
  const body = applyWhatsAppMarkdownHygiene(sanitizeWhatsAppLeakage(text)).trim();
  return truncateWhatsAppReply(`${body}${buildFooters(ctx)}`);
}

/** Saudação/ajuda/menu — o único momento em que a pessoa aprende o que o canal faz. */
export function buildWhatsAppGreeting(options: { hasActiveAccount?: boolean } = {}): string {
  const base = [
    'Oi! Sou o assistente do SICAT. Por aqui eu *consulto* — não emito, não imprimo e não cancelo nada.',
    '',
    'Dá para me perguntar, por exemplo:',
    MENU,
    '',
    'Para emitir, imprimir ou cancelar, use o SICAT no navegador.'
  ].join('\n');

  // Sem conta ativa, TODA pergunta útil seria bloqueada logo em seguida. Dizer isso na saudação evita
  // que a pessoa descubra na primeira tentativa e conclua que o canal não funciona.
  if (options.hasActiveAccount === false) {
    return `${base}\n\n—\n${ACCOUNT_REQUIRED_TEXT}`;
  }
  return base;
}

/**
 * Texto de número não vinculado. CONSTANTE — o mesmo para número desconhecido, vínculo `pending`,
 * vínculo órfão (sem `userId`) e telefone inválido.
 *
 * Não é uniformidade estética: qualquer variação por estado transforma o canal em ORÁCULO DE
 * ENUMERAÇÃO. Um texto do tipo "seu número já está cadastrado, falta concluir a verificação"
 * confirmaria a um terceiro — que só precisa mandar "oi" de um celular qualquer — que aquele número
 * está em processo de cadastro no SICAT. Por isso não existe variante `pending`, e por isso
 * `maybeSendUnlinkedNotice` nem recebe o estado do vínculo: sem discriminante, não há onde ramificar.
 */
export const WHATSAPP_UNLINKED_NOTICE = [
  'Oi! Aqui é o assistente do SICAT.',
  '',
  'Este número ainda não está liberado para conversar comigo.',
  '',
  'Para liberar: entre no SICAT pelo navegador, vá em Perfil → WhatsApp e cadastre este número. Você recebe um código aqui mesmo para confirmar.',
  '',
  'Até lá eu não consigo responder por aqui.'
].join('\n');

export const WHATSAPP_RATE_LIMIT_NOTICE =
  'Você mandou várias mensagens seguidas. Me dá um minutinho e chama de novo — respondo uma de cada vez.';

export function buildWhatsAppTerminalFailureNotice(correlationId?: string | null): string {
  return [
    'Não consegui processar sua última mensagem. Pode tentar de novo?',
    '',
    'Se continuar, o SICAT no navegador está funcionando normalmente.'
  ].join('\n') + buildProtocolLine(correlationId);
}

/**
 * Mensagem que ficou velha demais na fila (worker reiniciado, backlog de flood) e NÃO será mais
 * respondida. Existe porque o desfecho alternativo — concluir o job como `succeeded` sem enviar nada —
 * some do painel de fila como sucesso enquanto a pessoa fica esperando indefinidamente.
 *
 * Não pede desculpa técnica nem cita fila: para quem está do outro lado o fato é "não respondi".
 */
export function buildWhatsAppExpiredNotice(correlationId?: string | null): string {
  return [
    'Desculpe, fiquei fora do ar e não consegui responder suas mensagens a tempo.',
    '',
    'Pode mandar de novo o que você precisa? Agora eu respondo.'
  ].join('\n') + buildProtocolLine(correlationId);
}

export function buildWhatsAppTurnTimeoutNotice(correlationId?: string | null): string {
  return [
    'Demorei demais para responder e acabei perdendo o fôlego. Pode mandar de novo?',
    '',
    'Se for urgente, o SICAT no navegador está funcionando normalmente.'
  ].join('\n') + buildProtocolLine(correlationId);
}

/**
 * Resposta para disposições que NÃO gastam LLM. Decididas na recepção, respondidas aqui.
 */
export function composeStaticWhatsAppReply(
  disposition: WhatsAppDisposition,
  ctx: ReplyContext & { hasActiveAccount?: boolean } = {}
): string {
  switch (disposition) {
    case 'greeting':
      return finalize(buildWhatsAppGreeting({ hasActiveAccount: ctx.hasActiveAccount }), {});
    case 'unsupported_audio':
      // Resposta DISTINTA de "arquivo": a expectativa de quem manda áudio é forte, e um texto
      // genérico faz a pessoa reenviar o mesmo áudio achando que falhou o upload.
      return finalize('Ainda não escuto áudios por aqui. Me manda por escrito? Pode ser curtinho, tipo "MTRs de hoje".', {});
    case 'unsupported_media':
      // A promessa sobre o chat web é verdadeira: ele já tem ingestão multimodal (PDF e imagem).
      return finalize([
        'Recebi seu arquivo, mas ainda não consigo abrir anexos por aqui.',
        '',
        'Me escreve o que você precisa? Ou use o chat do SICAT no navegador, que lê PDF e imagem.'
      ].join('\n'), {});
    case 'unsupported_location':
      return finalize('Recebi sua localização, mas ainda não uso isso. Me escreve o que você precisa?', {});
    case 'sticker':
      return finalize('Estou por aqui! Me diz o que você precisa: "meus MTRs de hoje", "MTR 123456", "meus CDFs do mês".', {});
    case 'ignore_silent':
    case 'process_turn':
    default:
      // Nunca deveria chegar: quem chama já filtrou. String vazia = nada a enviar (fail-safe).
      return '';
  }
}

/**
 * Resposta a partir da saída do turno. ALLOWLIST por `status`.
 */
export function composeWhatsAppReply(output: ComposableTurnOutput, ctx: ReplyContext = {}): string {
  const reasonCode = String(output.policy?.reasonCode || '').trim();

  if (output.status === 'blocked') {
    // O `responseText` de `blocked` NUNCA é considerado — nem como fallback. É ele que traz a prévia
    // de ação sensível e o 'responda "confirmo …"'.
    const mapped = BLOCKED_TEXTS[reasonCode] || BLOCKED_FALLBACK_TEXT;
    return finalize(mapped, ctx);
  }

  if (output.status === 'failed') {
    if (OPAQUE_FAILURE_REASON_CODES.has(reasonCode)) {
      return finalize([
        'Não consegui responder agora — meu assistente está fora do ar. Tente de novo em alguns minutos.',
        '',
        'Se for urgente, o SICAT no navegador está funcionando normalmente.'
      ].join('\n') + buildProtocolLine(ctx.correlationId), ctx);
    }
    // Falha OPERACIONAL (erro de execução de tool): `mapOperationalToolErrorToOperatorMessage` já
    // produz pt-BR escrito para humano. Passa — mas pelo sanitizador e pela truncagem.
    const operational = String(output.responseText || '').trim();
    return finalize(operational || 'Não consegui completar essa consulta agora. Pode tentar de novo?', ctx);
  }

  // `responded` | `executed` — o ÚNICO caminho em que texto do LLM chega ao usuário.
  const text = String(output.responseText || '').trim();
  if (!text) return finalize(DONT_UNDERSTAND_TEXT, ctx);
  return finalize(text, ctx);
}
