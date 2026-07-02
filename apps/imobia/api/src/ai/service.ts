// Servico de IA: orquestra + persiste telemetria (AiRun). Fail-soft ponta a ponta.
import { prisma } from '../lib/prisma';
import { orchestrate, cortexClassify, type OrchestrateInput, type OrchestrateResult, type Triage } from './engine';

async function persistAiRun(data: {
  organizationId?: string | null;
  userId?: string | null;
  threadId?: string | null;
  channel?: string | null;
  route?: string;
  specialist?: string | null;
  model?: string | null;
  provider?: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  correlationId?: string | null;
}): Promise<void> {
  try {
    await prisma.aiRun.create({
      data: {
        organizationId: data.organizationId ?? null,
        userId: data.userId ?? null,
        threadId: data.threadId ?? null,
        channel: data.channel ?? null,
        route: data.route ?? 'deep',
        specialist: data.specialist ?? null,
        model: data.model ?? null,
        provider: data.provider ?? null,
        inputTokens: data.inputTokens,
        outputTokens: data.outputTokens,
        costUsd: data.costUsd,
        latencyMs: data.latencyMs,
        correlationId: data.correlationId ?? null,
      },
    });
  } catch (err) {
    console.error('[imobia] persistAiRun falhou (fail-soft):', (err as Error).message);
  }
}

export interface AiContext {
  organizationId?: string | null;
  userId?: string | null;
  channel?: string | null;
  threadId?: string | null;
}

/** Turno de chat orquestrado + telemetria. */
export async function runChat(ctx: AiContext, input: OrchestrateInput): Promise<OrchestrateResult> {
  const result = await orchestrate(input);
  if (!result.dormant) {
    await persistAiRun({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      threadId: ctx.threadId,
      channel: ctx.channel,
      specialist: result.specialist,
      model: result.model,
      provider: result.provider,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      costUsd: result.costUsd,
      latencyMs: result.latencyMs,
    });
  }
  return result;
}

export async function runTriage(message: string): Promise<Triage> {
  return cortexClassify(message);
}
