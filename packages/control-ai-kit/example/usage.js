// example/usage.js — EXEMPLAR da control-ai-kit.
//
// Este caminho e referenciado por um bloco de capacidade da Forge (ia-controle),
// portanto DEVE existir e ser executavel. Sem side effects no import: tudo roda
// so quando este arquivo e o entrypoint (ver `if (import.meta.url ...)` no fim).
//
// Mostra:
//   1. createControlAi com um llm FAKE e um prompt versionado no repo (fallback);
//   2. o conceito de uma tool de dominio (comentado — em producao via registry do ai-core);
//   3. que SEM llm a kit falha-fechada (fail-closed).

import { pathToFileURL } from 'node:url';
import { createControlAi, ControlAiConfigError } from '../src/index.js';

// --- LLM fake (em producao: createOpenAiLlm/createAnthropicLlm do ai-core) -----
// O adapter estrutural minimo da plataforma expoe `.complete({ messages })`.
const fakeLlm = {
  async complete({ messages }) {
    const system = messages.find((m) => m.role === 'system')?.content ?? '';
    const user = messages.find((m) => m.role === 'user')?.content ?? '';
    return `respondendo "${user}" sob a politica: ${system.slice(0, 48)}...`;
  },
};

// --- Tool de dominio (CONCEITO) -----------------------------------------------
// Em producao, o app registra tools no toolRegistry do @flavioneto11/ai-core e
// passa o `registry` para createControlAi; o grafo (ReAct) as despacha com
// authz/dry-run/confirmacao. Esboco:
//
//   import { createToolRegistry } from '@flavioneto11/ai-core';
//   const registry = createToolRegistry([{
//     name: 'lookup_order',
//     description: 'Consulta um pedido por id.',
//     risk: 'read',
//     handler: async ({ id }) => db.orders.findById(id),
//   }]);
//   const ai = buildAssistant(realLlm, registry);

/**
 * Monta a IA de controle de um app de exemplo ("myapp").
 * @param {object} llm        adapter estrutural ({ complete } | { invoke }).
 * @param {object} [registry] toolRegistry do ai-core (opcional).
 */
export function buildAssistant(llm, registry) {
  return createControlAi({
    appName: 'myapp',
    llm,
    registry,
    // Prompts versionados NO REPO: usados quando o ai-control-plane esta fora
    // (ou nao configurado). Em producao, a versao ativa do control-plane vence.
    prompts: {
      triage: 'Você é um assistente de triagem do myapp. Seja conciso e cite os dados disponíveis.',
    },
    // Quando definido, a kit tenta o ai-control-plane (timeout 2s) antes do fallback.
    controlPlaneUrl: process.env.AI_CONTROL_PLANE_URL,
  });
}

/** Demonstra o fail-closed: sem llm a kit nao sobe. */
export function demonstrateFailClosed() {
  try {
    createControlAi({ appName: 'myapp', llm: null });
    return { failedClosed: false };
  } catch (err) {
    return { failedClosed: err instanceof ControlAiConfigError, code: err.code };
  }
}

// --- runnable (sem side effects no import) ------------------------------------
async function main() {
  const ai = buildAssistant(fakeLlm);
  const answer = await ai.ask({ prompt: 'triage', input: 'meu pedido nao chegou' });
  console.log('[ask]', answer);

  const fc = demonstrateFailClosed();
  console.log('[fail-closed]', fc);
}

// entrypoint? (cross-platform: compara com a file URL do argv[1] — funciona no Windows)
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
