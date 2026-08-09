/**
 * Blocos de renderizacao + higiene de VALOR para o canal WhatsApp (fase 4).
 *
 * Duas responsabilidades, ambas de baixo nivel:
 *   1. o tipo `RenderBlock`, atomo que o renderer produz e o segmentador empacota;
 *   2. a coercao de um valor QUALQUER de payload para um texto seguro de emitir.
 *
 * +- POR QUE ISTO EH SEPARADO ---------------------------------------------------------------+
 * | `JSON.stringify` EH PROIBIDO NESTE MODULO E NO RENDERER - no default, em log de erro, em  |
 * | mensagem de excecao, em qualquer lugar. Foi serializacao multipla (resposta HTTP + trilha |
 * | de auditoria) que estourou o heap neste modulo (CrashLoop -> Cloudflare "invalid/         |
 * | incomplete response"). Um `stringify` aqui seria o TERCEIRO serializador. `String(valor)` |
 * | sobre objeto (que vira `[object Object]`) eh igualmente proibido: `coerceScalarText`      |
 * | devolve `null` para qualquer nao-escalar e o campo simplesmente NAO SAI.                  |
 * +------------------------------------------------------------------------------------------+
 *
 * As tres armadilhas de texto que este modulo fecha, todas com consequencia concreta:
 *
 *  - **valor nunca cria linha**: `\n`/`\r`/tab/separadores unicode viram espaco ANTES da
 *    formatacao. Sem isso um campo adversarial forja uma linha `Protocolo: corr_falso`, um item
 *    extra na lista ou um rodape falso - o texto passaria a mentir com a NOSSA tipografia.
 *  - **neutralizacao de formatacao por REMOCAO, nao por escape**: o WhatsApp nao tem caractere de
 *    escape. Um `*` orfao num nome de empresa aplica negrito ao RESTO da mensagem inteira; tres
 *    crases transformam o resto em bloco monoespacado. Os rotulos sao nossos e continuam podendo
 *    usar `*`; os VALORES, nao.
 *  - **corte em fronteira de grafema**: `slice` sobre UTF-16 parte par surrogate e produz um lone
 *    surrogate, isto eh, UTF-16 invalido, que o provedor pode REJEITAR. Mensagem rejeitada eh o
 *    pior desfecho: o operador fica MUDO e nao ve nem o erro.
 */

import { sanitizeConversationText } from '../../conversation-sanitizer.js';

export type RenderBlockKind = 'header' | 'scope' | 'item' | 'card' | 'note' | 'affordance';

export type RenderBlock = {
  kind: RenderBlockKind;
  /** Ja higienizado. NUNCA vazio - `buildBlock` devolve `null` em vez de emitir bloco vazio. */
  text: string;
  /** `true` = pode ser descartado se nao couber (item/card). `false` = obrigatorio. */
  droppable: boolean;
};

/**
 * Caps SEMANTICOS por campo, nao um cap unico. Um `manifestNumber` de 120 caracteres ja eh absurdo;
 * capar tudo em 120 deixaria passar linha ilegivel de lista.
 */
export const FIELD_CAPS = Object.freeze({
  identifier: 32,
  statusLabel: 40,
  personName: 60,
  freeText: 120,
  errorMessage: 300
});

const ELLIPSIS = '\u2026';

/** Quebras de linha e separadores de paragrafo - viram ESPACO (nao podem sumir e colar palavras). */
const LINE_BREAKING = /[\r\n\t\v\f\u0085\u2028\u2029]/g;

/**
 * Controles C0/C1, zero-width e TODOS os controles BIDI.
 * Um unico caractere invisivel inverte VISUALMENTE um numero de MTR na tela do celular - eh
 * falsificacao de conteudo fiscal, nao sujeira estetica.
 *
 * A classe foi AMPLIADA depois de uma varredura por code point que achou buracos entre o que o
 * comentario PROMETIA e o que a regex cobria: ARABIC LETTER MARK (marca direcional implicita,
 * equivalente a RLM para o algoritmo bidi), os controles de formatacao bidi depreciados, MONGOLIAN
 * VOWEL SEPARATOR e SOFT HYPHEN SOBREVIVIAM. Por isso a faixa 2060-206F inteira no lugar das duas
 * recortadas.
 */
const CONTROL_AND_INVISIBLE =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g;

/**
 * Bloco de TAGs (U+E0000-U+E007F) - o canal classico de texto invisivel: cada TAG espelha um ASCII,
 * nao aparece na tela e ainda consome orcamento de caracteres. Regex SEPARADA porque exige a flag
 * `u` (faixa astral) e a classe acima e deliberadamente UTF-16.
 */
const TAG_CHARACTERS = /[\u{E0000}-\u{E007F}]/gu;

/** Marcadores de formatacao do WhatsApp. Removidos dos VALORES, preservados nos nossos rotulos. */
const WHATSAPP_MARKUP = /[*_~`]/g;

/** Qualquer espaco (incl. NBSP e os de largura variavel) colapsa em um espaco simples. */
const ANY_SPACE = /[\s\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]+/g;

/**
 * Higiene de um VALOR vindo do payload. Ordem obrigatoria: quebra de linha -> espaco ANTES de apagar
 * controles (senao `\n` cai no intervalo C0, some, e "linha1\nlinha2" vira "linha1linha2").
 */
export function sanitizeRenderedValue(text: string): string {
  return String(text ?? '')
    .replace(LINE_BREAKING, ' ')
    .replace(CONTROL_AND_INVISIBLE, '')
    .replace(TAG_CHARACTERS, '')
    .replace(WHATSAPP_MARKUP, '')
    .replace(ANY_SPACE, ' ')
    .trim();
}

let cachedSegmenter: Intl.Segmenter | null | undefined;

function getGraphemeSegmenter(): Intl.Segmenter | null {
  if (cachedSegmenter === undefined) {
    try {
      cachedSegmenter = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
        ? new Intl.Segmenter('pt-BR', { granularity: 'grapheme' })
        : null;
    } catch {
      cachedSegmenter = null;
    }
  }
  return cachedSegmenter;
}

/** Marcas que CONTINUAM o grafema anterior (combinantes, variation selectors, ZWJ, keycap). */
const GRAPHEME_CONTINUATION =
  /[\u0300-\u036F\u0483-\u0489\u20D0-\u20FF\uFE00-\uFE0F\uFE20-\uFE2F\u200D\u20E3]/;

const ZERO_WIDTH_JOINER = '\u200D';

function isHighSurrogate(code: number): boolean {
  return code >= 0xD800 && code <= 0xDBFF;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xDC00 && code <= 0xDFFF;
}

/** Recuo sem `Intl.Segmenter` (Node sem ICU completo). Cobre surrogate, combinante e ZWJ. */
function retreatToBoundaryFallback(value: string, index: number): number {
  let cut = Math.min(index, value.length);
  while (cut > 0) {
    const code = value.charCodeAt(cut);
    if (isLowSurrogate(code) && isHighSurrogate(value.charCodeAt(cut - 1))) {
      cut -= 1;
      continue;
    }
    const char = value.charAt(cut);
    if (char && GRAPHEME_CONTINUATION.test(char)) {
      cut -= 1;
      continue;
    }
    if (value.charAt(cut - 1) === ZERO_WIDTH_JOINER) {
      cut -= 1;
      continue;
    }
    break;
  }
  return cut;
}

function retreatToBoundary(value: string, index: number): number {
  const segmenter = getGraphemeSegmenter();
  if (!segmenter) return retreatToBoundaryFallback(value, index);

  // So a regiao ATE o corte eh segmentada (+ folga) - segmentar 50k caracteres para cortar em 120
  // seria pagar exatamente o custo que este modulo existe para nao pagar.
  const window = value.slice(0, Math.min(value.length, index + 8));
  let boundary = 0;
  try {
    for (const piece of segmenter.segment(window)) {
      const end = piece.index + piece.segment.length;
      if (end > index) break;
      boundary = end;
    }
  } catch {
    return retreatToBoundaryFallback(value, index);
  }
  return boundary;
}

/**
 * Corte SEGURO em `maxChars` unidades UTF-16 (que eh o que o provedor mede). Nunca parte par
 * surrogate, sequencia ZWJ nem marca combinante. Prefere fronteira de espaco nos ultimos 10% do
 * espaco disponivel - cortar no meio de "Transresiduos" eh feio; cortar no meio de um emoji eh
 * invalido.
 */
export function cutAtGrapheme(text: string, maxChars: number): string {
  const value = String(text ?? '');
  const limit = Math.floor(Number(maxChars));
  if (!Number.isFinite(limit) || limit <= 0) return '';
  if (value.length <= limit) return value;

  let cut = limit;
  const spaceFloor = Math.max(1, Math.floor(limit * 0.9));
  const spaceIndex = value.lastIndexOf(' ', limit);
  if (spaceIndex >= spaceFloor) cut = spaceIndex;

  let output = value.slice(0, retreatToBoundary(value, cut)).trimEnd();

  // Cinto: se o recuo ainda deixou um high surrogate solto, ele sai. Lone surrogate = UTF-16
  // invalido = mensagem possivelmente REJEITADA pelo provedor.
  if (output.length > 0 && isHighSurrogate(output.charCodeAt(output.length - 1))) {
    output = output.slice(0, -1);
  }
  return output;
}

/**
 * Coercao de um valor de payload para texto emitivel, ou `null`.
 *
 * `null` (e nao string vazia) para tudo que nao for escalar: objeto, array, funcao, booleano,
 * `NaN`/`Infinity`. O campo simplesmente nao sai - eh a diferenca entre OMITIR e imprimir
 * `[object Object]`.
 *
 * Tambem roda `sanitizeConversationText` (Bearer/JWT/`chave=valor`): eh O(campo emitido) porque
 * acontece DEPOIS da projecao por allowlist, e ainda pega um segredo que caiu num campo livre
 * (`notes`, `message`). Rodar o sanitizador de ARVORE sobre `data` cru faria o oposto - ele desce 8
 * niveis e ALOCA UMA COPIA da arvore inteira, reintroduzindo o vetor de OOM dentro da propria defesa.
 */
function toRawScalar(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
  if (typeof value === 'bigint') return String(value);
  // objeto, array, symbol, function - sem `String()`, sem `stringify`, sem excecao.
  return null;
}

function capWithEllipsis(cleaned: string, maxChars: number): string | null {
  if (!cleaned) return null;
  const limit = Math.floor(Number(maxChars));
  if (!Number.isFinite(limit) || limit <= 0) return null;
  if (cleaned.length <= limit) return cleaned;

  // Corte SEMPRE marcado. Truncagem silenciosa eh a falha que a escada de honestidade elimina.
  const body = cutAtGrapheme(cleaned, Math.max(1, limit - 1));
  return body ? `${body}${ELLIPSIS}` : null;
}

/**
 * PRE-CORTE ANTES DA HIGIENE.
 *
 * `sanitizeConversationText` faz ~16 varreduras completas COM ALOCACAO (Bearer, JWT e 14 regexes de
 * `chave=valor` montadas em loop) e `sanitizeRenderedValue` mais cinco - todas sobre a string
 * INTEIRA, para so depois capar em 32-300 caracteres. Medido: 1 MB -> 27 ms, 20 MB -> 567 ms POR
 * CAMPO. O cap de ITENS limita a quantidade de campos, nao o tamanho de cada um: era o unico vetor
 * do modulo que ainda escalava com dado NAO CONFIAVEL em vez de escalar com o teto.
 *
 * A folga de 4x + 16 cobre com sobra o que a higiene remove (espacos colapsados, controles,
 * marcadores) sem mudar o texto emitido em nenhum campo de tamanho realista.
 *
 * Devolve tambem `truncated`, porque corte SILENCIOSO eh a falha que a escada de honestidade existe
 * para eliminar: se o pre-corte cortou e a higiene encolheu o resto para dentro do cap, quem chama
 * ainda tem de marcar a reticencia.
 */
function preCutForSanitizing(raw: string, maxChars: number): { head: string; truncated: boolean } {
  const limit = Math.floor(Number(maxChars));
  if (!Number.isFinite(limit) || limit <= 0) return { head: raw, truncated: false };
  const window = limit * 4 + 16;
  if (raw.length <= window) return { head: raw, truncated: false };
  return { head: cutAtGrapheme(raw, window), truncated: true };
}

/** Garante a marca de corte quando o pre-corte cortou e a higiene escondeu o excesso. */
function markTruncationIfNeeded(capped: string, truncated: boolean, maxChars: number): string {
  if (!truncated || capped.endsWith(ELLIPSIS)) return capped;
  return `${cutAtGrapheme(capped, Math.max(1, Math.floor(Number(maxChars)) - 1))}${ELLIPSIS}`;
}

export function coerceScalarText(value: unknown, maxChars: number): string | null {
  const raw = toRawScalar(value);
  if (raw === null) return null;
  const { head, truncated } = preCutForSanitizing(raw, maxChars);
  const capped = capWithEllipsis(sanitizeRenderedValue(sanitizeConversationText(head)), maxChars);
  return capped ? markTruncationIfNeeded(capped, truncated, maxChars) : null;
}

/**
 * Coercao de um IDENTIFICADOR que a pessoa precisa conseguir DIGITAR ou COPIAR (numero de MTR,
 * codigo de CDF, placa, protocolo de suporte).
 *
 * Difere de `coerceScalarText` num ponto so, e o ponto tem porque: aqui a neutralizacao de
 * formatacao eh uma ALLOWLIST DE CARACTERES em vez da remocao dos marcadores. `corr_9a41b0` passando
 * pela remocao de `_` viraria `corr9a41b0` - um protocolo que o suporte NAO acha. Entre "id
 * mangleado" e "id que talvez fique em italico", o segundo eh o dano menor: o texto continua
 * correto e copiavel. E `*`, `~` e crase (os marcadores que de fato bleedam formato) continuam
 * caindo fora da allowlist.
 */
const IDENTIFIER_DISALLOWED = /[^0-9A-Za-zÀ-ÖØ-öø-ÿ._:/-]+/g;

export function coerceIdentifierText(value: unknown, maxChars: number): string | null {
  const raw = toRawScalar(value);
  if (raw === null) return null;
  const { head, truncated } = preCutForSanitizing(raw, maxChars);
  // Mesma higiene de controle/BIDI/segredo; a diferenca eh a allowlist de caracteres no lugar da
  // remocao de marcadores. `*`, `_`... nao: `_` FICA (ver acima), `*`/`~`/crase caem fora.
  const cleaned = sanitizeConversationText(head)
    .replace(LINE_BREAKING, ' ')
    .replace(CONTROL_AND_INVISIBLE, '')
    .replace(TAG_CHARACTERS, '')
    .replace(IDENTIFIER_DISALLOWED, '')
    .trim();
  const capped = capWithEllipsis(cleaned, maxChars);
  return capped ? markTruncationIfNeeded(capped, truncated, maxChars) : null;
}

/** Constroi um bloco, ou `null` quando nao sobrou texto. Bloco vazio nunca entra na lista. */
export function buildBlock(
  kind: RenderBlockKind,
  text: string | null | undefined,
  droppable = false
): RenderBlock | null {
  const value = String(text ?? '').trim();
  if (!value) return null;
  return { kind, text: value, droppable };
}
