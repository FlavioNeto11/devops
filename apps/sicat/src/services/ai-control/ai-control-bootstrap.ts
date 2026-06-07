/**
 * Bootstrap do AI Control Center: no boot, semeia no banco os TEXTOS de IA
 * (prompts + definição/foco dos agentes) e aquece o snapshot do runtime.
 *
 * Assim o runtime do chat lê os textos do banco (editáveis no painel) desde o
 * primeiro turno; o fallback genérico no código só entra se o banco falhar.
 * Best-effort: nunca derruba o boot.
 */
import { ensureDefaultPromptsSeeded } from './ai-prompt-admin-service.js';
import { ensureDefaultAgentsSeeded } from './ai-agent-admin-service.js';
import { refreshRuntimeRegistry } from './ai-runtime-registry-service.js';

export async function seedAiRuntimeDefaults(): Promise<void> {
  try {
    await ensureDefaultPromptsSeeded();
    await ensureDefaultAgentsSeeded();
    await refreshRuntimeRegistry();
  } catch {
    // best-effort: o boot nunca falha por causa do seed de IA (há fallback genérico no runtime).
  }
}
