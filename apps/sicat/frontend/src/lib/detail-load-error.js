/**
 * ERRO DE CARREGAMENTO DE DETALHE — módulo PURO (sem Vue, sem DOM).
 *
 * Duas telas de detalhe contavam histórias diferentes para o MESMO caso (id
 * inexistente na URL):
 *   - `/manifestos/<id inválido>`: repassava a mensagem CRUA do backend, em
 *     INGLÊS e com o identificador interno dentro ("Manifesto man_… was not
 *     found.");
 *   - `/dmr/<id inválido>`: mostrava pt-BR, mas o cabeçalho ficava preso em
 *     "Carregando…" para sempre, porque o título só saía do placeholder quando
 *     o registro chegava — e ele nunca chegava.
 *
 * Aqui fica a tradução única: "não encontrado" em pt-BR, sem id interno e com o
 * caminho de volta declarado. O identificador interno continua acessível ao
 * suporte (bloco "Detalhes técnicos" da tela de manifesto) — ele só não é mais
 * a explicação dada ao operador.
 */

const NOT_FOUND_PATTERNS = Object.freeze([
  /\bnot found\b/i,
  /\bnão\s+(?:foi\s+)?encontrad[oa]s?\b/i,
  /\bnao\s+(?:foi\s+)?encontrad[oa]s?\b/i,
  /NOT_FOUND/,
  /\bERRO?\s*HTTP\s*404\b/i
]);

/**
 * Identificadores internos que não devem aparecer para o operador:
 * prefixados (`man_01JQ…`, `dmr_abc123…`) ou UUID.
 * Códigos de erro em CAIXA ALTA (`MANIFEST_CANCEL_NOT_CONFIRMED`) NÃO batem —
 * eles são úteis para o suporte e continuam visíveis.
 */
const INTERNAL_ID_PATTERNS = Object.freeze([
  /\b[a-z][a-z0-9]{1,7}_[A-Za-z0-9][A-Za-z0-9_-]{5,}\b/g,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi
]);

export const DETAIL_SUBJECTS = Object.freeze({
  manifest: Object.freeze({
    notFoundTitle: 'Manifesto não encontrado',
    notFoundMessage:
      'Este manifesto não existe ou não pertence à conta CETESB ativa nesta sessão.',
    notFoundHint:
      'Confira o número do MTR na listagem de manifestos e abra o registro por lá. Se você opera com mais de uma conta CETESB, troque a conta ativa em "Minha sessão".',
    failureTitle: 'Não foi possível carregar o manifesto',
    failureFallback: 'Falha ao carregar o detalhe do manifesto.'
  }),
  dmr: Object.freeze({
    notFoundTitle: 'Declaração não encontrada',
    notFoundMessage:
      'Esta declaração de resíduos (DMR) não existe ou não pertence à conta CETESB ativa nesta sessão.',
    notFoundHint:
      'Volte para a lista de DMRs e abra a declaração por lá. Se você opera com mais de uma conta CETESB, troque a conta ativa em "Minha sessão".',
    failureTitle: 'Não foi possível carregar a declaração',
    failureFallback: 'Falha ao carregar o detalhe da declaração.'
  })
});

/** Remove identificadores internos de um texto que vai para a tela. */
export function redactInternalIds(text) {
  let output = String(text ?? '');
  for (const pattern of INTERNAL_ID_PATTERNS) {
    output = output.replace(pattern, '');
  }

  return output.replace(/\s{2,}/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim();
}

/**
 * O erro (objeto de API, `Error` ou string de mensagem) é um "não encontrado"?
 */
export function isNotFoundError(error) {
  if (!error) return false;

  if (typeof error === 'object' && Number(error.status) === 404) {
    return true;
  }

  const text = typeof error === 'string'
    ? error
    : [error.message, error.detail, error.title, error.code].filter((part) => typeof part === 'string' && part).join(' | ');

  if (!text) return false;
  return NOT_FOUND_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Descreve, em pt-BR, a falha ao carregar um detalhe.
 *
 * @param {unknown} error erro da API, `Error` ou mensagem já extraída
 * @param {'manifest'|'dmr'} subject
 * @returns {{ notFound: boolean, title: string, message: string, hint: string, code: string }|null}
 *          `null` quando não há erro nenhum.
 */
export function describeDetailLoadError(error, subject = 'manifest') {
  if (!error) return null;

  const copy = DETAIL_SUBJECTS[subject] || DETAIL_SUBJECTS.manifest;
  const correlationId = typeof error === 'object' ? String(error.correlationId || '') : '';

  if (isNotFoundError(error)) {
    return {
      notFound: true,
      title: copy.notFoundTitle,
      message: copy.notFoundMessage,
      hint: copy.notFoundHint,
      code: ''
    };
  }

  const raw = typeof error === 'string' ? error : String(error?.message || '');
  const message = redactInternalIds(raw) || copy.failureFallback;

  return {
    notFound: false,
    title: copy.failureTitle,
    message,
    hint: 'Tente de novo em alguns instantes. Se o erro persistir, acione o suporte com o código abaixo.',
    code: correlationId
  };
}
