/**
 * ELEGIBILIDADE DE MANIFESTO PARA CDF — fonte ÚNICA da tela de emissão.
 *
 * A tela `/cdf/novo` decidia sozinha quem podia virar certificado: reimplantava
 * localmente `resolveManifestSnapshot`, `normalizedStatusValue`,
 * `hasIssuedCdfReference` e um `describeCdfManifestRestriction` PRÓPRIO. As
 * cópias envelheceram em separado e a tela passou a oferecer o que a listagem
 * bloqueia de propósito:
 *
 *   - a cópia da tela NÃO conhecia `submit_unconfirmed` ("envio despachado,
 *     desfecho desconhecido"). Um manifesto ainda sem confirmação cujo espelho
 *     da CETESB já trouxe 'Recebido' casava `status.includes('receb')`, a cópia
 *     devolvia motivo vazio e a linha vinha marcável como ELEGÍVEL — enquanto
 *     `canUseManifestForCdf` a bloqueia justamente para o certificado não sair
 *     antes de a reconciliação fechar a dúvida;
 *   - na direção oposta, a cópia de `resolveManifestIdentifiers` não tinha o
 *     fallback para as linhas ACHATADAS da listagem (`manifestNumber` /
 *     `externalCode`, que é a forma como `mapManifestListItem` entrega os itens
 *     desta tela), então manifestos com identidade externa eram anunciados como
 *     "Ainda não sincronizado com a CETESB";
 *   - e a explicação do bloqueio era outra: para um envio sem confirmação a tela
 *     dizia "Ainda não sincronizado com a CETESB", que sugere que nada saiu
 *     daqui — quando o envio SAIU e o desfecho é que é desconhecido. É a mesma
 *     frase que `manifestHelpers` foi corrigido para nunca mais usar neste
 *     estado.
 *
 * Por isso este módulo NÃO decide nada: ele só monta a linha da tabela em cima
 * de `manifestHelpers`. Quem responde "pode?" é `canUseManifestForCdf`; quem
 * responde "por que não?" é `describeCdfManifestRestriction`. Segunda opinião
 * sobre elegibilidade = duas telas discordando sobre o mesmo manifesto, que foi
 * exatamente o defeito.
 *
 * Módulo PURO (sem Vue, sem DOM) — testado em
 * tests/unit/cdf-candidate-eligibility.test.js.
 */

import {
  canUseManifestForCdf,
  describeCdfManifestRestriction,
  formatManifestLabel,
  resolveManifestIdentifier,
  resolveManifestSnapshot
} from '../mtr/list/manifestHelpers.js';

/**
 * Linha de candidato da tabela de emissão.
 *
 * INVARIANTE: `eligible` é literalmente `canUseManifestForCdf(manifest)`, e
 * `reason` é vazio se e somente se `eligible` — bloqueio sem motivo na tela é
 * checkbox que some sem explicar.
 */
export function buildCdfCandidateEntry(manifest) {
  const eligible = canUseManifestForCdf(manifest);

  return {
    manifest,
    snapshot: resolveManifestSnapshot(manifest),
    eligible,
    reason: eligible ? '' : describeCdfManifestRestriction(manifest),
    manifestId: resolveManifestIdentifier(manifest),
    manifestLabel: formatManifestLabel(manifest)
  };
}

export function buildCdfCandidateEntries(manifests) {
  return (Array.isArray(manifests) ? manifests : []).map((manifest) => buildCdfCandidateEntry(manifest));
}

/** Ids das linhas elegíveis, sem repetição e sem id vazio. */
export function collectEligibleManifestIds(entries) {
  const ids = (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry?.eligible)
    .map((entry) => entry?.manifestId)
    .filter(Boolean);

  return [...new Set(ids)];
}

/**
 * O que de fato vai no `listaManifesto` do payload da CETESB.
 *
 * Filtra por `eligible` de novo, de propósito: "selecionado" e "elegível" são
 * coisas diferentes nesta tela (o operador pode marcar uma linha bloqueada — ela
 * aparece no resumo com o motivo), e é este filtro que impede um envio sem
 * confirmação de entrar no certificado por marcação manual.
 */
export function collectEligibleSnapshots(entries) {
  return (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry?.eligible && entry?.snapshot)
    .map((entry) => entry.snapshot);
}

/** Estado do botão "Selecionar todos elegíveis" / "Limpar elegíveis". */
export function areAllEligibleSelected(entries, selectedIds) {
  const eligibleIds = collectEligibleManifestIds(entries);
  if (!eligibleIds.length) {
    return false;
  }

  const selected = new Set(Array.isArray(selectedIds) ? selectedIds : []);
  return eligibleIds.every((id) => selected.has(id));
}

/**
 * Próxima seleção ao clicar no botão de seleção em massa: marca todos os
 * ELEGÍVEIS (nunca um bloqueado) ou limpa exatamente esses, preservando o que o
 * operador marcou à mão fora do conjunto elegível.
 */
export function resolveEligibleSelectionToggle(entries, selectedIds) {
  const current = Array.isArray(selectedIds) ? selectedIds : [];
  const eligibleIds = collectEligibleManifestIds(entries);

  if (areAllEligibleSelected(entries, current)) {
    const eligible = new Set(eligibleIds);
    return current.filter((id) => !eligible.has(id));
  }

  return [...new Set([...current, ...eligibleIds])];
}
