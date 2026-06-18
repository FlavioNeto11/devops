// ai/tools.js — TOOLS R1 do chat de autoria (motor de grafo @flavioneto11/ai-core).
// Todas R1 (leitura/geracao; NAO mutam, NAO escrevem no git). O especialista "authoring"
// chama estas tools no loop ReAct: busca/consulta requisitos do produto (grounding que o
// cliente passa em ctx.grounding — produto completo) e PROPOE o draft (cujo OUTPUT vira o
// rascunho que a UI revisa). Decisao via LLM; o codigo so monta dados canonicos.
import { createToolRegistry } from '@flavioneto11/ai-core';

// authorize por IDENTIDADE: o grafo injeta ctx.identity (de turn.identity); operador
// autenticado na borda (SSO) OU Bearer. Sem identidade -> nega.
const authorizeOperator = (ctx) => ({
  allowed: Boolean(ctx && (ctx.identity || ctx.authenticated === true)),
  reason: ctx && (ctx.identity || ctx.authenticated) ? 'operador autenticado' : 'requer operador autenticado',
});

// --- busca textual pura sobre o grounding (sem dependencia de runtime) ---
const STOP = new Set(['o', 'a', 'os', 'as', 'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'um', 'uma', 'para', 'por', 'com', 'que', 'no', 'na', 'sistema', 'deve', 'the', 'of', 'to', 'and', 'in', 'for']);
function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
function tokens(s) { return [...new Set(norm(s).split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !STOP.has(t)))]; }
function scoreReq(qTokens, req) {
  const text = tokens(`${req.title || ''} ${req.statement || ''} ${req.id || ''}`);
  if (!text.length || !qTokens.length) return 0;
  const set = new Set(text);
  let inter = 0;
  for (const t of qTokens) if (set.has(t)) inter++;
  return inter / qTokens.length;
}

const groundingOf = (ctx) => (Array.isArray(ctx && ctx.grounding) ? ctx.grounding : []);

export function buildChatTools() {
  return createToolRegistry([
    {
      name: 'search_requirements',
      description: 'Busca, nos requisitos EXISTENTES do produto, os mais relevantes para uma consulta textual (descobrir se ja existe algo parecido, achar requisitos relacionados). Use ANTES de afirmar que algo existe ou nao.',
      specialist: 'authoring',
      risk: 'R1',
      mutates: false,
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'termos da busca (capacidade, tema, palavra-chave)' },
          limit: { type: 'integer', description: 'maximo de resultados (default 6)' },
        },
        required: ['query'],
      },
      authorize: authorizeOperator,
      execute: async (input, ctx) => {
        const q = tokens(input && input.query);
        const limit = Math.max(1, Math.min(12, Number(input && input.limit) || 6));
        const ranked = groundingOf(ctx)
          .map((r) => ({ r, s: scoreReq(q, r) }))
          .filter((x) => x.s > 0)
          .sort((a, b) => b.s - a.s)
          .slice(0, limit)
          .map((x) => ({ id: x.r.id, title: x.r.title || '', statement: String(x.r.statement || '').slice(0, 240), type: x.r.type }));
        return { count: ranked.length, results: ranked };
      },
    },
    {
      name: 'get_requirement',
      description: 'Retorna os detalhes de UM requisito existente do produto pelo seu id (REQ-...). Use para refinar/explicar um requisito especifico.',
      specialist: 'authoring',
      risk: 'R1',
      mutates: false,
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: 'id do requisito, ex.: REQ-GYMOPS-0001' } },
        required: ['id'],
      },
      authorize: authorizeOperator,
      execute: async (input, ctx) => {
        const id = String((input && input.id) || '').trim();
        const r = groundingOf(ctx).find((x) => x && x.id === id);
        if (!r) return { error: 'not_found', id };
        return { id: r.id, title: r.title || '', statement: r.statement || '', type: r.type || null };
      },
    },
    {
      name: 'propose_requirement_draft',
      description: 'Propoe UM rascunho de requisito testavel (uma unica capacidade) para o operador revisar no formulario. Chame quando tiver titulo + capacidade clara. NAO gere id, version nem source — quem fecha e a UI (PR). O resultado e o rascunho que aparece para revisao.',
      specialist: 'authoring',
      risk: 'R1',
      mutates: false,
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          type: { type: 'string', enum: ['functional', 'non-functional', 'business-rule', 'constraint'] },
          statement: { type: 'string', description: 'forma "O sistema DEVE ..."' },
          acceptance_criteria: { type: 'array', items: { type: 'string' } },
          verification_method: { type: 'array', items: { type: 'string', enum: ['test-unit', 'test-integration', 'test-e2e', 'architecture-review', 'deployment-policy-check', 'manual-review', 'monitoring', 'demo'] } },
          quality_scenarios: { type: 'array', items: { type: 'object', properties: { stimulus: { type: 'string' }, response: { type: 'string' }, measure: { type: 'string' } } } },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          criticality: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          architectural_significance: { type: 'boolean' },
          applies_to: { type: 'string', enum: ['product', 'product-foundation', 'shared-module', 'capability', 'portal-template', 'portal-instance', 'platform'] },
          rationale: { type: 'string' },
          warnings: { type: 'array', items: { type: 'string' } },
        },
        required: ['title', 'statement'],
      },
      authorize: authorizeOperator,
      execute: async (input, ctx) => {
        const f = input || {};
        const arr = (v) => (Array.isArray(v) ? v.filter((x) => x != null && x !== '') : []);
        // o draft tem o MESMO shape que applyDraftToForm consome; product_scope forcado pelo contexto.
        return {
          title: String(f.title || '').trim(),
          type: f.type || 'functional',
          statement: String(f.statement || '').trim(),
          acceptance_criteria: arr(f.acceptance_criteria),
          verification_method: arr(f.verification_method),
          quality_scenarios: Array.isArray(f.quality_scenarios) ? f.quality_scenarios : [],
          priority: f.priority || 'medium',
          criticality: f.criticality || f.priority || 'medium',
          architectural_significance: f.architectural_significance === true,
          scope: { applies_to: f.applies_to || 'product', product_scope: String((ctx && ctx.product) || '') },
          rationale: f.rationale ? String(f.rationale) : undefined,
          warnings: arr(f.warnings),
        };
      },
    },
  ]);
}
