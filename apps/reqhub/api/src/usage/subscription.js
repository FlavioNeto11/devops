// usage/subscription.js — LIMITES DO PLANO Claude (assinatura) que o usuário vê no app desktop
// (Configurações → Uso): plano, sessão atual %, limites semanais (todos os modelos / só Sonnet) e
// créditos. A assinatura NÃO tem API pública de limites e o cache do desktop é EFÊMERO — então o
// admin informa os números pelo FORMULÁRIO do painel (POST /v1/ai-usage/subscription) e o painel os
// espelha. Persiste em Postgres (claude_plan_usage) p/ sobreviver a restart; fail-soft p/ memória
// se não houver DATABASE_URL. Distinto da CHAVE DE API Anthropic (custo real dos apps), que vem do
// Admin API noutro card.

let store = null;
let pool = null;
let pgTried = false;

async function getPool() {
  if (pool || pgTried) return pool;
  pgTried = true;
  if (!process.env.DATABASE_URL) return null;
  try {
    const pg = await import('pg');
    const Pool = pg.default ? pg.default.Pool : pg.Pool;
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    await pool.query('CREATE TABLE IF NOT EXISTS claude_plan_usage (id int PRIMARY KEY DEFAULT 1, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), CHECK (id = 1))');
  } catch { pool = null; }
  return pool;
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, n) : null; };
const pct = (v) => { const n = num(v); return n == null ? null : Math.min(100, n); };
const str = (v, max = 80) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

// payload do formulário -> shape canônico do plano. Lança se nada de útil foi informado.
function normalize(payload) {
  const p = payload || {};
  const seg = p.session || {};
  const wa = p.weeklyAll || {};
  const ws = p.weeklySonnet || {};
  const cr = p.credits || {};
  const out = {
    source: 'manual',
    plan: str(p.plan, 40) || 'Max',
    session: { pct: pct(seg.pct) ?? 0, note: str(seg.note, 80) },
    weeklyAll: { pct: pct(wa.pct), resetsLabel: str(wa.resetsLabel, 40) },
    weeklySonnet: { pct: pct(ws.pct), resetsLabel: str(ws.resetsLabel, 40) },
    credits: { spent: num(cr.spent), currency: str(cr.currency, 8) || 'BRL', pct: pct(cr.pct), resetsLabel: str(cr.resetsLabel, 40) },
    updatedBy: str(p.updatedBy, 120),
    updatedAt: new Date().toISOString(),
  };
  if (out.session.pct == null && out.weeklyAll.pct == null && out.weeklySonnet.pct == null) {
    throw new Error('informe ao menos a Sessão atual % ou um limite semanal %');
  }
  return out;
}

/** Ingere os números do plano (do formulário admin). Persiste (fail-soft). */
export async function ingestSubscription(payload, identity) {
  const data = normalize({ ...payload, updatedBy: (payload && payload.updatedBy) || identity });
  store = data;
  const pl = await getPool();
  if (pl) {
    try {
      await pl.query(
        'INSERT INTO claude_plan_usage (id, data, updated_at) VALUES (1, $1::jsonb, now()) ON CONFLICT (id) DO UPDATE SET data = $1::jsonb, updated_at = now()',
        [JSON.stringify(data)],
      );
    } catch { /* fail-soft: fica só em memória */ }
  }
  return data;
}

/** Estado do plano p/ o painel. Memória → Postgres → vazio (com nota p/ preencher). */
export async function getSubscription() {
  if (store) return store;
  const pl = await getPool();
  if (pl) {
    try {
      const r = await pl.query('SELECT data FROM claude_plan_usage WHERE id = 1');
      if (r.rows[0] && r.rows[0].data) { store = r.rows[0].data; return store; }
    } catch { /* fail-soft */ }
  }
  return {
    source: 'empty',
    note: 'Sem dados do plano ainda. Como administrador, copie os números de Configurações → Uso do app Claude (sessão atual, limites semanais, créditos) no formulário abaixo — o painel passa a espelhá-los.',
  };
}

// p/ teste
export function _reset() { store = null; pool = null; pgTried = false; }
