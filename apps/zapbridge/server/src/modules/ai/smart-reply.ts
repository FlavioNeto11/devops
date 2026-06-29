// =============================================================================
// Fase A: sugestões de resposta, reescrita inline, resumo de conversa e triagem.
// Usa callAI (fail-soft/timeout/telemetria) + prompts versionados + estilo do usuário
// (memória longa). Nada é enviado ao WhatsApp aqui — só gera texto para a UI.
// =============================================================================
import { listMessages } from '../chats/chats.service';
import { callAI, chatJSON } from './ai.service';
import { getSettings } from './consent';
import { recallUserStyle } from './graph';
import { suggestionPrompt, rewritePrompt, summaryPrompt, triagePrompt, styleBlock } from './prompts';

/** Transcrição "remetente: texto" das últimas mensagens (mais antiga → mais nova). */
export async function buildTranscript(chatId: string, limit = 12): Promise<{ transcript: string; count: number; lastText: string }> {
  const { messages } = await listMessages(chatId, undefined, limit);
  const ordered = messages.slice().reverse();
  const lines = ordered.map((m: any) => {
    const who = m.fromMe ? 'Você' : m.senderName ?? 'Contato';
    const body = m.type === 'text' ? m.text ?? '' : `[${m.type}]`;
    return `${who}: ${body}`;
  });
  const lastIncoming = [...ordered].reverse().find((m: any) => !m.fromMe && m.type === 'text');
  return { transcript: lines.join('\n'), count: messages.length, lastText: lastIncoming?.text ?? '' };
}

function asStringArray(v: unknown, key: string): string[] {
  const obj = (v ?? {}) as Record<string, unknown>;
  const arr = Array.isArray(obj[key]) ? (obj[key] as unknown[]) : [];
  return arr.map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, 3);
}

export interface Suggestion {
  suggestions: string[];
  styleApplied: boolean;
}

/** Gera 1–3 respostas curtas para a última mensagem recebida do chat. */
export async function generateSuggestion(userId: string, chatId: string): Promise<Suggestion> {
  const settings = await getSettings(userId);
  const { transcript, lastText } = await buildTranscript(chatId, 12);
  if (!transcript.trim()) return { suggestions: [], styleApplied: false };
  const style = await recallUserStyle(userId, lastText || transcript.slice(-200));
  const prompt = suggestionPrompt({
    tone: settings.tone,
    transcript,
    style: styleBlock(style),
    language: settings.language,
  });
  const out = await callAI((client) => chatJSON(client, prompt), {}, { stage: 'suggest' });
  return { suggestions: asStringArray(out, 'suggestions'), styleApplied: style.length > 0 };
}

/** Reescreve o rascunho do usuário num modo (melhorar/encurtar/formalizar/traduzir). */
export async function rewriteDraft(userId: string, text: string, mode: string): Promise<string[]> {
  if (!text.trim()) return [];
  const settings = await getSettings(userId);
  const prompt = rewritePrompt({ mode, text, tone: settings.tone, language: settings.language });
  const out = await callAI((client) => chatJSON(client, prompt), {}, { stage: 'rewrite' });
  return asStringArray(out, 'variants');
}

/** Resume o que aconteceu numa conversa (efêmero; não vira mensagem). */
export async function summarizeChat(userId: string, chatId: string): Promise<{ bullets: string[]; count: number }> {
  const settings = await getSettings(userId);
  const { transcript, count } = await buildTranscript(chatId, 40);
  if (!transcript.trim()) return { bullets: [], count: 0 };
  const prompt = summaryPrompt({ transcript, count, language: settings.language });
  const out = await callAI((client) => chatJSON(client, prompt), {}, { stage: 'summary' });
  return { bullets: asStringArray({ bullets: (out as any)?.bullets }, 'bullets'), count };
}

export type Priority = 'urgente' | 'responder' | 'fyi';

/** Classifica a prioridade da conversa (priority inbox). */
export async function triageChat(userId: string, chatId: string): Promise<{ priority: Priority; reason: string } | null> {
  const settings = await getSettings(userId);
  const { transcript } = await buildTranscript(chatId, 10);
  if (!transcript.trim()) return null;
  const prompt = triagePrompt({ transcript, language: settings.language });
  const out = (await callAI((client) => chatJSON(client, prompt), {}, { stage: 'triage' })) as any;
  const p = String(out?.priority ?? '').toLowerCase();
  const priority: Priority = p === 'urgente' || p === 'responder' ? (p as Priority) : 'fyi';
  return { priority, reason: String(out?.reason ?? '').slice(0, 200) };
}
