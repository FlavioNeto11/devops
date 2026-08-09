/**
 * TEXTOS DO AVISO DE CONCLUSÃO (fase 6 da cadeia `whatsapp-channel-sicat`).
 *
 * Estes textos são a razão de a fase existir: a fase 5 fez alguém confirmar uma ação por mensagem e
 * o desfecho era invisível. Convenções do módulo, todas herdadas e nenhuma decorativa:
 *
 *  · `*asterisco simples*` = negrito no WhatsApp (o funil de higiene do composer converte `**x**`);
 *  · `Protocolo:` UMA ÚNICA VEZ e no FIM — duas linhas de protocolo leem como mensagem remontada errado;
 *  · NENHUMA URL. O WhatsApp auto-linka URL nua e a rota do SICAT devolve 401 para quem toca; o
 *    operador conclui que o SICAT quebrou (motivo já registrado em `whatsapp-result-renderer`);
 *  · nenhum `reasonCode`/`correlationId` cru, nenhum id interno, TELEFONE EM LUGAR NENHUM;
 *  · o texto é AUTOSSUFICIENTE: nunca referencia a conversa ("conforme você perguntou"). Ele chega
 *    como notificação de celular, possivelmente horas depois, e é lido isolado.
 *
 * ┌─ "*Nada mudou na CETESB.*" SÓ EM TEXTO DE N1 ─────────────────────────────────────────────────┐
 * │ Para N1 a frase é verdadeira POR CONSTRUÇÃO: `manifest.print` busca 2ª via de documento que já │
 * │ existe e `manifest.replicate_segmented` cria rascunho local. Não há estado remoto a mudar.     │
 * │                                                                                                │
 * │ Para `manifest.submit` ela é potencialmente MENTIRA: o job pode falhar DEPOIS de a CETESB ter  │
 * │ criado o MTR (timeout na resposta, erro de parse, falha ao persistir, o pod morrendo entre o   │
 * │ POST e o commit) — e o job não tem como saber a diferença. `lastErrorCode` distingue classes de │
 * │ erro de transporte, não distingue "não chegou lá" de "chegou e eu não soube". Por isso os      │
 * │ textos N2 abaixo dizem "a CETESB não confirmou" e mandam CONFERIR, e por isso o portão do N2   │
 * │ continua fechado (ver `whatsapp-confirmation-flow`).                                            │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 */

export type NoticeOutcome = 'succeeded' | 'partial' | 'failed' | 'dlq' | 'timeout';

export type NoticeTier = 'N1' | 'N2';

export type NoticeTextInput = {
  /** Manchete CONGELADA do ticket ("2a via de 3 MTRs"). Nunca remontada aqui. */
  headline: string;
  ticketId: string;
  tier: NoticeTier;
  /** Contagem da FONTE (jobs despachados), nunca `labels.length`. */
  itemTotal: number;
  itemCompleted: number;
  /** Rótulos conferíveis congelados na emissão do ticket. Truncados em 3 + "e mais N". */
  labels: string[];
  /** Quantos PDFs vão anexados nesta entrega. `0` = nenhum. */
  documentCount: number;
  /** `job.attempts` REAL do pior job. Nunca um literal. */
  attempts: number;
  /** Código de erro do job, para o mapa allowlisted. Nunca sai cru no texto. */
  errorCode?: string | null;
};

const MAX_LISTED_LABELS = 3;

/**
 * CAUSA DE FALHA POR ALLOWLIST — o mesmo princípio de `buildErrorFamily` no renderer.
 *
 * `lastErrorCode` é string vinda do gateway/CETESB e não é vocabulário de operador: emiti-la crua
 * põe `CETESB_HTTP_ERROR` na tela de quem está de luva no pátio. O default genérico é a resposta
 * correta para código desconhecido — nunca "vazar o código porque é mais informativo".
 */
const FAILURE_CAUSES: Readonly<Record<string, string>> = Object.freeze({
  CETESB_AUTH_FAILED: 'A conexao com a CETESB caiu no meio do caminho',
  CETESB_HTTP_ERROR: 'A CETESB nao respondeu',
  CETESB_REMOTE_ERROR: 'A CETESB recusou o pedido',
  CETESB_TIMEOUT: 'A CETESB demorou demais para responder',
  ETIMEDOUT: 'A CETESB demorou demais para responder',
  ECONNRESET: 'A conexao com a CETESB caiu no meio do caminho',
  ECONNREFUSED: 'Nao consegui falar com a CETESB'
});

const GENERIC_FAILURE_CAUSE = 'Nao consegui concluir';

export function describeNoticeFailureCause(errorCode: unknown): string {
  const key = String(errorCode ?? '').trim().toUpperCase();
  if (!key) return GENERIC_FAILURE_CAUSE;
  return Object.prototype.hasOwnProperty.call(FAILURE_CAUSES, key)
    ? (FAILURE_CAUSES[key] ?? GENERIC_FAILURE_CAUSE)
    : GENERIC_FAILURE_CAUSE;
}

/** "a", "a e b", "a, b e c" — concordância de operador, não lista separada por vírgula. */
function joinLabels(labels: string[]): string {
  const marked = labels.map((label) => `*${label}*`);
  if (marked.length <= 1) return marked[0] ?? '';
  return `${marked.slice(0, -1).join(', ')} e ${marked[marked.length - 1]}`;
}

function describeItems(input: NoticeTextInput): string | null {
  const shown = input.labels.slice(0, MAX_LISTED_LABELS);
  if (shown.length === 0) return null;
  const rest = Math.max(0, input.labels.length - shown.length);
  return `${joinLabels(shown)}${rest > 0 ? ` e mais ${rest}` : ''}`;
}

function finish(lines: Array<string | null>, ticketId: string): string {
  const body = lines.filter((line): line is string => line !== null);
  body.push('', `Protocolo: ${ticketId}`);
  return body.join('\n');
}

/**
 * O texto do aviso, escolhido pelo desfecho AGREGADO. Uma função só, porque o desfecho é uma decisão
 * do handler e o texto é consequência dela — espalhar a escolha em ramos do worker é como um texto
 * de N1 acaba saindo para um desfecho de N2.
 */
export function buildWhatsAppNoticeText(outcome: NoticeOutcome, input: NoticeTextInput): string {
  switch (outcome) {
    case 'succeeded':
      return buildSucceededText(input);
    case 'partial':
      return buildPartialText(input);
    case 'failed':
      return buildFailedText(input);
    case 'dlq':
      return buildDlqText(input);
    case 'timeout':
      return buildTimeoutText(input);
  }
}

/** (1) e (1b) e (2): sucesso. Com anexo o texto É a legenda da mídia quando há 1 documento só. */
function buildSucceededText(input: NoticeTextInput): string {
  const items = describeItems(input);

  if (input.documentCount === 1) {
    return finish([
      `*${input.headline}* — pronto.`,
      '',
      items ? `${items}. O PDF vai anexado nesta mensagem.` : 'O PDF vai anexado nesta mensagem.'
    ], input.ticketId);
  }

  if (input.documentCount > 1) {
    return finish([
      `*${input.headline}* — pronto.`,
      '',
      items ? `${items}.` : null,
      `Mando os ${input.documentCount} PDFs nas proximas mensagens.`
    ], input.ticketId);
  }

  // (2) SEM DOCUMENTO — mídia desligada, provedor sem bytes, arquivo acima do teto, artefato
  // indisponível. A frase é a MESMA de hoje no renderer: honesta, e sem prometer anexo.
  return finish([
    `*${input.headline}* — pronto.`,
    '',
    items
      ? `${items}. Por aqui nao consigo te mandar o arquivo desta vez; o download fica em *MTRs* no SICAT, pelo navegador, por 72 horas.`
      : 'Por aqui nao consigo te mandar o arquivo desta vez; o download fica em *MTRs* no SICAT, pelo navegador, por 72 horas.'
  ], input.ticketId);
}

/** (1c) LOTE PARCIAL. A contagem vem de `itemCompleted`/`itemTotal`, NUNCA de `labels.length`. */
function buildPartialText(input: NoticeTextInput): string {
  const missing = Math.max(0, input.itemTotal - input.itemCompleted);
  const items = describeItems(input);

  return finish([
    `*${input.headline}* — ${input.itemCompleted} de ${input.itemTotal} ficaram prontos.`,
    '',
    input.documentCount > 0
      ? `Mando ${input.documentCount === 1 ? 'o PDF' : `os ${input.documentCount} PDFs`} nas proximas mensagens.`
      : null,
    input.tier === 'N1'
      ? `${missing === 1 ? '1 nao saiu' : `${missing} nao sairam`}. *Nada mudou na CETESB* nesses.`
      : `${missing === 1 ? '1 nao foi confirmado' : `${missing} nao foram confirmados`} pela CETESB.`,
    '',
    input.tier === 'N1'
      ? 'Peca so o que faltou de novo por aqui, ou baixe em *MTRs* no SICAT.'
      : '*Confira em MTRs no SICAT antes de emitir de novo* — se ja estiver la, um segundo envio vira MTR duplicado, e cancelar nao tem volta.',
    items ? `Itens deste pedido: ${items}.` : null
  ], input.ticketId);
}

/** (3) FALHA. Em N1 o código SABE que nada mudou na CETESB, e por isso PODE afirmar. */
function buildFailedText(input: NoticeTextInput): string {
  const cause = describeNoticeFailureCause(input.errorCode);
  const tries = input.attempts === 1 ? 'Tentei 1 vez' : `Tentei ${input.attempts} vezes`;

  if (input.tier === 'N1') {
    return finish([
      `*${input.headline}* — nao deu certo.`,
      '',
      `${cause}. ${tries} e nao consegui. *Nada mudou na CETESB* — nenhum MTR foi criado, alterado ou cancelado.`,
      '',
      'Costuma ser passageiro: me peca de novo daqui a pouco. O SICAT no navegador esta funcionando normalmente.'
    ], input.ticketId);
  }

  // (5) N2 — NÃO afirma que nada aconteceu, porque o código não sabe.
  return finish([
    `*${input.headline}* — nao deu certo.`,
    '',
    `${cause}. A CETESB nao confirmou a emissao.`,
    '',
    '*Confira em MTRs no SICAT antes de emitir de novo* — se o MTR ja estiver la, um segundo envio vira MTR duplicado, e cancelar nao tem volta.'
  ], input.ticketId);
}

/** (4) DLQ. A diferença que importa não é técnica: ISTO NÃO VAI SE RESOLVER SOZINHO. */
function buildDlqText(input: NoticeTextInput): string {
  if (input.tier === 'N1') {
    return finish([
      `*${input.headline}* — parei de tentar.`,
      '',
      'Nao consegui concluir e o pedido ficou registrado para o time do SICAT olhar. *Nada mudou na CETESB.*',
      '',
      'Nao precisa esperar por mim: peca de novo por aqui, ou baixe em *MTRs* no SICAT.'
    ], input.ticketId);
  }

  return finish([
    `*${input.headline}* — parei de tentar.`,
    '',
    'A CETESB nao confirmou a emissao e o pedido ficou registrado para o time do SICAT olhar.',
    '',
    '*Confira em MTRs no SICAT antes de emitir de novo* — se o MTR ja estiver la, um segundo envio vira MTR duplicado, e cancelar nao tem volta.'
  ], input.ticketId);
}

/**
 * (6) PRAZO VENCIDO — a mensagem que garante que o canal NUNCA cala.
 *
 * É o texto do conjunto com maior risco de má-leitura: alguém apressado pode ler "ainda nao
 * terminou" como "nao saiu" e pedir de novo (em N1 o dano é um PDF duplicado). "continuam rodando" e
 * "acompanhe em MTRs" existem para reduzir isso, e o texto é o único que eu submeteria a um operador
 * real antes de subir.
 */
function buildTimeoutText(input: NoticeTextInput): string {
  const pending = Math.max(0, input.itemTotal - input.itemCompleted);
  const items = describeItems(input);

  return finish([
    `*${input.headline}* — ainda nao terminou.`,
    '',
    `${input.itemCompleted} de ${input.itemTotal} concluiu ate agora.`,
    items ? `Itens deste pedido: ${items}.` : null,
    `${pending === 1 ? 'O outro continua rodando' : `Os outros ${pending} continuam rodando`}, e este e o ultimo aviso que consigo te mandar sobre ${pending === 1 ? 'ele' : 'eles'}.`,
    '',
    'Acompanhe em *MTRs* no SICAT.'
  ], input.ticketId);
}

/**
 * BLOCO DE DÍVIDA — o aviso que a janela de 24 h impediu de sair, entregue DE CARONA na próxima
 * resposta do canal.
 *
 * Vai como prefixo de uma resposta que já ia sair: dentro da janela (a pergunta nova É um inbound),
 * grátis, e SEM uma bolha própria — mandar um `sendText` dedicado aqui seria uma mensagem paga a
 * mais para dizer algo que já perdeu a hora.
 */
export function buildWhatsAppPendingNoticeBlock(texts: string[]): string | null {
  const usable = texts.map((text) => String(text || '').trim()).filter(Boolean);
  if (usable.length === 0) return null;

  const lead = usable.length === 1
    ? 'Enquanto isso, um pedido seu terminou:'
    : `Enquanto isso, ${usable.length} pedidos seus terminaram:`;

  return [lead, '', usable.join('\n\n—\n')].join('\n');
}
