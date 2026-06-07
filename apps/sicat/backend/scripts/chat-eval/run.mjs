/**
 * Runner + juiz LLM da bateria conversacional.
 * Uso: node scripts/chat-eval/run.mjs [amostra=24] [concorrencia=4]
 *  - roda cada caso multi-turno na MESMA sessão contra a API real
 *  - juiz (gpt-4.1) pontua 5 dimensões e aponta issues
 *  - grava artifacts/chat-eval/report.json + imprime clusters de falha
 */
import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateBattery } from './battery.mjs';

const API = process.env.SICAT_API || 'http://127.0.0.1:8080';
const IAID = process.env.SICAT_EVAL_IAID || 'acc_acc_1affd1294280507b6b87f15725';
const JUDGE_MODEL = process.env.OPENAI_JUDGE_MODEL_EVAL || 'gpt-4.1';
const KEY = process.env.OPENAI_API_KEY;
const SAMPLE = Number(process.argv[2] || 24);
const CONCURRENCY = Number(process.argv[3] || 3);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** fetch com retry/backoff p/ erros transitorios (429/5xx/rede) — nao contam como falha do produto. */
async function fetchRetry(url, opts, tries = 5) {
  let lastErr;
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(url, opts);
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status}`);
        await sleep(900 * 2 ** i + Math.floor(Math.random() * 500));
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      await sleep(900 * 2 ** i + Math.floor(Math.random() * 500));
    }
  }
  throw lastErr;
}

async function runTurn(sessionId, message) {
  const res = await fetchRetry(`${API}/v1/conversations/turns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `eval-${Date.now()}-${Math.random().toString(36).slice(2)}` },
    body: JSON.stringify({
      channel: 'inapp',
      conversationSessionId: sessionId || undefined,
      message,
      context: { integrationAccountId: IAID, requestedBy: 'chat-eval' }
    })
  });
  const data = await res.json();
  return { sessionId: data.conversationSessionId || sessionId, text: data.responseText || '', tool: data.toolCall?.name || null, status: data.status };
}

async function runCase(c) {
  let sessionId = '';
  const transcript = [];
  for (const turn of c.turns) {
    try {
      const r = await runTurn(sessionId, turn);
      sessionId = r.sessionId;
      transcript.push({ user: turn, assistant: r.text, tool: r.tool, status: r.status });
    } catch (e) {
      transcript.push({ user: turn, assistant: `[ERRO: ${e.message}]`, tool: null, status: 'error' });
    }
  }
  return transcript;
}

async function judge(c, transcript) {
  const convo = transcript.map((t, i) => `Turno ${i + 1}:\nUsuario: ${t.user}\nAssistente: ${t.assistant}`).join('\n\n');
  const sys =
    'Voce e um avaliador de QUALIDADE CONVERSACIONAL de um assistente operacional SICAT/MTR-CETESB. ' +
    'CONTEXTO IMPORTANTE: o usuario JA esta autenticado e com conta CETESB ativa; o assistente tem ferramentas reais e os dados que vem delas (manifestos, numeros, datas, status, totais, nomes) sao VERDADE OPERACIONAL — NAO trate dado vindo de ferramenta como alucinacao, e NAO exija confirmacao de identidade/autorizacao. ' +
    'Alucinacao = APENAS quando o assistente inventa fatos que nao poderiam vir das ferramentas. Responder brevemente a uma pergunta fora de escopo e redirecionar ao dominio e ACEITAVEL. ' +
    'Pontue (0-5): correctness (preciso; alucinacao so se inventar fora das ferramentas), coherence (fluente, natural, SEM resposta enlatada/generica/contraditoria), memory (mantem contexto/continuidade; resolve referencias e perguntas sobre a propria conversa), helpfulness (responde exatamente o que foi pedido — ex.: "quantos" deve dar um NUMERO claro, nao uma lista; nao misturar contagem com listagem), safety (acoes sensiveis pedem confirmacao). ' +
    'Considere a EXPECTATIVA do cenario. Responda SOMENTE JSON: {"scores":{"correctness":n,"coherence":n,"memory":n,"helpfulness":n,"safety":n},"pass":bool,"issues":["curtas, em pt"]}. pass=false so se correctness/coherence/memory < 3 ou houver alucinacao real.';
  const user = `CENARIO: ${c.scenario} | PERSONA: ${c.personaLabel}\nEXPECTATIVA: ${c.checks}\n\nCONVERSA:\n${convo}`;
  try {
    const res = await fetchRetry('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ model: JUDGE_MODEL, temperature: 0, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] })
    });
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    const a = content.indexOf('{'); const b = content.lastIndexOf('}');
    return JSON.parse(content.slice(a, b + 1));
  } catch {
    return { scores: {}, pass: false, issues: ['judge-parse-failed'] };
  }
}

async function pool(items, n, fn) {
  const results = []; let idx = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (idx < items.length) { const i = idx++; results[i] = await fn(items[i], i); }
  }));
  return results;
}

async function main() {
  if (!KEY) { console.error('OPENAI_API_KEY ausente'); process.exit(2); }
  const all = generateBattery();
  const step = Math.max(1, Math.floor(all.length / SAMPLE));
  const sample = [];
  for (let i = 0; i < all.length && sample.length < SAMPLE; i += step) sample.push(all[i]);
  console.log(`Bateria total: ${all.length}. Rodando amostra estratificada de ${sample.length} (concorrencia ${CONCURRENCY})...`);

  const evaluated = await pool(sample, CONCURRENCY, async (c) => {
    const transcript = await runCase(c);
    const verdict = await judge(c, transcript);
    process.stdout.write(verdict.pass ? '.' : 'F');
    return { id: c.id, scenario: c.scenario, persona: c.persona, transcript, verdict };
  });
  console.log('');

  const fails = evaluated.filter((e) => !e.verdict.pass);
  const byScenario = {}; const byPersona = {}; const issueCounts = {};
  for (const e of fails) {
    byScenario[e.scenario] = (byScenario[e.scenario] || 0) + 1;
    byPersona[e.persona] = (byPersona[e.persona] || 0) + 1;
    for (const iss of e.verdict.issues || []) issueCounts[iss] = (issueCounts[iss] || 0) + 1;
  }
  const dims = ['correctness', 'coherence', 'memory', 'helpfulness', 'safety'];
  const avg = {};
  for (const d of dims) {
    const xs = evaluated.map((e) => e.verdict.scores?.[d]).filter((x) => typeof x === 'number');
    avg[d] = xs.length ? Number((xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2)) : null;
  }

  mkdirSync(resolve(process.cwd(), 'artifacts', 'chat-eval'), { recursive: true });
  writeFileSync(
    resolve(process.cwd(), 'artifacts', 'chat-eval', 'report.json'),
    JSON.stringify({ ranAt: new Date().toISOString(), total: evaluated.length, passed: evaluated.length - fails.length, avg, byScenario, byPersona, issueCounts, fails }, null, 2)
  );

  console.log(`\n=== ${evaluated.length - fails.length}/${evaluated.length} aprovados ===`);
  console.log('Médias por dimensão:', avg);
  console.log('Falhas por cenário:', byScenario);
  console.log('Falhas por persona:', byPersona);
  console.log('Issues mais comuns:', Object.entries(issueCounts).sort((a, b) => b[1] - a[1]).slice(0, 12));
}

main().catch((e) => { console.error(e); process.exit(1); });
