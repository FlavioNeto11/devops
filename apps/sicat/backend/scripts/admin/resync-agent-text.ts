/**
 * Re-sincroniza o TEXTO dinâmico dos agentes (label/foco/intents/intentPrefixes/
 * knowledgeTopics) a partir da estrutura de código (CONVERSATION_SPECIALISTS) para
 * `ai_agents`, preservando tools/estado (toolNames/enabled/promptName) e demais
 * chaves de config.
 *
 * O seed do boot é IDEMPOTENTE (só cria o agente que falta) — então, quando o
 * texto-fonte do agente muda no código, as linhas já existentes em `ai_agents`
 * permanecem com o texto antigo. Rode este script para empurrar os novos defaults
 * ao banco. É uma ação administrativa EXPLÍCITA (não roda no boot, para não
 * sobrescrever edições feitas pelo painel automaticamente).
 *
 * Uso (dentro do container api):
 *   npx tsx scripts/admin/resync-agent-text.ts
 */
import { listConversationSpecialists } from '../../src/services/conversation/agents/conversation-specialists.js';
import { listAiAgentOverrides, upsertAiAgentOverride } from '../../src/repositories/ai-tool-admin-repo.js';
import { refreshRuntimeRegistry } from '../../src/services/ai-control/ai-runtime-registry-service.js';

async function main(): Promise<void> {
  const overrides = await listAiAgentOverrides();
  const byName = new Map(overrides.map((override) => [override.agentName, override]));
  const synced: string[] = [];

  for (const specialist of listConversationSpecialists()) {
    const current = byName.get(specialist.id) ?? null;
    const config: Record<string, unknown> = { ...(current?.config ?? {}) };
    // Texto do agente sincronizado a partir do código (a "estrutura" continua em código).
    config.label = specialist.label;
    config.focus = specialist.focus;
    config.intentPrefixes = specialist.intentPrefixes;
    config.intents = specialist.intents;
    config.knowledgeTopics = specialist.knowledgeTopics;

    await upsertAiAgentOverride({
      agentName: specialist.id,
      description: specialist.label,
      specialistType: specialist.id,
      // Preserva edições estruturais já feitas no banco; cai para o código quando vazio.
      toolNames: current && current.toolNames.length > 0 ? current.toolNames : specialist.tools.slice(),
      promptName: current?.promptName ?? null,
      enabled: current ? current.enabled : true,
      config
    });
    synced.push(specialist.id);
  }

  await refreshRuntimeRegistry();
  console.log(JSON.stringify({ ok: true, synced }, null, 2));
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error('ERRO:', error instanceof Error ? error.message : error);
  process.exit(1);
});
