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
import type { ConversationChannel } from '../conversation/conversation-context-service.js';
import { resolveEffectiveAllowChannels } from '../conversation/channel/whatsapp/whatsapp-action-eligibility.js';

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

/**
 * Seam de teste: injeta o snapshot de `ai_tools` sem banco. `null` restaura o vazio (= só defaults de
 * código). `loadedAt` é carimbado com `Date.now()` para que `ensureFreshness` não dispare um refresh
 * real e apague a injeção no meio do caso.
 */
export function setRuntimeRegistryOverridesForTests(overrides: AiToolOverrideRecord[] | null): void {
  const overridesByName = new Map<string, AiToolOverrideRecord>();
  const disabled = new Set<string>();
  for (const override of overrides || []) {
    overridesByName.set(override.toolName, override);
    if (!override.enabled) disabled.add(override.toolName);
  }
  snapshot = {
    overridesByName,
    disabledToolNames: disabled,
    agentsByName: snapshot.agentsByName,
    version: snapshot.version + 1,
    loadedAt: overrides ? Date.now() : 0
  };
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

/**
 * Canais conhecidos. Entrada desconhecida no jsonb é DESCARTADA aqui (defesa em profundidade) e
 * recusada com 400 na rota administrativa — nunca substitui a lista silenciosamente.
 */
const KNOWN_CONVERSATION_CHANNELS: ReadonlySet<string> = new Set<string>(['whatsapp', 'native_chat', 'inapp']);

/** `null` = o jsonb não declara canais (ou declara só lixo): o default de código vale inteiro. */
export function normalizeOverrideChannels(raw: unknown): ConversationChannel[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const normalized = raw
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => KNOWN_CONVERSATION_CHANNELS.has(entry)) as ConversationChannel[];
  return normalized.length > 0 ? [...new Set(normalized)] : null;
}

/**
 * O OVERLAY SÓ PODE RESTRINGIR — exceto por adicionar canal dentro da elegibilidade de código.
 *
 * Três estreitamentos da fase 5, cada um fechando um caminho que hoje o PATCH abre:
 *  · `riskLevel` e `isAction` passam a vir SEMPRE do default de código. A 4.5 já havia blindado o
 *    ramo de catálogo degradado (`resolveCodeIsAction`); com a fase 5 abrindo canal externo, um
 *    `isAction: false` em `submit_manifest` derrubaria de uma vez `AI_CONTROL_READONLY`,
 *    `ACTIONS_DISABLED` e a classificação leitura×ação do gate.
 *  · `requiresConfirmation: false` é IGNORADO (`true` é aceito). Zerar a confirmação de uma ação pela
 *    tela de runtime é justamente o que a fase 5 torna perigoso: sem confirmação não há ticket, e sem
 *    ticket a mensagem executa direto.
 *  · `allowChannels` é validado ENTRADA A ENTRADA; a resolução final (elegibilidade + recusa
 *    permanente) é de `resolveEffectiveAllowChannels`, aplicada por quem consulta a policy.
 */
export function applyRuntimePolicyOverlay(
  raw: Record<string, unknown> | null | undefined,
  codeDefault: ConversationToolPolicy,
  eligibilityKey: string
): ConversationToolPolicy {
  const overlayChannels = raw && typeof raw === 'object' ? normalizeOverrideChannels(raw.allowChannels) : null;
  const allowChannels = resolveEffectiveAllowChannels({
    key: eligibilityKey,
    codeChannels: codeDefault.allowChannels,
    overlayChannels
  });

  const requiresConfirmation = raw && raw.requiresConfirmation === true
    ? true
    : codeDefault.requiresConfirmation;

  return {
    riskLevel: codeDefault.riskLevel,
    allowChannels,
    requiresConfirmation,
    isAction: codeDefault.isAction
  };
}

/**
 * Resolve a policy efetiva de um tool: default de código sobreposto pelo override do banco.
 * Síncrono (usa snapshot em cache). Usado pelo policy-service.
 *
 * Roda MESMO SEM override: `resolveEffectiveAllowChannels` também aplica `CHANNEL_HARD_DENY`, e a
 * recusa permanente não pode depender de existir linha em `ai_tools`.
 */
export function resolveEffectiveToolPolicy(toolName: string, codeDefault: ConversationToolPolicy): ConversationToolPolicy {
  ensureFreshness();
  const override = snapshot.overridesByName.get(toolName);
  return applyRuntimePolicyOverlay(override?.defaultPolicyJson, codeDefault, toolName);
}

/**
 * Overlay POR INTENT do orquestrador, lido de `ai_tools.default_policy_json.intents["<intent>"]`
 * (jsonb — nenhuma DDL).
 *
 * Existe porque `evaluateConversationPolicy` DESCARTA a policy resolvida com override quando
 * `toolName === 'orchestrate_manifest_operation'` (`effectivePolicy = intentPolicy`): sem isto, os 11
 * intents de ação — incluindo TODOS os lotes que a fase 5 abre — não teriam alavanca de runtime
 * nenhuma, e o operador ligaria um botão que não alcança o que promete.
 *
 * Devolve só o que o overlay pode dizer: canais e "exige confirmação". Nunca `riskLevel`/`isAction`.
 */
export function resolveRuntimeIntentPolicyOverride(
  toolName: string,
  intent: string
): { allowChannels: ConversationChannel[] | null; requiresConfirmation: true | null } | null {
  ensureFreshness();
  if (!intent) return null;
  const override = snapshot.overridesByName.get(toolName);
  const raw = override?.defaultPolicyJson;
  if (!raw || typeof raw !== 'object') return null;

  const intents = (raw as Record<string, unknown>).intents;
  if (!intents || typeof intents !== 'object' || Array.isArray(intents)) return null;
  if (!Object.prototype.hasOwnProperty.call(intents, intent)) return null;

  const entry = (intents as Record<string, unknown>)[intent];
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;

  const record = entry as Record<string, unknown>;
  return {
    allowChannels: normalizeOverrideChannels(record.allowChannels),
    requiresConfirmation: record.requiresConfirmation === true ? true : null
  };
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
    const effectivePolicy = applyRuntimePolicyOverlay(override?.defaultPolicyJson, codePolicy, toolName);

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
