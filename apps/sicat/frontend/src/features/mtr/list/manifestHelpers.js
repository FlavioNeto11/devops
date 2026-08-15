/**
 * Helpers puros de manifestos (sem estado reativo).
 *
 * Extraídos de ManifestsView para reduzir o tamanho da view e permitir reuso
 * e teste isolado. Toda função aqui depende apenas de argumentos + utilitários
 * de data; nenhuma fecha sobre stores, refs ou DOM.
 */

import {
  brDateToIsoDate,
  formatDateBr,
  formatDateTimeBr
} from '../../../utils/date-format.js';
import {
  MANIFEST_STATUS_SUBMIT_UNCONFIRMED,
  resolveManifestRawSituation,
  resolveManifestSituationLabel
} from '../../../lib/status-map.js';

/**
 * "Enviei e não sei se chegou": o submit foi despachado para a CETESB e o SICAT
 * NÃO sabe se o MTR nasceu. Não é falha (falha = sabemos que não nasceu) nem
 * envio (envio = sabemos que nasceu).
 *
 * Casa pelo status INTERNO exato — quem escreve esse token é o backend. De
 * propósito NÃO usa `normalizedStatusValue` (que concatena o `externalStatus`
 * livre da CETESB): substring aqui abriria porta para falso positivo vindo de
 * texto do SIGOR.
 *
 * Enquanto durar, TODA ação que escreve (na CETESB ou no MTR) fica bloqueada; a
 * única saída é "Atualizar da CETESB", que resolve a dúvida e devolve o
 * manifesto a um status que o sistema entende. Nunca é beco sem saída.
 */
export function isSubmitUnconfirmedManifest(manifest) {
  return String(manifest?.status || '').trim().toLowerCase() === MANIFEST_STATUS_SUBMIT_UNCONFIRMED;
}

/**
 * Frase única do estado, reaproveitada por todas as explicações de bloqueio —
 * o operador lê a MESMA verdade em qualquer ação que tentar.
 */
const SUBMIT_UNCONFIRMED_PREFIX = 'Envio sem confirmação: o SICAT ainda não sabe se este MTR nasceu na CETESB.';
const SUBMIT_UNCONFIRMED_WAY_OUT = 'Use “Atualizar da CETESB” para descobrir.';

/**
 * Rótulo do status do manifesto — delega ao mapa CANÔNICO (`lib/status-map.js`).
 * Antes esta função devolvia o `externalStatus` CRU da CETESB ('Salvo'), o que
 * fazia a lista falar um vocabulário e o filtro/dashboard outro.
 */
export function resolveManifestStatusLabel(manifest) {
  return resolveManifestSituationLabel(manifest);
}

/** Termo cru da CETESB (tooltip de rastreabilidade ao lado do rótulo canônico). */
export function resolveManifestRawStatus(manifest) {
  return resolveManifestRawSituation(manifest);
}

/**
 * Rótulo legível de um FILTRO de situação, a partir dos valores CRUS enviados à
 * API (`status` interno + `externalStatus`, que é um fragmento ILIKE da CETESB:
 * 'receb', 'salvo', 'cancel'...).
 *
 * Sem isto o resumo de "Filtros ativos" vazava o token cru truncado
 * (`situação "receb"`) — vocabulário de máquina, sem chip correspondente na tela.
 * Passa pelo mapa CANÔNICO (`lib/status-map.js`), o mesmo dos badges e dos chips.
 */
export function resolveSituationFilterLabel(status, externalStatus) {
  const rawStatus = String(status || '').trim();
  const rawExternalStatus = String(externalStatus || '').trim();
  const labels = [];
  if (rawExternalStatus) {
    labels.push(resolveManifestSituationLabel({ externalStatus: rawExternalStatus }));
  }
  if (rawStatus) {
    labels.push(resolveManifestSituationLabel({ status: rawStatus }));
  }
  return [...new Set(labels.filter((label) => label && label !== '-'))].join(' / ');
}

/*
 * NÃO existe helper local de COR/CLASSE de status neste módulo, e isso é uma
 * decisão (DL-100): quem pinta status é `SicatStatusBadge` a partir do mapa
 * canônico `lib/status-map.js`. Aqui só se decide AÇÃO (o que o operador pode
 * fazer), nunca cor.
 *
 * Existia aqui um `normalizedStatusClass(status)` classificando por substring,
 * sem nenhum chamador em todo o repositório — armadilha armada, não bug vivo.
 * Ele divergia do mapa canônico em pelo menos quatro pontos, e o pior era
 * `'submit_unconfirmed'.includes('submit')` → `'succeeded'`: pintaria de VERDE
 * justamente o estado que existe para o operador NÃO achar que deu certo
 * ("despachei para a CETESB e não sei se o MTR nasceu"). No mapa canônico ele é
 * `warning`. Divergia também em `cancelled` (→ vermelho, canônico é `neutral`),
 * `received` (→ vermelho: 'receb' não é substring de 'received') e em qualquer
 * status desconhecido, inclusive `draft` (→ vermelho, pelo `return` final).
 *
 * O vocabulário que ele devolvia ('queued'/'running'/'succeeded'/'failed') nem
 * era o das tonalidades (`STATUS_TONES`: neutral/running/warning/success/error),
 * então não havia consumidor plausível: consertá-lo seria reescrever o
 * `status-map.js` num segundo lugar — a duplicação que o DL-100 eliminou.
 * O guard vive em `tests/unit/manifest-status-class-helper.test.js`.
 */

export function isSingleDayDateWindow(dateFrom, dateTo) {
  const fromIso = brDateToIsoDate(dateFrom);
  const toIso = brDateToIsoDate(dateTo);
  if (!fromIso || !toIso) {
    return true;
  }
  return fromIso === toIso;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function pad2(value) {
  return String(value).padStart(2, '0');
}

export function formatLocalDateInput(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function formatLocalDateTimeInput(date = new Date()) {
  return `${formatLocalDateInput(date)}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function toDateTimeIso(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  const candidate = new Date(normalized);
  return Number.isNaN(candidate.getTime()) ? '' : candidate.toISOString();
}

export function toIntegerOrNull(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isInteger(parsed) ? parsed : null;
}

export function normalizeDocument(value) {
  return String(value || '').replaceAll(/\D/g, '');
}

export function resolveManifestIdentifiers(manifest) {
  const externalReference = manifest?.externalReference || manifest?.externalSnapshot || {};
  const externalSnapshot = manifest?.externalSnapshot || {};
  // As linhas da LISTAGEM (mapManifestListItem) vêm achatadas (manifestNumber/
  // externalCode) — sem o fallback, a baixa em lote perdia manNumero/manCodigo
  // e a busca CETESB por número (server-side) nunca era usada.
  return {
    manCodigo: externalReference?.manCodigo ?? externalSnapshot?.manCodigo ?? manifest?.externalCode ?? null,
    manNumero: externalReference?.manNumero ?? externalSnapshot?.manNumero ?? manifest?.manifestNumber ?? null,
    manHashCode: manifest?.externalHashCode || externalSnapshot?.manHashCode || null
  };
}

export function resolveManifestSnapshot(manifest) {
  if (!manifest) {
    return null;
  }
  const identifiers = resolveManifestIdentifiers(manifest);
  const generatorDocument = normalizeDocument(manifest?.generator?.document);
  return {
    ...identifiers,
    parceiroGerador: generatorDocument ? { parCnpj: generatorDocument } : undefined
  };
}

export function buildFriendlyCancelFailureMessage(job, manifestLabel) {
  const code = String(job?.lastErrorCode || '').trim().toUpperCase();
  const reason = String(job?.lastErrorMessage || '').trim();
  if (code === 'MANIFEST_CANCEL_NOT_CONFIRMED') {
    return `Cancelamento solicitado para ${manifestLabel}, mas a CETESB ainda não confirmou a alteração. O manifesto permanece com o status anterior no SIGOR.`;
  }
  if (code === 'MANIFEST_NOT_READY_FOR_CANCEL') {
    return `O manifesto ${manifestLabel} ainda não está pronto para cancelamento na CETESB. Tente novamente em alguns instantes.`;
  }
  return reason || `Cancelamento finalizado com status ${String(job?.status || '').toLowerCase()} para ${manifestLabel}.`;
}

export function triggerBrowserDownload(blob, fileName) {
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = fileName || 'manifesto.pdf';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(blobUrl);
}

export function sanitizeDownloadFileName(fileName, fallbackName = 'manifesto.pdf') {
  const normalized = String(fileName || '').trim();
  const safeName = normalized || fallbackName;
  return safeName.replaceAll(/[\\/:*?"<>|]+/g, '-');
}

export function getManifestDisplayCode(manifest) {
  return String(
    manifest?.manifestNumber
    || manifest?.externalCode
    || resolveManifestIdentifier(manifest)
    || ''
  ).trim();
}

export function buildBatchPrintZipFileName(printableManifests) {
  const manifests = Array.isArray(printableManifests) ? printableManifests : [];
  const total = manifests.length;
  const stamp = new Date().toISOString().slice(0, 10);
  const manifestCodes = manifests
    .map((manifest) => getManifestDisplayCode(manifest))
    .filter(Boolean);

  const uniqueGroupIds = [...new Set(manifests.map((manifest) => String(manifest?.groupId || '').trim()).filter(Boolean))];
  const hasSingleBatchGroup = uniqueGroupIds.length === 1 && total > 1;

  if (manifestCodes.length >= 2) {
    const firstCode = manifestCodes[0];
    const lastCode = manifestCodes[manifestCodes.length - 1];
    const prefix = hasSingleBatchGroup ? 'lote-manifestos' : 'manifestos';
    return sanitizeDownloadFileName(`${prefix}-${firstCode}-a-${lastCode}-${stamp}.zip`, `manifestos-${total}-itens-${stamp}.zip`);
  }

  if (manifestCodes.length === 1) {
    const prefix = hasSingleBatchGroup ? 'lote-manifesto' : 'manifesto';
    return sanitizeDownloadFileName(`${prefix}-${manifestCodes[0]}-${stamp}.zip`, `manifestos-${total}-itens-${stamp}.zip`);
  }

  if (hasSingleBatchGroup) {
    return `lote-manifestos-${total || 0}-itens-${stamp}.zip`;
  }

  return `manifestos-${total || 0}-itens-${stamp}.zip`;
}

export function parsePrintUrl(printUrl) {
  const match = String(printUrl || '').match(/^\/v1\/manifestos\/([^/]+)\/documents\/([^/]+)$/);
  if (!match) {
    return null;
  }
  return {
    manifestId: decodeURIComponent(match[1]),
    documentId: decodeURIComponent(match[2])
  };
}

export function normalizedStatusValue(manifest) {
  return `${String(manifest?.status || '').toLowerCase()} ${String(manifest?.externalStatus || '').toLowerCase()}`.trim();
}

export function hasIssuedCdfReference(manifest) {
  const externalSnapshot = manifest?.externalSnapshot || {};
  const externalReference = manifest?.externalReference || {};
  return [
    manifest?.cdfEmitidoNumero,
    externalSnapshot?.cdfEmitidoNumero,
    externalReference?.cdfEmitidoNumero,
    manifest?.certificateCode,
    manifest?.certificateId
  ].some((value) => String(value ?? '').trim());
}

export function resolveManifestIdentifier(manifest) {
  return String(
    manifest?.id
    || manifest?.manifestId
    || manifest?.entityId
    || manifest?.manifestNumber
    || manifest?.externalCode
    || ''
  ).trim();
}

export function isCancelledStatus(manifest) {
  return normalizedStatusValue(manifest).includes('cancel');
}

/**
 * ATENÇÃO — `submit_unconfirmed` NUNCA é erro. `isErrorManifest` é a chave que
 * abre "Reenviar" (`canRecoverManifest`) e "Remover" (`canRemoveManifest`):
 * classificar como erro um envio de desfecho desconhecido faz a tela oferecer
 * justamente as duas ações que produzem MTR duplicado / perda de rastro do
 * órfão. Os testes de `manifest-submit-unconfirmed.test.js` travam essas três
 * respostas juntas.
 *
 * O guard explícito no topo NÃO é redundante, e o comentário anterior aqui
 * errava ao dizer que bastava o estado não casar os fragmentos. A mensagem que o
 * backend grava em `externalStatus` quando o submit morre em DLQ sem
 * confirmação ("Envio sem confirmação: job finalizado em DLQ e a pesquisa na
 * CETESB não confirmou se o MTR foi criado...") contém a palavra **DLQ**: o
 * `includes('dlq')` abaixo lia o TEXTO EXPLICATIVO como sinal de estado e
 * devolvia `true`, reabrindo as duas ações. É o par exato do guard em
 * `isManifestFailureState` (backend), que autoriza a remoção da linha.
 */
export function isErrorManifest(manifest) {
  if (isSubmitUnconfirmedManifest(manifest)) {
    return false;
  }
  const status = String(manifest?.status || '').toLowerCase();
  const externalStatus = String(manifest?.externalStatus || '').toLowerCase();
  const combinedStatus = `${status} ${externalStatus}`;
  return combinedStatus.includes('fail')
    || combinedStatus.includes('error')
    || combinedStatus.includes('falha')
    || combinedStatus.includes('erro')
    || combinedStatus.includes('dlq');
}

export function canCancelManifest(manifest) {
  if (!resolveManifestIdentifier(manifest)) {
    return false;
  }
  // Cancelar exige saber O QUE cancelar. Sem este bloqueio, um manifesto com
  // hash e status `submit_unconfirmed` casava `status.includes('submit')` lá
  // embaixo e reabilitava "Cancelar".
  if (isSubmitUnconfirmedManifest(manifest)) {
    return false;
  }
  const hasExternalHash = Boolean(String(manifest?.externalHashCode || '').trim());
  if (!hasExternalHash) {
    return false;
  }
  const status = normalizedStatusValue(manifest);
  if (!status) {
    return false;
  }
  // Manifesto RECEBIDO nao volta a ser cancelado: o fluxo dele segue para o
  // certificado (ver canUseManifestForCdf, que EXIGE 'receb'). O recebimento
  // mantem o status interno 'submitted', entao sem este bloqueio o
  // `status.includes('submit')` abaixo reabilitava "Cancelar" para recebidos
  // (em lote aparecia "Cancelar (N)" para N manifestos ja recebidos).
  if (
    status.includes('draft')
    || status.includes('queue')
    || status.includes('process')
    || status.includes('cancel')
    || status.includes('receb')
    || status.includes('fail')
    || status.includes('error')
  ) {
    return false;
  }
  return status.includes('submit') || status.includes('print') || status.includes('success');
}

/**
 * Decisão para `submit_unconfirmed`: FALSE, herdado de `isErrorManifest` — sem
 * guard redundante aqui de propósito. "Reenviar" reexecuta o submit; num envio
 * de desfecho desconhecido isso é a fábrica do MTR duplicado.
 */
export function canRecoverManifest(manifest) {
  const manifestId = resolveManifestIdentifier(manifest);
  if (!manifestId) {
    return false;
  }
  const isRecoverableStatus = isErrorManifest(manifest);
  const hasExternalNumber = Boolean(String(manifest?.manifestNumber || '').trim());
  const hasExternalCode = Boolean(String(manifest?.externalCode || '').trim());
  return isRecoverableStatus && !hasExternalNumber && !hasExternalCode;
}

export function canSubmitManifest(manifest) {
  if (!resolveManifestIdentifier(manifest)) {
    return false;
  }
  // Reenviar o que já foi despachado é a receita do MTR duplicado. Hoje o
  // `return` final (que só aceita 'draft'/'pending_submission') já barraria por
  // acidente; aqui vira INTENÇÃO declarada — quem um dia acrescentar 'submit' à
  // lista de baixo esbarra neste guard e no teste que o cobre.
  if (isSubmitUnconfirmedManifest(manifest)) {
    return false;
  }
  if (canRecoverManifest(manifest)) {
    return false;
  }
  const hasExternalHash = Boolean(String(manifest?.externalHashCode || '').trim());
  if (hasExternalHash) {
    return false;
  }
  const status = normalizedStatusValue(manifest);
  if (!status) {
    return true;
  }
  return status.includes('draft') || status.includes('pending_submission');
}

export function canReplicateManifest(manifest) {
  const manifestId = resolveManifestIdentifier(manifest);
  if (!manifestId) {
    return false;
  }
  // Nenhum fragmento da lista abaixo casa 'submit_unconfirmed', então o ramo
  // genérico devolvia TRUE e a tela oferecia replicar um envio de destino
  // desconhecido — exatamente como nasce o MTR duplicado.
  if (isSubmitUnconfirmedManifest(manifest)) {
    return false;
  }
  const status = normalizedStatusValue(manifest);
  if (!status) {
    return true;
  }
  return !['queue', 'process', 'cancel', 'fail', 'error', 'dlq'].some((fragment) => status.includes(fragment));
}

export function canReceiveOperationalManifest(manifest) {
  const snapshot = resolveManifestSnapshot(manifest);
  if (!snapshot || !(snapshot.manCodigo || snapshot.manNumero || snapshot.manHashCode)) {
    return false;
  }
  // Baixa operacional pressupõe MTR existente. Com snapshot preenchido nenhum
  // fragmento da lista abaixo casava 'submit_unconfirmed' e a ação era liberada.
  if (isSubmitUnconfirmedManifest(manifest)) {
    return false;
  }
  const status = normalizedStatusValue(manifest);
  if (!status) {
    return true;
  }
  if (
    status.includes('draft')
    || status.includes('queue')
    || status.includes('process')
    || status.includes('cancel')
    || status.includes('receb')
    || status.includes('fail')
    || status.includes('error')
    || status.includes('dlq')
  ) {
    return false;
  }
  return true;
}

export function canUseManifestForCdf(manifest) {
  const snapshot = resolveManifestSnapshot(manifest);
  if (!snapshot || !(snapshot.manCodigo || snapshot.manNumero || snapshot.manHashCode)) {
    return false;
  }
  // O `includes('receb')` abaixo lê o `externalStatus` CRU junto: um manifesto
  // ainda `submit_unconfirmed` cujo espelho já trouxe 'Recebido' liberava CDF
  // antes de a reconciliação fechar a dúvida. Primeiro confirmar, depois emitir.
  if (isSubmitUnconfirmedManifest(manifest)) {
    return false;
  }
  const status = normalizedStatusValue(manifest);
  if (!status) {
    return false;
  }
  return status.includes('receb')
    && !hasIssuedCdfReference(manifest)
    && !status.includes('cancel')
    && !status.includes('fail')
    && !status.includes('error')
    && !status.includes('dlq');
}

export function canPrintManifest(manifest) {
  if (!resolveManifestIdentifier(manifest)) {
    return false;
  }
  // Imprimir gera papel que circula com a carga. Com hash presente o
  // `status.includes('submit')` do final casava 'submit_unconfirmed' e liberava
  // a impressão de um MTR que talvez não exista no SIGOR.
  if (isSubmitUnconfirmedManifest(manifest)) {
    return false;
  }
  const hasExternalHash = Boolean(String(manifest?.externalHashCode || '').trim());
  if (!hasExternalHash) {
    return false;
  }
  const status = normalizedStatusValue(manifest);
  if (!status) {
    return false;
  }
  if (
    status.includes('draft')
    || status.includes('queue')
    || status.includes('process')
    || status.includes('error')
    || status.includes('fail')
  ) {
    return false;
  }
  return status.includes('submit') || status.includes('print') || status.includes('success') || status.includes('cancel');
}

/**
 * Decisão para `submit_unconfirmed`: FALSE, herdado de `isErrorManifest` — sem
 * guard redundante aqui de propósito. Remover a linha local de um MTR que pode
 * existir no SIGOR apaga o rastro do órfão justamente quando ele é o único fio
 * para achá-lo. Quem mudar `isErrorManifest` derruba o teste que trava isto.
 */
export function canRemoveManifest(manifest) {
  return Boolean(resolveManifestIdentifier(manifest)) && isErrorManifest(manifest);
}

/**
 * Por que "Replicar" está bloqueado. Sem esta explicação o item sumia da lista
 * sem dizer nada e o operador concluía sozinho "não funcionou, vou mandar de
 * novo" — o caminho curto para dois MTRs do mesmo resíduo.
 */
export function describeReplicateManifestRestriction(manifest) {
  if (isSubmitUnconfirmedManifest(manifest)) {
    return `${SUBMIT_UNCONFIRMED_PREFIX} Replicar agora pode gerar um MTR duplicado. ${SUBMIT_UNCONFIRMED_WAY_OUT}`;
  }
  if (!resolveManifestIdentifier(manifest)) {
    return 'Manifesto sem identificador — recarregue a lista.';
  }
  const status = normalizedStatusValue(manifest);
  if (status.includes('queue') || status.includes('process')) {
    return 'Aguarde o processamento terminar.';
  }
  if (status.includes('cancel')) {
    return 'Este manifesto foi cancelado.';
  }
  if (status.includes('fail') || status.includes('error') || status.includes('dlq')) {
    return 'Este manifesto teve um problema.';
  }
  return 'Este manifesto não pode ser replicado agora.';
}

/** Por que "Submeter"/"Reenviar" está bloqueado. */
export function describeSubmitManifestRestriction(manifest) {
  if (isSubmitUnconfirmedManifest(manifest)) {
    return `${SUBMIT_UNCONFIRMED_PREFIX} Reenviar agora pode gerar um MTR duplicado. ${SUBMIT_UNCONFIRMED_WAY_OUT}`;
  }
  if (!resolveManifestIdentifier(manifest)) {
    return 'Manifesto sem identificador — recarregue a lista.';
  }
  if (String(manifest?.externalHashCode || '').trim()) {
    return 'Este manifesto já está registrado no SIGOR.';
  }
  return 'Este manifesto não pode ser enviado agora.';
}

export function describeCdfManifestRestriction(manifest) {
  // ANTES da checagem de snapshot: um envio sem confirmação normalmente não tem
  // identidade externa, e "Ainda não sincronizado" sugere que nada saiu daqui —
  // quando na verdade o envio SAIU e o desfecho é que é desconhecido.
  if (isSubmitUnconfirmedManifest(manifest)) {
    return `${SUBMIT_UNCONFIRMED_PREFIX} O certificado só sai depois da confirmação e do recebimento. ${SUBMIT_UNCONFIRMED_WAY_OUT}`;
  }
  const snapshot = resolveManifestSnapshot(manifest);
  if (!snapshot || !(snapshot.manCodigo || snapshot.manNumero || snapshot.manHashCode)) {
    return 'Ainda não sincronizado com a CETESB. Use “Atualizar da CETESB”.';
  }
  const status = normalizedStatusValue(manifest);
  if (hasIssuedCdfReference(manifest)) {
    return 'Este manifesto já tem um certificado (CDF).';
  }
  if (status.includes('cancel')) {
    return 'Este manifesto foi cancelado.';
  }
  if (status.includes('fail') || status.includes('error') || status.includes('dlq')) {
    return 'Este manifesto teve um problema. Reenvie antes de gerar o certificado.';
  }
  if (!status.includes('receb')) {
    return 'Ainda não foi recebido. O certificado só sai depois do recebimento.';
  }
  return 'Este manifesto não pode gerar certificado agora.';
}

export function describeReceiveManifestRestriction(manifest) {
  if (isSubmitUnconfirmedManifest(manifest)) {
    return `${SUBMIT_UNCONFIRMED_PREFIX} A baixa só depois da confirmação. ${SUBMIT_UNCONFIRMED_WAY_OUT}`;
  }
  const snapshot = resolveManifestSnapshot(manifest);
  if (!snapshot || !(snapshot.manCodigo || snapshot.manNumero || snapshot.manHashCode)) {
    return 'Ainda não sincronizado com a CETESB. Use “Atualizar da CETESB”.';
  }
  const status = normalizedStatusValue(manifest);
  if (status.includes('receb')) {
    return 'Este manifesto já foi recebido.';
  }
  if (status.includes('cancel')) {
    return 'Este manifesto foi cancelado.';
  }
  if (status.includes('fail') || status.includes('error') || status.includes('dlq')) {
    return 'Este manifesto teve um problema.';
  }
  if (status.includes('draft') || status.includes('queue') || status.includes('process')) {
    return 'Este manifesto ainda está sendo processado. Aguarde um pouco.';
  }
  return 'Este manifesto não pode ser recebido agora.';
}

export function describeCancelManifestRestriction(manifest) {
  // ANTES da checagem de hash: envio sem confirmação não tem hash, e a frase
  // "manifesto ainda nao registrado no SIGOR" seria MENTIRA — pode estar
  // registrado; é justamente o que não se sabe.
  if (isSubmitUnconfirmedManifest(manifest)) {
    return `${SUBMIT_UNCONFIRMED_PREFIX} Não dá para cancelar o que ainda não se sabe se existe. ${SUBMIT_UNCONFIRMED_WAY_OUT}`;
  }
  if (isCancelledStatus(manifest)) {
    return 'Manifesto ja cancelado.';
  }
  // Espelha describeReceiveManifestRestriction: recebido é estado final para o
  // cancelamento; o próximo passo é o certificado (CDF).
  if (normalizedStatusValue(manifest).includes('receb')) {
    return 'Este manifesto já foi recebido. O próximo passo é o certificado (CDF), não o cancelamento.';
  }
  if (!String(manifest?.externalHashCode || '').trim()) {
    return 'Sem hash CETESB — manifesto ainda nao registrado no SIGOR.';
  }
  const status = normalizedStatusValue(manifest);
  if (status.includes('queue') || status.includes('process')) {
    return 'Aguarde o processamento terminar.';
  }
  if (status.includes('draft')) {
    return 'Rascunho local — não há o que cancelar na CETESB.';
  }
  return 'Manifesto indisponivel para cancelamento.';
}

export function describePrintManifestRestriction(manifest) {
  // ANTES da checagem de hash: "imprima apos o envio ao SIGOR" diria ao
  // operador que ele ainda não enviou — ele enviou; o que falta é a confirmação.
  if (isSubmitUnconfirmedManifest(manifest)) {
    return `${SUBMIT_UNCONFIRMED_PREFIX} Imprima depois que a CETESB confirmar. ${SUBMIT_UNCONFIRMED_WAY_OUT}`;
  }
  if (!String(manifest?.externalHashCode || '').trim()) {
    return 'Sem hash CETESB — imprima apos o envio ao SIGOR.';
  }
  const status = normalizedStatusValue(manifest);
  if (status.includes('queue') || status.includes('process')) {
    return 'Aguarde o processamento terminar.';
  }
  if (status.includes('draft')) {
    return 'Rascunho local — envie a CETESB antes de imprimir.';
  }
  return 'Manifesto indisponivel para impressao.';
}

export function formatDate(value) {
  return formatDateBr(value);
}

export function formatManifestBatchLabel(manifest) {
  const batchSize = Number(manifest?.batchSize || 0);
  const batchIndex = Number(manifest?.batchIndex || 0);
  if (Number.isInteger(batchSize) && batchSize > 1) {
    const safeIndex = Number.isInteger(batchIndex) && batchIndex > 0 ? batchIndex : 1;
    return `Lote ${safeIndex} de ${batchSize}`;
  }
  return 'Criado em lote';
}

export function formatPartnerLabel(partner) {
  const description = String(partner?.description || '').trim();
  const partnerCode = String(partner?.partnerCode || '').trim();
  if (!description && !partnerCode) {
    return '-';
  }
  if (/^\d{11,14}$/.test(description)) {
    return partnerCode ? `CNPJ/CPF ${description} (cód. ${partnerCode})` : `CNPJ/CPF ${description}`;
  }
  if (description) {
    return description;
  }
  return `Código ${partnerCode}`;
}

export function formatManifestLabel(manifest) {
  return String(manifest?.manifestNumber || manifest?.externalCode || resolveManifestIdentifier(manifest) || 'manifesto').trim();
}

export function formatDateTime(value) {
  if (!value) return 'Não informado';
  return formatDateTimeBr(value);
}
