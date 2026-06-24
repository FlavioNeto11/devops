// services/consultations-service.js — regra de negócio de agendamentos.
import { createConsultation, findScheduleConflict } from '../repositories/consultations-repo.js';
import { findIdempotency, saveIdempotency } from '../repositories/idempotency-repo.js';
import { insertAuditLog } from '../repositories/audit-repo.js';
import { chargeConsultation } from './payments-service.js';

export async function scheduleConsultation({ tenantId, patientId, professionalId, scheduledAt, scheduledEndAt, amountCents, currency, idempotencyKey, actor, paymentMethodToken }) {
  if (idempotencyKey) {
    const cached = await findIdempotency('schedule_consultation', idempotencyKey);
    if (cached) return { fromCache: true, ...cached };
  }

  const conflict = await findScheduleConflict(professionalId, scheduledAt, scheduledEndAt);
  if (conflict) {
    const err = new Error('Profissional já possui consulta neste horário');
    err.code = 'SCHEDULE_CONFLICT';
    err.statusCode = 409;
    throw err;
  }

  const consultation = await createConsultation({
    tenantId, patientId, professionalId, scheduledAt, scheduledEndAt, amountCents, currency, createdBy: actor,
  });

  let payment = null;
  if (paymentMethodToken) {
    const payKey = idempotencyKey ? `pay:${idempotencyKey}` : `pay:consultation:${consultation.id}`;
    payment = await chargeConsultation({
      tenantId,
      consultationId: consultation.id,
      amountCents,
      currency,
      paymentMethodToken,
      idempotencyKey: payKey,
      actor,
    }).catch(() => null);
  }

  await insertAuditLog({
    tenantId,
    entityType: 'consultation',
    entityId: String(consultation.id),
    action: 'consultation.created',
    actor,
    amountCents,
    paymentStatus: payment?.status ?? 'pending',
    gateway: payment?.provider ?? null,
    metadata: { patientId, professionalId, scheduledAt },
  }).catch(() => {});

  const result = { ...consultation, payment };

  if (idempotencyKey) {
    await saveIdempotency({
      operation: 'schedule_consultation',
      idempotencyKey,
      entityType: 'consultation',
      entityId: String(consultation.id),
      response: result,
    }).catch(() => {});
  }

  return result;
}
