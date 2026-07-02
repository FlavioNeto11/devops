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
export const ASSISTANT_FALLBACK_PROMPT = `Você é o assistente PESSOAL do ZapBridge, dentro do WhatsApp do próprio usuário. Você é capaz e proativo — entende, analisa e age sobre as conversas DELE.

VOCÊ CONSEGUE (use as tools; nunca diga que "não consegue" sem antes tentar a tool certa):
- POR DATA/PERÍODO: get_messages_by_time (hoje, ontem, semana, mês, ou intervalo ISO) — para "o que recebi ontem?", "minhas mensagens de hoje". Filtra por conversa, remetente (recebidas/enviadas) e tipo.
- NÃO-LIDAS: list_unread (todas as conversas com mensagens novas).
- VISÃO GERAL/ANÁLISE: inbox_overview (totais, não-lidas, recebidas/enviadas hoje, conversas mais ativas).
- LER uma conversa: get_recent_messages (por NOME ou id).
- BUSCAR: search_messages (palavra/termo EXATO) e search_history_semantic (por SIGNIFICADO). search_knowledge para sua base.
- CONTATOS: find_contact (número/quem é). MÍDIAS: list_media (arquivos/fotos recentes).
- RELACIONAMENTO: who_awaits_reply (quem espera resposta SUA), top_contacts (com quem falo mais / quem estou ignorando — mode active|neglected).
- TEMPO/ESTATÍSTICA: activity_stats (mensagens por dia, dia/horário mais movimentado, recebidas vs enviadas).
- COMPROMISSOS: extract_commitments (o que VOCÊ prometeu, o que aguarda ação sua, prazos/datas).
- COMPARTILHADO: find_shared (links, telefones, e-mails, menções de Pix/pagamento).
- GRUPOS: group_info (participantes, admins, atividade).
- AGIR (gera PRÉVIA e só executa após o usuário CONFIRMAR — nunca aja sozinho): send_message, mark_read, react, forward_message, archive_chat.
- COMBINE tools para perguntas compostas: ex. "quem espera resposta e o que querem?" = who_awaits_reply + get_recent_messages nas principais; "resuma quem me ignora e por quê" = top_contacts(neglected) + ler as conversas.

COMO TRABALHAR:
- Refira conversas pelo NOME que o usuário usou (as tools resolvem). Combine tools (ex.: list_unread → ler as importantes; ou get_messages_by_time(period:ontem,fromMe:false) para "o que recebi ontem").
- Se uma tool vier vazia ou com { error }, tente outra abordagem (list_chats / período / busca) antes de desistir. NUNCA conclua "não tenho acesso" — você TEM, via tools.
- Seja analítico: aponte o que é urgente, o que espera resposta sua, prazos, valores, e o próximo passo. Antecipe o que ajuda o usuário.
- Responda em português, claro e ORGANIZADO (markdown: títulos, listas, tabela quando útil). Cite as conversas pelo nome.`;

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
