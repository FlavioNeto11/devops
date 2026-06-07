/**
 * Administração do catálogo dinâmico de tools.
 * Mescla defaults de código (tool-registry + schemas) com overrides do banco
 * (ai_tools) e estatísticas operacionais (telemetria conversacional em memória).
 */
import { AppError } from '../../lib/problem.js';
import {
  getRuntimeToolDefinitions,
  refreshRuntimeRegistry,
  bumpRuntimeToolsVersion
} from './ai-runtime-registry-service.js';
import { CONVERSATION_TOOLS } from '../conversation/llm-provider.js';
import { getConversationTelemetrySnapshot } from '../conversation/conversation-observability.js';
import {
  upsertAiToolOverride,
  findAiToolOverride,
  insertAiToolVersion,
  listAiToolVersions,
  type AiToolVersionRecord
} from '../../repositories/ai-tool-admin-repo.js';
import type { AiRiskLevel, AiRuntimeTool, AiRuntimeToolPolicy, AiRuntimeToolStats } from './ai-control-types.js';

const VALID_RISK = new Set<string>(['R1', 'R2', 'R3', 'R4']);
const KNOWN_CHANNELS = new Set<string>(['whatsapp', 'native_chat', 'inapp']);

function buildSchemaMap(): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const tool of CONVERSATION_TOOLS) {
    const name = tool?.function?.name;
    if (typeof name === 'string') {
      map.set(name, tool.function.parameters || {});
    }
  }
  return map;
}

function statsForTool(toolName: string): AiRuntimeToolStats {
  const snapshot = getConversationTelemetrySnapshot();
  const counters = snapshot.operations.tools[toolName];
  if (!counters) {
    return { total: 0, responded: 0, executed: 0, blocked: 0, failed: 0 };
  }
  return {
    total: counters.total,
    responded: counters.responded,
    executed: counters.executed,
    blocked: counters.blocked,
    failed: counters.failed
  };
}

function normalizeRiskLevel(value: unknown, fallback: AiRiskLevel): AiRiskLevel {
  return typeof value === 'string' && VALID_RISK.has(value) ? (value as AiRiskLevel) : fallback;
}

function normalizeChannels(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const normalized = value
    .filter((entry): entry is string => typeof entry === 'string')
    .filter((entry) => KNOWN_CHANNELS.has(entry));
  return normalized.length > 0 ? normalized : fallback;
}

export async function listRuntimeTools(): Promise<AiRuntimeTool[]> {
  const definitions = await getRuntimeToolDefinitions();
  const schemaMap = buildSchemaMap();
  return definitions.map((def) => {
    const schema = schemaMap.get(def.toolName) ?? null;
    return {
      toolName: def.toolName,
      category: def.category,
      objective: def.objective,
      dependencies: def.dependencies,
      enabled: def.enabled,
      source: def.source,
      activeVersion: def.activeVersion,
      hasSchema: Boolean(schema),
      schema,
      policy: def.policy,
      stats: statsForTool(def.toolName)
    };
  });
}

export async function getRuntimeTool(toolName: string): Promise<AiRuntimeTool | null> {
  const tools = await listRuntimeTools();
  return tools.find((tool) => tool.toolName === toolName) ?? null;
}

export type RuntimeToolPatch = {
  enabled?: boolean;
  riskLevel?: string;
  allowChannels?: string[];
  requiresConfirmation?: boolean;
  isAction?: boolean;
  changelog?: string | null;
};

export async function patchRuntimeTool(
  toolName: string,
  patch: RuntimeToolPatch,
  actorUserId: string
): Promise<AiRuntimeTool> {
  const current = await getRuntimeTool(toolName);
  if (!current) {
    throw new AppError(404, 'Not Found', `Tool ${toolName} nao encontrada no runtime.`, { code: 'TOOL_NOT_FOUND' });
  }

  const newPolicy: AiRuntimeToolPolicy = {
    riskLevel: normalizeRiskLevel(patch.riskLevel, current.policy.riskLevel),
    allowChannels: normalizeChannels(patch.allowChannels, current.policy.allowChannels),
    requiresConfirmation:
      typeof patch.requiresConfirmation === 'boolean' ? patch.requiresConfirmation : current.policy.requiresConfirmation,
    isAction: typeof patch.isAction === 'boolean' ? patch.isAction : current.policy.isAction
  };
  const enabled = typeof patch.enabled === 'boolean' ? patch.enabled : current.enabled;

  const override = await upsertAiToolOverride({
    toolName,
    category: current.category,
    objective: current.objective,
    dependencies: current.dependencies,
    schemaJson: current.schema ?? undefined,
    defaultPolicyJson: newPolicy as unknown as Record<string, unknown>,
    enabled,
    source: 'db'
  });

  if (override) {
    await insertAiToolVersion({
      toolId: override.id,
      version: new Date().toISOString(),
      schemaJson: current.schema ?? undefined,
      policyJson: newPolicy as unknown as Record<string, unknown>,
      changelog: patch.changelog ?? `policy/enabled atualizado por ${actorUserId}`,
      createdBy: actorUserId
    });
  }

  await refreshRuntimeRegistry();
  bumpRuntimeToolsVersion();

  const updated = await getRuntimeTool(toolName);
  if (!updated) {
    throw new AppError(500, 'Internal Server Error', 'Falha ao recarregar tool apos atualizacao.', { code: 'TOOL_RELOAD_FAILED' });
  }
  return updated;
}

export async function listRuntimeToolVersions(toolName: string): Promise<AiToolVersionRecord[]> {
  const override = await findAiToolOverride(toolName);
  if (!override) return [];
  return listAiToolVersions(override.id);
}
