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
import type { AiRuntimeTool, AiRuntimeToolPolicy, AiRuntimeToolStats } from './ai-control-types.js';

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

/**
 * Canais do PATCH, validados ENTRADA A ENTRADA.
 *
 * O comportamento anterior era `.filter(KNOWN_CHANNELS.has)`: um `allowChannels: ['whatsap']`
 * (digitado errado) virava lista vazia e caía no fallback SILENCIOSAMENTE — o operador via a tela
 * confirmar a mudança e nada tinha mudado. Com canal externo em jogo, silêncio é o modo de falha
 * errado: agora é 400 explícito.
 */
function requireKnownChannels(value: unknown, fallback: string[]): string[] {
  if (value === undefined) return fallback;
  if (!Array.isArray(value)) {
    throw new AppError(400, 'Bad Request', 'allowChannels deve ser uma lista de canais.', {
      code: 'AI_TOOL_ALLOW_CHANNELS_INVALID'
    });
  }
  const unknown = value.filter((entry) => typeof entry !== 'string' || !KNOWN_CHANNELS.has(entry));
  if (unknown.length > 0) {
    throw new AppError(400, 'Bad Request', `Canal desconhecido em allowChannels: ${unknown.map(String).join(', ')}.`, {
      code: 'AI_TOOL_ALLOW_CHANNELS_INVALID'
    });
  }
  return [...new Set(value as string[])];
}

/** Canais externos: adicionar um deles exige confirmação explícita na rota + auditoria. */
export const EXTERNAL_ADMIN_CHANNELS: ReadonlySet<string> = new Set<string>(['whatsapp']);

export function listAddedExternalChannels(current: readonly string[], next: readonly string[]): string[] {
  const before = new Set(current);
  return next.filter((channel) => EXTERNAL_ADMIN_CHANNELS.has(channel) && !before.has(channel));
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

  // `riskLevel` e `isAction` NÃO são graváveis: o gate de permissão e a classificação leitura×ação
  // leem sempre o default de código (`resolveCodeIsAction`, `normalizePolicyOverride`). Persistir um
  // valor divergente criaria uma tela que mente sobre o que o motor obedece.
  //
  // `requiresConfirmation` só ENDURECE: `false` vindo do PATCH é ignorado. Zerar a confirmação de uma
  // ação por esta tela é o caminho mais curto para executar sem ticket num canal externo.
  const newPolicy: AiRuntimeToolPolicy = {
    riskLevel: current.policy.riskLevel,
    allowChannels: requireKnownChannels(patch.allowChannels, current.policy.allowChannels),
    requiresConfirmation: patch.requiresConfirmation === true ? true : current.policy.requiresConfirmation,
    isAction: current.policy.isAction
  };
  const enabled = typeof patch.enabled === 'boolean' ? patch.enabled : current.enabled;

  // O mapa por INTENT vive no mesmo jsonb (`default_policy_json.intents`) e não pode ser clobberado
  // por um PATCH que só mexe em canais da tool.
  const existingOverride = await findAiToolOverride(toolName);
  const existingIntents = (existingOverride?.defaultPolicyJson as Record<string, unknown> | null | undefined)?.intents;
  const policyJson: Record<string, unknown> = { ...(newPolicy as unknown as Record<string, unknown>) };
  if (existingIntents && typeof existingIntents === 'object' && !Array.isArray(existingIntents)) {
    policyJson.intents = existingIntents;
  }

  const override = await upsertAiToolOverride({
    toolName,
    category: current.category,
    objective: current.objective,
    dependencies: current.dependencies,
    schemaJson: current.schema ?? undefined,
    defaultPolicyJson: policyJson,
    enabled,
    source: 'db'
  });

  if (override) {
    await insertAiToolVersion({
      toolId: override.id,
      version: new Date().toISOString(),
      schemaJson: current.schema ?? undefined,
      policyJson: policyJson,
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
