// services/ai-service.js — assistente de IA (bloco structured-outputs; caminho leve de ia-grafo).
// Triagem/priorização de ordens na Claude via @anthropic-ai/sdk (saída ESTRUTURADA, DRY-RUN: sugere,
// não aplica). App Claude-only greenfield → SDK direto (o grafo completo @flavioneto11/ai-core fica
// como exemplar do bloco ia-grafo p/ casos multi-tool).
import Anthropic from '@anthropic-ai/sdk';

let _client = null;
function client() {
  if (_client) return _client;
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  const authToken = (process.env.ANTHROPIC_AUTH_TOKEN || '').trim();
  if (!apiKey && !authToken) return null;
  _client = apiKey ? new Anthropic({ apiKey }) : new Anthropic({ authToken, defaultHeaders: { 'anthropic-beta': 'oauth-2025-04-20' } });
  return _client;
}

function parseJsonLoose(t) {
  const s = String(t || '').trim();
  const f = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const b = (f && f[1] ? f[1] : s).trim();
  try { return JSON.parse(b); } catch { /* */ }
  const i = b.indexOf('{'), j = b.lastIndexOf('}');
  if (i >= 0 && j > i) { try { return JSON.parse(b.slice(i, j + 1)); } catch { /* */ } }
  return null;
}

// Sugere a prioridade de uma ordem (saída estruturada). NÃO aplica — o operador confirma (dry-run).
export async function triageOrder(order) {
  const c = client();
  if (!c) { const e = new Error('IA não configurada (ANTHROPIC_API_KEY ausente)'); e.status = 503; throw e; }
  const model = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
  const r = await c.messages.create({
    model, max_tokens: 300,
    system: 'Você faz triagem de ordens de serviço de campo. Responda SOMENTE JSON: {"priority":"low|medium|high|critical","reason":string}. Avalie urgência e risco a partir do título.',
    messages: [{ role: 'user', content: `Ordem: "${order.title}" (prioridade atual: ${order.priority}). Sugira a prioridade adequada e justifique em 1 frase.` }],
  });
  const text = (r.content || []).map((b) => b.text || '').join('');
  const j = parseJsonLoose(text) || {};
  const valid = ['low', 'medium', 'high', 'critical'];
  return {
    suggestion: { priority: valid.includes(j.priority) ? j.priority : order.priority, reason: String(j.reason || '') },
    applied: false, // dry-run: requer confirmação do operador
    model,
  };
}
