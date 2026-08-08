/**
 * PREVIA DE CONFERENCIA DA BAIXA (recebimento com recibo) POR WHATSAPP — unidade D2, MODULO INERTE.
 *
 * ┌─ O QUE ISTO E, E O QUE ISTO NAO E ────────────────────────────────────────────────────────────┐
 * │ `manifest.receive_with_receipt` esta em `CHANNEL_HARD_DENY` porque registra recibo na CETESB  │
 * │ sem inverso e o desenho dizia que "nao ha conferencia visual" no canal. Este modulo constroi  │
 * │ exatamente a conferencia que faltava: dado o payload de um recebimento, produz o texto que a  │
 * │ pessoa LE antes de confirmar — numero do MTR, gerador, residuo(s) e quantidade a receber.     │
 * │                                                                                                │
 * │ Ele NAO promove a acao: a lista de elegibilidade e do COORDENADOR e este arquivo nao a toca.  │
 * │ Enquanto o coordenador nao ligar `buildWhatsAppReceiveConference` ao fluxo de emissao de      │
 * │ ticket, nada aqui e alcancavel em producao — so os testes exercitam.                          │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ FAIL-CLOSED, SEM EXCECAO ────────────────────────────────────────────────────────────────────┐
 * │ `canIssueTicket: true` SO sai quando TODOS os quatro itens resolvem para rotulo humano:        │
 * │ numero do MTR (digitos, nunca id interno `man_<hex>`), gerador, descricao de residuo e         │
 * │ quantidade > 0 por linha. Qualquer um faltando — inclusive erro de banco, alvo ambiguo,        │
 * │ identificador do payload que CONTRADIZ o manifesto resolvido, ou um override de residuo/       │
 * │ parceiro/responsavel que a previa nao consegue mostrar — devolve `canIssueTicket: false` com   │
 * │ o motivo. A degradacao correta e RECUSAR o ticket (a pessoa faz a baixa no navegador), nunca   │
 * │ pedir um codigo para um efeito que ela nao consegue verificar.                                 │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Limites assumidos, ditos sem maquiagem:
 *  · A resolucao e LOCAL (`findManifestById`), nunca `getManifest` — nenhuma chamada CETESB no
 *    meio da montagem de uma previa (mesma decisao de `whatsapp-confirmation-flow`). Se o espelho
 *    local estiver defasado, a quantidade exibida pode divergir da que o worker registrara (ele
 *    faz GET remoto na execucao). E o preco ja aceito pelo canal; quem quiser fechar essa fresta
 *    re-sincroniza ANTES de chamar aqui.
 *  · Payload de recebimento com override de linhas de residuo, parceiros, `paaCodigo`/`rrmCodigo`
 *    ou qualquer chave fora da allowlist e RECUSADO: a previa mostraria o espelho local enquanto a
 *    execucao registraria outra coisa — e isso pareceria conferencia sem ser.
 *  · Teto de `WHATSAPP_RECEIVE_MAX_RESIDUE_LINES` linhas, conferido ANTES de resolver qualquer
 *    uma: lista parcial ("3 de 8") parece conferencia e nao e, e lista gigante e o vetor de OOM
 *    que este canal ja pagou. Acima do teto: recusa, nunca truncagem.
 *  · Todo valor que veio de payload passa por `coerceScalarText` (higiene + cap + corte por
 *    GRAFEMA via `cutAtGrapheme` — nunca `slice` UTF-16): valor nao cria linha, nao injeta `*` de
 *    formatacao e nao parte emoji ao meio.
 */

import { findManifestById } from '../../../../repositories/manifest-repo.js';
import {
  buildManifestIdentityLabel,
  collectActionManifestIds,
  isConferibleItemLabel
} from './whatsapp-confirmation-texts.js';
import { coerceScalarText, FIELD_CAPS } from './whatsapp-render-blocks.js';

type LooseRecord = Record<string, unknown>;

/** Chave da acao na matriz do canal — exportada para o coordenador ligar sem literal duplicado. */
export const WHATSAPP_RECEIVE_ACTION_KEY = 'manifest.receive_with_receipt';

/**
 * Teto de linhas de residuo POR PREVIA. Um MTR real raramente passa de poucas linhas; acima disso
 * a conferencia por mensagem deixa de ser conferencia (ninguem valida 12 linhas no celular) e o
 * texto cresce alem do orcamento de segmento. Recusa, nunca lista parcial.
 */
export const WHATSAPP_RECEIVE_MAX_RESIDUE_LINES = 5;

/** Numero de MTR da CETESB e numerico. Id interno (`man_<hex>`) NUNCA passa por aqui. */
const MANIFEST_NUMBER_PATTERN = /^\d{4,20}$/;

const RESIDUE_LABEL_CAP = 60;
const UNIT_LABEL_CAP = 12;

/** Sao Paulo nao tem horario de verao desde 2019 — mesma premissa fixa do worker de recebimento. */
const SAO_PAULO_UTC_OFFSET = '-03:00';
const SAO_PAULO_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------------------------
// Seam de leitura — SO para testes (mesmo molde TOTAL de `whatsapp-confirmation-flow`)
// ---------------------------------------------------------------------------------------------

/**
 * Override TOTAL, nunca `Partial`: um spread sobre o default faria uma chave ausente cair no
 * repositorio REAL e o desfecho do teste passaria a depender de haver banco na maquina.
 */
export type ReceivePreviewRepositories = {
  findManifestById: typeof findManifestById;
};

const DEFAULT_RECEIVE_PREVIEW_REPOSITORIES: ReceivePreviewRepositories = { findManifestById };

let receivePreviewRepositories: ReceivePreviewRepositories = DEFAULT_RECEIVE_PREVIEW_REPOSITORIES;

export function setWhatsAppReceivePreviewRepositoriesForTests(overrides: ReceivePreviewRepositories | null): void {
  receivePreviewRepositories = overrides ?? DEFAULT_RECEIVE_PREVIEW_REPOSITORIES;
}

// ---------------------------------------------------------------------------------------------
// Contrato de saida
// ---------------------------------------------------------------------------------------------

export type WhatsAppReceivePreviewRefusalReason =
  /** Nenhum id interno nos argumentos, manifesto inexistente no espelho local, ou falha de banco. */
  | 'target_unresolved'
  /** Mais de um manifesto referenciado — receber e acao de UM manifesto por vez. */
  | 'target_ambiguous'
  /** O payload de recebimento NOMEIA um identificador que contradiz o manifesto resolvido. */
  | 'target_mismatch'
  /** Sem numero de MTR conferivel (rascunho, espelho corrompido ou id interno no lugar do numero). */
  | 'manifest_number_missing'
  /** Sem razao social de gerador conferivel. */
  | 'generator_missing'
  /** O manifesto local nao tem NENHUMA linha de residuo. */
  | 'residues_missing'
  /** Alguma linha sem descricao humana de residuo. */
  | 'residue_label_missing'
  /** Alguma linha sem quantidade a receber (> 0) renderizavel. */
  | 'residue_quantity_missing'
  /** Mais linhas que o teto do canal — recusa, nunca lista parcial. */
  | 'too_many_residue_lines'
  /** Payload de recebimento vazio — a execucao falharia com 400 depois do codigo digitado. */
  | 'receipt_payload_missing'
  /** O payload carrega override que a previa nao consegue mostrar (residuos, parceiros, rrmCodigo…). */
  | 'receipt_overrides_not_supported'
  /** Campo declarado no recebimento (data/observacao) presente porem nao renderizavel. */
  | 'receipt_fields_not_renderable';

export type WhatsAppReceiveConference = {
  canIssueTicket: true;
  /** Manchete curta no molde de `ACTION_HEADLINES` do fluxo de confirmacao. */
  headline: string;
  /** Bloco de conferencia pronto (sem o mecanismo do codigo — o ticket acrescenta o dele). */
  text: string;
  /** Rotulo conferivel do manifesto (`MTR <numero> - <gerador> (<data>)`), para `itemLabels`. */
  manifestLabel: string;
  /** Uma linha humana por residuo, ja higienizada e capada. */
  residueLines: string[];
};

export type WhatsAppReceiveRefusal = {
  canIssueTicket: false;
  reason: WhatsAppReceivePreviewRefusalReason;
  /**
   * So contexto estrutural: indice de linha ou NOME de chave — nunca VALOR vindo do payload.
   * Nome de chave tambem e conteudo do payload, entao sai higienizado e capado.
   */
  detail?: string;
};

export type WhatsAppReceivePreviewResult = WhatsAppReceiveConference | WhatsAppReceiveRefusal;

function refuse(reason: WhatsAppReceivePreviewRefusalReason, detail?: string): WhatsAppReceiveRefusal {
  return detail ? { canIssueTicket: false, reason, detail } : { canIssueTicket: false, reason };
}

// ---------------------------------------------------------------------------------------------
// Entrada principal
// ---------------------------------------------------------------------------------------------

/**
 * Monta a conferencia da baixa a partir dos ARGUMENTOS REAIS do tool-call (os mesmos que o
 * dispatcher executa: `receiptPayload || payload` + `manifestId`/`manifestIds`). O coordenador
 * chama isto ANTES de emitir ticket; `canIssueTicket: false` significa NENHUM ticket.
 */
export async function buildWhatsAppReceiveConference(args: LooseRecord): Promise<WhatsAppReceivePreviewResult> {
  // Paridade com `handleManifestReceiveWithReceipt`: `args.receiptPayload || args.payload`.
  const receipt = asRecord((args.receiptPayload || args.payload) ?? null);
  if (Object.keys(receipt).length === 0) {
    // O dispatcher recusa payload vazio com 400 — emitir ticket aqui faria a pessoa digitar um
    // codigo para receber um erro.
    return refuse('receipt_payload_missing');
  }

  const disallowedKey = findDisallowedReceiptKey(receipt);
  if (disallowedKey) {
    // NOME de chave e conteudo do payload tanto quanto o valor: sai higienizado e capado.
    return refuse('receipt_overrides_not_supported', coerceScalarText(disallowedKey, 48) ?? 'chave desconhecida');
  }

  const manifestIds = collectActionManifestIds(args);
  const targetManifestId = manifestIds.length === 1 ? manifestIds[0] : null;
  if (manifestIds.length > 1) {
    return refuse('target_ambiguous', `${manifestIds.length} manifestos referenciados`);
  }
  if (!targetManifestId) {
    return refuse('target_unresolved', 'nenhum manifestId nos argumentos');
  }

  const manifest = await loadManifestFailClosed(targetManifestId);
  if (!manifest) {
    return refuse('target_unresolved');
  }

  const externalReference = asRecord(manifest.externalReference);
  const payload = asRecord(manifest.payload);

  const manifestNumber = coerceScalarText(externalReference.manNumero, FIELD_CAPS.identifier);
  if (!manifestNumber || !MANIFEST_NUMBER_PATTERN.test(manifestNumber)) {
    return refuse('manifest_number_missing');
  }

  const mismatchedKey = findIdentifierMismatch({
    args,
    receipt,
    rowNumber: toScalarString(externalReference.manNumero),
    rowCode: toScalarString(externalReference.manCodigo),
    rowHash: toScalarString(manifest.externalHashCode)
  });
  if (mismatchedKey) {
    return refuse('target_mismatch', mismatchedKey);
  }

  const generatorLabel = toConferibleValueLabel(asRecord(payload.generator).description, FIELD_CAPS.personName);
  if (!generatorLabel) {
    return refuse('generator_missing');
  }

  const rawResidueLines = collectResidueLines(payload);
  if (rawResidueLines.length === 0) {
    return refuse('residues_missing');
  }
  // Teto conferido ANTES de resolver qualquer linha: acima dele o desfecho ja esta decidido e nao
  // se paga o custo (nem se emite lista parcial, que pareceria conferencia sem ser).
  if (rawResidueLines.length > WHATSAPP_RECEIVE_MAX_RESIDUE_LINES) {
    return refuse('too_many_residue_lines', `${rawResidueLines.length} linhas`);
  }

  const residueLines: string[] = [];
  for (let index = 0; index < rawResidueLines.length; index += 1) {
    const resolved = resolveResidueLine(rawResidueLines[index]);
    if (!resolved.ok) {
      return refuse(resolved.reason, `linha ${index + 1}`);
    }
    residueLines.push(resolved.label);
  }

  const receiptDate = renderReceiptDate(receipt.remDataRecebimento);
  if (receiptDate.kind === 'invalid') {
    // Presente porem irrenderizavel: omitir em silencio registraria uma data que a pessoa nunca
    // viu. Recusar e o unico desfecho honesto.
    return refuse('receipt_fields_not_renderable', 'remDataRecebimento');
  }

  const observation = renderObservation(receipt.remObservacao);
  if (observation.kind === 'invalid') {
    return refuse('receipt_fields_not_renderable', 'remObservacao');
  }

  const manifestLabel = buildManifestIdentityLabel({
    manifestNumber,
    generatorDescription: generatorLabel,
    expeditionDate: toScalarString(payload.expeditionDate)
  });
  if (!manifestLabel) {
    return refuse('manifest_number_missing');
  }

  return {
    canIssueTicket: true,
    headline: 'Dar baixa (receber) em 1 MTR',
    text: renderConferenceText({
      manifestNumber,
      generatorLabel,
      residueLines,
      dateLabel: receiptDate.kind === 'shown' ? receiptDate.label : null,
      observationLabel: observation.kind === 'shown' ? observation.label : null
    }),
    manifestLabel,
    residueLines
  };
}

// ---------------------------------------------------------------------------------------------
// Resolucao (leituras LOCAIS, fail-closed)
// ---------------------------------------------------------------------------------------------

async function loadManifestFailClosed(manifestId: string) {
  try {
    return await receivePreviewRepositories.findManifestById(manifestId);
  } catch (error) {
    // So a mensagem — nunca o payload — no log. Falha de banco recusa a previa (fail-closed).
    console.error(
      `[whatsapp-receive-preview] falha ao resolver o manifesto da baixa: ${(error as Error)?.message || 'desconhecida'}`
    );
    return undefined;
  }
}

/**
 * Allowlist do payload de recebimento. Tudo que ALTERA o que sera registrado e a previa nao
 * mostra — linhas de residuo, parceiros, `paaCodigo`/`rrmCodigo`/`remCodigo`, chave desconhecida —
 * recusa a emissao. Chave com valor nulo/vazio conta como ausente (LLMs emitem `"rrmCodigo": null`).
 */
const RECEIPT_ROOT_ALLOWED_KEYS: ReadonlySet<string> = new Set([
  'remDataRecebimento',
  'remObservacao',
  'manNumero',
  'manCodigo',
  'manHashCode',
  'manifesto',
  // Janela de PESQUISA do worker — nao muda o que e registrado.
  'dateFrom',
  'dateTo'
]);

const RECEIPT_MANIFESTO_ALLOWED_KEYS: ReadonlySet<string> = new Set(['manNumero', 'manCodigo', 'manHashCode']);

function findDisallowedReceiptKey(receipt: LooseRecord): string | null {
  for (const [key, value] of Object.entries(receipt)) {
    if (isAbsentValue(value)) continue;
    if (!RECEIPT_ROOT_ALLOWED_KEYS.has(key)) return key;
  }

  const manifesto = receipt.manifesto;
  if (manifesto != null && !isAbsentValue(manifesto)) {
    if (typeof manifesto !== 'object' || Array.isArray(manifesto)) return 'manifesto';
    for (const [key, value] of Object.entries(manifesto as LooseRecord)) {
      if (isAbsentValue(value)) continue;
      if (!RECEIPT_MANIFESTO_ALLOWED_KEYS.has(key)) return `manifesto.${key}`;
    }
  }

  return null;
}

/**
 * O payload de recebimento pode NOMEAR o manifesto (numero/codigo/hash). Quando nomeia e o valor
 * contradiz o manifesto resolvido pelo id interno, a pessoa conferiria um papel que nao e o que
 * sera executado — recusa. Comparacao so quando os DOIS lados existem.
 */
function findIdentifierMismatch(input: {
  args: LooseRecord;
  receipt: LooseRecord;
  rowNumber: string | null;
  rowCode: string | null;
  rowHash: string | null;
}): string | null {
  const manifesto = asRecord(input.receipt.manifesto);

  const namedNumbers: Array<[string, string | null]> = [
    ['manifestNumber', toScalarString(input.args.manifestNumber)],
    ['receiptPayload.manNumero', toScalarString(manifesto.manNumero ?? input.receipt.manNumero)]
  ];
  for (const [key, named] of namedNumbers) {
    if (named && input.rowNumber && named !== input.rowNumber) return key;
    // Numero nomeado sem numero no espelho: nao ha como conferir a igualdade — trate como
    // contradicao (fail-closed), nunca como "confere".
    if (named && !input.rowNumber) return key;
  }

  const namedCode = toScalarString(manifesto.manCodigo ?? input.receipt.manCodigo);
  if (namedCode && input.rowCode && namedCode !== input.rowCode) return 'receiptPayload.manCodigo';
  if (namedCode && !input.rowCode) return 'receiptPayload.manCodigo';

  const namedHash = toScalarString(manifesto.manHashCode ?? input.receipt.manHashCode);
  if (namedHash && input.rowHash && namedHash !== input.rowHash) return 'receiptPayload.manHashCode';
  if (namedHash && !input.rowHash) return 'receiptPayload.manHashCode';

  return null;
}

/**
 * Mesmas fontes de `normalizeManifestResidues` do manifest-service: o array normalizado
 * (`payload.residues`) primeiro; na ausencia, as linhas cruas do snapshot CETESB.
 */
function collectResidueLines(payload: LooseRecord): unknown[] {
  if (Array.isArray(payload.residues)) {
    return payload.residues.filter(Boolean);
  }
  const snapshot = asRecord(payload.externalSnapshot);
  return Array.isArray(snapshot.listaManifestoResiduo) ? snapshot.listaManifestoResiduo.filter(Boolean) : [];
}

type ResolvedResidueLine =
  | { ok: true; label: string }
  | { ok: false; reason: 'residue_label_missing' | 'residue_quantity_missing' };

/**
 * Uma linha de residuo vira `descricao: quantidade [unidade]`. Aceita as DUAS formas que o espelho
 * local guarda (normalizada e crua da CETESB). A quantidade preferida e a RECEBIDA; nula cai na
 * declarada — exatamente o prefill que o worker aplica no POST real. Zero ou negativo NAO cai em
 * fallback: e sinal explicito, e quantidade nao-positiva nao e conferivel.
 */
function resolveResidueLine(line: unknown): ResolvedResidueLine {
  const record = asRecord(line);
  const residue = asRecord(record.residuo ?? record.residue);

  const description = toConferibleValueLabel(residue.resDescricao ?? residue.description, RESIDUE_LABEL_CAP);
  if (!description) {
    return { ok: false, reason: 'residue_label_missing' };
  }

  const quantity = toQuantityNumber(
    record.marQuantidadeRecebida ?? record.receivedQuantity ?? record.marQuantidade ?? record.quantity
  );
  const quantityLabel = quantity == null ? null : formatQuantityBr(quantity);
  if (!quantityLabel) {
    return { ok: false, reason: 'residue_quantity_missing' };
  }

  const unitRecord = asRecord(record.unidade ?? record.unit);
  const unitLabel = coerceScalarText(
    unitRecord.uniSigla ?? unitRecord.symbol ?? unitRecord.uniDescricao ?? unitRecord.description,
    UNIT_LABEL_CAP
  );

  return { ok: true, label: unitLabel ? `${description}: ${quantityLabel} ${unitLabel}` : `${description}: ${quantityLabel}` };
}

// ---------------------------------------------------------------------------------------------
// Renderizacao
// ---------------------------------------------------------------------------------------------

function renderConferenceText(input: {
  manifestNumber: string;
  generatorLabel: string;
  residueLines: string[];
  dateLabel: string | null;
  observationLabel: string | null;
}): string {
  const lines: string[] = [];

  lines.push(`*Dar baixa (receber) no MTR ${input.manifestNumber}*`);
  lines.push(`Gerador: ${input.generatorLabel}`);
  lines.push(
    input.residueLines.length === 1
      ? 'Residuo a receber:'
      : `Residuos a receber (${input.residueLines.length}):`
  );
  for (const residueLine of input.residueLines) {
    lines.push(`- ${residueLine}`);
  }
  if (input.dateLabel) lines.push(`Data do recebimento: ${input.dateLabel}`);
  if (input.observationLabel) lines.push(`Observacao da baixa: ${input.observationLabel}`);

  lines.push('');
  lines.push('Registrar a baixa gera o recibo do MTR na CETESB e nao da para desfazer por aqui.');
  lines.push('Confira com o MTR em maos - se algo nao bater, nao confirme.');

  return lines.join('\n');
}

type OptionalFieldOutcome = { kind: 'absent' } | { kind: 'invalid' } | { kind: 'shown'; label: string };

/**
 * `remDataRecebimento` ausente = o worker registra "agora" — nada a mostrar. Presente, so os
 * formatos INEQUIVOCOS do contrato da tool (`YYYY-MM-DD` e ISO-8601): "12/06/2026" com barras e
 * ambiguo (o portal leria MM/DD) e epoch/objeto nao sao coisa que uma pessoa confere — recusa.
 * Datetime sem offset e lido como hora de Sao Paulo, o MESMO default do worker; com offset,
 * converte para Sao Paulo (offset fixo, sem horario de verao desde 2019).
 */
function renderReceiptDate(value: unknown): OptionalFieldOutcome {
  if (value == null) return { kind: 'absent' };
  if (typeof value !== 'string') return { kind: 'invalid' };
  const raw = value.trim();
  if (!raw) return { kind: 'absent' };

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (dateOnly) {
    // ⚠️ `Date.parse` NAO valida o calendario: '2026-02-30T12:00:00Z' NAO e NaN — o V8 ROLA para
    // 2 de marco. Como esta linha renderiza a partir dos COMPONENTES da string, aceitar o rollover
    // mostraria "30/02/2026" enquanto o worker registraria 02/03 — a exata divergencia que a
    // conferencia existe para impedir. Validacao por ida-e-volta, obrigatoria.
    if (!isRealCalendarDate(Number(dateOnly[1]), Number(dateOnly[2]), Number(dateOnly[3]))) {
      return { kind: 'invalid' };
    }
    return { kind: 'shown', label: `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}` };
  }

  const dateTime = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|[+-]\d{2}:\d{2})?$/.exec(raw);
  if (!dateTime) return { kind: 'invalid' };

  // Aqui o rotulo sai do EPOCH parseado, entao um eventual rollover do V8 aparece IGUAL ao que o
  // worker registraria — mostrado == registrado, que e o contrato da conferencia.
  const parsed = Date.parse(`${dateTime[1]}T${dateTime[2]}${dateTime[3] ?? SAO_PAULO_UTC_OFFSET}`);
  if (!Number.isFinite(parsed)) return { kind: 'invalid' };

  const saoPaulo = new Date(parsed - SAO_PAULO_UTC_OFFSET_MS);
  const pad = (part: number) => String(part).padStart(2, '0');
  return {
    kind: 'shown',
    label: `${pad(saoPaulo.getUTCDate())}/${pad(saoPaulo.getUTCMonth() + 1)}/${saoPaulo.getUTCFullYear()} `
      + `${pad(saoPaulo.getUTCHours())}:${pad(saoPaulo.getUTCMinutes())}`
  };
}

/** Observacao livre: higiene + cap por `coerceScalarText`. Presente porem nao-escalar = recusa. */
function renderObservation(value: unknown): OptionalFieldOutcome {
  if (value == null) return { kind: 'absent' };
  if (typeof value === 'string' && !value.trim()) return { kind: 'absent' };
  const label = coerceScalarText(value, FIELD_CAPS.freeText);
  return label ? { kind: 'shown', label } : { kind: 'invalid' };
}

// ---------------------------------------------------------------------------------------------
// Coercoes locais
// ---------------------------------------------------------------------------------------------

function asRecord(value: unknown): LooseRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as LooseRecord) : {};
}

function toScalarString(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isAbsentValue(value: unknown): boolean {
  return value == null || (typeof value === 'string' && !value.trim());
}

/** `Date.UTC` ROLA estouros (30/02 -> 02/03); a ida-e-volta e o que prova que a data EXISTE. */
function isRealCalendarDate(year: number, month: number, day: number): boolean {
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

/**
 * A checagem crua de id interno so precisa alcancar strings CURTAS (`createPrefixedId` gera ~20
 * caracteres). Acima deste teto nada pode ser id interno, e varrer/alocar uma string de megabytes
 * aqui reintroduziria o vetor de OOM que o pre-corte do `coerceScalarText` existe para fechar.
 */
const RAW_INTERNAL_ID_SCAN_MAX = 2048;

/**
 * Rotulo conferivel a partir de um VALOR de payload, com a checagem de id interno rodando sobre o
 * valor CRU — obrigatoriamente ANTES da higiene do canal. `sanitizeRenderedValue` remove `_` (e
 * demais marcadores de formatacao do WhatsApp) dos valores, entao `man_deadbeef99` higienizado
 * vira `mandeadbeef99` e ESCAPARIA do padrao de id interno: a checagem pos-higiene sozinha e
 * fail-open. As duas rodam — a crua pega o id interno, a pos-higiene pega o que a higiene esvaziou.
 */
function toConferibleValueLabel(value: unknown, maxChars: number): string | null {
  if (typeof value === 'string' && value.length <= RAW_INTERNAL_ID_SCAN_MAX && !isConferibleItemLabel(value)) {
    return null;
  }
  const coerced = coerceScalarText(value, maxChars);
  return coerced && isConferibleItemLabel(coerced) ? coerced : null;
}

/** Numero ou string numerica ("2,5", "2.5", "1.234,56"). Devolve `null` fora de (0, 1e12). */
function toQuantityNumber(value: unknown): number | null {
  let parsed: number;
  if (typeof value === 'number') {
    parsed = value;
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const normalized = trimmed.includes(',') ? trimmed.replaceAll('.', '').replace(',', '.') : trimmed;
    parsed = Number(normalized);
  } else {
    return null;
  }
  return Number.isFinite(parsed) && parsed > 0 && parsed < 1e12 ? parsed : null;
}

/**
 * Quantidade em pt-BR (virgula decimal, ate 4 casas). `null` quando o arredondamento colapsaria em
 * "0" — exibir "0" para uma quantidade positiva minuscula seria conferencia mentirosa.
 */
function formatQuantityBr(value: number): string | null {
  const fixed = value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  if (!(Number(fixed) > 0)) return null;
  return fixed.replace('.', ',');
}
