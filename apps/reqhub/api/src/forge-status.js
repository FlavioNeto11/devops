// forge-status.js — estado VIVO de um launch da Forja, lido do GitHub com o PAT de dispatch.
// A UI faz polling de GET /v1/forge/launch-status?product=<slug> e mostra o progresso na própria
// tela (requisitos → plano → construção → publicado) em vez de só um link para o GitHub.
//   - reqs:  PR forge/<product>/requisitos (aberto = criando; merged = pronto)
//   - plano: PR forge/plan/<product>       (aberto = planejando; merged = pronto)
//   - build: PRs de implementação abertos (label claude-generated) cujo branch é req/REQ-<PRODUCT>...
// A LIVENESS do app publicado é checada no BROWSER (mesmo host /<product>), não aqui — de dentro do
// pod o host público pode não resolver. Este módulo só reporta a cadeia do GitHub. Fail-soft.
const GH = 'https://api.github.com';

function slugToReqPrefix(product) {
  // REQ-<PRODUCT-SEM-HÍFEN-EM-MAIÚSCULAS>- — espelha nextReqId/forgeReqObject do frontend.
  return 'REQ-' + String(product || '').toUpperCase().replace(/-/g, '') + '-';
}

/** Busca o PR mais recente cujo head é <branch> (qualquer estado). null se não houver. */
async function prForHead({ token, repo, branch, fetchImpl }) {
  const owner = repo.split('/')[0];
  const url = `${GH}/repos/${repo}/pulls?head=${owner}:${encodeURIComponent(branch)}&state=all&per_page=10`;
  const r = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'reqhub-forge' },
  });
  if (!r.ok) return null;
  const arr = await r.json().catch(() => []);
  if (!Array.isArray(arr) || !arr.length) return null;
  const pr = arr.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
  return { number: pr.number, state: pr.state, merged: !!pr.merged_at, url: pr.html_url, title: pr.title };
}

/** Conta os PRs de implementação (claude-generated) do produto: abertos vs já mesclados (recentes). */
async function implPrs({ token, repo, product, fetchImpl }) {
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'reqhub-forge' };
  const prefix = slugToReqPrefix(product).toLowerCase();
  const open = await fetchImpl(`${GH}/repos/${repo}/pulls?state=open&per_page=100`, { headers })
    .then((r) => (r.ok ? r.json() : [])).catch(() => []);
  const isProd = (pr) => String(pr.head && pr.head.ref || '').toLowerCase().includes(prefix)
    && (pr.labels || []).some((l) => l.name === 'claude-generated');
  const openProd = (Array.isArray(open) ? open : []).filter(isProd);
  return { open: openProd.length, openUrls: openProd.slice(0, 8).map((p) => ({ number: p.number, url: p.html_url, title: p.title })) };
}

function stage(key, label, status, detail, url) { return { key, label, status, detail: detail || '', url: url || '' }; }

/** Monta o estado da cadeia (fail-soft: erros viram detail, nunca lançam). */
export async function buildLaunchStatus({ token, repo, product, fetchImpl = fetch }) {
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(String(product || ''))) {
    return { ok: false, code: 'INVALID_PRODUCT', message: 'product inválido (slug)' };
  }
  const stages = [];
  try {
    const reqs = await prForHead({ token, repo, branch: `forge/${product}/requisitos`, fetchImpl });
    if (!reqs) stages.push(stage('requisitos', 'Requisitos no git', 'pending', 'aguardando o disparo…'));
    else if (reqs.merged) stages.push(stage('requisitos', 'Requisitos no git', 'done', `PR #${reqs.number} mesclado`, reqs.url));
    else if (reqs.state === 'open') stages.push(stage('requisitos', 'Requisitos no git', 'active', `PR #${reqs.number} aberto`, reqs.url));
    else stages.push(stage('requisitos', 'Requisitos no git', 'error', `PR #${reqs.number} fechado sem merge`, reqs.url));

    const plan = await prForHead({ token, repo, branch: `forge/plan/${product}`, fetchImpl });
    if (!plan) stages.push(stage('plano', 'Arquitetura & plano', 'pending', 'aguardando os requisitos…'));
    else if (plan.merged) stages.push(stage('plano', 'Arquitetura & plano', 'done', `PR #${plan.number} mesclado`, plan.url));
    else if (plan.state === 'open') stages.push(stage('plano', 'Arquitetura & plano', 'active', `PR #${plan.number} aberto`, plan.url));
    else stages.push(stage('plano', 'Arquitetura & plano', 'error', `PR #${plan.number} fechado sem merge`, plan.url));

    const impl = await implPrs({ token, repo, product, fetchImpl });
    if (impl.open > 0) stages.push(stage('build', 'Construção (implementação)', 'active', `${impl.open} PR(s) de implementação em andamento`));
    else if (plan && plan.merged) stages.push(stage('build', 'Construção (implementação)', 'active', 'gerando as partes…'));
    else stages.push(stage('build', 'Construção (implementação)', 'pending', 'aguardando o plano…'));
  } catch (e) {
    return { ok: true, product, stages, error: String((e && e.message) || e) };
  }
  return { ok: true, product, stages };
}

/** Estado VIVO do BUILD de um produto: req-implement rodando + PRs de implementação abertos (com CI).
 *  Alimenta o indicador "processando/bloqueado" na tela Build. Fail-soft. */
export async function buildProductStatus({ token, repo, product, fetchImpl = fetch }) {
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(String(product || ''))) {
    return { ok: false, code: 'INVALID_PRODUCT', message: 'product inválido' };
  }
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'reqhub-forge', 'X-GitHub-Api-Version': '2022-11-28' };
  const out = { ok: true, product, running: 0, prs: [] };
  try {
    // req-implement em execução/fila (sinal de "construindo agora"). Não é por-produto, mas no lab
    // só há um build ativo por vez — suficiente para o indicador.
    for (const st of ['in_progress', 'queued']) {
      const r = await fetchImpl(`${GH}/repos/${repo}/actions/workflows/req-implement.yml/runs?status=${st}&per_page=30`, { headers });
      if (r.ok) { const j = await r.json().catch(() => ({})); out.running += (j.total_count || (j.workflow_runs || []).length || 0); }
    }
    // PRs de implementação abertos deste produto (branch req/REQ-<PRODUTO>...), com resumo de CI.
    const prefix = ('req/' + slugToReqPrefix(product)).toLowerCase();
    const open = await fetchImpl(`${GH}/repos/${repo}/pulls?state=open&per_page=100`, { headers })
      .then((r) => (r.ok ? r.json() : [])).catch(() => []);
    for (const pr of (Array.isArray(open) ? open : [])) {
      const ref = String(pr.head && pr.head.ref || '').toLowerCase();
      if (!ref.startsWith(prefix)) continue;
      const reqId = (String(pr.head.ref).match(/req\/(REQ-[A-Z0-9-]+?)\//i) || [])[1] || '';
      // resumo de checks do PR (status + check-runs do head sha)
      let failed = 0, pending = 0, passed = 0;
      try {
        const sha = pr.head.sha;
        const cr = await fetchImpl(`${GH}/repos/${repo}/commits/${sha}/check-runs?per_page=100`, { headers }).then((x) => x.ok ? x.json() : { check_runs: [] }).catch(() => ({ check_runs: [] }));
        for (const c of (cr.check_runs || [])) {
          if (/auto-merge/i.test(c.name || '')) continue; // ignora o próprio job de merge
          if (c.status !== 'completed') pending++;
          else if (c.conclusion === 'success' || c.conclusion === 'neutral' || c.conclusion === 'skipped') passed++;
          else failed++;
        }
      } catch { /* fail-soft */ }
      const state = failed > 0 ? 'blocked' : (pending > 0 ? 'checking' : 'ready');
      out.prs.push({ req: reqId, number: pr.number, url: pr.html_url, state, failed, pending, passed });
    }
  } catch (e) { out.error = String((e && e.message) || e); }
  return out;
}

export { slugToReqPrefix };
