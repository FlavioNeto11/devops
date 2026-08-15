/**
 * Service da camada fiscal do Transporte — importação/validação/vínculo de DF-e (NF-e/CT-e/MDF-e),
 * PR-E1, DL-103.
 *
 * TUDO SÍNCRONO (200/201) — parsing local, SEM chamada à SEFAZ (emissão fica na Fase G, via
 * `fiscal-kit`, atrás de flag). Fronteira `route → service → repository` (sem job/worker/gateway
 * nesta camada — não há "resposta que nasce depois", o XML já chega pronto no request).
 *
 * Pipeline de `importarDocumentoFiscal`: parse (`dfe-parser.ts`, puro) → dedupe por
 * `(integrationAccountId, accessKey)` → resolve a entrada VIGENTE do schema registry na data de
 * EMISSÃO do documento (`dfe-schema-registry-repo.ts`, mesmo predicado temporal do catálogo
 * regulatório) → valida (`dfe-validator.ts`, puro — já usa o contexto da operação quando
 * `operationId` é informado no próprio import) → grava o XML em
 * `STORAGE_DIR/transporte-dfe/<hash>.xml` (nunca em coluna jsonb) → persiste `fiscal_documents` +
 * eventos (`imported`, `validated`, e `linked_to_operation` quando aplicável) + `fiscal_document_links`
 * resolvidos automaticamente (chaves referenciadas no XML já importadas antes) — tudo NUMA transação.
 *
 * `vincular`/`revalidar` reabrem esse pipeline PARCIALMENTE: `vincular` roda só o cross-check
 * CIOT↔MDF-e (`MDFE_CIOT_MISMATCH`) e o side-effect VPO↔MDF-e sobre o snapshot JÁ EXTRAÍDO (sem
 * reler o XML); `revalidar` relê o XML do storage e roda o pipeline de validação INTEIRO de novo
 * contra o registry/operação ATUAIS — mas NUNCA reescreve `xml_storage_ref`/`xml_hash`/campos
 * extraídos do documento original (`ciot_numbers`/`vpo_references` inclusive — são parte do
 * snapshot da importação, não da validação).
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import type { PoolClient } from 'pg';

import { AppError } from '../lib/problem.js';
import { createPrefixedId } from '../lib/ids.js';
import { withTransaction } from '../db/pool.js';
import { ensureDir, resolveStoragePath } from '../lib/files.js';
import { DfeParseError, parseDfeXml, type ParsedDfeDocument } from '../lib/transport/dfe-parser.js';
import {
  deriveValidationStatus,
  extractReferencedDocuments,
  validateDfeDocument,
  type DfeValidationContext
} from '../lib/transport/dfe-validator.js';
import type {
  DfeSchemaRegistryEntry,
  DfeValidationIssue,
  FiscalAuthorizationStatus,
  FiscalDocument,
  FiscalDocumentLink,
  FiscalDocumentLinkType,
  FiscalDocumentType,
  FiscalValidationStatus
} from '../lib/transport/dfe-types.js';
import { findActiveSchemaRegistryEntry } from '../repositories/dfe-schema-registry-repo.js';
import {
  findFiscalDocumentByAccessKey,
  findFiscalDocumentById,
  findFiscalDocumentsByAccessKeys,
  insertFiscalDocument,
  insertFiscalDocumentEvent,
  insertFiscalDocumentLink,
  linkFiscalDocumentToOperation,
  listFiscalDocumentLinksForDocument,
  listFiscalDocumentsForOperation,
  unlinkFiscalDocumentFromOperation,
  updateFiscalDocumentValidation
} from '../repositories/transport-fiscal-repo.js';
import { getOperationAggregateById, getOperationHeaderById } from '../repositories/transport-operation-repo.js';
import { findLatestCiotOperationForOperation } from '../repositories/ciot-repo.js';
import type { CiotOperation } from '../lib/transport/ciot-types.js';
import {
  findVpoAllocationByOperationId,
  insertVpoEvent,
  setVpoAllocationMdfeReference
} from '../repositories/vpo-repo.js';
import type { VpoAllocation } from '../lib/transport/vpo-types.js';
import type { TransportOperationAggregate } from '../lib/transport/transport-operation-types.js';

type LooseRecord = Record<string, unknown>;

const DFE_STORAGE_SUBDIR = 'transporte-dfe';

export type TransportFiscalCommandContext = { correlationId: string; evaluatedBy?: string | null };

// =============================================================================
// Helpers locais — deliberadamente não compartilhados com transport-operation-service.ts (mesmo
// molde de transport-ciot-service.ts/transport-vpo-service.ts: cada service da vertical duplica o
// mínimo de validação de entrada).
// =============================================================================

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function requireNonEmptyString(value: unknown, detail: string, code: string): string {
  const normalized = toTrimmedString(value);
  if (!normalized) throw new AppError(400, 'Bad Request', detail, { code });
  return normalized;
}

function requireIntegrationAccountId(source: LooseRecord): string {
  return requireNonEmptyString(
    source.integrationAccountId,
    'integrationAccountId é obrigatório.',
    'TRANSPORT_OPERATION_FIELD_REQUIRED'
  );
}

function requireOptionalVersion(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const version = Number(value);
  if (!Number.isFinite(version) || !Number.isInteger(version) || version < 1) {
    throw new AppError(400, 'Bad Request', 'version deve ser um inteiro >= 1 quando informado.', {
      code: 'TRANSPORTE_DFE_FIELD_REQUIRED'
    });
  }
  return version;
}

function operationNotFound(operationId: string): AppError {
  return new AppError(404, 'Not Found', `Operação de transporte ${operationId} não encontrada.`, {
    code: 'TRANSPORT_OPERATION_NOT_FOUND'
  });
}

function documentNotFound(documentId: string): AppError {
  return new AppError(404, 'Not Found', `Documento fiscal ${documentId} não encontrado.`, {
    code: 'TRANSPORTE_DFE_NOT_FOUND'
  });
}

/** Hoje em 'YYYY-MM-DD' no fuso LOCAL do processo — mesmo padrão de `transport-compliance-service.ts`. */
function todayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// =============================================================================
// Storage — XML NUNCA em coluna jsonb (storage_ref + hash, molde manifest-service.ts).
// =============================================================================

function computeXmlHash(xmlContent: string): string {
  return createHash('sha256').update(xmlContent, 'utf8').digest('hex');
}

async function writeDfeXmlToStorage(xmlHash: string, xmlContent: string): Promise<string> {
  await ensureDir(resolveStoragePath(DFE_STORAGE_SUBDIR));
  await fs.writeFile(resolveStoragePath(DFE_STORAGE_SUBDIR, `${xmlHash}.xml`), xmlContent, 'utf8');
  return `${DFE_STORAGE_SUBDIR}/${xmlHash}.xml`;
}

async function readDfeXmlFromStorage(xmlHash: string): Promise<string> {
  return fs.readFile(resolveStoragePath(DFE_STORAGE_SUBDIR, `${xmlHash}.xml`), 'utf8');
}

// =============================================================================
// Parse + resolução do schema registry
// =============================================================================

function parseXmlOrThrow(xmlContent: string): ParsedDfeDocument {
  try {
    return parseDfeXml(xmlContent);
  } catch (error: unknown) {
    if (error instanceof DfeParseError) {
      throw new AppError(400, 'Bad Request', error.message, { code: error.code });
    }
    throw error;
  }
}

/** Entrada VIGENTE do registry na data de EMISSÃO do documento (não na data de importação). `null` quando o layout não está no registry. */
async function resolveRegistryEntryForParsed(parsed: ParsedDfeDocument): Promise<DfeSchemaRegistryEntry | null> {
  if (!parsed.layoutVersion) return null;
  const referenceDate = parsed.issuedAt ? parsed.issuedAt.slice(0, 10) : todayIsoDate();
  return findActiveSchemaRegistryEntry(parsed.documentType, parsed.layoutVersion, referenceDate);
}

// =============================================================================
// Contexto de validação a partir da operação vinculada (recorte — o validador nunca lê banco)
// =============================================================================

function isAggregateRemunerated(aggregate: TransportOperationAggregate): boolean {
  const { freightOfferedAmount, freightContractedAmount } = aggregate.operation;
  return (freightOfferedAmount != null && freightOfferedAmount > 0) || (freightContractedAmount != null && freightContractedAmount > 0);
}

function ciotNumberIfRegistered(ciotOperation: CiotOperation | null): string | null {
  if (!ciotOperation) return null;
  if (ciotOperation.status === 'registered' || ciotOperation.status === 'rectified') return ciotOperation.ciotNumber;
  return null;
}

function buildValidationContext(
  aggregate: TransportOperationAggregate | null,
  ciotOperation: CiotOperation | null
): DfeValidationContext {
  if (!aggregate) return {};
  return {
    remunerated: isAggregateRemunerated(aggregate),
    partyDocuments: aggregate.parties.map((party) => (party.partySnapshot?.documentNumber as string | null | undefined) ?? null),
    route: aggregate.route ? { originUf: aggregate.route.originUf, destinationUf: aggregate.route.destinationUf } : null,
    tollExpected: aggregate.route?.tollExpected ?? null,
    linkedCiotNumber: ciotNumberIfRegistered(ciotOperation)
  };
}

// =============================================================================
// Snapshot extraído do XML — congelado na importação, nunca recomputado por revalidar/cross-check.
// =============================================================================

function extractCiotNumbers(parsed: ParsedDfeDocument): string[] {
  return parsed.mdfe?.ciots.map((entry) => entry.ciotNumber) ?? [];
}

function extractVpoReferences(parsed: ParsedDfeDocument): Record<string, unknown>[] {
  if (!parsed.mdfe || !parsed.mdfe.toll.hasValePedagio) return [];
  return [{ categories: parsed.mdfe.toll.categories }];
}

// =============================================================================
// fiscal_document_links — resolvidos automaticamente na importação
// =============================================================================

function resolveLinkType(parentType: FiscalDocumentType, referencedType: FiscalDocumentType): FiscalDocumentLinkType | null {
  if (parentType === 'CTE' && referencedType === 'NFE') return 'nfe_in_cte';
  if (parentType === 'MDFE' && referencedType === 'CTE') return 'cte_in_mdfe';
  if (parentType === 'MDFE' && referencedType === 'NFE') return 'nfe_in_mdfe';
  return null;
}

async function persistReferencedDocumentLinks(
  document: FiscalDocument,
  parsed: ParsedDfeDocument,
  client: PoolClient
): Promise<void> {
  const referenced = extractReferencedDocuments(parsed);
  if (referenced.length === 0) return;

  const accessKeys = [...new Set(referenced.map((entry) => entry.accessKey))];
  const existingDocs = await findFiscalDocumentsByAccessKeys(document.integrationAccountId, accessKeys, client);
  const byAccessKey = new Map(existingDocs.map((entry) => [entry.accessKey, entry]));

  for (const ref of referenced) {
    const linkedDoc = byAccessKey.get(ref.accessKey);
    if (!linkedDoc) continue; // documento referenciado ainda não foi importado — nada a vincular ainda
    const linkType = resolveLinkType(document.documentType, linkedDoc.documentType);
    if (!linkType) continue;
    await insertFiscalDocumentLink(
      { id: createPrefixedId('dfelink'), documentId: document.id, linkedDocumentId: linkedDoc.id, linkType },
      client
    );
  }
}

// =============================================================================
// Cross-check CIOT↔MDF-e e side-effect VPO↔MDF-e (TR-CIOT-005/TR-VPO-004)
// =============================================================================

/** `MDFE_CIOT_MISMATCH` contra o `ciot_numbers` JÁ EXTRAÍDO (sem reler o XML) — usado por `vincular` (o import já cobre isso via `buildValidationContext` quando `operationId` chega no próprio request). */
function computeCiotMismatchIssue(document: FiscalDocument, ciotOperation: CiotOperation | null): DfeValidationIssue | null {
  if (document.documentType !== 'MDFE') return null;
  const linkedCiotNumber = ciotNumberIfRegistered(ciotOperation);
  if (!linkedCiotNumber || document.ciotNumbers.includes(linkedCiotNumber)) return null;

  return {
    severity: 'error',
    code: 'MDFE_CIOT_MISMATCH',
    message: `CIOT registrado na operação (${linkedCiotNumber}) não aparece no infCIOT do MDF-e importado `
      + `(${document.ciotNumbers.join(', ') || 'nenhum CIOT no XML'}).`
  };
}

/** `vpo_allocations.mdfe_reference` — só quando o MDF-e tem indício de vale-pedágio E a alocação já foi ADQUIRIDA. Idempotente (não regrava o mesmo valor, não reemite evento). */
async function applyVpoMdfeReferenceSideEffect(
  document: Pick<FiscalDocument, 'documentType' | 'vpoReferences' | 'accessKey'>,
  vpoAllocation: VpoAllocation | null,
  correlationId: string
): Promise<void> {
  if (document.documentType !== 'MDFE' || document.vpoReferences.length === 0) return;
  if (!vpoAllocation || vpoAllocation.status !== 'acquired') return;
  if (vpoAllocation.mdfeReference === document.accessKey) return;

  const updated = await setVpoAllocationMdfeReference(vpoAllocation.id, document.accessKey);
  if (!updated) return;

  await insertVpoEvent({
    id: createPrefixedId('vpoev'),
    vpoAllocationId: vpoAllocation.id,
    eventType: 'evidence_attached',
    detail: { mdfeReference: document.accessKey, source: 'transporte-dfe' },
    correlationId
  });
}

/** Roda o cross-check CIOT↔MDF-e + o side-effect VPO↔MDF-e sobre um documento JÁ VINCULADO. Usado por `vincular`. */
async function applyMdfeOperationCrossChecks(
  document: FiscalDocument,
  integrationAccountId: string,
  correlationId: string
): Promise<FiscalDocument> {
  if (document.documentType !== 'MDFE' || !document.operationId) return document;

  const [ciotOperation, vpoAllocation] = await Promise.all([
    findLatestCiotOperationForOperation(document.operationId, integrationAccountId),
    findVpoAllocationByOperationId(document.operationId, integrationAccountId)
  ]);

  let result = document;
  const mismatchIssue = computeCiotMismatchIssue(document, ciotOperation);
  const baseIssues = document.validationIssues.filter((entry) => entry.code !== 'MDFE_CIOT_MISMATCH');
  const mergedIssues = mismatchIssue ? [...baseIssues, mismatchIssue] : baseIssues;
  const issuesChanged = mergedIssues.length !== document.validationIssues.length
    || mergedIssues.some((entry, index) => entry.code !== document.validationIssues[index]?.code);

  if (issuesChanged) {
    const validationStatus = deriveValidationStatus(mergedIssues);
    const updated = await updateFiscalDocumentValidation(document.id, integrationAccountId, {
      validationStatus,
      validationIssues: mergedIssues
    });
    if (updated) result = updated;
  }

  await applyVpoMdfeReferenceSideEffect(result, vpoAllocation, correlationId);
  return result;
}

// =============================================================================
// DTO (contrato)
// =============================================================================

export type FiscalDocumentLinkResource = {
  id: string;
  linkedDocumentId: string;
  linkType: FiscalDocumentLinkType;
  createdAt: string;
};

export type FiscalDocumentResource = {
  id: string;
  operationId: string | null;
  documentType: FiscalDocumentType;
  accessKey: string;
  layoutVersion: string | null;
  schemaRegistryId: string | null;
  authorizationStatus: FiscalAuthorizationStatus;
  protocol: string | null;
  issuedAt: string | null;
  issuerDocument: string | null;
  issuerName: string | null;
  recipientDocument: string | null;
  recipientName: string | null;
  totalAmount: number | null;
  validationStatus: FiscalValidationStatus;
  validationIssues: DfeValidationIssue[];
  ciotNumbers: string[];
  /** Referência INTERNA de storage — nunca o XML em si (`xmlContent` não existe neste DTO). */
  xmlStorageRef: string;
  xmlHash: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  links?: FiscalDocumentLinkResource[];
};

function toFiscalDocumentLinkResource(link: FiscalDocumentLink): FiscalDocumentLinkResource {
  return { id: link.id, linkedDocumentId: link.linkedDocumentId, linkType: link.linkType, createdAt: link.createdAt };
}

function toFiscalDocumentResource(document: FiscalDocument, links?: FiscalDocumentLink[]): FiscalDocumentResource {
  return {
    id: document.id,
    operationId: document.operationId,
    documentType: document.documentType,
    accessKey: document.accessKey,
    layoutVersion: document.layoutVersion,
    schemaRegistryId: document.schemaRegistryId,
    authorizationStatus: document.authorizationStatus,
    protocol: document.protocol,
    issuedAt: document.issuedAt,
    issuerDocument: document.issuerDocument,
    issuerName: document.issuerName,
    recipientDocument: document.recipientDocument,
    recipientName: document.recipientName,
    totalAmount: document.totalAmount,
    validationStatus: document.validationStatus,
    validationIssues: document.validationIssues,
    ciotNumbers: document.ciotNumbers,
    xmlStorageRef: document.xmlStorageRef,
    xmlHash: document.xmlHash,
    version: document.version,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    ...(links ? { links: links.map(toFiscalDocumentLinkResource) } : {})
  };
}

// =============================================================================
// POST /v1/transporte/documentos-fiscais/importar — SÍNCRONO, 201.
// =============================================================================

export async function importarDocumentoFiscal(
  body: LooseRecord,
  ctx: TransportFiscalCommandContext
): Promise<FiscalDocumentResource> {
  const integrationAccountId = requireIntegrationAccountId(body);
  const xmlContent = requireNonEmptyString(body.xmlContent, 'xmlContent é obrigatório.', 'TRANSPORTE_DFE_FIELD_REQUIRED');
  const operationIdInput = toTrimmedString(body.operationId);

  const parsed = parseXmlOrThrow(xmlContent);

  // A DB CHECK constraint (chk_dfe_access_key_format) exige EXATAMENTE 44 dígitos numéricos — uma
  // chave fora desse formato é estruturalmente impossível de armazenar, então falha aqui como 400
  // (não como um DfeValidationIssue, que pressupõe uma linha gravável). Chave com 44 dígitos mas DV/
  // modelo/CNPJ incoerentes É gravável — vira DFE_ACCESS_KEY_MISMATCH em validation_issues.
  if (!/^\d{44}$/.test(parsed.accessKey)) {
    throw new AppError(
      400,
      'Bad Request',
      `Chave de acesso "${parsed.accessKey}" não tem 44 dígitos numéricos — documento não pode ser importado.`,
      { code: 'DFE_ACCESS_KEY_MISMATCH' }
    );
  }

  const existing = await findFiscalDocumentByAccessKey(integrationAccountId, parsed.accessKey);
  if (existing) {
    throw new AppError(
      409,
      'Conflict',
      `Documento fiscal com a chave de acesso ${parsed.accessKey} já foi importado nesta conta (id ${existing.id}).`,
      // `errors` (não `context`) porque é o único campo extra que `error-handler.ts#createProblem`
      // de fato serializa no corpo problem+json — `context` fica só no objeto AppError em memória.
      { code: 'DFE_ALREADY_IMPORTED', errors: { existingId: existing.id } }
    );
  }

  let aggregate: TransportOperationAggregate | null = null;
  let ciotOperation: CiotOperation | null = null;
  let vpoAllocation: VpoAllocation | null = null;
  if (operationIdInput) {
    aggregate = await getOperationAggregateById(operationIdInput, integrationAccountId);
    if (!aggregate) throw operationNotFound(operationIdInput);
    [ciotOperation, vpoAllocation] = await Promise.all([
      findLatestCiotOperationForOperation(operationIdInput, integrationAccountId),
      findVpoAllocationByOperationId(operationIdInput, integrationAccountId)
    ]);
  }

  const registryEntry = await resolveRegistryEntryForParsed(parsed);
  const context = buildValidationContext(aggregate, ciotOperation);
  const issues = validateDfeDocument(parsed, registryEntry, context);
  const validationStatus = deriveValidationStatus(issues);

  const xmlHash = computeXmlHash(xmlContent);
  const xmlStorageRef = await writeDfeXmlToStorage(xmlHash, xmlContent);

  const ciotNumbers = extractCiotNumbers(parsed);
  const vpoReferences = extractVpoReferences(parsed);

  const document = await withTransaction(async (client) => {
    const inserted = await insertFiscalDocument(
      {
        id: createPrefixedId('dfe'),
        integrationAccountId,
        operationId: operationIdInput,
        documentType: parsed.documentType,
        accessKey: parsed.accessKey,
        xmlStorageRef,
        xmlHash,
        layoutVersion: parsed.layoutVersion,
        schemaRegistryId: registryEntry?.id ?? null,
        authorizationStatus: parsed.authorizationStatus,
        protocol: parsed.protocol,
        issuedAt: parsed.issuedAt,
        issuerDocument: parsed.issuer.document,
        issuerName: parsed.issuer.name,
        recipientDocument: parsed.recipient.document,
        recipientName: parsed.recipient.name,
        totalAmount: parsed.totalAmount,
        validationStatus,
        validationIssues: issues,
        ciotNumbers,
        vpoReferences,
        correlationId: ctx.correlationId
      },
      client
    );

    await insertFiscalDocumentEvent(
      {
        id: createPrefixedId('dfeev'),
        documentId: inserted.id,
        eventType: 'imported',
        detail: {
          documentType: inserted.documentType,
          accessKey: inserted.accessKey,
          layoutVersion: inserted.layoutVersion,
          schemaRegistryId: inserted.schemaRegistryId,
          xmlHash: inserted.xmlHash
        },
        correlationId: ctx.correlationId
      },
      client
    );

    await insertFiscalDocumentEvent(
      {
        id: createPrefixedId('dfeev'),
        documentId: inserted.id,
        eventType: 'validated',
        detail: { validationStatus: inserted.validationStatus, issues: issues.map((entry) => entry.code) },
        correlationId: ctx.correlationId
      },
      client
    );

    await persistReferencedDocumentLinks(inserted, parsed, client);

    if (operationIdInput) {
      await insertFiscalDocumentEvent(
        {
          id: createPrefixedId('dfeev'),
          documentId: inserted.id,
          eventType: 'linked_to_operation',
          detail: { operationId: operationIdInput },
          correlationId: ctx.correlationId
        },
        client
      );
    }

    return inserted;
  });

  await applyVpoMdfeReferenceSideEffect(document, vpoAllocation, ctx.correlationId);

  return toFiscalDocumentResource(document);
}

// =============================================================================
// POST /v1/transporte/documentos-fiscais/{documentId}/vincular — SÍNCRONO, 200.
// =============================================================================

export async function vincularDocumentoFiscal(
  documentId: string,
  body: LooseRecord,
  ctx: TransportFiscalCommandContext
): Promise<FiscalDocumentResource> {
  const integrationAccountId = requireIntegrationAccountId(body);
  const operationId = requireNonEmptyString(body.operationId, 'operationId é obrigatório.', 'TRANSPORTE_DFE_FIELD_REQUIRED');
  const expectedVersion = requireOptionalVersion(body.version);

  const document = await findFiscalDocumentById(documentId, integrationAccountId);
  if (!document) throw documentNotFound(documentId);

  const operation = await getOperationHeaderById(operationId, integrationAccountId);
  if (!operation) throw operationNotFound(operationId);

  const linked = await linkFiscalDocumentToOperation(documentId, integrationAccountId, operationId, expectedVersion);

  await insertFiscalDocumentEvent({
    id: createPrefixedId('dfeev'),
    documentId,
    eventType: 'linked_to_operation',
    detail: { operationId },
    correlationId: ctx.correlationId
  });

  const withCrossCheck = await applyMdfeOperationCrossChecks(linked, integrationAccountId, ctx.correlationId);
  return toFiscalDocumentResource(withCrossCheck);
}

// =============================================================================
// POST /v1/transporte/documentos-fiscais/{documentId}/desvincular — SÍNCRONO, 200.
// =============================================================================

export async function desvincularDocumentoFiscal(
  documentId: string,
  body: LooseRecord,
  ctx: TransportFiscalCommandContext
): Promise<FiscalDocumentResource> {
  const integrationAccountId = requireIntegrationAccountId(body);
  const expectedVersion = requireOptionalVersion(body.version);

  const document = await findFiscalDocumentById(documentId, integrationAccountId);
  if (!document) throw documentNotFound(documentId);
  const previousOperationId = document.operationId;

  const unlinked = await unlinkFiscalDocumentFromOperation(documentId, integrationAccountId, expectedVersion);

  await insertFiscalDocumentEvent({
    id: createPrefixedId('dfeev'),
    documentId,
    eventType: 'unlinked',
    detail: { previousOperationId },
    correlationId: ctx.correlationId
  });

  return toFiscalDocumentResource(unlinked);
}

// =============================================================================
// POST /v1/transporte/documentos-fiscais/{documentId}/revalidar — SÍNCRONO, 200.
// =============================================================================

export async function revalidarDocumentoFiscal(
  documentId: string,
  body: LooseRecord,
  ctx: TransportFiscalCommandContext
): Promise<FiscalDocumentResource> {
  const integrationAccountId = requireIntegrationAccountId(body);
  const document = await findFiscalDocumentById(documentId, integrationAccountId);
  if (!document) throw documentNotFound(documentId);

  let xmlContent: string;
  try {
    xmlContent = await readDfeXmlFromStorage(document.xmlHash);
  } catch {
    throw new AppError(
      500,
      'Internal Server Error',
      `Falha ao ler o XML armazenado do documento fiscal ${documentId} (storage_ref: ${document.xmlStorageRef}).`,
      { code: 'TRANSPORTE_DFE_STORAGE_UNAVAILABLE' }
    );
  }

  // Reparse do MESMO XML — não confia em nenhum campo já persistido para os inputs da validação
  // (prova que revalidar recalcula de verdade, não só reafirma o que já estava salvo).
  const parsed = parseXmlOrThrow(xmlContent);
  const registryEntry = await resolveRegistryEntryForParsed(parsed);

  let aggregate: TransportOperationAggregate | null = null;
  let ciotOperation: CiotOperation | null = null;
  let vpoAllocation: VpoAllocation | null = null;
  if (document.operationId) {
    aggregate = await getOperationAggregateById(document.operationId, integrationAccountId);
    [ciotOperation, vpoAllocation] = await Promise.all([
      findLatestCiotOperationForOperation(document.operationId, integrationAccountId),
      findVpoAllocationByOperationId(document.operationId, integrationAccountId)
    ]);
  }

  const context = buildValidationContext(aggregate, ciotOperation);
  const issues = validateDfeDocument(parsed, registryEntry, context);
  const validationStatus = deriveValidationStatus(issues);

  const updated = await updateFiscalDocumentValidation(documentId, integrationAccountId, { validationStatus, validationIssues: issues });
  if (!updated) throw documentNotFound(documentId);

  await insertFiscalDocumentEvent({
    id: createPrefixedId('dfeev'),
    documentId,
    eventType: 'revalidated',
    detail: {
      validationStatus,
      previousValidationStatus: document.validationStatus,
      issues: issues.map((entry) => entry.code)
    },
    correlationId: ctx.correlationId
  });

  await applyVpoMdfeReferenceSideEffect(updated, vpoAllocation, ctx.correlationId);

  return toFiscalDocumentResource(updated);
}

// =============================================================================
// GET /v1/transporte/operacoes/{operationId}/documentos-fiscais — 200.
// =============================================================================

export async function getFiscalDocumentsForOperationService(
  operationId: string,
  query: LooseRecord
): Promise<{ items: FiscalDocumentResource[] }> {
  const integrationAccountId = requireIntegrationAccountId(query);
  const operation = await getOperationHeaderById(operationId, integrationAccountId);
  if (!operation) throw operationNotFound(operationId);

  const documents = await listFiscalDocumentsForOperation(operationId, integrationAccountId);
  return { items: documents.map((document) => toFiscalDocumentResource(document)) };
}

// =============================================================================
// GET /v1/transporte/documentos-fiscais/{documentId} — 200, com issues e links.
// =============================================================================

export async function getFiscalDocumentByIdService(
  documentId: string,
  query: LooseRecord
): Promise<FiscalDocumentResource> {
  const integrationAccountId = requireIntegrationAccountId(query);
  const document = await findFiscalDocumentById(documentId, integrationAccountId);
  if (!document) throw documentNotFound(documentId);

  const links = await listFiscalDocumentLinksForDocument(documentId);
  return toFiscalDocumentResource(document, links);
}
