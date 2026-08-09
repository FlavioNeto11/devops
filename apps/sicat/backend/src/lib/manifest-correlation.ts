// Correlação pré-submit de manifesto (C1) — fonte única do marcador.
//
// O `manHashCode` só nasce na RESPOSTA do PUT da CETESB; nenhum identificador
// nosso viaja no corpo enviado. Se a resposta se perde (timeout, pod morto
// entre o PUT e o commit local), a busca por atributos é ambígua em lotes que
// repetem (data, gerador, transportador, destinador, resíduo) de propósito.
//
// A solução: um marcador DETERMINÍSTICO derivado do id local do manifesto,
// gravado no campo livre `manObservacao` do payload enviado (preservando a
// observação do usuário). O `manObservacao` volta no resultado de
// `searchManifests`, então o marcador torna o envio reencontrável depois.
//
// Este módulo é consumido pelo gateway (JS — DL-093) e pelo worker (TS); os
// dois lados DEVEM derivar o marcador daqui para nunca divergirem.

const MARKER_PREFIX = '[sicat:';
const MARKER_SUFFIX = ']';

// Ids locais são `<prefixo>_<hex>` (ex.: man_ab12…). O padrão aceita qualquer
// id sem espaços/colchetes, que quebrariam o parse do marcador.
const MARKER_PATTERN = /\[sicat:([A-Za-z0-9_.-]+)\]/;

/**
 * Gera o marcador de correlação de um manifesto. Determinístico: o mesmo
 * `manifestId` sempre produz o mesmo marcador.
 */
export function buildManifestCorrelationMarker(manifestId: string): string {
  const normalized = String(manifestId ?? '').trim();
  if (!normalized) {
    throw new Error('manifestId é obrigatório para gerar o marcador de correlação.');
  }
  if (!/^[A-Za-z0-9_.-]+$/.test(normalized)) {
    throw new Error(`manifestId inválido para marcador de correlação: "${manifestId}"`);
  }
  return `${MARKER_PREFIX}${normalized}${MARKER_SUFFIX}`;
}

/**
 * Concatena o marcador à observação do usuário SEM sobrescrevê-la.
 * Idempotente: se o marcador deste manifesto já está presente (ex.: manifesto
 * re-submetido após sync do `manObservacao` da CETESB), não duplica.
 */
export function appendManifestCorrelationMarker(notes: unknown, manifestId: string): string {
  const marker = buildManifestCorrelationMarker(manifestId);
  const base = typeof notes === 'string' ? notes.trim() : '';
  if (!base) {
    return marker;
  }
  if (base.includes(marker)) {
    return base;
  }
  return `${base} ${marker}`;
}

/**
 * Extrai o id local do manifesto de um `manObservacao` retornado pela CETESB
 * (ou `null` quando não há marcador). É o caminho de volta: permite confirmar
 * se um envio de resposta perdida foi processado, via `searchManifests`.
 */
export function extractManifestIdFromObservation(observation: unknown): string | null {
  if (typeof observation !== 'string') {
    return null;
  }
  const match = MARKER_PATTERN.exec(observation);
  return match?.[1] ?? null;
}
