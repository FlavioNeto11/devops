/**
 * Guarda de autorização do AI Control Center. Reaproveita o RBAC admin existente
 * (`resolveAdminAccessSummary`: token-role + acesso global no banco) e centraliza
 * o gate de modo somente-leitura e de confirmação para mutações sensíveis.
 */
import { AppError } from '../../lib/problem.js';
import { resolveAdminAccessSummary } from '../access-admin-service.js';
import { isAiControlReadOnly } from './ai-control-config.js';

export type AiControlActor =
  | {
      userId?: string;
      id?: string;
      roles?: unknown[];
      email?: string;
      name?: string;
    }
  | null
  | undefined;

/** Exige admin. Retorna o userId do ator. Lança 401/403 em problem+json. */
export async function ensureAiControlAdmin(actor: AiControlActor): Promise<string> {
  const userId = String(actor?.userId || actor?.id || '').trim();
  if (!userId) {
    throw new AppError(401, 'Unauthorized', 'Sessao SICAT invalida ou ausente.', { code: 'UNAUTHENTICATED' });
  }
  const summary = await resolveAdminAccessSummary(actor);
  if (!summary.allowed) {
    throw new AppError(
      403,
      'Forbidden',
      'Usuario sem permissao administrativa para o AI Control Center.',
      { code: 'ADMIN_REQUIRED' }
    );
  }
  return userId;
}

/** Bloqueia mutações administrativas quando AI_CONTROL_READONLY=true. */
export function assertAiControlWritable(): void {
  if (isAiControlReadOnly()) {
    throw new AppError(
      409,
      'Read-only',
      'AI Control Center em modo somente-leitura (AI_CONTROL_READONLY=true). Mutacoes administrativas estao bloqueadas.',
      { code: 'AI_CONTROL_READONLY' }
    );
  }
}

/** Exige confirmação explícita (`confirmed: true`) para ações destrutivas/sensíveis. */
export function requireConfirmation(confirmed: unknown, message: string): void {
  if (confirmed !== true) {
    throw new AppError(428, 'Confirmation Required', message, { code: 'CONFIRMATION_REQUIRED' });
  }
}
