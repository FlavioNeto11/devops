/**
 * FILTRO SELECIONADO ≠ FILTRO VALENDO.
 *
 * Os chips de situação ("Recebidos") e de período ("30 dias") pintam de
 * primário assim que são clicados. Enquanto a busca não roda com aquele valor,
 * o chip AFIRMA um filtro que ainda não está valendo — a mesma família do
 * "feedback mentiroso" (o clique pinta; a lista, não). Acontece de verdade
 * quando a busca é abortada (ex.: intervalo de datas inválido), quando ainda
 * está em voo, ou quando o operador digitou nos outros campos e não aplicou.
 *
 * Aqui a tela compara TRÊS coisas: o que o chip representa (`target`), o que
 * está nos campos (`current`) e o que a última busca realmente usou
 * (`applied`). Daí saem três estados honestos:
 *
 *   idle     → o chip não corresponde ao que está nos campos
 *   pending  → está selecionado, mas a busca ainda não rodou com ele
 *   applied  → está selecionado E é o que a lista está mostrando
 *
 * Módulo PURO (sem Vue, sem DOM) — testado em tests/unit/filter-application-state.test.js.
 */

/** Comparação tolerante: null/undefined/espaços são "vazio"; número vira texto. */
export function normalizeFilterValue(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim();
}

/** Os dois conjuntos têm o mesmo valor em TODAS as chaves observadas? */
export function filtersMatch(left, right, keys = []) {
  if (!left || !right) {
    return false;
  }

  return keys.every((key) => normalizeFilterValue(left[key]) === normalizeFilterValue(right[key]));
}

/**
 * Chaves alteradas desde a última busca. Sem busca nenhuma (`applied` nulo),
 * qualquer filtro PREENCHIDO conta como pendente — nada foi aplicado ainda.
 */
export function pendingFilterKeys(current, applied, keys = []) {
  if (!current) {
    return [];
  }

  if (!applied) {
    return keys.filter((key) => normalizeFilterValue(current[key]) !== '');
  }

  return keys.filter((key) => normalizeFilterValue(current[key]) !== normalizeFilterValue(applied[key]));
}

/** Há filtro alterado esperando o "Aplicar filtros"? */
export function hasPendingFilterChanges(current, applied, keys = []) {
  return pendingFilterKeys(current, applied, keys).length > 0;
}

/** 'idle' | 'pending' | 'applied' — ver o cabeçalho do módulo. */
export function resolveSelectionState(target, current, applied, keys = []) {
  if (!filtersMatch(target, current, keys)) {
    return 'idle';
  }

  return filtersMatch(target, applied, keys) ? 'applied' : 'pending';
}

/** Snapshot imutável das chaves observadas (o que a busca levou). */
export function snapshotFilters(source, keys = []) {
  const snapshot = {};
  for (const key of keys) {
    snapshot[key] = normalizeFilterValue(source?.[key]);
  }
  return snapshot;
}

/**
 * SEQUENCIAMENTO DAS BUSCAS (requisição superada).
 *
 * O reconciliador anterior olhava só o `loading` da lista: fotografava os
 * filtros quando ele virava `true` e promovia a foto a "aplicado" quando virava
 * `false`. Com DOIS cliques seguidos (ex.: "Recebidos" e, 250 ms depois,
 * "Cancelados") o `loading` já estava `true` no segundo clique — a segunda busca
 * nunca era fotografada — e voltava a `false` no fim da PRIMEIRA. Resultado: o
 * chip novo ficava eternamente "pendente" (relógio) mesmo depois de a lista
 * mudar, e uma resposta antiga chegando fora de ordem podia sobrescrever a foto
 * da mais recente.
 *
 * Aqui cada busca ganha um ID crescente. Só a resposta da requisição MAIS
 * RECENTE promove o snapshot para "aplicado"; respostas superadas ou fora de
 * ordem são descartadas em silêncio. Módulo PURO — testado em
 * tests/unit/filter-application-state.test.js.
 */
export function createFilterApplicationTracker(keys = []) {
  const observedKeys = [...keys];
  const inFlightSnapshots = new Map();
  let lastIssuedId = 0;
  let latestIssuedId = 0;
  let applied = null;

  /** Registra uma busca prestes a sair e devolve o ID dela. */
  function begin(source) {
    lastIssuedId += 1;
    latestIssuedId = lastIssuedId;
    inFlightSnapshots.set(lastIssuedId, snapshotFilters(source, observedKeys));
    return lastIssuedId;
  }

  /**
   * Liquida a busca `requestId`. Devolve `true` só quando ela era a mais recente
   * (e, portanto, promoveu os filtros para "aplicados").
   */
  function settle(requestId) {
    const snapshot = inFlightSnapshots.get(requestId);
    inFlightSnapshots.delete(requestId);

    // Desconhecida (ou já liquidada) e superada caem no mesmo lugar: descartar.
    if (!snapshot || requestId !== latestIssuedId) {
      return false;
    }

    applied = snapshot;
    return true;
  }

  /** O que a última busca CONCLUÍDA e não superada levou (`null` antes da 1ª). */
  function appliedFilters() {
    return applied;
  }

  /** Buscas registradas e ainda não liquidadas (diagnóstico/teste). */
  function inFlightCount() {
    return inFlightSnapshots.size;
  }

  return { begin, settle, appliedFilters, inFlightCount };
}
