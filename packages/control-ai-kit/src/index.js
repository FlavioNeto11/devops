// @flavioneto11/control-ai-kit — IA de CONTROLE por app.
//
// O que e: uma fina camada que (1) resolve prompts versionados do ai-control-plane
// com cache + timeout + fallback offline (ver prompt-source.js) e (2) monta um
// grafo minimo de raciocinio sobre @flavioneto11/ai-core — declarado como PEER
// e NAO vendorizado aqui (o app consumidor ja vendoriza o ai-core via o bloco de
// capacidade `ia-grafo`). Distinta do bloco ia-grafo: la mora o MOTOR; aqui mora
// a IA de controle por app (prompt governado + fail-closed sem LLM).
//
// Fail-closed: sem LLM, a control AI nao sobe (nunca degrada para "sem IA" calado).

import { ControlAiError, ControlAiConfigError } from './errors.js';
import { createPromptSource } from './prompt-source.js';

export { ControlAiError, ControlAiConfigError } from './errors.js';
export { createPromptSource } from './prompt-source.js';

/**
 * Cria a IA de controle do app.
 *
 * Fail-closed: sem `llm` lanca ControlAiConfigError (nunca roda "sem IA").
 *
 * Caminho de PRODUCAO: `ask` importa @flavioneto11/ai-core LAZILY e monta
 * `createAiGraph({ llm, registry, ... })` (o motor padrao da plataforma).
 * Caminho de TESTE/degradacao: se o ai-core nao estiver instalado, usa o `llm`
 * direto (espera `.complete` ou `.invoke`) — assim a kit funciona com um llm
 * mockado sem precisar do ai-core instalado.
 *
 * @param {object} opts
 * @param {string} opts.appName               namespace do app (prefixo dos prompts).
 * @param {object} opts.llm                    adapter estrutural ({ complete } | { invoke }). OBRIGATORIO.
 * @param {object} [opts.registry]             toolRegistry do app (createToolRegistry do ai-core).
 * @param {Record<string,string>} [opts.prompts]  prompts versionados no repo (fallback offline).
 * @param {string} [opts.controlPlaneUrl]      base do ai-control-plane (default: so fallback).
 * @param {typeof fetch} [opts.fetchImpl]      fetch injetavel (testes offline).
 * @param {number} [opts.cacheTtlMs]           TTL do cache de prompts (ms).
 */
export function createControlAi({
  appName,
  llm,
  registry,
  prompts,
  controlPlaneUrl,
  fetchImpl,
  cacheTtlMs,
} = {}) {
  if (!appName || typeof appName !== 'string') {
    throw new ControlAiConfigError('createControlAi: `appName` obrigatorio');
  }
  // FAIL-CLOSED: sem LLM a control AI nao existe.
  if (!llm) {
    throw new ControlAiConfigError('sem LLM — control AI desabilitada (fail-closed)');
  }

  const promptSource = createPromptSource({
    controlPlaneUrl,
    app: appName,
    fallback: prompts || {},
    cacheTtlMs,
    fetchImpl,
  });

  // grafo do ai-core, montado uma unica vez sob demanda (lazy import).
  let graphPromise = null;
  async function getGraph() {
    if (graphPromise) return graphPromise;
    graphPromise = (async () => {
      try {
        const aiCore = await import('@flavioneto11/ai-core');
        if (typeof aiCore.createAiGraph !== 'function') return null;
        return aiCore.createAiGraph({ llm, registry });
      } catch {
        // ai-core nao instalado neste contexto => degrada para o llm direto.
        return null;
      }
    })();
    return graphPromise;
  }

  /** Chama o llm diretamente quando o ai-core nao esta disponivel (path de teste). */
  async function callLlmDirect({ system, input }) {
    if (typeof llm.complete === 'function') {
      const out = await llm.complete({
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: typeof input === 'string' ? input : JSON.stringify(input ?? '') },
        ],
      });
      // tolera string crua ou { content } / { text }.
      if (typeof out === 'string') return out;
      return out?.content ?? out?.text ?? out;
    }
    if (typeof llm.invoke === 'function') {
      const out = await llm.invoke({ system, input });
      if (typeof out === 'string') return out;
      return out?.content ?? out?.text ?? out;
    }
    throw new ControlAiError(
      'llm sem `.complete`/`.invoke` e ai-core ausente — control AI nao tem como responder',
      'CONTROL_AI_NO_ENGINE',
    );
  }

  /**
   * Responde uma pergunta usando o prompt resolvido (control-plane | fallback).
   * @param {object} args
   * @param {string} args.prompt   nome logico do prompt (resolvido pelo promptSource).
   * @param {any} [args.input]     entrada do usuario / contexto do turno.
   */
  async function ask({ prompt, input } = {}) {
    const system = await promptSource.resolve(prompt);

    // Caminho de PRODUCAO: motor do ai-core.
    const graph = await getGraph();
    if (graph && typeof graph.runTurn === 'function') {
      const result = await graph.runTurn({
        message: typeof input === 'string' ? input : JSON.stringify(input ?? ''),
        systemContext: system,
      });
      return result;
    }

    // Caminho de TESTE/degradacao: llm direto com o prompt como system.
    return callLlmDirect({ system, input });
  }

  return { appName, promptSource, ask };
}
