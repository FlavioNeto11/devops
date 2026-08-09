// Vocabulário do submit de manifesto — FONTE ÚNICA.
//
// Antes desta unidade o conjunto {queued_submit, submitting, processing} vivia
// COPIADO em três lugares (workers/operation-handlers.ts, services/manifest-service.ts
// e repositories/manifest-repo.ts). Três cópias do mesmo conjunto significam que
// acrescentar um estado (foi exatamente o caso de `submit_unconfirmed`) conserta o
// comportamento em dois lugares e o deixa quebrado no terceiro, em silêncio.
//
// Mora em `lib/` pelo mesmo motivo que `retry.ts` e `job-lanes.ts`: é vocabulário
// compartilhado entre repositório, serviço e worker, e `lib/` é a única camada que
// os três podem importar sem inverter a fronteira declarada no AGENTS.md
// (`route → service → repository → job → worker → gateway`).
//
// Módulo PURO: sem imports, sem I/O — importável de teste unitário sem banco.

/**
 * Estados em que o submit JÁ COMEÇOU mas a CETESB ainda não confirmou nada.
 * Nenhum deles tem `external_hash_code` — é isso que os torna invisíveis para a
 * varredura de "fantasmas" do espelho (que exige hash preenchido).
 */
export const TRANSIENT_MANIFEST_SUBMIT_STATUSES = ['queued_submit', 'submitting', 'processing'] as const;

/**
 * Estado FÍSICO em `manifests.status` (a coluna é `text not null` sem CHECK; a
 * única constraint relacionada, `chk_manifest_submitted_integrity`, só trava o
 * valor `'submitted'` — por isso este estado entra SEM migration).
 *
 * Semântica: "o envio pode ter nascido na CETESB e o sistema NÃO sabe". É
 * deliberadamente distinto de `failed`, porque `failed` autoriza o operador a
 * reenviar — e reenviar um manifesto que nasceu produz um SEGUNDO MTR real.
 */
export const MANIFEST_SUBMIT_UNCONFIRMED_STATUS = 'submit_unconfirmed';

/**
 * Tudo que a varredura de reconciliação deve reavaliar. Inclui
 * `submit_unconfirmed`: sem ele, um manifesto rebaixado para "não sei" sairia do
 * radar da varredura no instante seguinte e ficaria preso para sempre.
 */
export const RECONCILABLE_MANIFEST_SUBMIT_STATUSES = [
  ...TRANSIENT_MANIFEST_SUBMIT_STATUSES,
  MANIFEST_SUBMIT_UNCONFIRMED_STATUS
] as const;

const TRANSIENT_STATUS_SET = new Set<string>(TRANSIENT_MANIFEST_SUBMIT_STATUSES);
const RECONCILABLE_STATUS_SET = new Set<string>(RECONCILABLE_MANIFEST_SUBMIT_STATUSES);

function normalizeStatus(status: unknown): string {
  return String(status ?? '').trim().toLowerCase();
}

export function isTransientManifestSubmitStatus(status: unknown): boolean {
  return TRANSIENT_STATUS_SET.has(normalizeStatus(status));
}

export function isReconcilableManifestSubmitStatus(status: unknown): boolean {
  return RECONCILABLE_STATUS_SET.has(normalizeStatus(status));
}

export function isManifestSubmitUnconfirmedStatus(status: unknown): boolean {
  return normalizeStatus(status) === MANIFEST_SUBMIT_UNCONFIRMED_STATUS;
}

/**
 * Certeza sobre o desfecho de um submit que não completou.
 *
 * - `confirmed-absent`: o sistema PERGUNTOU à CETESB (pesquisa pelo marcador de
 *   correlação, com o polling esgotado) e o MTR não está lá. Só neste caso é
 *   legítimo mandar reenviar.
 * - `unknown`: ninguém perguntou, ou a pergunta não obteve resposta conclusiva.
 *   Mandar reenviar aqui é a receita do MTR duplicado.
 */
export type ManifestSubmitOutcomeCertainty = 'confirmed-absent' | 'unknown';

export type ManifestSubmitFailureMessageInput = {
  certainty: ManifestSubmitOutcomeCertainty;
  /** `dlq` | `failed` | `cancelled` (worker) ou o status terminal do job (serviço). */
  terminalAction?: string | null;
  /** Detalhe de diagnóstico do SICAT (ex.: job de submit não encontrado). */
  detail?: string | null;
  /** Mensagem técnica do erro subjacente, já resumida pelo chamador. */
  technicalCause?: string | null;
};

function buildFailureBaseMessage(certainty: ManifestSubmitOutcomeCertainty, isDlq: boolean): string {
  if (certainty === 'confirmed-absent') {
    return isDlq
      ? 'Falha no envio para CETESB: job finalizado em DLQ. A pesquisa na CETESB confirmou que o MTR não foi criado — revise os dados e realize novo envio.'
      : 'Falha definitiva no envio para CETESB. A pesquisa na CETESB confirmou que o MTR não foi criado — revise os dados e realize novo envio.';
  }

  return isDlq
    ? 'Envio sem confirmação: job finalizado em DLQ e a pesquisa na CETESB não confirmou se o MTR foi criado. NÃO reenvie: um novo envio pode gerar um segundo MTR real. Use a ação "Atualizar da CETESB" para reconciliar.'
    : 'Envio sem confirmação: não foi possível confirmar na CETESB se o MTR foi criado. NÃO reenvie: um novo envio pode gerar um segundo MTR real. Use a ação "Atualizar da CETESB" para reconciliar.';
}

/**
 * ÚNICA fonte da mensagem gravada em `manifests.external_status` quando um
 * submit não completa. Substitui as duas quase-duplicatas anteriores
 * (`buildManifestSubmitFailureExternalStatus` no worker e
 * `buildManifestSubmitTerminalErrorExternalStatus` no serviço), que divergiam no
 * texto mas cometiam o MESMO erro: mandavam reenviar sem nunca ter perguntado à
 * CETESB se o MTR já existia.
 */
export function buildManifestSubmitFailureExternalStatus(input: ManifestSubmitFailureMessageInput): string {
  const isDlq = normalizeStatus(input.terminalAction) === 'dlq';
  const parts = [buildFailureBaseMessage(input.certainty, isDlq)];

  const detail = typeof input.detail === 'string' ? input.detail.trim() : '';
  if (detail) {
    parts.push(`Detalhe: ${detail}`);
  }

  const technicalCause = typeof input.technicalCause === 'string' ? input.technicalCause.trim() : '';
  if (technicalCause) {
    parts.push(`Causa técnica: ${technicalCause}`);
  }

  return parts.join(' ');
}

/**
 * Mensagem do desfecho OPOSTO: a pesquisa encontrou o manifesto na CETESB pelo
 * marcador de correlação. O envio nasceu — nunca é falha.
 */
export function buildManifestSubmitConfirmedExternalStatus(input: {
  manNumero?: string | number | null;
  manCodigo?: string | number | null;
} = {}): string {
  const identifier = input.manNumero ?? input.manCodigo;
  const normalizedIdentifier = identifier == null ? '' : String(identifier).trim();

  return normalizedIdentifier
    ? `Envio confirmado na CETESB pela reconciliação (MTR ${normalizedIdentifier}).`
    : 'Envio confirmado na CETESB pela reconciliação.';
}
