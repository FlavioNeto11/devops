/**
 * NOME ACESSÍVEL DAS CAIXAS DE SELEÇÃO DA LISTA DE MANIFESTOS.
 *
 * As 21 caixas da tabela (uma por linha, mais a de "selecionar todos") não
 * tinham rótulo nenhum: para quem navega por leitor de tela todas se anunciavam
 * como "caixa de seleção", sem dizer QUAL manifesto seria marcado — e a de
 * cabeçalho era indistinguível das outras. A ação em lote (receber, cancelar,
 * imprimir) fica impossível de operar às cegas.
 *
 * O rótulo repete o que a linha mostra na coluna "Número MTR": o número do MTR
 * quando existe, senão o identificador interno que aparece no lugar dele. Módulo
 * PURO (sem Vue, sem DOM) — testado em tests/unit/manifest-selection-label.test.js.
 */

/** O mesmo texto que a coluna "Número MTR" exibe para esta linha. */
export function resolveManifestDisplayNumber(manifest) {
  const candidates = [
    manifest?.manifestNumber,
    manifest?.externalCode,
    manifest?.id,
    manifest?.manifestId,
    manifest?.entityId
  ];

  for (const candidate of candidates) {
    const normalized = String(candidate ?? '').trim();
    if (normalized) {
      return normalized;
    }
  }

  return '';
}

/** "Selecionar manifesto 260012603974" (ou o genérico, se a linha não tem número). */
export function buildManifestSelectionLabel(manifest) {
  const displayNumber = resolveManifestDisplayNumber(manifest);
  return displayNumber ? `Selecionar manifesto ${displayNumber}` : 'Selecionar manifesto sem número';
}
