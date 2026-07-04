// forge-lib.js — lógica PURA da aba Forge (sem DOM). Testável com node:test.
// O Forge é um scheduler determinístico em cima da esteira: aqui só modelamos
// dados (produtos, fases, DAG de waves, progresso) e geramos texto (YAML/comandos).
// Nada de fetch, nada de DOM, nada de efeito colateral — render fica no app.js.

export const DONE_STATUSES = ['deployed', 'done', 'merged'];
export const ACTIVE_STATUSES = ['in_progress', 'pr_open', 'merged'];
export const STATUS_ORDER = ['not_started', 'in_progress', 'pr_open', 'merged', 'deployed', 'done', 'blocked'];

const PHASE_KEYS = ['definir', 'arquitetura', 'build'];

/* ---------- merge do estado VIVO × BAKED (D1, Forja 4.1) ----------
   Semântica decidida em revisão adversarial:
   - PRESENÇA = payload vivo fresco (ConfigMap). União ressuscitaria produto apagado para sempre
     (a imagem :local nunca rebakeia sozinha) e regrediria o forge-delete verificado do 4.0.
   - CAMPOS: o baked PREENCHE o que o vivo não transporta ou manda vazio (origin, vision,
     architecture_summary, phases…) — generalização da regra anti-regressão do architecture_summary.
   - implStatus = UNIÃO por REQ-id: o baked traz TODOS os escopos (incl. ~350 REQs de plataforma
     que o payload vivo não carrega — o replace antigo os zerava); o vivo vence por id. */
export function mergeLiveProducts(bakedProducts, liveProducts, prevArchByName) {
  const baked = new Map((Array.isArray(bakedProducts) ? bakedProducts : []).filter((p) => p && p.name).map((p) => [p.name, p]));
  const prev = prevArchByName || {};
  const fill = (live, bk, key) => {
    const v = live[key];
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length && Array.isArray(bk[key]) && bk[key].length)) return bk[key] !== undefined ? bk[key] : v;
    return v;
  };
  return (Array.isArray(liveProducts) ? liveProducts : []).filter((p) => p && p.name).map((p) => {
    const bk = baked.get(p.name) || {};
    return {
      name: p.name,
      display_name: fill(p, bk, 'display_name') || p.name,
      base_path: fill(p, bk, 'base_path'),
      blueprint: fill(p, bk, 'blueprint'),
      stack: fill(p, bk, 'stack'),
      app_type: fill(p, bk, 'app_type'),
      origin: p.origin || bk.origin || 'greenfield',
      vision: fill(p, bk, 'vision'),
      phases: (p.phases && Object.keys(p.phases).length ? p.phases : bk.phases) || {},
      architecture_summary: p.architecture_summary || bk.architecture_summary || prev[p.name] || '',
      capability_blocks: fill(p, bk, 'capability_blocks'),
      requirement_ids: fill(p, bk, 'requirement_ids'),
      reqCount: p.reqCount,
      progress: p.progress,
    };
  });
}
export function mergeImplItems(bakedItems, liveProducts) {
  const items = { ...(bakedItems || {}) };
  for (const p of (Array.isArray(liveProducts) ? liveProducts : [])) {
    for (const r of (p && Array.isArray(p.reqs) ? p.reqs : [])) if (r && r.id) items[r.id] = { ...(items[r.id] || {}), status: r.status };
  }
  return items;
}
/** Assinatura barata do estado MESCLADO — re-render só quando algo visível muda. */
export function forgeStateSig(mergedProducts) {
  return JSON.stringify((mergedProducts || []).map((p) => [p.name, p.reqCount ?? null, p.progress ? p.progress.done : null, p.progress ? p.progress.pct : null, p.origin || null]));
}

/** Status de implementação de um requisito (default not_started). */
export function reqStatus(implStatus, id) {
  const it = implStatus && implStatus.items && implStatus.items[id];
  return (it && it.status) || 'not_started';
}

/** Rollup de progresso de um conjunto de requisitos a partir do implementation-status. */
export function progressOf(reqIds, implStatus) {
  const ids = Array.isArray(reqIds) ? reqIds : [];
  const by = {};
  for (const s of STATUS_ORDER) by[s] = 0;
  let done = 0;
  for (const id of ids) {
    const st = reqStatus(implStatus, id);
    by[st] = (by[st] || 0) + 1;
    if (DONE_STATUSES.includes(st)) done++;
  }
  const total = ids.length;
  return { by, done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

// Pesos por estágio para um progresso GRANULAR e HONESTO. "merged" (código no main) NÃO é 100% —
// falta deploy/verificação; só deployed/done (ou merged com o app COMPROVADAMENTE no ar) chega a 1.
// Assim a barra reflete o quanto falta e SEMPRE tem o que acompanhar (não pula de 0 a 100).
export const STAGE_WEIGHT = { not_started: 0, blocked: 0, in_progress: 0.4, pr_open: 0.7, merged: 0.9, deployed: 1, done: 1 };

/** Progresso PONDERADO por estágio (+ breakdown por status). opts.live=true (app no ar comprovado)
 *  faz "merged" contar como 1 (entregue e no ar). Puro. */
export function weightedProgress(reqIds, implStatus, opts = {}) {
  const ids = Array.isArray(reqIds) ? reqIds : [];
  const live = !!opts.live;
  const by = {};
  for (const s of STATUS_ORDER) by[s] = 0;
  let score = 0;
  for (const id of ids) {
    const st = reqStatus(implStatus, id);
    by[st] = (by[st] || 0) + 1;
    let w = STAGE_WEIGHT[st] != null ? STAGE_WEIGHT[st] : 0;
    if (live && st === 'merged') w = 1;
    score += w;
  }
  const total = ids.length;
  const delivered = (by.merged || 0) + (by.deployed || 0) + (by.done || 0); // código no main
  const liveCount = (by.deployed || 0) + (by.done || 0) + (live ? (by.merged || 0) : 0); // no ar de fato
  return { by, total, delivered, live: liveCount, pct: total ? Math.round((score / total) * 100) : 0 };
}

/** Estado das waves COERENTE com o progresso geral. Os work_orders do build-plan são TAREFAS finas
 *  (não requisitos rastreados) — não dá p/ contar "done" por tarefa sem mentir. Então derivamos o
 *  preenchimento das waves do progresso ponderado (pct 0..100), cumulativo e em ordem. Puro. */
export function wavesFromProgress(buildPlan, pct) {
  const waves = (buildPlan && buildPlan.waves) || [];
  const n = waves.length;
  const filled = Math.max(0, Math.min(1, (Number(pct) || 0) / 100)) * n;
  return waves.map((w, i) => {
    let state;
    if (i + 1 <= filled) state = 'done';      // wave inteiramente coberta pelo progresso
    else if (i < filled) state = 'active';     // o progresso cai dentro desta wave
    else state = 'todo';                       // ainda não alcançada
    return { id: w.id || ('w' + i), gate: w.gate || 'auto', tasks: (w.work_orders || []).map(String), state, index: i, total: n };
  });
}

/** Modelo ORDENADO das 4 fases da tela "Construindo o <X>", derivado de dados REAIS:
 *  - requisitos / plano: do launch-status (PRs no git).
 *  - construção / publicado: do impl-status (progresso REAL dos requisitos), NÃO de uma sonda HEAD
 *    (que dá falso-positivo quando o catch-all do portal responde 200 em /<slug>/).
 *  Clamp MONOTÔNICO: nenhuma fase pode estar done/active à frente de uma anterior incompleta — assim
 *  "Publicado" NUNCA aparece concluído antes de Arquitetura/Construção. PURO/testável.
 *  `stages` = array do /v1/forge/launch-status; `product` pode ser null (ainda não no estado vivo). */
export function launchPhases(stages, product, implStatus, buildPlan) {
  const by = {};
  for (const s of (Array.isArray(stages) ? stages : [])) if (s && s.key) by[s.key] = s;
  const reqIds = (product && product.requirement_ids) || [];
  const prog = weightedProgress(reqIds, implStatus);
  const phases = (product && product.phases) || {};
  const nWaves = ((buildPlan && buildPlan.waves) || []).length;
  const archApproved = !!(phases.architecture && phases.architecture.status === 'approved');

  const r = by.requisitos || {};
  const requisitos = {
    key: 'requisitos', label: 'Requisitos no git', url: r.url || '',
    status: r.status || (reqIds.length ? 'done' : 'pending'),
    detail: r.detail || (reqIds.length ? `${reqIds.length} requisito(s)` : 'aguardando o disparo…'),
  };

  const pl = by.plano || {};
  const planoDone = pl.status === 'done' || archApproved || (nWaves > 0 && buildPlan && buildPlan.status === 'approved');
  const plano = {
    key: 'plano', label: 'Arquitetura & plano', url: pl.url || '',
    status: planoDone ? 'done' : (pl.status || (nWaves > 0 ? 'active' : 'pending')),
    detail: nWaves > 0 ? `${nWaves} wave(s) · plano ${(buildPlan && buildPlan.status) || 'proposto'}`
      : (pl.detail || (archApproved ? 'arquitetura aprovada' : 'aguardando os requisitos…')),
  };

  const b = by.build || {};
  const buildDone = prog.total > 0 && prog.pct === 100;
  const buildActive = (prog.total > 0 && prog.pct > 0 && !buildDone) || b.status === 'active';
  const build = {
    key: 'build', label: 'Construção (implementação)', url: b.url || '',
    status: buildDone ? 'done' : (buildActive ? 'active' : 'pending'),
    detail: prog.total ? `${prog.live}/${prog.total} requisito(s) no ar · ${prog.pct}%`
      : (b.detail || 'aguardando o plano…'),
  };

  const publicado = {
    key: 'publicado', label: 'Publicado', url: '',
    status: buildDone ? 'done' : 'pending',
    detail: buildDone ? 'no ar' : 'aguardando a construção…',
  };

  const out = [requisitos, plano, build, publicado];
  // Clamp MONOTÔNICO: depois da 1ª fase não-concluída, todas as seguintes voltam a 'pending'.
  let seenIncomplete = false;
  for (const ph of out) {
    if (seenIncomplete && ph.status !== 'pending') ph.status = 'pending';
    if (ph.status !== 'done') seenIncomplete = true;
  }
  return out;
}

/** Lista de produtos com progresso vivo, ordenada por display_name. */
export function productSummaries(products, implStatus) {
  const list = (products && products.products) || [];
  return list
    .map((p) => ({
      name: p.name,
      display_name: p.display_name || p.name,
      blueprint: p.blueprint || null,
      vision: p.vision || '',
      base_path: p.base_path || '/' + p.name,
      app_type: p.app_type || 'product_software',
      reqIds: p.requirement_ids || [],
      reqCount: (p.requirement_ids || []).length,
      // weightedProgress: "no ar"=deployed+done (.live), "código no main"=.delivered, pct ponderado.
      progress: weightedProgress(p.requirement_ids || [], implStatus),
      phases: p.phases || {},
    }))
    .sort((a, b) => String(a.display_name).localeCompare(String(b.display_name), 'pt-BR'));
}

export function findProduct(products, name) {
  return ((products && products.products) || []).find((p) => p.name === name) || null;
}

export function blueprintById(blueprints, id) {
  return ((blueprints && blueprints.blueprints) || []).find((b) => b.id === id) || null;
}

/**
 * Modelo do stepper de 3 fases (Definir → Arquitetura → Build), derivado de dados REAIS:
 * - definir: phases.requirements approved + tem requisitos
 * - arquitetura: phases.architecture approved
 * - build: 100% dos requisitos deployed/done
 * Exatamente uma fase 'current' (a primeira não concluída); as demais 'done' ou 'todo'.
 */
export function phaseModel(product, buildPlan, implStatus) {
  const phases = (product && product.phases) || {};
  const reqIds = (product && product.requirement_ids) || [];
  // weightedProgress (mesma fonte do hub/build): "no ar" = deployed+done (merged NÃO é no ar);
  // pct ponderado. Garante números CONSISTENTES entre stepper, hub e pipeline.
  const prog = weightedProgress(reqIds, implStatus);
  const nWaves = ((buildPlan && buildPlan.waves) || []).length;
  const archApproved = (phases.architecture && phases.architecture.status) === 'approved';
  const done = {
    definir: ((phases.requirements && phases.requirements.status) === 'approved') && reqIds.length > 0,
    // arquitetura aprovada = fase concluída (o plano de build/waves é um detalhe, não o gate):
    // sistemas no ar não devem mais aparecer como "sem plano de build".
    arquitetura: archApproved,
    build: prog.total > 0 && prog.pct === 100,
  };
  const archDetail = (buildPlan && nWaves) ? `${nWaves} wave(s) · plano ${buildPlan.status || 'proposed'}`
    : (archApproved ? 'arquitetura aprovada' : 'sem plano de build');
  const meta = {
    definir: { label: 'Definir', detail: reqIds.length ? `${reqIds.length} requisito(s)` : 'sem requisitos' },
    arquitetura: { label: 'Arquitetura', detail: archDetail },
    build: { label: 'Build', detail: `${prog.live}/${prog.total} no ar · ${prog.pct}%` },
  };
  let currentAssigned = false;
  return PHASE_KEYS.map((k) => {
    let status;
    if (done[k]) status = 'done';
    else if (!currentAssigned) { status = 'current'; currentAssigned = true; }
    else status = 'todo';
    return { key: k, label: meta[k].label, detail: meta[k].detail, status };
  });
}

/**
 * TRILHO do Product Studio (A1b, Forja 4.0) — 7 fases do produto:
 * Brief → Requisitos → Arquitetura → Telas → Documentação → Pipeline → Publicação.
 * Puro e determinístico; sinais assíncronos entram por `extra` (fail-soft):
 *   extra.previewStatus: 'ready'|'building'|'error'|'absent'|null (null = desconhecido)
 *   extra.previewScreens: nº de telas do preview (quando ready)
 *   extra.liveUrlOk: boolean|null — sonda da URL final (null = não sondada; só REBAIXA quando false)
 * Mesma regra do phaseModel: exatamente uma fase 'current' (a primeira não concluída).
 */
export const STUDIO_PHASE_KEYS = ['brief', 'requisitos', 'arquitetura', 'telas', 'docs', 'pipeline', 'publicado'];
/* (E4, Forja 4.1) trilho REDUZIDO t1: portal de conteúdo (executor = CMS, sem esteira de código).
   Brief → Conteúdo → Publicação. A fase Conteúdo embute o editor do CMS do Console e NUNCA fica
   "done" — conteúdo é vivo por natureza (a fase é o lugar de trabalho, não um gate). */
export const STUDIO_T1_PHASE_KEYS = ['brief', 'conteudo', 'publicado'];
export function isT1Product(product) { return !!product && product.app_type === 'cms_portal'; }
// exatamente uma fase 'current' (a primeira não concluída) — regra compartilhada dos trilhos
function assignPhaseStatuses(keys, done, meta) {
  let currentAssigned = false;
  return keys.map((k) => {
    let status;
    if (done[k]) status = 'done';
    else if (!currentAssigned) { status = 'current'; currentAssigned = true; }
    else status = 'todo';
    return { key: k, label: meta[k].label, detail: meta[k].detail, status };
  });
}
export function studioPhaseModel(product, buildPlan, implStatus, extra) {
  const x = extra || {};
  const hasBrief = !!String((product && (product.vision || product.brief)) || '').trim();
  // produto t1: sem requisitos/arquitetura/telas/pipeline — o executor é o CMS da plataforma
  if (isT1Product(product)) {
    return assignPhaseStatuses(STUDIO_T1_PHASE_KEYS, {
      brief: hasBrief,
      conteudo: false, // vivo por natureza: sempre a fase de trabalho (nunca 'done')
      publicado: x.liveUrlOk === true,
    }, {
      brief: { label: 'Brief', detail: hasBrief ? 'visão registrada' : 'sem visão/brief' },
      conteudo: { label: 'Conteúdo', detail: 'editor do CMS embutido — páginas e seções' },
      publicado: { label: 'Publicação', detail: x.liveUrlOk === true ? 'no ar' : (x.liveUrlOk === false ? 'URL fora do ar!' : 'sonda pendente…') },
    });
  }
  const phases = (product && product.phases) || {};
  const reqIds = (product && product.requirement_ids) || [];
  const prog = weightedProgress(reqIds, implStatus);
  const nWaves = ((buildPlan && buildPlan.waves) || []).length;
  const archApproved = (phases.architecture && phases.architecture.status) === 'approved';
  const preview = x.previewStatus || null;
  // docs renderizáveis = há o que documentar (visão + requisitos ou arquitetura) — a fase Docs
  // compõe o que JÁ existe (product/build-plan/baseline); não depende de artefato novo.
  const docsReady = hasBrief && (reqIds.length > 0 || archApproved || nWaves > 0);
  const pipelineDone = prog.total > 0 && prog.pct === 100;
  const done = {
    brief: hasBrief,
    requisitos: ((phases.requirements && phases.requirements.status) === 'approved') && reqIds.length > 0,
    arquitetura: archApproved,
    telas: preview === 'ready',
    docs: docsReady,
    pipeline: pipelineDone,
    publicado: pipelineDone && x.liveUrlOk !== false,
  };
  const archDetail = (buildPlan && nWaves) ? `${nWaves} wave(s) · plano ${buildPlan.status || 'proposed'}`
    : (archApproved ? 'arquitetura aprovada' : 'sem plano de build');
  const telasDetail = preview === 'ready' ? (x.previewScreens ? `${x.previewScreens} tela(s) navegáveis` : 'preview pronto')
    : preview === 'building' ? 'gerando preview…'
      : preview === 'error' ? 'preview com erro'
        : preview === 'absent' ? 'sem preview' : 'preview não consultado';
  const meta = {
    brief: { label: 'Brief', detail: hasBrief ? 'visão registrada' : 'sem visão/brief' },
    requisitos: { label: 'Requisitos', detail: reqIds.length ? `${reqIds.length} requisito(s)` : 'sem requisitos' },
    arquitetura: { label: 'Arquitetura', detail: archDetail },
    telas: { label: 'Telas', detail: telasDetail },
    docs: { label: 'Documentação', detail: docsReady ? 'gerada do produto' : 'aguardando visão/requisitos' },
    pipeline: { label: 'Pipeline', detail: `${prog.live}/${prog.total} no ar · ${prog.pct}%` },
    publicado: { label: 'Publicação', detail: pipelineDone ? (x.liveUrlOk === false ? 'URL fora do ar!' : 'no ar') : 'aguardando o pipeline…' },
  };
  return assignPhaseStatuses(STUDIO_PHASE_KEYS, done, meta);
}

/* ---------- (E4, Forja 4.1) embed do CMS no trilho t1 — helpers puros ----------
   O editor de conteúdo do Console é embutido por IFRAME same-origin em modo embed
   (?embed=1). O contrato postMessage é validado aqui (payload); a checagem de ORIGEM
   (event.origin === location.origin) é responsabilidade do listener que tem o evento. */
// URL do Console em modo EMBED: renderiza SÓ o editor de conteúdo (sem casca) já
// focado no projeto <key> (o hash usa a MESMA gramática do deep-link A4/E1).
export function embedConsoleUrl(projectKey) {
  const k = String(projectKey || '').trim();
  return k ? '/devops/?embed=1#conteudo?projeto=' + encodeURIComponent(k) : '';
}
// URL pública do portal (site-renderer /sites/<chave> ou app dedicado) — barra final
// para os assets relativos resolverem dentro do iframe.
export function publishedSiteUrl(product) {
  const bp = String((product && product.base_path) || '');
  return bp.startsWith('/') ? bp.replace(/\/+$/, '') + '/' : '';
}
// Mensagens aceitas do embed do Console: { source:'console-embed', type:'embed:ready'|'embed:navigate' }.
// Qualquer outra coisa => null (nunca lança; dados de postMessage são input não confiável).
export function parseEmbedMessage(data) {
  if (!data || typeof data !== 'object' || data.source !== 'console-embed') return null;
  const type = typeof data.type === 'string' ? data.type : '';
  if (type !== 'embed:ready' && type !== 'embed:navigate') return null;
  return {
    type,
    view: typeof data.view === 'string' ? data.view : '',
    projeto: typeof data.projeto === 'string' ? data.projeto : '',
  };
}

/**
 * DAG de build a partir das waves: nós = requisitos (com wave e status), arestas
 * conectam cada requisito aos da wave imediatamente anterior (ordem do build-plan,
 * que já é topologicamente ordenada). Determinístico e puro.
 */
export function buildDag(buildPlan, implStatus) {
  const waves = (buildPlan && buildPlan.waves) || [];
  const nodes = [];
  const edges = [];
  waves.forEach((w, i) => {
    for (const id of w.work_orders || []) {
      nodes.push({ id, wave: i, waveId: w.id, status: reqStatus(implStatus, id) });
    }
  });
  for (let i = 1; i < waves.length; i++) {
    const prev = waves[i - 1].work_orders || [];
    const cur = waves[i].work_orders || [];
    for (const c of cur) for (const p of prev) edges.push({ from: p, to: c });
  }
  return { nodes, edges };
}

/**
 * Estado por wave para o stepper de Build. Uma wave fica:
 * - done: todos os requisitos done/deployed/merged
 * - active: a anterior concluiu e há requisito em andamento
 * - ready: a anterior concluiu e nada começou
 * - blocked: a anterior não concluiu
 */
export function waveProgress(buildPlan, implStatus) {
  const waves = (buildPlan && buildPlan.waves) || [];
  let prevDone = true; // "todas as waves anteriores concluiram" (gating cumulativo)
  return waves.map((w) => {
    const reqs = (w.work_orders || []).map((id) => ({ id, status: reqStatus(implStatus, id) }));
    const total = reqs.length;
    const done = reqs.filter((r) => DONE_STATUSES.includes(r.status)).length;
    const allDone = total === 0 || done === total; // wave vazia nao tem nada a fazer -> nao bloqueia
    const anyActive = reqs.some((r) => ACTIVE_STATUSES.includes(r.status));
    let state;
    if (allDone) state = 'done';
    else if (prevDone && (anyActive || done > 0)) state = 'active';
    else if (prevDone) state = 'ready';
    else state = 'blocked';
    const out = { id: w.id, gate: w.gate || 'auto', reqs, done, total, state };
    prevDone = prevDone && allDone;
    return out;
  });
}

/** Rótulo pt-BR do tipo de requisito (alinha o vocabulario do metamodelo). */
export function typeLabel(type) {
  return { functional: 'Funcional', non_functional: 'Não-funcional', 'non-functional': 'Não-funcional',
    constraint: 'Restrição', interface: 'Interface', 'business-rule': 'Regra de negócio' }[type] || (type || 'Funcional');
}

/** Garante array (a IA pode devolver string/undefined em campos de lista). */
export function asList(v) {
  if (Array.isArray(v)) return v.filter((x) => x != null && x !== '');
  if (v == null || v === '') return [];
  return [v];
}

/** Linha da tabela de build de um requisito (junta baseline + status). */
export function reqRow(id, baseline, implStatus) {
  const r = baseline && baseline.requirements && baseline.requirements.find((x) => x.id === id);
  const it = implStatus && implStatus.items && implStatus.items[id];
  return {
    id,
    title: r ? r.title : '',
    type: r ? r.type : '',
    product: r && r.scope ? r.scope.product_scope : '',
    status: (it && it.status) || 'not_started',
    pr: (it && it.pr) || null,
    deployed_at: (it && it.deployed_at) || null,
  };
}

/** Classe CSS de badge por status de desenvolvimento (alinhada ao reqhub). */
export function forgeStatusCls(status) {
  if (DONE_STATUSES.includes(status)) return 'b-ok';
  if (status === 'blocked') return 'b-crit';
  if (ACTIVE_STATUSES.includes(status)) return 'b-high';
  return 'b-low';
}

/** Valida o padrão canônico de REQ-ID (REQ-PRODUTO-[NFR-]NNN[N]). */
export function validateReqId(id) {
  return /^REQ-[A-Z0-9]+-(NFR-)?\d{3,4}$/.test(String(id || ''));
}

/** Próximo número livre de REQ para um produto (ex.: REQ-CRM-0006). */
export function nextReqId(productName, existingIds) {
  const prefix = 'REQ-' + String(productName || '').toUpperCase().replace(/[^A-Z0-9]/g, '') + '-';
  let max = 0;
  for (const id of existingIds || []) {
    const m = String(id).match(/-(\d{3,4})$/);
    if (id.startsWith(prefix) && m) max = Math.max(max, parseInt(m[1], 10));
  }
  return prefix + String(max + 1).padStart(4, '0');
}

/** Caminho do arquivo YAML de um requisito (para o comando de PR). */
export function reqFilePath(id, productName) {
  return `specs/requirements/${productName}/${id}.yaml`;
}

/** Branch sugerida para a proposta de requisitos (a UI não escreve git). */
export function proposeBranch(productName) {
  return `forge/${String(productName || 'produto')}/requisitos`;
}

/**
 * One-liner informativo do fluxo de PR (a UI NUNCA escreve no git — mostra o caminho).
 * Não executa nada; é texto para o operador copiar.
 */
export function proposeHint(productName, count) {
  const branch = proposeBranch(productName);
  return `# Revise os YAMLs abaixo, salve em specs/requirements/${productName}/ e abra o PR:\n` +
    `git checkout -b ${branch} && git add specs/requirements/${productName}/ && \\\n` +
    `git commit -m "feat(${productName}): ${count} requisito(s) propostos pelo Forge" && \\\n` +
    `git push -u origin ${branch} && gh pr create --fill --label requirement`;
}

/** Normaliza texto p/ casar título de work_order ↔ requisito. */
function normTitle(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

/**
 * Constrói {nodes, edges} a partir de requisitos PROPOSTOS (com id+title) e das WAVES
 * vindas de propose-architecture (work_orders por id OU título). Arestas = adjacência
 * entre waves consecutivas. Requisitos sem wave caem numa wave extra ao final. Puro.
 * Com waves=[] → todos viram nós soltos (wave 0, sem arestas) — o "mapa antes da arquitetura".
 */
export function dagFromWaves(reqs, waves) {
  const list = Array.isArray(reqs) ? reqs : [];
  const byId = new Map(list.map((r) => [r.id, r]));
  const byTitle = new Map(list.map((r) => [normTitle(r.title), r]));
  const match = (wo) => byId.get(wo) || byTitle.get(normTitle(wo)) || null;
  const nodes = [];
  const seen = new Set();
  const waveList = Array.isArray(waves) ? waves : [];
  const perWave = [];
  waveList.forEach((w, i) => {
    const ids = [];
    for (const wo of (w.work_orders || [])) {
      const r = match(wo);
      if (!r || seen.has(r.id)) continue;
      seen.add(r.id); ids.push(r.id);
      nodes.push({ id: r.id, title: r.title || '', wave: i, waveId: w.id || ('w' + i) });
    }
    perWave.push(ids);
  });
  const extra = list.filter((r) => !seen.has(r.id));
  if (extra.length) {
    const i = perWave.length; const ids = [];
    for (const r of extra) { ids.push(r.id); nodes.push({ id: r.id, title: r.title || '', wave: waveList.length ? i : 0, waveId: 'w' + i }); }
    perWave.push(ids);
  }
  const edges = [];
  for (let i = 1; i < perWave.length; i++) for (const c of perWave[i]) for (const p of perWave[i - 1]) edges.push({ from: p, to: c });
  return { nodes, edges };
}

/**
 * Escopos que NÃO são produtos de software de negócio: infra/plataforma e ferramentas.
 * Não entram no Editor guiado (que AUTORA requisitos de PRODUTO) — continuam visíveis nas
 * demais telas (Explorador, Mapa de impacto, Cobertura). Lista estável (infra muda pouco);
 * um produto de negócio novo aparece automaticamente sem editar isto.
 */
export const NON_PRODUCT_SCOPES = ['ai', 'argocd', 'cicd', 'keycloak', 'observability', 'oidc', 'platform', 'portal-contracts', 'portal-recorder', 'specs', 'traefik'];

/**
 * Escopos de PRODUTO DE SOFTWARE DE NEGÓCIO presentes na baseline (para o picker do Editor):
 * escopos com requisito, menos os de infra/plataforma (NON_PRODUCT_SCOPES), menos os que um
 * dia forem declarados em products.json com app_type != 'product_software' (futuro-proof).
 * PURO. Sites CMS não aparecem porque seus requisitos não existem mais na base.
 */
export function businessProductScopes(reqs, products) {
  const declared = {};
  for (const p of ((products && products.products) || [])) declared[p.name] = p.app_type || 'product_software';
  const skip = new Set(NON_PRODUCT_SCOPES);
  const seen = new Set();
  for (const r of (reqs || [])) { const s = r && r.scope && r.scope.product_scope; if (s) seen.add(s); }
  return [...seen]
    .filter((s) => !skip.has(s) && (declared[s] === undefined || declared[s] === 'product_software'))
    .sort();
}

/** Resumo agregado de todos os produtos (para o cabeçalho do hub). */
export function hubSummary(products, implStatus) {
  const summ = productSummaries(products, implStatus);
  const totalReqs = summ.reduce((a, p) => a + p.reqCount, 0);
  const totalDone = summ.reduce((a, p) => a + (p.progress.live || 0), 0); // "no ar" = deployed+done
  const live = summ.filter((p) => p.progress.total > 0 && p.progress.pct === 100).length;
  const weighted = summ.reduce((a, p) => a + (p.progress.pct || 0) * (p.reqCount || 0), 0); // % ponderado agregado
  return { products: summ.length, totalReqs, totalDone, live, pct: totalReqs ? Math.round(weighted / totalReqs) : 0 };
}

// ─── Camada de LINGUAGEM COMUM (trilha guiada) ──────────────────────────────
// Traduz cada BLOCO DE CAPACIDADE técnico para algo que um leigo entende: ícone +
// "o que o sistema faz" + 1 frase. É COPY de UI (apresentação), não decisão de IA.
// Sem mapeamento -> usa o título/descrição do catálogo (fallback), nunca inventa.
export const CAPABILITY_PLAIN = {
  'camadas-rigidas': { icon: '🧱', title: 'Base bem organizada', desc: 'O sistema é construído em camadas limpas — fácil de manter e evoluir.' },
  'migrations-versionadas': { icon: '🗄️', title: 'Banco de dados seguro', desc: 'Guarda seus dados e evolui o formato sem perder nada.' },
  'observabilidade': { icon: '📊', title: 'Monitoramento', desc: 'Acompanha a saúde e o uso do sistema em tempo real, com alertas.' },
  'worker-queue-transacional': { icon: '⚙️', title: 'Tarefas em segundo plano', desc: 'Processa tarefas pesadas sem travar a tela, com novas tentativas se algo falhar.' },
  'redis-bullmq': { icon: '⚡', title: 'Filas rápidas', desc: 'Processa muitas tarefas em paralelo, com agilidade.' },
  'gateway-externo': { icon: '🔌', title: 'Conexão com sistemas externos', desc: 'Conversa com outros sistemas (órgãos, parceiros) de forma segura e confiável.' },
  'oidc-sessao': { icon: '🔐', title: 'Login corporativo', desc: 'Entrar com a conta da empresa (login único / SSO).' },
  'rbac-multitenant': { icon: '👥', title: 'Várias empresas e permissões', desc: 'Cada empresa vê só os seus dados; cada pessoa tem o seu nível de acesso.' },
  'ia-grafo': { icon: '🤖', title: 'Assistente de IA', desc: 'Um assistente inteligente que ajuda, sugere e responde.' },
  'structured-outputs': { icon: '✅', title: 'Respostas confiáveis da IA', desc: 'A IA responde sempre no formato certo, sem surpresas.' },
  'rag-pgvector': { icon: '📚', title: 'IA que consulta documentos', desc: 'O assistente responde citando os seus manuais e documentos.' },
  'contract-openapi': { icon: '📜', title: 'API documentada', desc: 'Uma API estável e documentada para integrar com outros sistemas.' },
  'idempotencia': { icon: '🔁', title: 'Sem duplicação', desc: 'Clicar duas vezes não cria pedido duplicado.' },
  'design-system': { icon: '🎨', title: 'Visual consistente', desc: 'Telas bonitas e padronizadas com a identidade da plataforma.' },
  'notificacoes-multicanal': { icon: '📣', title: 'Avisos automáticos', desc: 'Envia e-mail, push e WhatsApp quando algo importante acontece.' },
};
export function capabilityPlain(id, catalog) {
  const p = CAPABILITY_PLAIN[id];
  if (p) return { id, icon: p.icon, title: p.title, desc: p.desc };
  const c = (catalog || []).find((b) => b && b.id === id);
  return { id, icon: '🧩', title: c ? c.title : id, desc: c ? c.description : '' };
}

// ─── (C2) MODOS DE USUÁRIO da Forja: projeções PURAS sobre a MESMA engine ──────────
// O modo é estado do FRONTEND (localStorage) e NUNCA muda os ARTEFATOS gerados — os dados
// por baixo (id/title/statement/aceite) são OS MESMOS nos 3 modos; muda só a APRESENTAÇÃO
// (disclosure/condução). simples: linguagem do dia a dia, sem YAML/ids técnicos; guiado
// (default): cartões claros + detalhe técnico opcional; profissional: tudo aberto + export.
export const FORGE_MODES = ['simples', 'guiado', 'profissional'];
export const FORGE_MODE_KEY = 'reqhub_forge_mode';
export const FORGE_MODE_LABELS = { simples: 'Simples', guiado: 'Guiado', profissional: 'Profissional' };

/** Normaliza o modo (default 'guiado'; migra os nomes antigos do wizard guided/advanced). Puro. */
export function normalizeForgeMode(v) {
  const m = String(v || '').trim().toLowerCase();
  if (FORGE_MODES.includes(m)) return m;
  if (m === 'guided') return 'guiado';           // trilha antiga do wizard (pré-C2)
  if (m === 'advanced') return 'profissional';   // trilha antiga do wizard (pré-C2)
  return 'guiado';
}

// Textos de CONDUÇÃO por modo (copy de UI, não decisão de IA). Chave -> { simples, guiado,
// profissional }; chave desconhecida -> '' e modo sem texto próprio cai no guiado (default).
const MODE_COPY = {
  'selector.sub': {
    simples: 'converse em linguagem do dia a dia',
    guiado: 'cartões claros + detalhe opcional',
    profissional: 'tudo aberto: YAML, blocos, export',
  },
  'idea.q': { simples: 'O que você quer criar?', guiado: 'O que você quer criar?', profissional: 'Defina o produto' },
  'idea.name': { simples: 'Nome do sistema', guiado: 'Nome do sistema', profissional: 'Slug do produto' },
  'idea.namePh': { simples: 'Ex.: Central de chamados', guiado: 'Ex.: Central de chamados', profissional: 'slug (ex.: helpdesk)' },
  'idea.brief': { simples: 'Conte, com suas palavras, o que ele precisa fazer', guiado: 'Descreva sua ideia', profissional: 'Descreva sua ideia' },
  'idea.generate': { simples: '✨ Ver como vai ficar', guiado: '✨ Ver o que a IA vai criar', profissional: '✨ Ver o que a IA vai criar' },
  'what.q': { simples: 'Veja, em palavras simples, o que seu sistema terá', guiado: 'Veja o que será criado', profissional: 'Requisitos e capacidades propostos' },
  'what.screens': { simples: 'O que seu sistema vai fazer', guiado: 'Telas e funções que serão criadas', profissional: 'Requisitos propostos (telas/funções)' },
  'what.hint': {
    simples: 'Revise cada cartão: ✔ aceite o que estiver certo, ✎ ajuste com suas palavras.',
    guiado: 'Quer ver o requisito por baixo de um cartão? Abra "ver detalhe técnico".',
    profissional: '',
  },
  'plan.q': { simples: 'Como ele vai ser construído', guiado: 'Plano de construção', profissional: 'Plano de construção' },
  'review.q': { simples: 'Confirmar e criar', guiado: 'Revisar e criar', profissional: 'Revisar e criar' },
  'review.launch': { simples: '🚀 Criar meu sistema', guiado: '🚀 Criar meu sistema', profissional: '🚀 Criar PR de requisitos' },
  // (E2, Forja 4.1) 3º cartão do fork de criação: portal CAPTURADO como insumo — mesma engine,
  // projeção por modo (o cartão muda de linguagem; a trilha e os artefatos são idênticos).
  'fork.capture.title': {
    simples: 'Copiar de um sistema que você já usa',
    guiado: 'A partir de um portal capturado',
    profissional: 'A partir de um contrato capturado',
  },
  'fork.capture.desc': {
    simples: 'Você mostrou um sistema real para a plataforma (captura)? Dá para criar o seu a partir dele: a IA aprende o que aquele sistema faz e propõe um sistema seu com as mesmas funções.',
    guiado: 'Use a captura de um portal real como insumo: o contrato normalizado (endpoints, entidades, fluxos) vira o brief e o contexto da IA — que propõe requisitos e arquitetura já conhecendo o sistema original.',
    profissional: 'Deriva o brief do export canônico do portal-recorder (sem samples), anexa o export ao propose-requirements e carimba architecture.external_contract (portal, versão, content_hash) no launch.',
  },
  'fork.capture.foot': {
    simples: 'usa uma captura já feita',
    guiado: 'insumo: contrato do portal-recorder',
    profissional: 'GET /portal-rec/api/v1/contracts → export',
  },
  'capture.lead': {
    simples: 'Escolha abaixo qual sistema capturado você quer usar de modelo.',
    guiado: 'Escolha um contrato capturado — ele vira o ponto de partida do novo sistema (brief + contexto da IA).',
    profissional: 'Contratos normalizados do portal-recorder (export sem samples). Selecionar deriva o brief client-side e pré-carrega o wizard greenfield.',
  },
};
export function modeCopy(mode, key) {
  const row = MODE_COPY[key];
  if (!row) return '';
  const m = normalizeForgeMode(mode);
  return row[m] != null ? row[m] : (row.guiado != null ? row.guiado : '');
}

// Apresentação em linguagem natural (determinística — sem IA): decapitaliza o título
// (preserva siglas) e troca o prefixo canônico "O sistema DEVE" por voz direta.
function decap(s) {
  const t = String(s || '').trim();
  if (t.length < 2) return t;
  // segunda letra maiúscula = sigla (IA, API…) — não decapitaliza
  if (/[A-ZÀ-Ü]/.test(t[1])) return t;
  return t[0].toLowerCase() + t.slice(1);
}
function plainTitle(title) {
  const t = String(title || '').trim();
  return t ? 'Seu sistema terá ' + decap(t) : 'Seu sistema terá esta função';
}
function plainLine(statement) {
  const s = String(statement || '').trim();
  const m = s.match(/^o sistema deve\s+/i);
  return m ? 'Ele vai ' + s.slice(m[0].length) : s;
}

/**
 * (C2) PROJEÇÃO de um requisito para exibição num cartão, conforme o MODO.
 * Aceita { id, req } (shape do wizard) ou o requisito com id. NUNCA perde/altera os dados:
 * `source` carrega id/title/statement ORIGINAIS (intactos) em TODOS os modos — só a
 * apresentação (`title`/`lines`/`tech`) muda. Puro (não muta a entrada). Retorna:
 *   { id, source:{id,title,statement}, title (exibição), lines[] (exibição),
 *     tech: null | { typeLabel, type, priority, blocks[], acceptance[] } }
 * simples: linguagem natural, sem YAML/ids técnicos (tech=null — nunca exibido).
 * guiado: title + statement + aceite resumido; tech preenchido (disclosure opcional).
 * profissional: tudo (statement + todos os critérios); tech preenchido (aberto).
 */
export function projectRequirementCard(entry, mode) {
  const e = entry || {};
  const req = (e.req && typeof e.req === 'object') ? e.req : e;
  const id = e.id || req.id || '';
  const m = normalizeForgeMode(mode);
  const title = req.title || '';
  const statement = req.statement || '';
  const ac = asList(req.acceptance_criteria).map(String);
  const source = { id, title, statement };
  if (m === 'simples') {
    return { id, source, title: plainTitle(title), lines: [plainLine(statement)].filter(Boolean), tech: null };
  }
  const tech = {
    type: req.type || 'functional',
    typeLabel: typeLabel(req.type || 'functional'),
    priority: req.priority || 'medium',
    blocks: asList(req.capability_blocks).map(String),
    acceptance: ac,
  };
  if (m === 'profissional') {
    return { id, source, title, lines: [statement, ...ac.map((c) => '✓ ' + c)].filter(Boolean), tech };
  }
  // guiado (default): statement + aceite RESUMIDO (1º critério + contagem)
  const okLine = ac.length ? 'Aceite: ' + ac[0] + (ac.length > 1 ? ` (+${ac.length - 1})` : '') : '';
  return { id, source, title, lines: [statement, okLine].filter(Boolean), tech };
}

/** Objeto YAML canônico de um requisito proposto (era do studio.js; puro/testável). */
export function forgeReqObject(id, pname, blueprint, req) {
  return {
    id,
    title: req.title || '',
    type: req.type || 'functional',
    status: 'proposed',
    owner: 'plataforma-digital',
    priority: req.priority || 'medium',
    statement: req.statement || '',
    scope: { applies_to: 'product', product_scope: pname, blueprint: blueprint || null },
    source: { source_paths: ['specs/products/' + pname + '/product-brief.md'] },
    acceptance_criteria: asList(req.acceptance_criteria),
    verification_method: asList(req.verification_method).length ? asList(req.verification_method) : ['test'],
    version: { baseline_version: '1.0.0', item_revision: 1, semantic_change: 'none', change_reason: 'proposto pelo Forge' },
  };
}

/**
 * (C2) Corpo do POST /v1/forge/launch — PURO/testável. O MODO NÃO entra na montagem dos
 * artefatos: o payload é IDÊNTICO nos 3 modos, exceto o campo informativo `creation_mode`
 * (validado no backend; vai ao client_payload/PR como rastreabilidade de UX, nunca muda o writer).
 */
export function buildLaunchBody({ product, displayName, blueprint, brief, mode, requirements, architecture, creationMode, skipPreviewGate, externalContract } = {}) {
  const arch = architecture || {};
  // (E2) origem = captura de portal: carimba a REFERÊNCIA do contrato (nunca o export inteiro)
  // dentro de architecture — o forge-launch faz passthrough do objeto architecture verbatim.
  const ec = (externalContract && typeof externalContract === 'object' && externalContract.portal) ? externalContract : null;
  return {
    product,
    displayName: displayName || product,
    blueprint,
    brief: brief || '',
    mode,
    requirements: Array.isArray(requirements) ? requirements : [],
    architecture: {
      stack: arch.stack, selected_blocks: arch.selected_blocks || [], adrs: arch.adrs || [], waves: arch.waves || [],
      ...(ec ? { external_contract: { portal: String(ec.portal), contract_version: String(ec.contract_version || ''), content_hash: String(ec.content_hash || '') } } : {}),
    },
    ...(skipPreviewGate ? { skipPreviewGate: true } : {}),
    ...(creationMode ? { creation_mode: normalizeForgeMode(creationMode) } : {}),
  };
}

/* ─── (E2, Forja 4.1) CAPTURA como entrada da Forja — funções PURAS ───────────────────────────
   O portal-recorder exporta um contrato canônico { manifest, endpoints } SEM samples
   (GET /portal-rec/api/v1/contracts/:id/export → { data }). Aqui derivamos, client-side:
   - briefFromPortalContract: brief textual (portal, entidades, fluxos, endpoints) p/ o wizard;
   - externalContractRef: a referência { portal, contract_version, content_hash } que o launch
     carimba em architecture.external_contract (rastreabilidade — nunca o export inteiro);
   - suggestIntegrationBlock: o bloco de integração do catálogo a sugerir (gateway-externo).
   Sem fetch, sem DOM — testável com node:test como o resto deste módulo. */

// Teto de endpoints listados no brief (o launch trunca brief em 8000 chars no servidor;
// o export COMPLETO segue como anexo multipart — o brief é resumo, não a fonte).
export const CAPTURE_BRIEF_MAX_ENDPOINTS = 40;

/**
 * Deriva um brief textual do export canônico de um contrato capturado. Puro.
 * exportJson: { manifest: { portal, base_url, version, endpoint_count, ... },
 *               endpoints: [{ method, path_template, group, auth, requires_captcha, ... }] }
 * opts.integrationBlock: id de bloco do catálogo a sugerir (ex.: 'gateway-externo').
 * Retorna '' quando o export não é utilizável (sem manifest.portal ou sem endpoints).
 */
export function briefFromPortalContract(exportJson, opts = {}) {
  const ex = (exportJson && typeof exportJson === 'object') ? exportJson : {};
  const man = (ex.manifest && typeof ex.manifest === 'object') ? ex.manifest : null;
  const eps = Array.isArray(ex.endpoints) ? ex.endpoints.filter((e) => e && typeof e === 'object') : [];
  if (!man || !man.portal || !eps.length) return '';
  const lines = [];
  lines.push(`Sistema derivado da captura do portal real "${man.portal}"${man.base_url ? ` (${man.base_url})` : ''}.`);
  lines.push(`Contrato normalizado${man.version ? ` de ${man.version}` : ''} com ${eps.length} endpoint(s) observado(s) — export sem payloads de exemplo (anexo).`);
  // Entidades/áreas: os grupos funcionais derivados na normalização.
  const groups = new Map();
  for (const e of eps) { const g = String(e.group || 'general'); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(e); }
  lines.push('', `Entidades/áreas observadas (${groups.size}): ${[...groups.keys()].sort().join(', ')}.`);
  // Fluxos: leitura × escrita + exigências (auth/captcha) — o desenho do produto parte daqui.
  const isWrite = (m) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(m || '').toUpperCase());
  const writes = eps.filter((e) => isWrite(e.method)).length;
  const auth = eps.filter((e) => e.auth && e.auth.required).length;
  const captcha = eps.filter((e) => e.requires_captcha).length;
  lines.push(`Fluxos: ${eps.length - writes} consulta(s) e ${writes} operação(ões) de escrita.`
    + (auth ? ` ${auth} endpoint(s) exigem autenticação.` : '') + (captcha ? ` ${captcha} exigem captcha.` : ''));
  lines.push('', 'Endpoints do portal original (referência de integração):');
  let listed = 0;
  for (const g of [...groups.keys()].sort()) {
    if (listed >= CAPTURE_BRIEF_MAX_ENDPOINTS) break;
    lines.push(`- ${g}:`);
    for (const e of groups.get(g)) {
      if (listed >= CAPTURE_BRIEF_MAX_ENDPOINTS) break;
      lines.push(`  - ${String(e.method || 'GET').toUpperCase()} ${e.path_template || ''}`
        + (e.auth && e.auth.required ? ' [auth]' : '') + (e.requires_captcha ? ' [captcha]' : ''));
      listed++;
    }
  }
  if (eps.length > listed) lines.push(`  … e mais ${eps.length - listed} endpoint(s) no contrato anexo.`);
  lines.push('', 'O produto deve oferecer ao usuário final as funções equivalentes a esses fluxos e, quando precisar submeter/consultar dados reais, integrar-se ao portal original por uma camada de integração dedicada.');
  const blk = (typeof opts.integrationBlock === 'string' && opts.integrationBlock) ? opts.integrationBlock : '';
  if (blk) lines.push(`Capacidade sugerida: inclua o bloco "${blk}" — toda integração HTTP com o portal externo passa por um gateway único e resiliente.`);
  return lines.join('\n');
}

/**
 * Referência do contrato para o launch (architecture.external_contract). Puro.
 * -> { portal, contract_version, content_hash } | null (export sem manifest utilizável).
 */
export function externalContractRef(exportJson) {
  const man = (exportJson && exportJson.manifest && typeof exportJson.manifest === 'object') ? exportJson.manifest : null;
  if (!man || !man.portal || !man.content_hash) return null;
  return { portal: String(man.portal), contract_version: String(man.version || ''), content_hash: String(man.content_hash) };
}

/**
 * Bloco de integração externa a sugerir quando a origem é captura. Preferência pelo id
 * canônico 'gateway-externo' (specs/forge/capabilities); fallback DECLARATIVO: o primeiro
 * bloco de category 'integration' do catálogo (sem mapa de sinônimos). null = catálogo
 * sem bloco de integração — a UI simplesmente não sugere nada. Puro.
 */
export function suggestIntegrationBlock(catalog) {
  const list = Array.isArray(catalog) ? catalog.filter((b) => b && b.id) : [];
  if (list.some((b) => b.id === 'gateway-externo')) return 'gateway-externo';
  const integ = list.find((b) => b.category === 'integration');
  return integ ? integ.id : null;
}

// Resumo do que será criado (para a etapa "O que será criado"). Puro/testável.
// reqs: [{ title, statement, type, capability_blocks }]; arch (opcional): { stack, selected_blocks, waves }.
export function planSummary(reqs, arch, catalog) {
  const rs = asList(reqs);
  const blockSet = new Set();
  for (const r of rs) for (const b of asList(r && r.capability_blocks)) blockSet.add(b);
  for (const s of asList(arch && arch.selected_blocks)) if (s && s.id) blockSet.add(s.id);
  const capabilities = [...blockSet].map((id) => capabilityPlain(id, catalog));
  // "telas/funções" = requisitos funcionais (uma capacidade testável cada).
  const screens = rs.map((r) => ({ title: (r && r.title) || '', what: (r && r.statement) || '' }));
  return {
    capabilities,
    screens,
    counts: { capabilities: capabilities.length, screens: screens.length, waves: asList(arch && arch.waves).length },
    stack: (arch && arch.stack) || null,
  };
}

/* ─── ETAPA IDEIA (copiloto de PRODUTO) — estado ideaDraft e funções PURAS ──────────────────────
   A etapa 1 do wizard é 100% PRODUTO/NEGÓCIO (nada de tecnologia — isso é a etapa 2). O copiloto
   conversa e devolve, a cada turno, um PATCH incremental deste estado. Estas funções são PURAS
   (sem DOM, sem localStorage) e testáveis com node:test; o autosave (localStorage) fica no studio.js. */

// Estado inicial vazio do ideaDraft (só campos de produto). chatHistory/maturity/confirmed são de UI.
export function emptyIdea() {
  return {
    name: '', problem: '', audience: '', actors: [], summary: '',
    capabilities: [], businessRules: [], goals: [], value: '', constraints: [],
    openQuestions: [], maturity: 0, chatHistory: [], confirmed: false,
  };
}

// Coerção de um valor em lista de strings limpas (tolera item objeto {text}); dedup fica no merge.
function ideaStrList(v) {
  return (Array.isArray(v) ? v : [])
    .map((x) => String(x == null ? '' : (typeof x === 'object' ? (x.text || x.label || '') : x)).trim())
    .filter(Boolean);
}
function clampMaturity(v) { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0; }
function normalizeOpenQuestions(list) {
  return (Array.isArray(list) ? list : [])
    .map((q) => (q && typeof q === 'object')
      ? { text: String(q.text || '').trim(), essential: q.essential === true }
      : { text: String(q || '').trim(), essential: false })
    .filter((q) => q.text);
}
// Une duas listas de strings preservando a ordem e removendo duplicatas (case-insensitive).
// NUNCA descarta o que já existe — o incremental do copiloto só ACRESCENTA (a pessoa remove na UI).
function mergeUniqueStrings(existing, incoming) {
  const out = []; const seen = new Set();
  const push = (x) => {
    const s = String(x == null ? '' : (typeof x === 'object' ? (x.text || '') : x)).trim();
    if (!s) return; const key = s.toLowerCase();
    if (seen.has(key)) return; seen.add(key); out.push(s);
  };
  (Array.isArray(existing) ? existing : []).forEach(push);
  (Array.isArray(incoming) ? incoming : []).forEach(push);
  return out;
}

// Normaliza um ideaDraft parcial/sujo para o shape canônico (defensivo — nunca lança).
export function normalizeIdea(idea) {
  const d = (idea && typeof idea === 'object') ? idea : {};
  const str = (v) => (typeof v === 'string' ? v.trim() : (v == null ? '' : String(v)));
  return {
    name: str(d.name), problem: str(d.problem), audience: str(d.audience),
    actors: ideaStrList(d.actors), summary: str(d.summary),
    capabilities: ideaStrList(d.capabilities), businessRules: ideaStrList(d.businessRules),
    goals: ideaStrList(d.goals), value: str(d.value), constraints: ideaStrList(d.constraints),
    openQuestions: normalizeOpenQuestions(d.openQuestions),
    maturity: clampMaturity(d.maturity),
    chatHistory: Array.isArray(d.chatHistory) ? d.chatHistory : [],
    confirmed: d.confirmed === true,
  };
}

/**
 * Aplica o payload do evento SSE `patch` do copiloto ao ideaDraft. PURO (retorna novo objeto).
 * payload = { patch:{name,problem,audience,actors,summary,capabilities,businessRules,goals,value,constraints},
 *             maturity, open_questions:[{text,essential}], summary }.
 * Escalares substituem quando vierem preenchidos; listas ACRESCENTAM com dedupe (nunca apagam o que a
 * pessoa já tem). open_questions é um SNAPSHOT do modelo (substitui). maturity é clampada 0-100.
 */
export function applyIdeaPatch(idea, payload) {
  const base = normalizeIdea(idea);
  const p = (payload && typeof payload === 'object') ? payload : {};
  const patch = (p.patch && typeof p.patch === 'object') ? p.patch : {};
  const next = { ...base };
  for (const k of ['name', 'problem', 'audience', 'value']) {
    if (typeof patch[k] === 'string' && patch[k].trim()) next[k] = patch[k].trim();
  }
  const sum = (typeof patch.summary === 'string' && patch.summary.trim()) ? patch.summary.trim()
    : (typeof p.summary === 'string' && p.summary.trim()) ? p.summary.trim() : '';
  if (sum) next.summary = sum;
  for (const k of ['actors', 'capabilities', 'businessRules', 'goals', 'constraints']) {
    next[k] = mergeUniqueStrings(base[k], patch[k]);
  }
  if (p.maturity != null && Number.isFinite(Number(p.maturity))) next.maturity = clampMaturity(p.maturity);
  if (Array.isArray(p.open_questions)) next.openQuestions = normalizeOpenQuestions(p.open_questions);
  return next;
}

/**
 * Gate de avanço para a etapa 2 (igual nos 3 modos). PURO. "Fechada" = maturidade suficiente,
 * problema + público (audience OU atores) + >=2 capacidades e NENHUMA pergunta essencial em aberto.
 */
export const IDEA_MATURITY_THRESHOLD = 70;
export function ideaReady(idea) {
  const d = normalizeIdea(idea);
  const hasProblem = !!d.problem;
  const hasAudience = !!(d.audience || d.actors.length);
  const enoughCaps = d.capabilities.length >= 2;
  const noEssential = !d.openQuestions.some((q) => q && q.essential);
  return d.maturity >= IDEA_MATURITY_THRESHOLD && hasProblem && hasAudience && enoughCaps && noEssential;
}

/** Dica curta de qual é a MAIOR lacuna de produto agora (para o indicador de maturidade). PURO. */
export function ideaMaturityHint(idea) {
  const d = normalizeIdea(idea);
  if (!d.problem) return 'Comece contando qual problema o sistema resolve.';
  if (!(d.audience || d.actors.length)) return 'Diga para quem é o sistema (quem vai usar).';
  if (d.capabilities.length < 2) return 'Liste o que o sistema precisa fazer.';
  const ess = d.openQuestions.filter((q) => q && q.essential);
  if (ess.length) return ess[0].text;
  if (d.maturity < IDEA_MATURITY_THRESHOLD) return 'Quase lá — detalhe regras e objetivos.';
  return 'Ideia pronta para seguir.';
}

/**
 * Compõe o `brief` textual (rico) que alimenta /v1/forge/propose-requirements no handoff para a
 * etapa 2 — SEM mudar o contrato da etapa 2 (ela continua recebendo um brief string). PURO.
 */
export function composeBriefFromIdea(idea) {
  const d = normalizeIdea(idea);
  const lines = [];
  if (d.summary) lines.push(d.summary);
  if (d.problem) lines.push(`Problema/dor que resolve: ${d.problem}`);
  const who = [d.audience, ...d.actors].filter(Boolean).join('; ');
  if (who) lines.push(`Para quem / quem usa: ${who}`);
  if (d.capabilities.length) lines.push(`O que o sistema faz:\n${d.capabilities.map((c) => `- ${c}`).join('\n')}`);
  if (d.businessRules.length) lines.push(`Regras de negócio:\n${d.businessRules.map((r) => `- ${r}`).join('\n')}`);
  if (d.goals.length) lines.push(`Objetivos: ${d.goals.join('; ')}`);
  if (d.value) lines.push(`Valor esperado: ${d.value}`);
  if (d.constraints.length) lines.push(`Restrições de negócio: ${d.constraints.join('; ')}`);
  return lines.join('\n\n').trim();
}
