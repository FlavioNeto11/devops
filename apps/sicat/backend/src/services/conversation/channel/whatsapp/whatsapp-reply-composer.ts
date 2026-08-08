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
 *
 * ┌─ FASE 4: A FICHA ─────────────────────────────────────────────────────────────────────────────┐
 * │ A allowlist continua sendo daqui. O que mudou é que o ramo `responded`/`executed` agora        │
 * │ consulta o RESULTADO ESTRUTURADO (`output.result`) além do `responseText`, e devolve           │
 * │ `string[]` — uma entrada por mensagem do WhatsApp.                                             │
 * │                                                                                                │
 * │ `blocked` e `failed` ficam INTOCADOS: a fronteira de policy não é assunto desta fase, e é      │
 * │ deles que vem a prévia de ação. Só `executed` tem `result` (em `responded` não houve tool),    │
 * │ então `responded` degrada para o comportamento de hoje sem nenhum ramo novo.                   │
 * │                                                                                                │
 * │ A divisão de trabalho é: **prosa = manchete, ficha = dado**. Onde os dois divergirem, quem     │
 * │ manda é a ficha — ela lê campo por campo de uma allowlist, a prosa pode INVENTAR número de     │
 * │ MTR, data e situação. Por isso, havendo ficha, só o PRIMEIRO parágrafo da prosa sobrevive.     │
 * │ Não há comparação de similaridade entre as duas: heurística chumbada falha de forma            │
 * │ imprevisível justamente nos casos raros. A divisão é CONTRATUAL, via prompt de canal.          │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 */

import { config } from '../../../../lib/config.js';
import { buildBlock, cutAtGrapheme, type RenderBlock } from './whatsapp-render-blocks.js';
import { renderStructuredResultForWhatsApp } from './whatsapp-result-renderer.js';
import { WHATSAPP_CHANNEL_NOT_ENABLED_TEXT } from './whatsapp-confirmation-texts.js';
import { splitIntoSegments } from './whatsapp-segmenter.js';

/** Subconjunto de `ProcessTurnOutput` que o compositor precisa — evita acoplar ao tipo inteiro. */
export type ComposableTurnOutput = {
  status: 'responded' | 'blocked' | 'executed' | 'failed';
  responseText: string;
  policy?: { reasonCode?: string | null } | null;
  /**
   * `ConversationStructuredResult` na forma CRUA do dispatcher. JÁ EXISTIA em runtime (o
   * turn-service tipa a saída como `ComposableTurnOutput & LooseRecord`); era invisível ao contrato,
   * e por isso um grep por `result` neste módulo dava zero.
   *
   * `unknown` e não `ConversationStructuredResult`: `inferTypeFromPayload` faz um cast NÃO CHECADO e
   * `withNormalizedShape` injeta `'list'|'detail'|'action'|'status'`, fora da união. Tipar com a
   * união seria uma mentira que o `tsc` cobraria de nós e não do payload.
   */
  result?: unknown;
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
  // Fase 5: DISTINTO de `CHANNEL_BLOCKED`. A ação é elegível no canal e o disjuntor de ambiente está
  // ligado — falta só o operador virar a chave no AI Control Center. Sem este ramo, ele liga o botão,
  // a pessoa recebe `READ_ONLY_TEXT` e ninguém percebe que o toggle não pegou.
  CHANNEL_NOT_ENABLED: WHATSAPP_CHANNEL_NOT_ENABLED_TEXT,
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

/** Teto do provedor quando o config vem inválido. É o mesmo default de `lib/config`. */
const DEFAULT_REPLY_MAX_CHARS = 3500;

/**
 * Leitura DEFENSIVA de teto numérico.
 *
 * Declarada aqui, acima do primeiro uso, porque `truncateWhatsAppReply` e `finalizeSegment` liam
 * `config.whatsappReplyMaxChars` CRU: com `WHATSAPP_REPLY_MAX_CHARS=0` ou não-numérico no Secret
 * (`Number(process.env… || 3500)` produz `0`/`NaN`), a truncagem devolvia o texto INTACTO e os
 * caminhos que não passam pelo segmentador (`composeWhatsAppNotice`, ramo `blocked`, ramo `failed`
 * operacional, avisos de expiração/timeout) ficavam sem teto nenhum — mensagem rejeitada pelo
 * provedor, operador MUDO. O resto do compositor já lia por aqui: era a divergência entre as duas
 * leituras que escondia o defeito.
 */
function readPositiveConfig(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

/**
 * Truncagem em `whatsappReplyMaxChars`.
 *
 * NÃO é estética: acima de ~4096 caracteres o provedor REJEITA a mensagem e o usuário fica MUDO —
 * o pior desfecho possível, porque nem erro ele vê. O sufixo é honesto (diz que cortou e o que fazer)
 * e cabe DENTRO do teto, senão a própria correção estouraria o limite.
 *
 * O corte é `cutAtGrapheme`, NUNCA `slice`. Esta função é a última etapa de TODO segmento que sai
 * (`finalizeSegment`) e também o corte da prosa sem ficha: um `slice` cru em unidades UTF-16 parte
 * par surrogate na fronteira (basta um emoji cair ali), o payload vira UTF-16 inválido e o provedor
 * pode REJEITÁ-LO — o mesmo desfecho mudo que a truncagem existe para evitar.
 */
export function truncateWhatsAppReply(text: string, maxChars: unknown = config.whatsappReplyMaxChars): string {
  const value = String(text ?? '');
  const limit = readPositiveConfig(maxChars, DEFAULT_REPLY_MAX_CHARS);
  if (value.length <= limit) return value;

  const suffix = '\n\n[...] A resposta era longa e foi cortada aqui. Peça um período menor ou veja a lista completa no SICAT.';
  // Teto tão baixo que não sobra espaço ÚTIL de conteúdo depois do sufixo honesto (o sufixo tem
  // ~106 chars): SUPRIME o sufixo e corta só o conteúdo no teto. Anexar o sufixo aqui degeneraria
  // `room` a ~0 e a saída seria SÓ o sufixo — perdendo 100% da resposta e ainda estourando o próprio
  // teto (o desfecho mudo que a truncagem existe para evitar).
  const MIN_CONTENT_ROOM = 24;
  const room = limit - suffix.length;
  if (room < MIN_CONTENT_ROOM) return cutAtGrapheme(value, limit);
  return `${cutAtGrapheme(value, room)}${suffix}`;
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

/**
 * Pipeline final, comum a todo texto que sai pelo canal — agora POR SEGMENTO.
 *
 * As três etapas (leakage → markdown → truncagem) são locais e idempotentes, e a truncagem só faz
 * sentido contra o teto do PROVEDOR, que é por mensagem.
 *
 * `sanitizeWhatsAppLeakage` continua obrigatório mesmo sobre texto do renderer: o renderer não
 * reimplementa nada dela, e é ela que remove nome de tool e `reasonCode=` caso escapem por um campo
 * livre. `applyWhatsAppMarkdownHygiene` existe pelo LEAD, que vem do LLM — o renderer não emite
 * markdown de navegador para ser convertido depois.
 *
 * Posicionamento com porquê: rodapés e `Protocolo:` no ÚLTIMO segmento (perdê-los é sobrevivível);
 * `(n/N)` como última linha e SÓ quando N > 1 — em N=1 não aparece, o que preserva byte-a-byte a
 * saída da fase 3 e evita o absurdo de "(1/1)". Quando N > 1 é OBRIGATÓRIO: a ordem de entrega entre
 * chamadas separadas de API não é garantida pelo protocolo e sem numeração o operador não remonta.
 */
function finalizeSegment(text: string, ctx: ReplyContext, index: number, total: number): string {
  const body = applyWhatsAppMarkdownHygiene(sanitizeWhatsAppLeakage(text)).trim();
  const isLast = index === total - 1;
  const withFooters = isLast ? `${body}${buildFooters(ctx)}` : body;

  const marker = total > 1 ? `\n\n(${index + 1}/${total})` : '';
  if (!marker) return truncateWhatsAppReply(withFooters);

  // O marcador entra DENTRO do orçamento: acrescentá-lo depois da truncagem estouraria o teto e o
  // desfecho é mensagem REJEITADA pelo provedor — operador mudo, sem ver nem o erro.
  const limit = readPositiveConfig(config.whatsappReplyMaxChars, DEFAULT_REPLY_MAX_CHARS);
  const room = Math.max(1, limit - marker.length);
  return `${truncateWhatsAppReply(withFooters, room)}${marker}`;
}

/** Aviso pronto (expiração, timeout) que vira UMA mensagem, pelo mesmo funil de higiene. */
export function composeWhatsAppNotice(notice: string, ctx: ReplyContext = {}): string[] {
  return [finalizeSegment(notice, ctx, 0, 1)];
}

/**
 * CARONA DA DÍVIDA DE AVISO (fase 6) — o desfecho que a janela de 24 h impediu de empurrar, colado
 * numa resposta que JÁ IA SAIR.
 *
 * Duas propriedades inegociáveis, e as duas são sobre não estragar o que já funciona:
 *
 *  1. **Não gera mensagem paga.** O bloco entra num segmento existente; um segmento novo seria um
 *     `sendText` dedicado, que é exatamente o que a decisão de custo desta fase proíbe.
 *  2. **Não danifica a resposta.** Se o bloco não couber no orçamento do último segmento, ele NÃO É
 *     anexado — a dívida fica onde está e tenta de novo no turno seguinte. Truncar para caber
 *     cortaria a cauda da resposta útil (é ela que fica no fim), e uma dívida entregue às custas da
 *     resposta que a pessoa acabou de pedir é troca ruim.
 *
 * Limitação declarada: uma dívida grande diante de respostas sempre longas pode nunca caber, e aí
 * morre pelo TTL — com contador (`pendingNoticesDropped`), nunca em silêncio.
 *
 * `null` = não coube (ou não havia dívida): quem chama NÃO deve limpar a dívida.
 */
export function attachPendingNoticeBlock(segments: string[], block: string | null): string[] | null {
  if (!block || segments.length === 0) return null;

  const lastIndex = segments.length - 1;
  const last = segments[lastIndex];
  if (!last) return null;

  const joined = `${last}\n\n—\n${block}`;
  const limit = readPositiveConfig(config.whatsappReplyMaxChars, DEFAULT_REPLY_MAX_CHARS);
  if (joined.length > limit) return null;

  const next = [...segments];
  next[lastIndex] = joined;
  return next;
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
): string[] {
  switch (disposition) {
    case 'greeting':
      return composeWhatsAppNotice(buildWhatsAppGreeting({ hasActiveAccount: ctx.hasActiveAccount }));
    case 'unsupported_audio':
      // Resposta DISTINTA de "arquivo": a expectativa de quem manda áudio é forte, e um texto
      // genérico faz a pessoa reenviar o mesmo áudio achando que falhou o upload.
      return composeWhatsAppNotice('Ainda não escuto áudios por aqui. Me manda por escrito? Pode ser curtinho, tipo "MTRs de hoje".');
    case 'unsupported_media':
      // A promessa sobre o chat web é verdadeira: ele já tem ingestão multimodal (PDF e imagem).
      return composeWhatsAppNotice([
        'Recebi seu arquivo, mas ainda não consigo abrir anexos por aqui.',
        '',
        'Me escreve o que você precisa? Ou use o chat do SICAT no navegador, que lê PDF e imagem.'
      ].join('\n'));
    case 'unsupported_location':
      return composeWhatsAppNotice('Recebi sua localização, mas ainda não uso isso. Me escreve o que você precisa?');
    case 'sticker':
      return composeWhatsAppNotice('Estou por aqui! Me diz o que você precisa: "meus MTRs de hoje", "MTR 123456", "meus CDFs do mês".');
    case 'ignore_silent':
    case 'process_turn':
    default:
      // Nunca deveria chegar: quem chama já filtrou. Lista vazia = nada a enviar (fail-safe).
      return [];
  }
}

/** Cap do lead quando HÁ ficha. Acima disso o LLM está listando — e a lista é da ficha. */
const LEAD_MAX_CHARS = 350;

/**
 * Primeiro parágrafo da prosa, cortado em fronteira de frase.
 *
 * O resto é descartado QUANDO HÁ FICHA, por três razões: (i) a prosa pode omitir e pode INVENTAR
 * número de MTR, data e situação, enquanto a ficha lê campo por campo de uma allowlist; (ii)
 * `shouldBypassNaturalSynthesis` faz o `responseText` sair SEM LLM, como template escrito para
 * navegador — a poda conserta o caso do LLM e o caso determinístico com a mesma regra; (iii)
 * `validateIntentResponseGuardrails` já exige que a redação cite um número da evidência, então o
 * primeiro parágrafo é, por contrato, a manchete numérica.
 */
function buildLeadText(prose: string, maxChars: number): string {
  const firstParagraph = prose.split(/\n{2,}/)[0] ?? '';
  const trimmed = firstParagraph.trim();
  if (!trimmed || trimmed.length <= maxChars) return trimmed;

  const window = trimmed.slice(0, maxChars);
  const sentenceEnd = Math.max(window.lastIndexOf('. '), window.lastIndexOf('! '), window.lastIndexOf('? '));
  if (sentenceEnd >= Math.floor(maxChars * 0.4)) return trimmed.slice(0, sentenceEnd + 1);
  return `${cutAtGrapheme(trimmed, Math.max(1, maxChars - 1))}…`;
}

/**
 * Resposta a partir da saída do turno. ALLOWLIST por `status`.
 *
 * Devolve `string[]` em TODOS os caminhos (`length >= 1` sempre que há o que dizer); `blocked`,
 * `failed` e os estáticos devolvem exatamente 1. Uniformizar (em vez de `string | string[]`) tira do
 * turn-service qualquer ramo condicional — e ramo condicional em livro-razão de entrega é onde nasce
 * mensagem duplicada.
 */
export function composeWhatsAppReply(output: ComposableTurnOutput, ctx: ReplyContext = {}): string[] {
  const reasonCode = String(output.policy?.reasonCode || '').trim();

  if (output.status === 'blocked') {
    // O `responseText` de `blocked` NUNCA é considerado — nem como fallback. É ele que traz a prévia
    // de ação sensível e o 'responda "confirmo …"'.
    const mapped = BLOCKED_TEXTS[reasonCode] || BLOCKED_FALLBACK_TEXT;
    return composeWhatsAppNotice(mapped, ctx);
  }

  if (output.status === 'failed') {
    if (OPAQUE_FAILURE_REASON_CODES.has(reasonCode)) {
      return composeWhatsAppNotice([
        'Não consegui responder agora — meu assistente está fora do ar. Tente de novo em alguns minutos.',
        '',
        'Se for urgente, o SICAT no navegador está funcionando normalmente.'
      ].join('\n') + buildProtocolLine(ctx.correlationId), ctx);
    }
    // Falha OPERACIONAL (erro de execução de tool): `mapOperationalToolErrorToOperatorMessage` já
    // produz pt-BR escrito para humano. Passa — mas pelo sanitizador e pela truncagem.
    const operational = String(output.responseText || '').trim();
    return composeWhatsAppNotice(operational || 'Não consegui completar essa consulta agora. Pode tentar de novo?', ctx);
  }

  // `responded` | `executed` — o ÚNICO caminho em que texto do LLM chega ao usuário.
  const prose = String(output.responseText || '').trim();
  const hardChars = readPositiveConfig(config.whatsappReplyMaxChars, 3500);
  // INVARIANTE: o alvo de UX nunca pode passar do teto TÉCNICO. Sem o clamp, um
  // `WHATSAPP_REPLY_MAX_CHARS` baixo faria o corte honesto acontecer no teto errado e ser depois
  // decapitado pelo teto certo — truncagem em duas etapas, com o aviso perdido no meio.
  const softChars = Math.min(readPositiveConfig(config.whatsappSegmentSoftChars, 1200), hardChars);
  const ficha = renderStructuredResultForWhatsApp(output.result, {
    itemCap: readPositiveConfig(config.whatsappRenderMaxItems, 8),
    cardCap: readPositiveConfig(config.whatsappRenderMaxCards, 3),
    nowMs: Date.now()
  });

  let blocks: RenderBlock[];
  if (ficha.refusal) {
    // ÚNICO caso em `executed` que descarta a prosa — e é justificado: nessa família a prosa É a
    // prévia de ação, com `responda "confirmo <intent>"`, dados do payload e token de snapshot.
    blocks = ficha.blocks;
  } else if (ficha.blocks.length === 0) {
    // Sem ficha (tipo desconhecido, lista vazia, `responded` sem tool): comportamento de HOJE.
    // `truncateWhatsAppReply` aqui já é o corte honesto — nunca um `slice` mudo.
    const alone = buildBlock('note', truncateWhatsAppReply(prose, softChars));
    blocks = alone ? [alone] : [];
  } else {
    const lead = buildBlock('note', buildLeadText(prose, LEAD_MAX_CHARS));
    blocks = lead ? [lead, ...ficha.blocks] : ficha.blocks;
  }

  if (blocks.length === 0) return composeWhatsAppNotice(DONT_UNDERSTAND_TEXT, ctx);

  const segments = splitIntoSegments(blocks, {
    softChars,
    hardChars,
    maxSegments: readPositiveConfig(config.whatsappReplyMaxSegments, 2),
    minLeftoverBlocksForExtraSegment: 2
  }).segments.filter((segment) => segment.trim());

  if (segments.length === 0) return composeWhatsAppNotice(DONT_UNDERSTAND_TEXT, ctx);
  return segments.map((segment, index) => finalizeSegment(segment, ctx, index, segments.length));
}
