/**
 * Administração de agentes/especialistas.
 *
 * O texto do agente (label + foco/instruções) é DINÂMICO: vive em `ai_agents`
 * (config_json), é semeado no boot a partir da estrutura de código e editável no
 * painel. A ESTRUTURA (tools/intents/roteamento) permanece em código. O runtime
 * lê o foco/label do banco (ver ai-runtime-registry-service.resolveRuntimeAgentText).
 */
import { AppError } from '../../lib/problem.js';
import { listConversationSpecialists } from '../conversation/agents/conversation-specialists.js';
import {
  listAiAgentOverrides,
  upsertAiAgentOverride
} from '../../repositories/ai-tool-admin-repo.js';
import { refreshRuntimeRegistry, bumpRuntimeToolsVersion } from './ai-runtime-registry-service.js';
import type { AiRuntimeAgent } from './ai-control-types.js';

type JsonObject = Record<string, unknown>;

function cfgString(config: JsonObject | null | undefined, key: string, fallback: string): string {
  const value = config?.[key];
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function cfgStringArray(config: JsonObject | null | undefined, key: string, fallback: string[]): string[] {
  const value = config?.[key];
  if (Array.isArray(value)) {
    const list = value.filter((entry): entry is string => typeof entry === 'string');
    if (list.length > 0) return list;
  }
  return fallback;
}

let agentsSeedAttempted = false;

/**
 * Semeia (uma vez) os agentes padrão em `ai_agents` a partir da estrutura de
 * código, com o texto (label/foco) + intents/conhecimento em config_json.
 * Idempotente. Chamado no boot e (lazy) ao listar agentes.
 */
export async function ensureDefaultAgentsSeeded(): Promise<void> {
  if (agentsSeedAttempted) return;
  agentsSeedAttempted = true;
  try {
    const overrides = await listAiAgentOverrides();
    const existing = new Set(overrides.map((override) => override.agentName));
    for (const specialist of listConversationSpecialists()) {
      if (existing.has(specialist.id)) continue;
      await upsertAiAgentOverride({
        agentName: specialist.id,
        description: specialist.label,
        specialistType: specialist.id,
        toolNames: specialist.tools.slice(),
        promptName: null,
        enabled: true,
        config: {
          label: specialist.label,
          focus: specialist.focus,
          intentPrefixes: specialist.intentPrefixes,
          intents: specialist.intents,
          knowledgeTopics: specialist.knowledgeTopics
        }
      });
    }
  } catch {
    agentsSeedAttempted = false; // permite nova tentativa
  }
}

export async function listRuntimeAgents(): Promise<AiRuntimeAgent[]> {
  await ensureDefaultAgentsSeeded();
  const overrides = await listAiAgentOverrides();
  const overrideByName = new Map(overrides.map((override) => [override.agentName, override]));
  const specialists = listConversationSpecialists();

  const agents: AiRuntimeAgent[] = [];
  const seen = new Set<string>();

  for (const specialist of specialists) {
    const override = overrideByName.get(specialist.id) ?? null;
    const config = override?.config ?? null;
    seen.add(specialist.id);
    agents.push({
      agentName: specialist.id,
      description: override?.description || specialist.label,
      specialistType: override?.specialistType || specialist.id,
      focus: cfgString(config, 'focus', specialist.focus),
      intents: cfgStringArray(config, 'intents', specialist.intents),
      knowledgeTopics: cfgStringArray(config, 'knowledgeTopics', specialist.knowledgeTopics),
      toolNames: override && override.toolNames.length > 0 ? override.toolNames : specialist.tools.slice(),
      promptName: override?.promptName ?? null,
      enabled: override ? override.enabled : true,
      source: override ? 'db' : 'code',
      config: config && Object.keys(config).length > 0
        ? config
        : {
            label: specialist.label,
            focus: specialist.focus,
            intentPrefixes: specialist.intentPrefixes,
            intents: specialist.intents,
            knowledgeTopics: specialist.knowledgeTopics
          }
    });
  }

  for (const override of overrides) {
    if (seen.has(override.agentName)) continue;
    const config = override.config ?? {};
    agents.push({
      agentName: override.agentName,
      description: override.description || '',
      specialistType: override.specialistType,
      focus: cfgString(config, 'focus', ''),
      intents: cfgStringArray(config, 'intents', []),
      knowledgeTopics: cfgStringArray(config, 'knowledgeTopics', []),
      toolNames: override.toolNames,
      promptName: override.promptName,
      enabled: override.enabled,
      source: 'db',
      config
    });
  }

  return agents;
}

export async function getRuntimeAgent(agentName: string): Promise<AiRuntimeAgent | null> {
  const agents = await listRuntimeAgents();
  return agents.find((agent) => agent.agentName === agentName) ?? null;
}

export type RuntimeAgentPatch = {
  description?: string | null;
  /** Texto do agente — o que ele faz/resolve (injetado no planner). */
  focus?: string;
  intents?: string[];
  knowledgeTopics?: string[];
  toolNames?: string[];
  promptName?: string | null;
  enabled?: boolean;
  config?: Record<string, unknown>;
};

export async function patchRuntimeAgent(
  agentName: string,
  patch: RuntimeAgentPatch,
  _actorUserId: string
): Promise<AiRuntimeAgent> {
  const current = await getRuntimeAgent(agentName);
  if (!current) {
    throw new AppError(404, 'Not Found', `Agente ${agentName} nao encontrado.`, { code: 'AGENT_NOT_FOUND' });
  }

  const nextConfig: JsonObject = { ...(current.config || {}) };
  if (typeof patch.focus === 'string') nextConfig.focus = patch.focus;
  if (Array.isArray(patch.intents)) nextConfig.intents = patch.intents;
  if (Array.isArray(patch.knowledgeTopics)) nextConfig.knowledgeTopics = patch.knowledgeTopics;
  if (patch.config && typeof patch.config === 'object') Object.assign(nextConfig, patch.config);

  await upsertAiAgentOverride({
    agentName,
    description: typeof patch.description === 'string' ? patch.description : current.description,
    specialistType: current.specialistType,
    toolNames: Array.isArray(patch.toolNames) ? patch.toolNames : current.toolNames,
    promptName: patch.promptName !== undefined ? patch.promptName : current.promptName,
    enabled: typeof patch.enabled === 'boolean' ? patch.enabled : current.enabled,
    config: nextConfig
  });

  // Recarrega o snapshot do runtime (foco aplica no próximo turno; tools forçam rebuild do grafo).
  await refreshRuntimeRegistry();
  bumpRuntimeToolsVersion();

  const updated = await getRuntimeAgent(agentName);
  if (!updated) {
    throw new AppError(500, 'Internal Server Error', 'Falha ao recarregar agente apos atualizacao.', { code: 'AGENT_RELOAD_FAILED' });
  }
  return updated;
}
