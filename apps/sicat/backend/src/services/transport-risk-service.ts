/**
 * Gerenciamento de Riscos operacional (PR-I5, REQ-SICAT-0036): pesquisa cadastral de motorista/
 * veículo e confirmação de rastreamento por operação.
 *
 * DESENHO — por que a pesquisa é SÍNCRONA (e não um job, como averbação/CIOT):
 * a pesquisa cadastral é uma CONSULTA (não muda estado no provedor), o operador está na tela
 * esperando o veredito para decidir se libera a viagem, e o resultado é imediato. O que o DL-102
 * protege — dispatch acontecido com resposta perdida — continua honrado: o `correlationMarker` é
 * gravado ANTES da chamada, resposta perdida deixa a linha em `request_unconfirmed`, e a varredura
 * periódica (`enqueueTransporteRiskScreeningReconcileSweepIfNeeded`) pergunta ao provedor pelo
 * marcador. Nenhuma consulta é "refeita às cegas": `queryByMarker` é a fonte da verdade.
 */

import { AppError } from '../lib/problem.js';
import { createCorrelationId, createPrefixedId } from '../lib/ids.js';
import { config } from '../lib/config.js';
import { createRiskScreeningGateway } from '../gateways/risk-screening-gateway.js';
import {
  completeScreening,
  findActiveTrackingConfirmation,
  findLatestValidScreening,
  findScreeningById,
  insertScreening,
  insertTrackingConfirmation,
  listScreeningsForAccount,
  listUnconfirmedScreeningsForReconciliation,
  markScreeningFailed,
  markScreeningUnconfirmed,
  revokeTrackingConfirmation,
  type RiskScreening,
  type RiskScreeningSubjectType
} from '../repositories/risk-management-repo.js';
import { getDriverById } from '../repositories/transport-driver-repo.js';
import { getVehicleById } from '../repositories/transport-vehicle-repo.js';
import { getOperationHeaderById } from '../repositories/transport-operation-repo.js';

type LooseRecord = Record<string, unknown>;

function toTrimmedString(value: unknown): string {
  return String(value ?? '').trim();
}

function requireIntegrationAccountId(source: LooseRecord): string {
  const value = toTrimmedString(source.integrationAccountId);
  if (!value) {
    throw new AppError(400, 'Bad Request', 'integrationAccountId é obrigatório.', {
      code: 'TRANSPORTE_INTEGRATION_ACCOUNT_REQUIRED'
    });
  }
  return value;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Marcador DL-102 da pesquisa — formato `[sicat:<screeningId>]`, molde da averbação. */
export function buildRiskScreeningMarker(screeningId: string): string {
  return `[sicat:${screeningId}]`;
}

/**
 * Solicita a pesquisa cadastral de um motorista OU veículo. O marcador é derivado de um id gerado
 * ANTES da chamada e gravado com a linha — se a resposta se perder, a reconciliação encontra.
 */
export async function solicitarScreeningService(body: LooseRecord) {
  const integrationAccountId = requireIntegrationAccountId(body);
  const subjectType = toTrimmedString(body.subjectType) as RiskScreeningSubjectType;
  if (subjectType !== 'driver' && subjectType !== 'vehicle') {
    throw new AppError(400, 'Bad Request', "subjectType deve ser 'driver' ou 'vehicle'.", {
      code: 'TRANSPORTE_GR_SUBJECT_TYPE_INVALID'
    });
  }

  const driverId = toTrimmedString(body.driverId) || null;
  const vehicleId = toTrimmedString(body.vehicleId) || null;
  const referenceDate = toTrimmedString(body.referenceDate) || todayIsoDate();

  let identifier = '';
  if (subjectType === 'driver') {
    if (!driverId) {
      throw new AppError(400, 'Bad Request', 'driverId é obrigatório para pesquisa de motorista.', {
        code: 'TRANSPORTE_GR_DRIVER_REQUIRED'
      });
    }
    const driver = await getDriverById(driverId, integrationAccountId);
    if (!driver) {
      throw new AppError(404, 'Not Found', `Motorista ${driverId} não encontrado nesta conta.`, {
        code: 'TRANSPORTE_DRIVER_NOT_FOUND'
      });
    }
    identifier = String(driver.partyDocumentNumber || driver.cnhNumber || '');
  } else {
    if (!vehicleId) {
      throw new AppError(400, 'Bad Request', 'vehicleId é obrigatório para pesquisa de veículo.', {
        code: 'TRANSPORTE_GR_VEHICLE_REQUIRED'
      });
    }
    const vehicle = await getVehicleById(vehicleId, integrationAccountId);
    if (!vehicle) {
      throw new AppError(404, 'Not Found', `Veículo ${vehicleId} não encontrado nesta conta.`, {
        code: 'TRANSPORTE_VEHICLE_NOT_FOUND'
      });
    }
    identifier = String(vehicle.plate || '');
  }

  // Cria o gateway ANTES de gravar: `off` recusa aqui (501) e nada é persistido — pesquisa que não
  // vai acontecer não deve deixar linha "requesting" órfã no banco.
  const gateway = createRiskScreeningGateway();
  const correlationId = createCorrelationId();
  const screeningId = createPrefixedId('riskscr');
  const correlationMarker = buildRiskScreeningMarker(screeningId);

  const screening = await insertScreening({
    integrationAccountId,
    subjectType,
    driverId: subjectType === 'driver' ? driverId : null,
    vehicleId: subjectType === 'vehicle' ? vehicleId : null,
    provider: gateway.mode,
    correlationMarker,
    requestedBy: toTrimmedString(body.requestedBy) || null,
    correlationId
  });

  try {
    const result = subjectType === 'driver'
      ? await gateway.screenDriver({
        correlationMarker,
        driverDocument: identifier,
        cnhNumber: toTrimmedString(body.cnhNumber),
        referenceDate
      })
      : await gateway.screenVehicle({
        correlationMarker,
        plate: identifier,
        renavam: toTrimmedString(body.renavam) || null,
        referenceDate
      });

    const completed = await completeScreening({
      id: screening.id,
      outcome: result.outcome,
      validUntil: result.validUntil,
      result: { ...result.raw, screeningRef: result.screeningRef }
    });
    return completed || screening;
  } catch (error) {
    // Resposta perdida DEPOIS do dispatch: a linha vira `request_unconfirmed` e a sweep resolve.
    // Erro de configuração/validação do provedor derruba para `failed` (nada a reconciliar).
    const code = (error as { code?: string })?.code;
    if (code === 'RISK_SCREENING_LOST_RESPONSE_TEST') {
      await markScreeningUnconfirmed(screening.id);
      const refreshed = await findScreeningById(screening.id, integrationAccountId);
      return refreshed || screening;
    }
    await markScreeningFailed(screening.id);
    throw error;
  }
}

export async function listScreeningsService(query: LooseRecord) {
  const integrationAccountId = requireIntegrationAccountId(query);
  const subjectType = toTrimmedString(query.subjectType) as RiskScreeningSubjectType | '';
  const items = await listScreeningsForAccount({
    integrationAccountId,
    subjectType: subjectType || null,
    driverId: toTrimmedString(query.driverId) || null,
    vehicleId: toTrimmedString(query.vehicleId) || null,
    limit: Number(query.limit || 100)
  });
  return { items, total: items.length };
}

export async function getScreeningService(screeningId: string, query: LooseRecord) {
  const integrationAccountId = requireIntegrationAccountId(query);
  const screening = await findScreeningById(toTrimmedString(screeningId), integrationAccountId);
  if (!screening) {
    throw new AppError(404, 'Not Found', `Pesquisa ${screeningId} não encontrada nesta conta.`, {
      code: 'TRANSPORTE_GR_SCREENING_NOT_FOUND'
    });
  }
  return screening;
}

/** Reconciliação da resposta perdida — chamada pela sweep do worker. */
export async function reconcileRiskScreening(screening: RiskScreening): Promise<void> {
  const gateway = createRiskScreeningGateway();
  const answer = await gateway.queryByMarker({ correlationMarker: screening.correlationMarker });
  if (!answer.found) {
    await markScreeningFailed(screening.id);
    return;
  }
  await completeScreening({
    id: screening.id,
    outcome: answer.outcome,
    validUntil: answer.validUntil,
    result: { ...answer.raw, screeningRef: answer.screeningRef, reconciled: true }
  });
}

export async function listUnconfirmedScreenings(updatedSince: string): Promise<RiskScreening[]> {
  return listUnconfirmedScreeningsForReconciliation({ updatedSince });
}

// -------------------------------------------------------------------------------------------------
// Rastreamento
// -------------------------------------------------------------------------------------------------

export async function confirmarRastreamentoService(operationId: string, body: LooseRecord) {
  const integrationAccountId = requireIntegrationAccountId(body);
  const operation = await getOperationHeaderById(toTrimmedString(operationId), integrationAccountId);
  if (!operation) {
    throw new AppError(404, 'Not Found', `Operação ${operationId} não encontrada nesta conta.`, {
      code: 'TRANSPORTE_OPERATION_NOT_FOUND'
    });
  }

  const existing = await findActiveTrackingConfirmation(operation.id);
  if (existing) return existing; // idempotente: já confirmado é NO-OP

  return insertTrackingConfirmation({
    integrationAccountId,
    operationId: operation.id,
    vehicleId: toTrimmedString(body.vehicleId) || null,
    trackerProvider: toTrimmedString(body.trackerProvider) || null,
    evidence: (body.evidence && typeof body.evidence === 'object' ? body.evidence : {}) as Record<string, unknown>,
    correlationId: createCorrelationId()
  });
}

export async function getRastreamentoService(operationId: string, query: LooseRecord) {
  const integrationAccountId = requireIntegrationAccountId(query);
  const operation = await getOperationHeaderById(toTrimmedString(operationId), integrationAccountId);
  if (!operation) {
    throw new AppError(404, 'Not Found', `Operação ${operationId} não encontrada nesta conta.`, {
      code: 'TRANSPORTE_OPERATION_NOT_FOUND'
    });
  }
  const confirmation = await findActiveTrackingConfirmation(operation.id);
  return { operationId: operation.id, confirmation: confirmation || null };
}

export async function revogarRastreamentoService(confirmationId: string, body: LooseRecord) {
  const integrationAccountId = requireIntegrationAccountId(body);
  const revoked = await revokeTrackingConfirmation(toTrimmedString(confirmationId), integrationAccountId);
  if (!revoked) {
    throw new AppError(404, 'Not Found', `Confirmação ${confirmationId} não encontrada ou já revogada.`, {
      code: 'TRANSPORTE_GR_TRACKING_NOT_FOUND'
    });
  }
  return revoked;
}

/** Contexto do gate TR-GR-001 — a pesquisa válida mais recente de cada alvo. */
export async function findValidScreeningForTarget(opts: {
  subjectType: RiskScreeningSubjectType;
  targetId: string;
  referenceDate: string;
}): Promise<RiskScreening | null> {
  return findLatestValidScreening(opts);
}

/** Exposto para o gate TR-GR-002. */
export async function findTrackingConfirmationForOperation(operationId: string) {
  return findActiveTrackingConfirmation(operationId);
}

export function riskScreeningEnabled(): boolean {
  return config.riskScreeningMode === 'sandbox';
}
