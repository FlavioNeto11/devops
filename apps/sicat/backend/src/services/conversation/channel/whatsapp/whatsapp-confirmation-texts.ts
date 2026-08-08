/**
 * Textos do fluxo de confirmação no WhatsApp (fase 5).
 *
 * ┌─ REGRA DURA: A PRÉVIA É SEMPRE UM ÚNICO SEGMENTO ─────────────────────────────────────────────┐
 * │ Lista truncada em 3 itens + "e mais N", e a linha do código é bloco ATÔMICO — nunca            │
 * │ descartável, nunca partida entre a bolha 1 e a 2. Um código partido entre mensagens é a mesma  │
 * │ classe de falha que o segmentador da fase 4 existe para impedir, com o agravante de que a      │
 * │ pessoa digitaria metade e queimaria um palpite.                                                 │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ IDENTIDADE HUMANAMENTE CONFERÍVEL, OU NENHUM TICKET ─────────────────────────────────────────┐
 * │ O LLM escolhe o manifesto; o ticket congela a escolha DELE. O congelamento protege contra troca│
 * │ DEPOIS da prévia, não contra erro NA prévia — a única defesa contra o erro é a pessoa conferir.│
 * │ Se a prévia degradasse para "MTR mtr_a1b2c3", a proteção sumiria SEM nenhum teste vermelho.    │
 * │ Por isso `buildWhatsAppConfirmationPreview` devolve `null` quando não há um rótulo conferível: │
 * │ o desfecho de degradação é RECUSAR a confirmação (a pessoa cai no texto de sempre e vai ao     │
 * │ navegador), nunca pedir um código para um alvo que ela não consegue verificar.                  │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * `*asterisco simples*` = negrito no WhatsApp. `applyWhatsAppMarkdownHygiene` (composer) converte
 * `**x**` em `*x*`, então aqui já se escreve na forma final.
 */

/** Formato de `createPrefixedId`: `mtr_a1b2c3…`. Id interno NUNCA é identidade conferível. */
const INTERNAL_ID_PATTERN = /^[a-z][a-z0-9]*_[0-9a-f]{6,}$/i;

const MAX_LISTED_ITEMS = 3;

export type ConfirmationPreviewItem = {
  /** O que a pessoa consegue conferir: número do MTR, número do rascunho, data, gerador, peso. */
  label: string;
};

export type ConfirmationPreviewInput = {
  /** Manchete da ação, em português de operação: "2ª via de 3 MTRs", "Emitir 2 MTRs na CETESB". */
  headline: string;
  items: ConfirmationPreviewItem[];
  /** NOME da conta CETESB (com CNPJ quando houver) — nunca só o id interno. */
  accountLabel: string | null;
  code: string;
  ttlSeconds: number;
  ticketId: string;
  /** Aviso de que um pedido anterior foi descartado. Vai na PRIMEIRA linha. */
  supersededSummary?: string | null;
  /** Aviso do N2: "Liberação ativa até 15:40 - esta seria a 2ª de 10 ações." */
  windowLine?: string | null;
  /** Só no N2: o parágrafo que diz que a emissão é irreversível. */
  irreversibleWarning?: string | null;
};

export function isConferibleItemLabel(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length < 3) return false;
  return !INTERNAL_ID_PATTERN.test(trimmed);
}

/**
 * Rótulos conferíveis a partir dos argumentos congelados. Aceita número de MTR/rascunho e rótulos já
 * montados; DESCARTA id interno. Se sobrar nada, quem chama não emite ticket.
 */
export function extractConferibleItemLabels(args: Record<string, unknown>): string[] {
  const candidates: unknown[] = [];
  for (const key of ['manifestNumbers', 'numbers', 'labels', 'manifestIds', 'documentIds', 'segments']) {
    const value = args[key];
    if (Array.isArray(value)) candidates.push(...value);
  }
  for (const key of ['manifestNumber', 'number', 'manifestId', 'documentId']) {
    if (args[key] != null) candidates.push(args[key]);
  }

  const labels: string[] = [];
  for (const candidate of candidates) {
    const label = typeof candidate === 'number' ? String(candidate) : candidate;
    if (isConferibleItemLabel(label)) labels.push(String(label).trim());
  }
  return [...new Set(labels)];
}

/**
 * OS IDS QUE O LLM REALMENTE EMITE — ponto de partida da identidade conferível.
 *
 * `extractConferibleItemLabels` (acima) descarta `man_<hex>` de propósito, e está certo: id interno
 * não é identidade. O problema é que id interno é EXATAMENTE o que chega em `toolCall.arguments`
 * (`manifestIds`, `selectionSnapshot.selectedManifestIds`, `manifestId`, `segments[].sourceManifestId`;
 * o dispatcher executa por eles). Descartar sem RESOLVER deixava todo intent de lote sem rótulo
 * nenhum — e sem rótulo não há prévia, logo o canário `manifest.batch_print_selected` nunca emitia.
 *
 * Esta função só COLETA. Quem transforma id em número de MTR é o chamador, contra o repositório.
 */
export function collectActionManifestIds(args: Record<string, unknown>): string[] {
  const ids: string[] = [];

  const pushAll = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    for (const entry of value) {
      if (typeof entry === 'string' && entry.trim()) ids.push(entry.trim());
    }
  };

  pushAll(args.manifestIds);
  if (typeof args.manifestId === 'string' && args.manifestId.trim()) ids.push(args.manifestId.trim());

  const snapshot = args.selectionSnapshot;
  if (snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)) {
    pushAll((snapshot as Record<string, unknown>).selectedManifestIds);
  }

  // `manifest.replicate_segmented`: cada segmento aponta para o manifesto de origem.
  if (Array.isArray(args.segments)) {
    for (const segment of args.segments) {
      if (!segment || typeof segment !== 'object' || Array.isArray(segment)) continue;
      const source = (segment as Record<string, unknown>).sourceManifestId;
      if (typeof source === 'string' && source.trim()) ids.push(source.trim());
    }
  }

  return [...new Set(ids)];
}

/**
 * Teto por rótulo. Razão social de gerador é texto livre e pode ter centenas de caracteres; três
 * rótulos longos empurrariam o BLOCO DO CÓDIGO — que é a cauda da prévia — para fora do orçamento do
 * segmento, entregando um ticket vivo sem o código para resgatá-lo.
 */
const MAX_LABEL_CHARS = 80;

function clampLabel(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed.length <= MAX_LABEL_CHARS ? trimmed : `${trimmed.slice(0, MAX_LABEL_CHARS - 1).trimEnd()}…`;
}

function formatBrDate(value: string | null | undefined): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : null;
}

/**
 * O rótulo que a pessoa consegue conferir no pátio, a partir do manifesto REAL.
 *
 * Preferência absoluta pelo número do MTR — é o que está impresso no papel que ela tem na mão. Sem
 * número (rascunho ainda não emitido), gerador + data ainda permitem conferência. Sem nenhum dos
 * dois, `null`: a degradação correta é RECUSAR a confirmação, não pedir um código para um alvo
 * inverificável.
 */
export function buildManifestIdentityLabel(input: {
  manifestNumber?: string | number | null;
  generatorDescription?: string | null;
  expeditionDate?: string | null;
}): string | null {
  const number = input.manifestNumber == null ? '' : String(input.manifestNumber).trim();
  const generator = input.generatorDescription ? clampLabel(input.generatorDescription) : null;
  const date = formatBrDate(input.expeditionDate);

  if (number) {
    const suffix = [generator, date].filter(Boolean).join(' - ');
    const label = suffix ? `MTR ${number} - ${suffix}` : `MTR ${number}`;
    return isConferibleItemLabel(label) ? clampLabel(label) : null;
  }

  if (generator && date) {
    const label = `Rascunho de ${date} - ${generator}`;
    return isConferibleItemLabel(label) ? clampLabel(label) : null;
  }

  return null;
}

function formatMinutes(ttlSeconds: number): string {
  const minutes = Math.max(1, Math.round(ttlSeconds / 60));
  return minutes === 1 ? '1 minuto' : `${minutes} minutos`;
}

/**
 * Prévia + código, em UM segmento. `null` = não há identidade conferível → não emita ticket.
 */
export function buildWhatsAppConfirmationPreview(input: ConfirmationPreviewInput): string | null {
  const conferible = input.items.map((item) => item.label).filter((label) => isConferibleItemLabel(label));
  if (conferible.length === 0) return null;
  if (!input.code || !/^\d{6}$/.test(input.code)) return null;

  const lines: string[] = [];
  if (input.supersededSummary) {
    lines.push(`Descartei o pedido anterior (${input.supersededSummary}) - *nada foi executado*.`, '');
  }

  lines.push('Confere antes de eu executar:', '');
  lines.push(`*${input.headline}*`);

  for (const label of conferible.slice(0, MAX_LISTED_ITEMS)) {
    lines.push(`- ${label}`);
  }
  const hidden = conferible.length - MAX_LISTED_ITEMS;
  if (hidden > 0) lines.push(`- e mais ${hidden}`);

  if (input.accountLabel) lines.push(`Conta CETESB: ${input.accountLabel}`);
  if (input.windowLine) lines.push(input.windowLine);

  if (input.irreversibleWarning) {
    lines.push('', input.irreversibleWarning);
  }

  // BLOCO ATÔMICO DO CÓDIGO. Fica no fim e nunca é separado do prazo nem da saída de desistência.
  lines.push('');
  lines.push(`Para confirmar, responda so com o codigo *${input.code}*.`);
  lines.push(`Vale ${formatMinutes(input.ttlSeconds)} e serve uma unica vez. Para desistir, responda NAO.`);
  lines.push('');
  lines.push(`Protocolo: ${input.ticketId}`);

  return lines.join('\n');
}

/**
 * Confirmado: o que entrou na fila. Nunca repete o código (ele já foi queimado).
 *
 * ┌─ PROMESSA SOLDADA AO MECANISMO — a troca condicional da fase 6 ───────────────────────────────┐
 * │ Este texto dizia "Te aviso aqui quando terminar." quando o aviso de conclusão NÃO EXISTIA, e a │
 * │ fase 5 teve de corrigi-lo: promessa sem mecanismo é pior que silêncio, porque quem confia nela │
 * │ não vai conferir.                                                                              │
 * │                                                                                                │
 * │ Na fase 6 o mecanismo existe — mas a promessa NÃO passa a ser incondicional, e essa é a lição  │
 * │ inteira. Ela depende de `noticeEnqueued`, que é o retorno REAL do INSERT do job de aviso naquela│
 * │ confirmação específica. `false` (INSERT falhou, ou nada foi despachado) devolve as DUAS LINHAS │
 * │ DE HOJE, palavra por palavra.                                                                  │
 * │                                                                                                │
 * │ ⚠️ O texto não verifica a condição sozinho — ela chega por parâmetro. Se um refactor futuro     │
 * │ passar `true` fixo, a promessa sem mecanismo volta pela porta dos fundos. É por isso que o teste│
 * │ que remove `noticeEnqueued` do caminho de confirmação é OBRIGATÓRIO, não opcional.             │
 * │                                                                                                │
 * │ E a segunda metade da frase não é hedge: é a única parte honesta quando a janela de 24 h fecha │
 * │ antes do desfecho. SEM PRAZO PROMETIDO — a duração da chamada à CETESB não está medida em lugar│
 * │ nenhum do repo, então "menos de um minuto" seria invenção.                                     │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export function buildWhatsAppConfirmedText(input: {
  headline: string;
  itemCount: number;
  ticketId: string;
  windowLine?: string | null;
  /** `true` SOMENTE quando o job de aviso daquela confirmação existe. Ver o bloco acima. */
  noticeEnqueued?: boolean;
}): string {
  const plural = input.itemCount === 1 ? 'a operação' : `as ${input.itemCount} operações`;
  const lines = input.noticeEnqueued === true
    ? [
      `Confirmado. Coloquei ${plural} na fila.`,
      'Te aviso aqui assim que terminar - deu certo ou nao. Se a conversa esfriar antes disso, o resultado fica em *MTRs* no SICAT.'
    ]
    : [
      `Confirmado. Coloquei ${plural} na fila.`,
      'Ainda nao consigo te avisar por aqui quando terminar: acompanhe em *MTRs* no SICAT, ou me pergunte daqui a pouco.'
    ];
  if (input.windowLine) lines.push('', input.windowLine);
  lines.push('', `Protocolo: ${input.ticketId}`);
  return lines.join('\n');
}

/**
 * "sim" / "ok" / 👍. NÃO conta tentativa de código — não pode consumir palpite —, mas gasta uma
 * saída paga do ticket.
 *
 * ⚠️ O código NÃO é repetido, e isto é consequência do desenho, não economia de texto: em claro ele
 * existe em EXATAMENTE DOIS lugares — a mensagem de saída e `code_hash` (scrypt com salt). O servidor
 * não tem como relê-lo, e inventar um caminho para relê-lo seria guardá-lo reversível.
 */
export function buildWhatsAppVagueYesText(input: { headline: string }): string {
  return [
    'Nao executo com um "sim" - neste canal e facil responder na mensagem errada.',
    '',
    `Para confirmar *${input.headline}*, responda so com os 6 digitos do codigo que mandei na mensagem anterior.`,
    'Se nao era isso, responda NAO.'
  ].join('\n');
}

/**
 * Código errado. O código NUNCA é repetido — repeti-lo tornaria as tentativas decorativas, que é
 * exatamente o oposto do que `attempt_count` existe para medir.
 */
export function buildWhatsAppWrongCodeText(input: { headline: string; attemptsRemaining: number }): string {
  const remaining = input.attemptsRemaining === 1 ? 'Resta 1 tentativa' : `Restam ${input.attemptsRemaining} tentativas`;
  return [
    `Codigo nao confere. ${remaining}.`,
    `O codigo da confirmacao de *${input.headline}* esta na mensagem anterior.`
  ].join('\n');
}

export function buildWhatsAppAttemptsExhaustedText(): string {
  return [
    'Cancelei a confirmacao por excesso de tentativas. *Nada foi executado.*',
    '',
    'Se ainda quiser, e so me pedir de novo.',
    'Se nao foi voce quem tentou, fale com o administrador da sua conta no SICAT.'
  ].join('\n');
}

/**
 * Expirou. "Nada foi executado" vem CEDO e é obrigatório: a pergunta real de quem está no pátio é
 * "saiu ou não saiu?", e a resposta tem de caber na notificação.
 */
export function buildWhatsAppExpiredTicketText(input: { headline: string; ttlSeconds: number }): string {
  return [
    `Essa confirmacao expirou (ela vale ${formatMinutes(input.ttlSeconds)}) e *nada foi executado*.`,
    '',
    `Se ainda quiser *${input.headline}*, me peca de novo que eu monto outra.`
  ].join('\n');
}

/** Replay. Mesma regra do confirmado: não promete aviso que não existe. */
export function buildWhatsAppAlreadyUsedText(input: { ticketId: string; usedAt: string | null }): string {
  const when = input.usedAt ? formatHourMinute(input.usedAt) : null;
  return [
    when
      ? `Essa confirmacao ja foi usada as ${when} - nao executei de novo para nao duplicar.`
      : 'Essa confirmacao ja foi usada - nao executei de novo para nao duplicar.',
    '',
    'O pedido anterior ja foi para a fila: veja o resultado em *MTRs* no SICAT.',
    `Protocolo: ${input.ticketId}`
  ].join('\n');
}

/**
 * O código veio de OUTRO telefone do mesmo usuário SICAT.
 *
 * A prévia (e o código) foram para um número; a resposta chegou de outro. Não se diz qual é o outro
 * número — quem manda a mensagem pode não ser o dono dele.
 */
export function buildWhatsAppOtherPhoneTicketText(): string {
  return [
    'Essa confirmacao foi montada para outro numero vinculado ao seu SICAT, entao *nada foi executado* por aqui.',
    '',
    'Se o pedido e seu, me peca de novo por aqui que eu monto uma confirmacao para este numero.'
  ].join('\n');
}

/** Ticket descartado (por "NAO", por um pedido novo que o substituiu, ou por falha de entrega). */
export function buildWhatsAppCancelledTicketText(input: { headline: string }): string {
  return [
    'Essa confirmacao foi descartada antes de ser usada e *nada foi executado*.',
    '',
    `Se ainda quiser *${input.headline}*, me peca de novo que eu monto outra.`
  ].join('\n');
}

/**
 * O DESPACHO FALHOU DEPOIS DA QUEIMA — e o pedido foi remontado sozinho.
 *
 * Vai como cabeçalho de uma prévia NOVA (código novo, prazo novo). A pessoa perdeu a confirmação por
 * uma falha que não é dela; fazê-la reescrever o pedido seria cobrar duas vezes pelo mesmo erro.
 */
export function buildWhatsAppDispatchRetryLead(input: { headline: string }): string {
  return [
    `Nao consegui colocar *${input.headline}* na fila agora - foi falha minha, e *nada foi executado*.`,
    '',
    'Ja remontei o pedido para voce nao ter de pedir de novo. O codigo anterior nao vale mais:',
    ''
  ].join('\n');
}

/** O despacho falhou de forma TERMINAL (a política recusou): remontar produziria o mesmo "não". */
export function buildWhatsAppDispatchBlockedText(input: { ticketId: string }): string {
  return [
    'Confirmei, mas na hora de executar o SICAT recusou o pedido, entao *nada foi executado*.',
    '',
    'Me peca de novo que eu monto a confirmacao ja no contexto atual - se repetir, fale com o administrador da sua conta no SICAT.',
    `Protocolo: ${input.ticketId}`
  ].join('\n');
}

export function buildWhatsAppDeclinedText(): string {
  return 'Ok, descartei a confirmacao. Nada foi executado.';
}

/** Cada conflito diz o MOTIVO ESPECÍFICO: "não executei nada" sem causa vira chamado de suporte. */
export function buildWhatsAppConflictText(input: { conflict: string; ticketId: string }): string {
  switch (input.conflict) {
    case 'account_changed':
    case 'session_changed':
      return [
        'A conta CETESB ativa no seu SICAT mudou depois que eu montei essa confirmacao, entao *nao executei nada*.',
        '',
        'Me peca de novo para eu montar a confirmacao ja na conta certa.',
        `Protocolo: ${input.ticketId}`
      ].join('\n');
    case 'window_missing':
    case 'window_exhausted':
      return [
        'A liberacao de acoes pelo WhatsApp foi encerrada, entao *nao executei nada*.',
        '',
        'Se ainda precisa, abra outra liberacao no SICAT (menu *Canais*).'
      ].join('\n');
    default:
      return [
        'Alguma coisa mudou no seu SICAT depois que eu montei essa confirmacao, entao *nao executei nada*.',
        '',
        'Me peca de novo que eu monto outra ja no contexto atual.',
        `Protocolo: ${input.ticketId}`
      ].join('\n');
  }
}

/** Consulta no meio do fluxo: o ticket SOBREVIVE, ganha rodapé e o TTL NÃO é renovado. */
export function buildWhatsAppPendingTicketFooter(input: {
  headline: string;
  code: string;
  minutesRemaining: number;
}): string {
  const minutes = Math.max(1, Math.round(input.minutesRemaining));
  return [
    '',
    '--',
    `Ainda pendente: *${input.headline}*. Responda *${input.code}* (vale por mais ~${minutes} min) ou NAO.`
  ].join('\n');
}

/**
 * Elegível, mas o operador ainda não ligou. Existe porque hoje `CHANNEL_BLOCKED` e `ACTIONS_DISABLED`
 * caem no MESMO `READ_ONLY_TEXT`: o operador liga o botão, a pessoa recebe a frase de sempre e
 * ninguém percebe que não pegou.
 */
export const WHATSAPP_CHANNEL_NOT_ENABLED_TEXT = [
  'Essa acao por aqui ainda nao esta liberada na sua plataforma. Nao e limitacao sua - e uma chave que o administrador do SICAT liga no AI Control Center.',
  '',
  'Enquanto isso, da para fazer no SICAT pelo navegador. E posso te ajudar a achar: "MTR 202600123456".'
].join('\n');

/**
 * N2 sem janela aberta. **NENHUM TICKET É CRIADO** — se não existe nada pendente, não existe nada que
 * a vítima possa ser induzida a confirmar.
 */
export function buildWhatsAppStepUpRequiredText(correlationId: string | null): string {
  const lines = [
    'Emitir MTR muda o registro na CETESB, entao precisa de uma liberacao feita por voce no SICAT pelo navegador - nao da para liberar por aqui.',
    '',
    'No SICAT: menu *Canais* -> *Liberar acoes pelo WhatsApp*. Voce escolhe a conta, por quanto tempo e quantas acoes.',
    '',
    'Quando liberar, e so me chamar de novo aqui.'
  ];
  if (correlationId) lines.push('', `Protocolo: ${correlationId}`);
  return lines.join('\n');
}

/**
 * N2 elegível, janela viva, mas o AVISO DE CONCLUSÃO não está no ar. Ver
 * `whatsapp-action-eligibility.ts`: confirmar uma emissão irreversível num canal onde o desfecho é
 * invisível é defeito, não detalhe. Recusa explícita, com texto próprio — não silêncio.
 */
export const WHATSAPP_N2_NOTICE_MISSING_TEXT = [
  'Emitir MTR por aqui ainda nao esta no ar: por enquanto eu nao consigo te avisar quando a CETESB responde, e emitir sem saber o desfecho nao da.',
  '',
  'Emita no SICAT pelo navegador. Por aqui eu ja imprimo 2a via e consulto o que voce precisar.'
].join('\n');

function formatHourMinute(iso: string): string | null {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return null;
  const date = new Date(parsed);
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
}
