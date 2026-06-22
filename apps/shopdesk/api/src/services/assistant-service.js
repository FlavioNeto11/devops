// services/assistant-service.js — IA de controle do app via @flavioneto11/control-ai-kit
// (bloco control-ai-por-app). Prompts versionados do ai-control-plane com cache+timeout+FALLBACK local;
// LLM = @anthropic-ai/sdk direto (Claude haiku). FAIL-CLOSED: sem ANTHROPIC_API_KEY -> 503. A control-ai-kit
// degrada sem ai-core (usa o adapter .complete); em produção plena o ai-core dá o grafo ReAct + tools.
import { createControlAi } from '@flavioneto11/control-ai-kit';

const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ASSISTANT_MODEL || 'claude-haiku-4-5-20251001';

// adapter estrutural mínimo da plataforma ({ complete({messages}) }) sobre o SDK Anthropic.
const llm = KEY
  ? {
      async complete({ messages }) {
        const { default: Anthropic } = await import('@anthropic-ai/sdk');
        const client = new Anthropic({ apiKey: KEY });
        const system = (messages.find((m) => m.role === 'system') || {}).content || '';
        const user = (messages.find((m) => m.role === 'user') || {}).content || '';
        const r = await client.messages.create({ model: MODEL, max_tokens: 500, system, messages: [{ role: 'user', content: user }] });
        return (r.content || []).map((b) => b.text || '').join('').trim();
      },
    }
  : null;

let ai = null;
function getAi() {
  if (ai) return ai;
  if (!llm) { const e = new Error('assistente de IA indisponível — ANTHROPIC_API_KEY ausente (fail-closed)'); e.status = 503; throw e; }
  ai = createControlAi({
    appName: 'shopdesk',
    llm,
    prompts: { assist: 'Você é o assistente do lojista no ShopDesk. Ajude com preço/descrição de produto e dúvidas sobre pedidos, de forma concisa, em pt-BR, citando os dados informados.' },
    controlPlaneUrl: process.env.AI_CONTROL_PLANE_URL,
  });
  return ai;
}

export async function assist(message) {
  const a = getAi();
  const answer = await a.ask({ prompt: 'assist', input: String(message || '') });
  return { answer: typeof answer === 'string' ? answer : (answer && (answer.text || answer.answer)) || '', model: MODEL };
}
export const aiEnabled = !!KEY;
