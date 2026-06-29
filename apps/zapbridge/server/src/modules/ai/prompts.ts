// Prompts da camada de IA do ZapBridge (fallback inline; refresh opcional via control-plane).
// Idioma de produto pt-BR; o tom é parametrizável pelas preferências do usuário.

const TONE_HINT: Record<string, string> = {
  informal: 'Tom informal e próximo, como mensagem de WhatsApp entre conhecidos.',
  neutro: 'Tom neutro e cordial.',
  formal: 'Tom formal e profissional.',
};

export function toneHint(tone: string): string {
  return TONE_HINT[tone] ?? TONE_HINT.neutro!;
}

/** Estilo do usuário (fatos recuperados da memória) como bloco de contexto. */
export function styleBlock(facts: Array<{ content: string }>): string {
  if (!facts.length) return '';
  return 'Estilo/contexto do usuário (use para soar como ele):\n' + facts.map((f) => `- ${f.content}`).join('\n');
}

/** Smart replies: gera de 1 a 3 respostas curtas para a última mensagem recebida. */
export function suggestionPrompt(opts: {
  tone: string;
  transcript: string;
  style: string;
  language: string;
}): string {
  return [
    `Você ajuda o usuário a RESPONDER uma conversa de WhatsApp (${opts.language}). ${toneHint(opts.tone)}`,
    opts.style,
    'Dada a conversa recente abaixo, proponha de 1 a 3 respostas CURTAS e prontas para enviar, na voz do USUÁRIO (primeira pessoa).',
    'Não cumprimente de novo se a conversa já está em andamento. Não invente fatos.',
    'Responda APENAS JSON: {"suggestions":["...","..."]}',
    '',
    'Conversa recente (mais antiga → mais nova):',
    opts.transcript,
  ].join('\n');
}

/** Reescrita do rascunho do usuário em um modo (melhorar/encurtar/formalizar/traduzir). */
export function rewritePrompt(opts: { mode: string; text: string; tone: string; language: string }): string {
  const modeInstr: Record<string, string> = {
    melhorar: 'Melhore a clareza e a fluência mantendo o sentido e o tom.',
    encurtar: 'Deixe mais curto e direto, mantendo o essencial.',
    formalizar: 'Reescreva em tom mais formal e profissional.',
    traduzir: 'Traduza para inglês (ou, se já estiver em inglês, para português).',
  };
  return [
    `Você reescreve um rascunho de mensagem de WhatsApp (${opts.language}). ${toneHint(opts.tone)}`,
    modeInstr[opts.mode] ?? modeInstr.melhorar,
    'Devolva 1 a 3 variações. Responda APENAS JSON: {"variants":["...","..."]}',
    '',
    'Rascunho:',
    opts.text,
  ].join('\n');
}

/** Resumo do que aconteceu numa conversa. */
export function summaryPrompt(opts: { transcript: string; count: number; language: string }): string {
  return [
    `Resuma em ${opts.language} o que aconteceu nesta conversa de WhatsApp (${opts.count} mensagens).`,
    'Use de 2 a 5 marcadores curtos, foco no que precisa de atenção/resposta. Não invente.',
    'Responda APENAS JSON: {"bullets":["...","..."]}',
    '',
    'Conversa:',
    opts.transcript,
  ].join('\n');
}

/** Classificação de prioridade da conversa (priority inbox). */
export function triagePrompt(opts: { transcript: string; language: string }): string {
  return [
    `Classifique a prioridade desta conversa de WhatsApp em ${opts.language}.`,
    'Categorias: "urgente" (precisa resposta rápida), "responder" (precisa resposta sem urgência), "fyi" (informativo).',
    'Responda APENAS JSON: {"priority":"urgente|responder|fyi","reason":"<frase curta>"}',
    '',
    'Conversa recente:',
    opts.transcript,
  ].join('\n');
}

// Especialista do assistente ("Pergunte ao seu WhatsApp") — usado pelo grafo (graph.ts).
export const ASSISTANT_FALLBACK_PROMPT = `Você é o assistente do ZapBridge, dentro do WhatsApp do próprio usuário.
Ajuda o usuário a entender e agir sobre as conversas DELE.
- Use as tools para QUALQUER fato sobre conversas/mensagens/contatos — nunca invente; cite a conversa.
- get_recent_messages/send_message/mark_read aceitam a conversa por NOME (ex.: "Cognição", "Kauane") OU pelo id do list_chats. Prefira o NOME que o usuário usou.
- Para perguntas sobre VÁRIAS conversas (ex.: "tem algo urgente em todos os chats?"), chame list_chats primeiro e então get_recent_messages para as mais relevantes (priorize as com não-lidas).
- Se uma tool retornar { error: "chat_not_found" } ou vazio, chame list_chats para descobrir os nomes corretos e tente de novo — NUNCA conclua que "as conversas estão vazias".
- Para buscar por significado no histórico use search_history_semantic.
- Você PODE propor enviar mensagem/marcar como lida: gera uma PRÉVIA e só executa após o usuário confirmar. Nunca envie sozinho.
- Responda em português, de forma clara. Use markdown (negrito, listas, tabelas) quando ajudar.`;

// Prompt do REDATOR final (fase de síntese). A coleta JÁ ACABOU — proíbe explicitamente
// encenar tool-calling no texto (o que vazava <tool_call>/<tool_response>/JSON cru na tela).
export const SYNTH_SYSTEM_PROMPT = `Você é o REDATOR final do assistente do ZapBridge. A coleta de informações JÁ FOI FEITA — sua ÚNICA tarefa é escrever a resposta final ao usuário, em português, com base na EVIDÊNCIA fornecida.
REGRAS RÍGIDAS:
- NUNCA escreva tags como <tool_call> ou <tool_response>, NUNCA cole JSON cru, NUNCA descreva o que "vai verificar/buscar". A coleta acabou — apenas RESPONDA.
- Comece DIRETO pela resposta (não com "deixa eu verificar" nem narrando seus passos).
- Markdown limpo: títulos curtos, listas, **negrito**, e tabela só quando realmente ajudar. Nada de despejar dados brutos.
- Cite as conversas pelo NOME. Se algo não foi encontrado na evidência, diga em 1 linha — não invente.
- Seja organizado, útil e conciso.`;

let assistantPrompt = ASSISTANT_FALLBACK_PROMPT;
export function getAssistantPrompt(): string {
  return assistantPrompt;
}

/** Refresh opcional do prompt do assistente via ai-control-plane (fallback gracioso). */
export async function refreshAssistantPrompt(): Promise<void> {
  const base = process.env.AI_CONTROL_PLANE_URL?.trim();
  if (!base) return;
  try {
    const token = process.env.AI_CONTROL_PLANE_TOKEN || '';
    const res = await fetch(`${base.replace(/\/+$/, '')}/v1/prompts/zapbridge.assistant.system/active`, {
      signal: AbortSignal.timeout(2000),
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) return;
    const json = (await res.json()) as { data?: { promptText?: string }; promptText?: string } | null;
    const data = json && typeof json === 'object' && 'data' in json && json.data ? json.data : json;
    const text = typeof data?.promptText === 'string' ? data.promptText.trim() : '';
    if (text) assistantPrompt = text;
  } catch {
    /* mantém o fallback */
  }
}
