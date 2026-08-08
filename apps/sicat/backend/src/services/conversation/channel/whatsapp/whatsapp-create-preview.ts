/**
 * D3 — PRÉVIA DE CONFERÊNCIA PARA CRIAR MANIFESTO POR WHATSAPP (módulo NOVO, INERTE).
 *
 * ┌─ POR QUE ESTE MÓDULO EXISTE ──────────────────────────────────────────────────────────────────┐
 * │ Criar (`manifest.create_from_payload` / `manifest.create_draft`) está em `CHANNEL_HARD_DENY`   │
 * │ (`whatsapp-action-eligibility.ts`) com uma razão explícita: "conferir 6 entidades montadas pelo│
 * │ LLM sobre texto livre, por mensagem, não é conferência". O operador decidiu liberar assim mesmo,│
 * │ nas duas formas, MAS só com uma prévia que torne a criação de fato conferível. Este módulo é    │
 * │ essa prévia — e nada além dela. A PROMOÇÃO da elegibilidade é do COORDENADOR; aqui não se toca  │
 * │ `whatsapp-action-eligibility.ts`, e ninguém chama este módulo ainda (INERTE).                    │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * DOIS MODOS:
 *  · REPLICAR (dominante, o mais seguro de conferir) — parte de um MTR REAL que a pessoa referencia
 *    ("igual ao 260011… mas 3 toneladas"). A prévia mostra a ORIGEM (número + gerador, e o resíduo
 *    quando disponível) e A DIFERENÇA aplicada (o que muda). O que a pessoa confere é um documento que
 *    existe, mais a alteração — não um objeto inteiro montado do zero.
 *  · COMPLETO — o LLM monta as 6 entidades. A prévia lista cada uma com rótulo HUMANO: gerador,
 *    transportador, destinador, resíduo, quantidade e data de expedição. FAIL-CLOSED: se QUALQUER uma
 *    não resolver para rótulo humano (ficou um código cru, ou vazia), o módulo devolve `ok: false` e
 *    NÃO há prévia — logo não há ticket. Listar 5 entidades e criar com 6 é pior que não listar
 *    nenhuma, porque PARECE conferência (mesma lição do lote em `whatsapp-confirmation-flow.ts`).
 *
 * FRONTEIRA ESTRITA: este arquivo só FORMATA texto de WhatsApp e resolve identidade por um seam
 * injetável (o mesmo molde de `setWhatsAppConfirmationRepositoriesForTests`). Não decide política, não
 * emite ticket, não escreve no banco. As leituras (manifesto de origem, parceiro, resíduo) passam pelo
 * seam para que o teste de unidade rode SEM Postgres e com doubles de valores DISTINTOS por entidade.
 *
 * TETO DE ITENS (OOM já aconteceu neste subsistema): rótulos são cortados por grafema (`cutAtGrapheme`)
 * e as listas têm cap. Nada aqui serializa árvore de payload.
 */

import { findManifestById } from '../../../../repositories/manifest-repo.js';
import { searchPartners } from '../../../../repositories/partner-repo.js';
import { getCatalog } from '../../../../repositories/catalog-repo.js';
import { cutAtGrapheme } from './whatsapp-render-blocks.js';
import { buildManifestIdentityLabel } from './whatsapp-confirmation-texts.js';

type LooseRecord = Record<string, unknown>;

export type CreatePartnerRole = 'generator' | 'carrier' | 'receiver';

/** Rótulo humano do papel, em português de operação — o que a pessoa lê antes do valor. */
const ROLE_HEADINGS: Readonly<Record<CreatePartnerRole, string>> = Object.freeze({
  generator: 'Gerador',
  carrier: 'Transportador',
  receiver: 'Destinador'
});

/**
 * Vocabulários equivalentes do MESMO papel (pt-BR do contrato × en do código). Inline de propósito:
 * `resolvePartnerRoleAliases` vive em `partner-service`, que constrói um gateway CETESB no load do
 * módulo — importá-lo por três strings traria esse efeito colateral para um módulo que se quer inerte.
 */
const ROLE_ALIASES: Readonly<Record<CreatePartnerRole, readonly string[]>> = Object.freeze({
  generator: Object.freeze(['gerador', 'generator']),
  carrier: Object.freeze(['transportador', 'carrier']),
  receiver: Object.freeze(['destinador', 'receiver'])
});

/** Teto de linhas conferíveis. Bem acima das 6 entidades e da origem+diff; existe contra payload adversarial. */
const MAX_CONFERIBLE_LINES = 8;

/** Teto por rótulo, em unidades UTF-16 (o que o provedor mede). Igual ao de `whatsapp-confirmation-texts`. */
const MAX_LABEL_CHARS = 80;

/** `createPrefixedId`: `man_a1b2c3…`. Id interno NUNCA é rótulo conferível — é código cru. */
const INTERNAL_ID_PATTERN = /^[a-z][a-z0-9]*_[0-9a-f]{6,}$/i;

// ---------------------------------------------------------------------------------------------
// Seam de leitura — SÓ para testes (mesmo molde de `setWhatsAppConfirmationRepositoriesForTests`)
// ---------------------------------------------------------------------------------------------

/**
 * As três leituras de que a prévia depende. O override é TOTAL (`| null`), nunca `Partial`: um spread
 * sobre o default faria uma chave ausente cair no repositório REAL e o desfecho do teste passaria a
 * depender de haver banco na máquina — exatamente a armadilha que o seam do ticket-service documenta.
 */
export type CreatePreviewResolvers = {
  findManifestById: typeof findManifestById;
  /** Código de parceiro → razão social conferível, ou `null` (não resolvido). */
  resolvePartnerLabel: (input: { code: string; role: CreatePartnerRole }) => Promise<string | null>;
  /** Código de resíduo → descrição conferível, ou `null`. */
  resolveResidueLabel: (input: { code: string }) => Promise<string | null>;
};

/**
 * Defaults que REUSAM a resolução já existente (manifesto, parceiro, catálogo de resíduos). Importar
 * estas funções não abre conexão — só chamá-las abre. Em produção o coordenador injeta o que quiser;
 * no teste, `setWhatsAppCreatePreviewResolversForTests` troca tudo por doubles.
 */
const DEFAULT_CREATE_PREVIEW_RESOLVERS: CreatePreviewResolvers = {
  findManifestById,
  resolvePartnerLabel: async ({ code, role }) => {
    const roles = [...(ROLE_ALIASES[role] ?? [])];
    const found = await searchPartners({ q: code, role: roles[0] ?? null, roles, page: 1, pageSize: 5 });
    const exact = found.items.find((partner) => String(partner.partnerCode) === String(code));
    return normalizeResolvedName(exact?.description, code);
  },
  resolveResidueLabel: async ({ code }) => {
    const catalog = await getCatalog({ catalogName: 'wasteTypes', search: code, page: 1, pageSize: 5 });
    const exact = catalog?.items.find((item) => String(item.code) === String(code));
    return normalizeResolvedName(exact?.name ?? exact?.shortName ?? null, code);
  }
};

let createPreviewResolvers: CreatePreviewResolvers = DEFAULT_CREATE_PREVIEW_RESOLVERS;

export function setWhatsAppCreatePreviewResolversForTests(overrides: CreatePreviewResolvers | null): void {
  createPreviewResolvers = overrides ?? DEFAULT_CREATE_PREVIEW_RESOLVERS;
}

// ---------------------------------------------------------------------------------------------
// Entrada / saída
// ---------------------------------------------------------------------------------------------

export type ReplicateCreationInput = {
  mode: 'replicate';
  /** Id interno (`man_<hex>`) do MTR de ORIGEM. O número→id é resolvido a montante (coordenador). */
  sourceManifestId: string;
  /** O que a pessoa pediu para MUDAR em relação à origem. Só o que difere de fato vira linha de diff. */
  overrides?: {
    quantity?: number | string | null;
    expeditionDate?: string | null;
  } | null;
  /** NOME da conta CETESB (com CNPJ quando houver). Nunca só o id interno. */
  accountLabel?: string | null;
};

export type CompleteCreationInput = {
  mode: 'complete';
  /** Payload montado pelo LLM — mesma forma de `manifest.create_from_payload`. */
  payload: LooseRecord;
  accountLabel?: string | null;
};

export type WhatsAppCreatePreviewInput = ReplicateCreationInput | CompleteCreationInput;

export type CreatePreviewOk = {
  ok: true;
  mode: 'replicate' | 'complete';
  /** Bloco de conferência em UM segmento, pronto para o funil de higiene. SEM código (é do ticket). */
  text: string;
  /** As linhas conferíveis, para o ticket congelar como `itemLabels`. */
  itemLabels: string[];
};

export type CreatePreviewBlocked = {
  ok: false;
  mode: 'replicate' | 'complete';
  /**
   * Por que NÃO dá para emitir ticket:
   *  · `source_unconferible` — a origem (replicar) não tem número + gerador conferíveis.
   *  · `empty_payload` — nada foi enviado (completo).
   *  · `unresolved_entities` — ao menos uma das entidades não virou rótulo humano.
   */
  blocker: 'source_unconferible' | 'empty_payload' | 'unresolved_entities';
  /** Entidades que não resolveram para rótulo humano, em nomes de operação ("Gerador", "Resíduo"…). */
  unresolved: string[];
};

export type CreatePreviewResult = CreatePreviewOk | CreatePreviewBlocked;

/** Ponto único de entrada. `mode` decide o caminho; a saída é sempre `ok:true` (com prévia) ou `ok:false`. */
export async function buildWhatsAppCreatePreview(input: WhatsAppCreatePreviewInput): Promise<CreatePreviewResult> {
  return input.mode === 'replicate'
    ? buildReplicateCreatePreview(input)
    : buildCompleteCreatePreview(input);
}

// ---------------------------------------------------------------------------------------------
// Modo REPLICAR
// ---------------------------------------------------------------------------------------------

export async function buildReplicateCreatePreview(input: ReplicateCreationInput): Promise<CreatePreviewResult> {
  const sourceManifestId = typeof input.sourceManifestId === 'string' ? input.sourceManifestId.trim() : '';
  if (!sourceManifestId) {
    return { ok: false, mode: 'replicate', blocker: 'source_unconferible', unresolved: ['Origem'] };
  }

  const source = await loadSourceManifest(sourceManifestId);
  if (!source) {
    // Sem a origem não há o que replicar nem o que conferir. Fail-closed.
    return { ok: false, mode: 'replicate', blocker: 'source_unconferible', unresolved: ['Origem'] };
  }

  // Rótulo da origem no formato pedido: `MTR <numero> - <gerador>` (sem data — a data, se mudar, aparece
  // no diff). `buildManifestIdentityLabel` sem `expeditionDate` produz exatamente essa forma.
  const originLabel = buildManifestIdentityLabel({
    manifestNumber: source.manifestNumber,
    generatorDescription: source.generatorDescription
  });
  if (!originLabel) {
    // Origem sem número + gerador não é conferível — degradar para "MTR man_a1b2c3" seria o oposto de
    // conferência (a mesma razão de `buildWhatsAppConfirmationPreview` devolver `null`).
    return { ok: false, mode: 'replicate', blocker: 'source_unconferible', unresolved: ['Origem'] };
  }

  const residueLabel = await resolveSourceResidueLabel(source);
  const changes = computeReplicateChanges(source, input.overrides ?? null);

  const text = buildReplicatePreviewText({
    originLabel,
    residueLabel,
    changes,
    accountLabel: coerceAccountLabel(input.accountLabel)
  });

  const itemLabels = capLines([
    originLabel,
    ...changes.map((change) => `${change.heading}: ${change.summary}`)
  ]);

  return { ok: true, mode: 'replicate', text, itemLabels };
}

type SourceManifest = {
  manifestNumber: string | null;
  generatorDescription: string | null;
  residueCode: string | null;
  residueDescription: string | null;
  quantity: number | null;
  unitLabel: string | null;
  expeditionDate: string | null;
};

async function loadSourceManifest(manifestId: string): Promise<SourceManifest | null> {
  try {
    const manifest = await createPreviewResolvers.findManifestById(manifestId);
    if (!manifest) return null;

    const record = asRecord(manifest);
    const externalReference = asRecord(record.externalReference);
    const payload = asRecord(record.payload);
    const generator = asRecord(payload.generator);
    const firstResidue = asRecord(firstItem(payload.residues));
    const residue = asRecord(firstResidue.residue);
    const unit = asRecord(firstResidue.unit);

    return {
      manifestNumber: toScalarString(externalReference.manNumero),
      generatorDescription: toScalarString(generator.description),
      residueCode: toScalarString(residue.code),
      residueDescription: toScalarString(residue.description),
      quantity: toFiniteNumber(firstResidue.quantity),
      unitLabel: resolveUnitLabel(unit),
      expeditionDate: toScalarString(payload.expeditionDate)
    };
  } catch (error) {
    // Falha de banco vira `null`, e `null` recusa a emissão (fail-closed). Nunca `getManifest`: aquele
    // reconcilia estado e pode acionar o gateway CETESB no meio da montagem de uma prévia.
    console.error(
      `[whatsapp-create-preview] falha ao carregar o manifesto de origem: ${(error as Error)?.message || 'desconhecida'}`
    );
    return null;
  }
}

/** Resíduo da origem é INFORMATIVO (a âncora de conferência é o número do MTR); best-effort, nunca bloqueia. */
async function resolveSourceResidueLabel(source: SourceManifest): Promise<string | null> {
  if (isHumanName(source.residueDescription, source.residueCode)) {
    return clampLabel(source.residueDescription as string);
  }
  if (source.residueCode) {
    try {
      const resolved = await createPreviewResolvers.resolveResidueLabel({ code: source.residueCode });
      if (isHumanName(resolved, source.residueCode)) return clampLabel(resolved as string);
    } catch (error) {
      console.warn(
        `[whatsapp-create-preview] resíduo da origem não resolvido: ${(error as Error)?.message || 'desconhecida'}`
      );
    }
  }
  return null;
}

export type ReplicateChange = { heading: string; summary: string };

/**
 * A DIFERENÇA aplicada, comparando a origem com o que a pessoa pediu para mudar. Só entra o que MUDA de
 * fato: pedir "quantidade 2 t" numa origem que já é 2 t não é diferença. É esta função que faz a prévia
 * refletir a alteração — se ela ignorasse `overrides`, o teste de mutação da quantidade morre.
 */
export function computeReplicateChanges(
  source: Pick<SourceManifest, 'quantity' | 'unitLabel' | 'expeditionDate'>,
  overrides: ReplicateCreationInput['overrides']
): ReplicateChange[] {
  if (!overrides) return [];
  const changes: ReplicateChange[] = [];

  const newQuantity = toFiniteNumber(overrides.quantity);
  if (newQuantity != null && newQuantity > 0 && newQuantity !== source.quantity) {
    changes.push({
      heading: 'Quantidade',
      summary: `de ${formatQuantity(source.quantity, source.unitLabel)} para ${formatQuantity(newQuantity, source.unitLabel)}`
    });
  }

  const newDate = formatBrDate(overrides.expeditionDate);
  const sourceDate = formatBrDate(source.expeditionDate);
  if (newDate && newDate !== sourceDate) {
    changes.push({
      heading: 'Data de expedicao',
      summary: `de ${sourceDate ?? 'nao informada'} para ${newDate}`
    });
  }

  return changes;
}

function buildReplicatePreviewText(input: {
  originLabel: string;
  residueLabel: string | null;
  changes: ReplicateChange[];
  accountLabel: string | null;
}): string {
  const lines: string[] = ['Confere antes de eu criar (copia de outro MTR):', ''];
  lines.push(`Origem: ${input.originLabel}`);
  if (input.residueLabel) lines.push(`Residuo: ${input.residueLabel}`);

  lines.push('O que muda:');
  if (input.changes.length === 0) {
    lines.push('- nada - seria uma copia identica da origem');
  } else {
    for (const change of input.changes.slice(0, MAX_CONFERIBLE_LINES)) {
      lines.push(`- ${change.heading}: ${change.summary}`);
    }
  }

  if (input.accountLabel) lines.push(`Conta CETESB: ${input.accountLabel}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------------------------
// Modo COMPLETO
// ---------------------------------------------------------------------------------------------

type ConferibleEntity = { heading: string; value: string };

export async function buildCompleteCreatePreview(input: CompleteCreationInput): Promise<CreatePreviewResult> {
  const payload = asRecord(input.payload);
  if (Object.keys(payload).length === 0) {
    return { ok: false, mode: 'complete', blocker: 'empty_payload', unresolved: ['Payload'] };
  }

  const entities: ConferibleEntity[] = [];
  const unresolved: string[] = [];

  // Ordem fixa das 6 entidades — a mesma que a pessoa lê e confere.
  for (const role of ['generator', 'carrier', 'receiver'] as CreatePartnerRole[]) {
    const label = await resolvePartnerEntityLabel(role, asRecord(payload[role]));
    if (label) entities.push({ heading: ROLE_HEADINGS[role], value: label });
    else unresolved.push(ROLE_HEADINGS[role]);
  }

  const residueOutcome = await resolveResidueAndQuantity(payload.residues);
  if (residueOutcome.residue) entities.push({ heading: 'Residuo', value: residueOutcome.residue });
  else unresolved.push('Residuo');
  if (residueOutcome.quantity) entities.push({ heading: 'Quantidade', value: residueOutcome.quantity });
  else unresolved.push('Quantidade');

  const expedition = formatBrDate(toScalarString(payload.expeditionDate));
  if (expedition) entities.push({ heading: 'Data de expedicao', value: expedition });
  else unresolved.push('Data de expedicao');

  // FAIL-CLOSED. Faltando UMA que seja, não há prévia e não há ticket. Afrouxar este teste (emitir com
  // entidades cruas) é exatamente a regressão que a suíte tem de matar.
  if (unresolved.length > 0) {
    return { ok: false, mode: 'complete', blocker: 'unresolved_entities', unresolved: dedupe(unresolved) };
  }

  const text = buildCompletePreviewText(entities, coerceAccountLabel(input.accountLabel));
  const itemLabels = capLines(entities.map((entity) => `${entity.heading}: ${entity.value}`));
  return { ok: true, mode: 'complete', text, itemLabels };
}

async function resolvePartnerEntityLabel(role: CreatePartnerRole, partner: LooseRecord): Promise<string | null> {
  const code = toScalarString(partner.partnerCode);
  const inlineDescription = toScalarString(partner.description);

  // Caminho rápido: o payload já trouxe uma razão social conferível (não é o próprio código cru).
  if (isHumanName(inlineDescription, code)) return clampLabel(inlineDescription as string);

  // Só o código: resolve contra o cadastro. Se ainda assim não virar NOME, é entidade não conferível.
  if (code) {
    try {
      const resolved = await createPreviewResolvers.resolvePartnerLabel({ code, role });
      if (isHumanName(resolved, code)) return clampLabel(resolved as string);
    } catch (error) {
      console.warn(
        `[whatsapp-create-preview] parceiro (${role}) nao resolvido: ${(error as Error)?.message || 'desconhecida'}`
      );
    }
  }
  return null;
}

/**
 * Resíduo + quantidade a partir de `payload.residues`. O canal confere UM resíduo — é o desenho da
 * criação por mensagem. Zero resíduos deixa as duas entidades sem rótulo (fail-closed). MAIS DE UM é
 * recusado de propósito: conferir "o primeiro" e criar N esconde resíduos, que é a falha de "listar 3 e
 * executar 5". Nesse caso o resíduo fica sem rótulo e a criação é recusada.
 */
async function resolveResidueAndQuantity(rawResidues: unknown): Promise<{ residue: string | null; quantity: string | null }> {
  const residues = Array.isArray(rawResidues) ? rawResidues : [];
  if (residues.length !== 1) {
    // 0 → nada a conferir. >1 → não conferível pela prévia de 6 linhas. Ambas ficam sem rótulo.
    return { residue: null, quantity: null };
  }

  const first = asRecord(residues[0]);
  const residueRecord = asRecord(first.residue);
  const unit = asRecord(first.unit);
  const code = toScalarString(residueRecord.code);
  const inlineDescription = toScalarString(residueRecord.description);

  let residueLabel: string | null = null;
  if (isHumanName(inlineDescription, code)) {
    residueLabel = clampLabel(inlineDescription as string);
  } else if (code) {
    try {
      const resolved = await createPreviewResolvers.resolveResidueLabel({ code });
      if (isHumanName(resolved, code)) residueLabel = clampLabel(resolved as string);
    } catch (error) {
      console.warn(
        `[whatsapp-create-preview] resíduo nao resolvido: ${(error as Error)?.message || 'desconhecida'}`
      );
    }
  }

  const quantityValue = toFiniteNumber(first.quantity);
  const unitLabel = resolveUnitLabel(unit);
  const quantityLabel = quantityValue != null && quantityValue > 0
    ? formatQuantity(quantityValue, unitLabel)
    : null;

  return { residue: residueLabel, quantity: quantityLabel };
}

function buildCompletePreviewText(entities: ConferibleEntity[], accountLabel: string | null): string {
  const lines: string[] = ['Confere antes de eu criar o MTR:', ''];
  for (const entity of entities.slice(0, MAX_CONFERIBLE_LINES)) {
    lines.push(`${entity.heading}: ${entity.value}`);
  }
  if (accountLabel) lines.push(`Conta CETESB: ${accountLabel}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------------------------
// Helpers puros
// ---------------------------------------------------------------------------------------------

/**
 * `true` quando `value` é um NOME humano — não um código cru nem um id interno, e não o próprio código.
 * É a peça central do fail-closed: partnerCode "12345" ou id `man_a1b2c3` NÃO passam por aqui, então
 * uma entidade que só tem código é reprovada até resolver contra o cadastro.
 */
export function isHumanName(value: unknown, code?: string | null): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length < 3) return false;
  if (/^\d+$/.test(trimmed)) return false; // só dígitos = código
  if (INTERNAL_ID_PATTERN.test(trimmed)) return false; // id interno
  if (code != null && trimmed === String(code).trim()) return false; // eco do código
  return true;
}

function clampLabel(value: string): string {
  const collapsed = value.trim().replace(/\s+/g, ' ');
  return collapsed.length <= MAX_LABEL_CHARS ? collapsed : `${cutAtGrapheme(collapsed, MAX_LABEL_CHARS - 1)}…`;
}

function capLines(lines: string[]): string[] {
  return lines.slice(0, MAX_CONFERIBLE_LINES).map((line) => clampLabel(line));
}

/**
 * Rótulo humano da unidade: descrição ("tonelada") ou abreviação ("t"). NUNCA o `code` numérico do
 * catálogo CETESB — "3 5" (quantidade + código de unidade) não é conferência, é ruído. Sem rótulo
 * humano a quantidade sai só com o número, que já é conferível.
 */
function resolveUnitLabel(unit: LooseRecord): string | null {
  return toScalarString(unit.description) ?? toScalarString(unit.abbreviation) ?? toScalarString(unit.symbol);
}

function formatQuantity(quantity: number | null, unitLabel: string | null): string {
  if (quantity == null || !Number.isFinite(quantity)) return 'nao informada';
  const asText = Number.isInteger(quantity) ? String(quantity) : String(quantity).replace('.', ',');
  const unit = unitLabel && unitLabel.trim() ? ` ${unitLabel.trim()}` : '';
  return `${asText}${unit}`;
}

function formatBrDate(value: string | null | undefined): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : null;
}

function normalizeResolvedName(value: unknown, code: string): string | null {
  return isHumanName(value, code) ? String(value).trim() : null;
}

function coerceAccountLabel(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asRecord(value: unknown): LooseRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as LooseRecord) : {};
}

function firstItem(value: unknown): unknown {
  return Array.isArray(value) && value.length > 0 ? value[0] : null;
}

function toScalarString(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim().replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}
