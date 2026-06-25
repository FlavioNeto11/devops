// ai/tools.js — TOOLS R1 do assistente clínico (motor de grafo @flavioneto11/ai-core).
// R1: somente leitura / geração de rascunho. Nunca persistem diretamente.
// Especialista: clinical-assistant.
import { createToolRegistry } from '@flavioneto11/ai-core';
import { pool } from '../db.js';
import { embedQuery, toVectorLiteral } from './embedder.js';

// Busca por similaridade cosine no pgvector; retorna [] se não disponível.
async function searchKnowledge(queryText, { k = 6 } = {}) {
  try {
    const embedding = await embedQuery(queryText);
    if (!embedding) return [];
    const r = await pool.query(
      `select id, source_id, title, content, 1 - (embedding <=> $1::vector) as score
         from knowledge_chunks
        order by embedding <=> $1::vector
        limit $2`,
      [toVectorLiteral(embedding), k],
    );
    return (r.rows || []).map((row) => ({
      id: row.id,
      source: row.source_id,
      title: row.title ?? undefined,
      text: String(row.content).slice(0, 600),
      score: Number(row.score) || 0,
    }));
  } catch {
    // pgvector não disponível ou erro de embedding → retorna vazio (fail-soft).
    return [];
  }
}

// authorize por IDENTIDADE injetada pelo grafo (ctx.identity de turn.identity).
const authorizeAuthenticated = (ctx) => ({
  allowed: Boolean(ctx && ctx.identity),
  reason: ctx?.identity ? 'usuário autenticado' : 'requer autenticação',
});

// Autoriza somente para profissionais (context_type injetado via toolContext).
const authorizeProfessional = (ctx) => ({
  allowed: Boolean(ctx && ctx.identity && (ctx.context_type === 'professional' || ctx.role === 'professional' || ctx.role === 'clinic_manager')),
  reason: ctx?.context_type === 'professional' ? 'profissional autenticado' : 'restrito a profissionais',
});

export function buildAssistantTools() {
  return createToolRegistry([
    {
      name: 'search_knowledge',
      description:
        'Busca na base de conhecimento clínico (manuais, protocolos, documentação científica) ' +
        'os trechos mais relevantes para responder à consulta. USE ANTES de afirmar protocolos, ' +
        'diagnósticos ou posologias — cite apenas o que esta tool retornar.',
      specialist: 'clinical-assistant',
      risk: 'R1',
      mutates: false,
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'termos da busca clínica (diagnóstico, protocolo, medicamento, procedimento)' },
          k: { type: 'integer', description: 'número máximo de trechos (default 6)' },
        },
        required: ['query'],
      },
      authorize: authorizeAuthenticated,
      execute: async (input, _ctx) => {
        const k = Math.max(1, Math.min(12, Number(input?.k) || 6));
        const results = await searchKnowledge(String(input?.query || ''), { k });
        return { count: results.length, results };
      },
    },
    {
      name: 'propose_draft',
      description:
        'Propõe um rascunho clínico (plano de intervenção, carta de recomendação, relatório) ' +
        'para o profissional REVISAR E CONFIRMAR antes de salvar. ' +
        'NÃO persiste automaticamente — requer confirmação explícita do usuário.',
      specialist: 'clinical-assistant',
      risk: 'R1',
      mutates: false,
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['intervention_plan', 'recommendation_letter', 'clinical_report', 'referral'],
            description: 'tipo do documento clínico proposto',
          },
          title: { type: 'string', description: 'título do documento' },
          content: { type: 'string', description: 'conteúdo completo do rascunho em texto' },
          rationale: { type: 'string', description: 'justificativa clínica resumida' },
        },
        required: ['type', 'title', 'content'],
      },
      authorize: authorizeProfessional,
      execute: async (input, _ctx) => {
        const f = input || {};
        return {
          type: String(f.type || 'intervention_plan'),
          title: String(f.title || '').trim(),
          content: String(f.content || '').trim(),
          rationale: f.rationale ? String(f.rationale).trim() : undefined,
          requires_confirmation: true,
          status: 'pending_confirmation',
        };
      },
    },
  ]);
}

export { __resetEmbedderForTest } from './embedder.js';
