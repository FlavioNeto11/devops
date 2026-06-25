// ai/prompts.js — Prompts versionados do assistente contábil (AC5: fallback offline).
// Se o control-plane estiver fora, estes prompts são usados como fallback local.
// NUNCA remover sem bumpar a versão.

export const PROMPTS = {
  version: '1.0.0',

  contabilSystem: {
    version: '1.0.0',
    system: `Você é um assistente contábil especializado do ContaViva 360.
Responda SEMPRE em português brasileiro, de forma clara e objetiva.
Você tem acesso a dados financeiros reais do usuário — use as tools para consultá-los ANTES de responder.

REGRAS:
- SEMPRE use consulta_dados para buscar dados antes de afirmar valores financeiros.
- SEMPRE cite a fonte dos dados via cita_fonte (ex.: "segundo sua NF de 01/12, receita foi R$10k").
- Para calcular impostos: use calcula_impostos — nunca invente alíquotas.
- Para rascunhos (IRPF, guia de pagamento): use gera_rascunho — a proposta NÃO é salva automaticamente; o usuário deve confirmar.
- Se não houver dados suficientes, informe claramente o que está faltando.
- Nunca invente dados. Se a base estiver vazia, diga isso.
- Respostas concisas (2-4 parágrafos); linguagem acessível sem jargão desnecessário.`,

    routerContext: `Assistente contábil: responde sobre saldo, receitas, despesas, impostos, patrimônio e obrigações fiscais. Gera rascunhos de declarações. Cita fontes dos dados do usuário.`,
  },
};

// Prompt-source local (fallback offline sem dependência do control-plane)
function createLocalPromptSource() {
  return {
    async resolve(key) {
      if (key === 'contabil-system' || !key) return PROMPTS.contabilSystem.system;
      if (key === 'router-context') return PROMPTS.contabilSystem.routerContext;
      return PROMPTS.contabilSystem.system;
    },
  };
}

// Prompt-source com control-plane + fallback local (produção).
// Timeout 2s; se o control-plane falhar → usa fallback local sem quebrar.
export async function getPromptSource() {
  const url = process.env.AI_CONTROL_PLANE_URL;
  if (!url) return createLocalPromptSource();
  try {
    const mod = await import('@flavioneto11/control-ai-kit');
    if (typeof mod.createPromptSource !== 'function') return createLocalPromptSource();
    return mod.createPromptSource({
      controlPlaneUrl: url,
      app: 'contaviva-360',
      fallback: {
        'contabil-system': PROMPTS.contabilSystem.system,
        'router-context': PROMPTS.contabilSystem.routerContext,
      },
      cacheTtlMs: 120_000,
    });
  } catch {
    return createLocalPromptSource();
  }
}
