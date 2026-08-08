/**
 * GRAMÁTICA DE RESGATE — determinística, ANTES do planner, zero LLM.
 *
 * O turno de resgate não pode passar pelo modelo por dois motivos independentes:
 *  · re-planejar poderia despachar algo DIFERENTE do que a pessoa leu na prévia (o ticket congela a
 *    escolha justamente para isso);
 *  · um modelo que interpreta "pode mandar" como confirmação é um modelo que confirma sozinho.
 *
 * Três decisões deste módulo, cada uma fechando uma colisão real do canal:
 *
 *  1. **`cancelar` isolado, com ticket vivo, significa DESISTIR da confirmação — nunca
 *     `cancel_manifest`.** É a colisão de vocabulário mais perigosa do canal e é resolvida aqui,
 *     antes do LLM. (Com ticket vivo — sem ticket, o texto segue o caminho normal e o desenho recusa
 *     cancelamento por canal externo de qualquer forma.)
 *  2. **"sim", "ok", "pode", "isso" e emoji NUNCA confirmam.** Não contam tentativa de código (não
 *     podem consumir palpite), mas gastam uma saída do ticket — responder infinitamente a "sim" é
 *     amplificar custo contra quem está confuso.
 *  3. **Colisão numérica.** O código tem 6 dígitos e convive no fio com número de MTR (8+) e de
 *     rascunho (4). O padrão é ancorado nas duas pontas e exige EXATAMENTE 6 dígitos: `202600123456`
 *     não é confirmação, e `4821` também não.
 */

/** `\d` em JS casa só ASCII sem `u` — e é isso que se quer: dígito árabe-oriental não é o código. */
const CODE_PATTERN = /^\s*(?:CONFIRMAR\s+)?(\d{6})\s*$/i;

const DECLINE_PATTERN = /^\s*(?:n[aã]o|n|cancela|cancelar|deixa|desisto|desistir)\s*[.!]?\s*$/i;

/**
 * "Sim" ambíguo. Deliberadamente CURTO e ancorado: uma frase inteira que contenha "ok" no meio é
 * pergunta normal, não confirmação — e o desfecho de um falso positivo aqui é gastar uma saída paga
 * do ticket, não executar nada.
 */
const VAGUE_YES_PATTERN =
  /^\s*(?:sim|s|ok|okay|okey|blz|beleza|isso|isso\s+mesmo|confirmo|confirmado|confirma|pode|pode\s+ser|pode\s+mandar|manda|vai|bora|certo|positivo|claro|👍|👍🏻|👍🏼|👍🏽|👍🏾|👍🏿|✅|🆗)\s*[.!]?\s*$/i;

export type WhatsAppConfirmationUtterance =
  | { kind: 'none' }
  | { kind: 'code'; code: string }
  | { kind: 'decline' }
  | { kind: 'vague_yes' };

/**
 * Classifica a mensagem. Ordem: código → recusa → "sim" ambíguo. `code` vence porque é o único que
 * autoriza; `decline` vence `vague_yes` porque `n` está nos dois espaços de vizinhança e desistir é
 * o desfecho seguro.
 */
export function parseWhatsAppConfirmationUtterance(text: unknown): WhatsAppConfirmationUtterance {
  if (typeof text !== 'string') return { kind: 'none' };
  const raw = text.trim();
  if (!raw || raw.length > 40) return { kind: 'none' };

  const codeMatch = CODE_PATTERN.exec(raw);
  if (codeMatch?.[1]) return { kind: 'code', code: codeMatch[1] };

  if (DECLINE_PATTERN.test(raw)) return { kind: 'decline' };
  if (VAGUE_YES_PATTERN.test(raw)) return { kind: 'vague_yes' };

  return { kind: 'none' };
}
