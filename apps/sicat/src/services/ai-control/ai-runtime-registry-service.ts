/**
 * AI Runtime Registry — fonte unificada do catálogo de tools em runtime.
 *
 * Combina:
 *  a. defaults de código (tool-registry.ts + schemas de function-calling);
 *  b. overrides do banco (ai_tools): enabled, policy, schema, versão ativa.
 *
 * Princípios de segurança/compatibilidade:
 *  - SEM linhas em `ai_tools`, o comportamento é IDÊNTICO aos defaults atuais.
 *  - Snapshot em memória com refresh stale-while-revalidate (nunca lança).
 *  - Em falha de DB, mantém o último snapshot bom (fail-safe).
 *  - NÃO importa o llm-provider (evita ciclo): recebe os defaults por parâmetro.
 */
import { getConversationToolInventory } from '../conversation/tools/tool-registry.js';
import type { ConversationToolInventoryItem, ConversationToolPolicy } from '../conversation/tools/tool-types.js';
import {
  listAiToolOverrides,
  listAiAgentOverrides,
  type AiToolOverrideRecord,
  type AiAgentRecord
} from '../../repositories/ai-tool-admin-repo.js';
import type { AiRuntimeToolPolicy, AiToolSource } from './ai-control-types.js';

type FunctionToolLike = {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

type RegistrySnapshot = {
  overridesByName: Map<string, AiToolOverrideRecord>;
  disabledToolNames: Set<string>;
  agentsByName: Map<string, AiAgentRecord>;
  version: number;
  loadedAt: number;
};

let snapshot: RegistrySnapshot = {
  overridesByName: new Map(),
  disabledToolNames: new Set(),
  agentsByName: new Map(),
  version: 1,
  loadedAt: 0
};
let refreshing = false;
const STALE_MS = 30_000;

export function getRuntimeToolsVersion(): number {
  return snapshot.version;
}

/** Invalida cache de grafos do planner (chamado após mutação administrativa de tools). */
export function bumpRuntimeToolsVersion(): void {
  snapshot = { ...snapshot, version: snapshot.version + 1 };
}

function isStale(): boolean {
  return Date.now() - snapshot.loadedAt > STALE_MS;
}

/** Recarrega overrides do banco. Nunca lança; em erro mantém o snapshot anterior. */
export async function refreshRuntimeRegistry(): Promise<void> {
  if (refreshing) return;
  refreshing = true;
  try {
    const [overrides, agents] = await Promise.all([listAiToolOverrides(), listAiAgentOverrides()]);
    const overridesByName = new Map<string, AiToolOverrideRecord>();
    const disabled = new Set<string>();
    for (const override of overrides) {
      overridesByName.set(override.toolName, override);
      if (!override.enabled) {
        disabled.add(override.toolName);
      }
    }
    const agentsByName = new Map<string, AiAgentRecord>(agents.map((agent) => [agent.agentName, agent]));
    snapshot = {
      overridesByName,
      disabledToolNames: disabled,
      agentsByName,
      version: snapshot.version + 1,
      loadedAt: Date.now()
    };
  } catch {
    // Mantém o último snapshot bom; atualiza loadedAt para não martelar o DB.
    snapshot = { ...snapshot, loadedAt: Date.now() };
  } finally {
    refreshing = false;
  }
}

function ensureFreshness(): void {
  if (isStale() && !refreshing) {
    void refreshRuntimeRegistry();
  }
}

export function isRuntimeToolEnabled(toolName: string): boolean {
  ensureFreshness();
  return !snapshot.disabledToolNames.has(toolName);
}

export type RuntimeAgentText = { label: string; focus: string };

/**
 * Texto do agente (label + foco/instruções) lido do banco (ai_agents.config_json).
 * O texto REAL vive no banco (semeado no boot e editável no painel); o `fallback`
 * passado pelo chamador é genérico, só usado se o banco não tiver o agente.
 */
export function resolveRuntimeAgentText(agentName: string, fallback: RuntimeAgentText): RuntimeAgentText {
  ensureFreshness();
  const agent = snapshot.agentsByName.get(agentName);
  if (!agent || agent.enabled === false) return fallback;
  const cfg = agent.config || {};
  const labelRaw = typeof cfg.label === 'string' ? cfg.label.trim() : '';
  const focusRaw = typeof cfg.focus === 'string' ? cfg.focus.trim() : '';
  return {
    label: labelRaw || agent.description || fallback.label,
    focus: focusRaw || fallback.focus
  };
}

/** Subconjunto de tools do agente (override do banco) ou fallback de estrutura (código). */
export function resolveRuntimeAgentTools(agentName: string, fallback: string[]): string[] {
  ensureFreshness();
  const agent = snapshot.agentsByName.get(agentName);
  if (agent && Array.isArray(agent.toolNames) && agent.toolNames.length > 0) {
    return agent.toolNames;
  }
  return fallback;
}

/**
 * Filtra os schemas default de function-calling removendo tools desabilitados.
 * Sem overrides desabilitados, retorna a lista original (mesma referência).
 */
export function getActiveToolSchemas<T extends FunctionToolLike>(defaults: T[]): T[] {
  ensureFreshness();
  if (snapshot.disabledToolNames.size === 0) {
    return defaults;
  }
  return defaults.filter((tool) => {
    const name = tool?.function?.name;
    return typeof name === 'string' ? !snapshot.disabledToolNames.has(name) : true;
  });
}

function normalizePolicyOverride(
  raw: Record<string, unknown> | null | undefined,
  codeDefault: ConversationToolPolicy
): ConversationToolPolicy {
  if (!raw || typeof raw !== 'object') {
    return codeDefault;
  }
  const riskLevel =
    typeof raw.riskLevel === 'string' ? (raw.riskLevel as ConversationToolPolicy['riskLevel']) : codeDefault.riskLevel;
  const allowChannels =
    Array.isArray(raw.allowChannels) && raw.allowChannels.length > 0
      ? (raw.allowChannels as ConversationToolPolicy['allowChannels'])
      : codeDefault.allowChannels;
  return {
    riskLevel,
    allowChannels,
    requiresConfirmation:
      typeof raw.requiresConfirmation === 'boolean' ? raw.requiresConfirmation : codeDefault.requiresConfirmation,
    isAction: typeof raw.isAction === 'boolean' ? raw.isAction : codeDefault.isAction
  };
}

/**
 * Resolve a policy efetiva de um tool: default de código sobreposto pelo override do banco.
 * Síncrono (usa snapshot em cache). Usado pelo policy-service.
 */
export function resolveEffectiveToolPolicy(toolName: string, codeDefault: ConversationToolPolicy): ConversationToolPolicy {
  ensureFreshness();
  const override = snapshot.overridesByName.get(toolName);
  if (!override) {
    return codeDefault;
  }
  return normalizePolicyOverride(override.defaultPolicyJson, codeDefault);
}

export type RuntimeToolDefinition = {
  toolName: string;
  category: string;
  objective: string;
  dependencies: string[];
  enabled: boolean;
  source: AiToolSource;
  activeVersion: string | null;
  policy: AiRuntimeToolPolicy;
};

type InventoryItem = ConversationToolInventoryItem;

function policyToDto(policy: ConversationToolPolicy): AiRuntimeToolPolicy {
  return {
    riskLevel: policy.riskLevel,
    allowChannels: [...policy.allowChannels],
    requiresConfirmation: policy.requiresConfirmation,
    isAction: policy.isAction
  };
}

/**
 * Definições mescladas (código + banco) para a API administrativa.
 * Faz refresh síncrono para garantir visão fresca na tela admin.
 */
export async function getRuntimeToolDefinitions(): Promise<RuntimeToolDefinition[]> {
  await refreshRuntimeRegistry();
  const inventory = getConversationToolInventory();
  const byName = new Map<string, InventoryItem>(inventory.map((item) => [item.toolName, item]));
  const names = new Set<string>([...byName.keys(), ...snapshot.overridesByName.keys()]);

  const definitions: RuntimeToolDefinition[] = [];
  for (const toolName of names) {
    const item = byName.get(toolName) || null;
    const override = snapshot.overridesByName.get(toolName) || null;
    const codePolicy: ConversationToolPolicy = item
      ? item.policy
      : { riskLevel: 'R1', allowChannels: ['inapp'], requiresConfirmation: false, isAction: false };
    const effectivePolicy = override ? normalizePolicyOverride(override.defaultPolicyJson, codePolicy) : codePolicy;

    definitions.push({
      toolName,
      category: override?.category || item?.category || 'unknown',
      objective: override?.objective || item?.objective || '',
      dependencies: override && override.dependencies.length > 0 ? override.dependencies : item?.dependencies || [],
      enabled: override ? override.enabled : true,
      source: override ? 'db' : 'code',
      activeVersion: override?.activeVersionId || null,
      policy: policyToDto(effectivePolicy)
    });
  }

  return definitions.sort((a, b) => a.toolName.localeCompare(b.toolName));
}
