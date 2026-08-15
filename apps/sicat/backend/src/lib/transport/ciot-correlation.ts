// Correlação pré-solicitação do CIOT (PR-C2) — fonte única do marcador deste domínio.
//
// Réplica DELIBERADA dos princípios de `lib/manifest-correlation.ts` (DL-102), NÃO reuso: o CIOT é
// um bounded context próprio (D1 do DL-103) e o marcador aqui tem semântica diferente — não vai num
// campo livre de um payload que "volta" numa busca por atributos; vai OU no request estruturado do
// gateway (campo dedicado — provedores reais costumam aceitar uma "referência do cliente") OU, no
// mock, como a própria chave do Map em memória. As duas pontas (service que cria a linha ANTES da
// chamada e o gateway que responde/consulta por marcador) DEVEM derivar o formato daqui.
//
// O número do CIOT só nasce na RESPOSTA do provedor — nenhum identificador nosso existe do lado de
// lá antes disso. Se a resposta se perder (timeout, pod morto entre o dispatch e o commit local), a
// única forma de perguntar "isto nasceu?" é por este marcador determinístico, gravado ANTES da
// chamada.

const MARKER_PREFIX = '[sicat:';
const MARKER_SUFFIX = ']';

// Ids locais de ciot_operations são `ciot_<hex>`. O padrão aceita qualquer id sem espaços/colchetes.
const MARKER_PATTERN = /\[sicat:([A-Za-z0-9_.-]+)\]/;

/**
 * Gera o marcador de correlação de uma tentativa de CIOT. Determinístico: o mesmo `ciotOperationId`
 * sempre produz o mesmo marcador — é o que permite ao reconciliador reconstruir a pergunta a partir
 * da linha local, mesmo depois de o processo que fez o dispatch ter morrido.
 */
export function buildCiotCorrelationMarker(ciotOperationId: string): string {
  const normalized = String(ciotOperationId ?? '').trim();
  if (!normalized) {
    throw new Error('ciotOperationId é obrigatório para gerar o marcador de correlação do CIOT.');
  }
  if (!/^[A-Za-z0-9_.-]+$/.test(normalized)) {
    throw new Error(`ciotOperationId inválido para marcador de correlação do CIOT: "${ciotOperationId}"`);
  }
  return `${MARKER_PREFIX}${normalized}${MARKER_SUFFIX}`;
}

/** Extrai o id local da linha `ciot_operations` de um marcador — caminho de volta para o reconciliador. */
export function extractCiotOperationIdFromMarker(marker: unknown): string | null {
  if (typeof marker !== 'string') return null;
  const match = MARKER_PATTERN.exec(marker);
  return match?.[1] ?? null;
}
