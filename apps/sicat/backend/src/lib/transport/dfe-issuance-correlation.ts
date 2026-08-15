// Correlação pré-submissão da emissão de DF-e (PR-G) — fonte única do marcador deste domínio.
//
// Réplica DELIBERADA dos princípios de `lib/transport/ciot-correlation.ts` (DL-102), NÃO reuso: a
// emissão fiscal é um bounded context próprio e o marcador aqui tem semântica diferente (chave de
// correlação do simulador sandbox do `@flavioneto11/fiscal-kit`, jamais um campo do provedor real —
// o kit não tem conceito de marcador). Prefixo distinto (`sicat-dfe`, não `sicat`) para nunca
// colidir/confundir com o marcador do CIOT em nenhum log/auditoria compartilhados.
//
// O protocolo de autorização só nasce na RESPOSTA do (simulador de) SEFAZ. Se a resposta se perder
// (timeout, pod morto entre o dispatch e o commit local), a única forma de perguntar "isto foi
// autorizado?" é por este marcador determinístico, gravado ANTES de qualquer chamada ao gateway.

const MARKER_PREFIX = '[sicat-dfe:';
const MARKER_SUFFIX = ']';

// Ids locais de dfe_issuances são `dfeiss_<hex>`. O padrão aceita qualquer id sem espaços/colchetes.
const MARKER_PATTERN = /\[sicat-dfe:([A-Za-z0-9_.-]+)\]/;

/**
 * Gera o marcador de correlação de uma tentativa de emissão. Determinístico: o mesmo `issuanceId`
 * sempre produz o mesmo marcador — é o que permite ao reconciliador reconstruir a pergunta a partir
 * da linha local, mesmo depois de o processo que fez o dispatch ter morrido.
 */
export function buildDfeIssuanceCorrelationMarker(issuanceId: string): string {
  const normalized = String(issuanceId ?? '').trim();
  if (!normalized) {
    throw new Error('issuanceId é obrigatório para gerar o marcador de correlação da emissão de DF-e.');
  }
  if (!/^[A-Za-z0-9_.-]+$/.test(normalized)) {
    throw new Error(`issuanceId inválido para marcador de correlação da emissão de DF-e: "${issuanceId}"`);
  }
  return `${MARKER_PREFIX}${normalized}${MARKER_SUFFIX}`;
}

/** Extrai o id local da linha `dfe_issuances` de um marcador — caminho de volta para o reconciliador. */
export function extractDfeIssuanceIdFromMarker(marker: unknown): string | null {
  if (typeof marker !== 'string') return null;
  const match = MARKER_PATTERN.exec(marker);
  return match?.[1] ?? null;
}
