import React, { useCallback, useEffect, useState } from 'react';
import {
  pmProjects, pmCreateProject,
  pmItems, pmCreateItem, pmPatchItem, pmDeleteItem,
  pmTasks, pmCreateTask, pmPatchTask, pmDeleteTask,
  fetchApps,
} from '../api.js';
import { ageFrom } from '../format.js';

/**
 * MetaProjects — "Projetos & Tarefas"
 * -----------------------------------
 * Board estilo Trello focado em desenvolvimento:
 *  - Pills de projeto (com badge de app vivo cruzado com /apps do backend read-only).
 *  - Colunas por STATUS; cada CARD e um item (bug/feature/evolucao), arrastavel
 *    entre colunas (HTML5 DnD -> PATCH /items/:id { status }).
 *  - Cada card mostra progresso de tasks (task_done/task_total — vem do pm-api).
 *  - Clicar num card abre o DRAWER de detalhe: editar campos + checklist de tasks
 *    (ciclo todo -> in_progress -> done).
 *
 * Usa exclusivamente o design system do Console (styles.css) — sem tokens soltos.
 */

const ITEM_TYPES = ['bug', 'feature', 'evolution'];
const ITEM_STATUSES = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'wontfix'];
const PRIORITIES = ['P0', 'P1', 'P2', 'P3'];
const DONE = new Set(['done', 'wontfix']);

// Colunas do board (wontfix fica fora por padrao; um toggle o adiciona).
const STATUS_COLS = [
  { key: 'backlog', label: 'Backlog' },
  { key: 'todo', label: 'A fazer' },
  { key: 'in_progress', label: 'Em andamento' },
  { key: 'in_review', label: 'Em revisão' },
  { key: 'done', label: 'Concluído' },
];
const STATUS_LABEL = {
  backlog: 'Backlog', todo: 'A fazer', in_progress: 'Em andamento',
  in_review: 'Em revisão', done: 'Concluído', wontfix: 'Descartado',
};

const TYPE_META = {
  bug: { icon: '🐞', label: 'bug', cls: 'badge-err' },
  feature: { icon: '✨', label: 'feature', cls: 'badge-ok' },
  evolution: { icon: '🚀', label: 'evolução', cls: 'badge-accent' },
};
const PRIO_META = { P0: 'badge-err', P1: 'badge-warn', P2: 'badge-accent', P3: 'badge-muted' };

const TASK_NEXT = { todo: 'in_progress', in_progress: 'done', done: 'todo' };
const TASK_LABEL = { todo: 'a fazer', in_progress: 'em andamento', done: 'concluído' };

// Acha o app vivo (do /apps) correspondente ao projeto. BUGFIX: o backend agrupa
// por `app` (label app.kubernetes.io/part-of), nao por `name`.
function liveAppFor(apps, proj) {
  if (!proj) return null;
  return (apps || []).find(
    (a) => a && (a.app === proj.k8s_label_selector || a.app === proj.key),
  ) || null;
}

// ===========================================================================
// Card do board
// ===========================================================================
function Card({ it, onOpen, dragging, setDragging }) {
  const tt = it.task_total || 0;
  const td = it.task_done || 0;
  const pct = tt ? Math.round((td / tt) * 100) : 0;
  const type = TYPE_META[it.type] || { icon: '•', label: it.type, cls: 'badge-muted' };
  return (
    <article
      className={'kcard' + (dragging ? ' kcard--dragging' : '')}
      draggable
      onDragStart={(e) => {
        setDragging(it.id);
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', it.id); } catch { /* alguns browsers exigem; ignoramos falha */ }
      }}
      onDragEnd={() => setDragging(null)}
      onClick={onOpen}
      title="Arraste para mudar o status · clique para abrir"
    >
      <div className="kcard__tags">
        <span className={'badge ' + type.cls}>{type.icon} {type.label}</span>
        <span className={'badge ' + (PRIO_META[it.priority] || 'badge-muted')}>{it.priority}</span>
      </div>
      <div className="kcard__title">{it.title}</div>
      {tt > 0 && (
        <div className="progress">
          <div className="progress__track">
            <div className={'progress__bar' + (td === tt ? ' progress__bar--done' : '')} style={{ width: pct + '%' }} />
          </div>
          <span className="progress__label">{td}/{tt}</span>
        </div>
      )}
      <div className="kcard__foot">
        <span>{ageFrom(it.created_at)}</span>
        {(it.git_url || it.pr_url) && (
          <span className="kcard__links" onClick={(e) => e.stopPropagation()}>
            {it.git_url && <a href={it.git_url} target="_blank" rel="noopener noreferrer" title="código">⎇</a>}
            {it.pr_url && <a href={it.pr_url} target="_blank" rel="noopener noreferrer" title="pull request">⇄</a>}
          </span>
        )}
      </div>
    </article>
  );
}

// ===========================================================================
// Drawer de detalhe / criacao de item
// ===========================================================================
function ItemDrawer({ mode, item, projectId, onClose, onSaved }) {
  const isCreate = mode === 'create';
  const [form, setForm] = useState(() => ({
    type: item?.type || 'feature',
    title: item?.title || '',
    description: item?.description || '',
    status: item?.status || 'backlog',
    priority: item?.priority || 'P2',
    git_url: item?.git_url || '',
    pr_url: item?.pr_url || '',
  }));
  const [tasks, setTasks] = useState([]);
  const [taskTitle, setTaskTitle] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const reloadTasks = useCallback(async () => {
    if (isCreate || !item) return;
    try { setTasks((await pmTasks(item.id)) || []); } catch (e) { setErr(e.message); }
  }, [isCreate, item]);

  useEffect(() => { reloadTasks(); }, [reloadTasks]);

  const guard = async (fn) => {
    setBusy(true);
    try { await fn(); setErr(null); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  // Auto-save de UM campo (no-op se inalterado). Em modo create so atualiza o buffer.
  const saveField = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (isCreate || !item || item[key] === value) return;
    guard(async () => { await pmPatchItem(item.id, { [key]: value }); await onSaved?.(); });
  };

  const createItem = () => guard(async () => {
    if (!form.title.trim()) { setErr('Título é obrigatório.'); return; }
    await pmCreateItem(projectId, { ...form, title: form.title.trim() });
    await onSaved?.();
    onClose();
  });

  const addTask = () => guard(async () => {
    if (!taskTitle.trim()) return;
    await pmCreateTask(item.id, { title: taskTitle.trim() });
    setTaskTitle('');
    await reloadTasks();
    await onSaved?.();
  });

  const cycleTask = (t) => guard(async () => {
    await pmPatchTask(t.id, { status: TASK_NEXT[t.status] || 'todo' });
    await reloadTasks();
    await onSaved?.();
  });

  const delTask = (t) => guard(async () => {
    await pmDeleteTask(t.id);
    await reloadTasks();
    await onSaved?.();
  });

  const delItem = () => guard(async () => {
    // eslint-disable-next-line no-alert
    if (!confirm('Excluir este item e todas as suas tasks?')) return;
    await pmDeleteItem(item.id);
    await onSaved?.();
    onClose();
  });

  const doneCount = tasks.filter((t) => t.status === 'done').length;
  const type = TYPE_META[form.type] || TYPE_META.feature;

  return (
    <div
      className="drawer__overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Detalhe do item">
        <div className="drawer__head">
          <div className="kcard__tags">
            <span className={'badge ' + type.cls}>{type.icon} {type.label}</span>
            <span className={'badge ' + (PRIO_META[form.priority] || 'badge-muted')}>{form.priority}</span>
            {!isCreate && <span className="badge badge-muted">{STATUS_LABEL[form.status]}</span>}
          </div>
          <button className="drawer__close" onClick={onClose} aria-label="Fechar">×</button>
        </div>

        <div className="drawer__body">
          {err && <div className="state state--error" role="alert">⚠ {err}</div>}

          <label className="field">
            <span className="field__label">Título</span>
            <input
              className="input"
              value={form.title}
              placeholder="Título do item…"
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              onBlur={(e) => saveField('title', e.target.value.trim())}
            />
          </label>

          <div className="drawer__row">
            <label className="field">
              <span className="field__label">Tipo</span>
              <select className="select" value={form.type} onChange={(e) => saveField('type', e.target.value)}>
                {ITEM_TYPES.map((t) => <option key={t} value={t}>{TYPE_META[t].icon} {TYPE_META[t].label}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Prioridade</span>
              <select className="select" value={form.priority} onChange={(e) => saveField('priority', e.target.value)}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            {!isCreate && (
              <label className="field">
                <span className="field__label">Status</span>
                <select className="select" value={form.status} onChange={(e) => saveField('status', e.target.value)}>
                  {ITEM_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
              </label>
            )}
          </div>

          <label className="field">
            <span className="field__label">Descrição</span>
            <textarea
              className="textarea"
              value={form.description || ''}
              placeholder="Contexto, critérios de aceite, passos para reproduzir…"
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              onBlur={(e) => saveField('description', e.target.value)}
            />
          </label>

          <div className="drawer__row">
            <label className="field">
              <span className="field__label">Git URL</span>
              <input
                className="input" placeholder="https://github.com/…"
                value={form.git_url || ''}
                onChange={(e) => setForm((f) => ({ ...f, git_url: e.target.value }))}
                onBlur={(e) => saveField('git_url', e.target.value.trim())}
              />
            </label>
            <label className="field">
              <span className="field__label">PR URL</span>
              <input
                className="input" placeholder="https://github.com/…/pull/1"
                value={form.pr_url || ''}
                onChange={(e) => setForm((f) => ({ ...f, pr_url: e.target.value }))}
                onBlur={(e) => saveField('pr_url', e.target.value.trim())}
              />
            </label>
          </div>

          {!isCreate && (
            <div>
              <div className="section-title" style={{ margin: '2px 0 8px' }}>
                Tasks <span className="muted">({doneCount}/{tasks.length})</span>
              </div>
              <div className="drawer__row" style={{ marginBottom: 10 }}>
                <input
                  className="input" style={{ flex: 1 }}
                  placeholder="Nova task (começo → meio → fim)…"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addTask(); }}
                />
                <button className="btn btn--primary" disabled={busy || !taskTitle.trim()} onClick={addTask}>+ task</button>
              </div>
              <div className="checklist">
                {tasks.map((t) => (
                  <div key={t.id} className="checklist__item">
                    <button
                      className={'checklist__status' + (t.status === 'done' ? ' checklist__status--done' : t.status === 'in_progress' ? ' checklist__status--in_progress' : '')}
                      title={'status: ' + TASK_LABEL[t.status] + ' — clique para avançar'}
                      onClick={() => cycleTask(t)}
                    >
                      {t.status === 'done' ? '✓' : t.status === 'in_progress' ? '◑' : ''}
                    </button>
                    <span className={'checklist__title' + (t.status === 'done' ? ' checklist__title--done' : '')}>{t.title}</span>
                    <button className="icon-btn" title="excluir task" onClick={() => delTask(t)}>✕</button>
                  </div>
                ))}
                {!tasks.length && <p className="muted" style={{ fontSize: '.82rem', margin: 0 }}>Sem tasks. Quebre o item em passos.</p>}
              </div>
            </div>
          )}
        </div>

        <div className="drawer__foot">
          {isCreate ? (
            <>
              <span className="muted" style={{ alignSelf: 'center', fontSize: '.82rem' }}>Novo item neste projeto</span>
              <button className="btn btn--primary" disabled={busy || !form.title.trim()} onClick={createItem}>Criar item</button>
            </>
          ) : (
            <>
              <button className="btn btn--danger" disabled={busy} onClick={delItem}>Excluir item</button>
              <button className="btn" onClick={onClose}>Fechar</button>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

// ===========================================================================
// Componente principal
// ===========================================================================
export default function MetaProjects() {
  const [projects, setProjects] = useState([]);
  const [apps, setApps] = useState([]);
  const [selId, setSelId] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [fType, setFType] = useState('');
  const [fPrio, setFPrio] = useState('');
  const [q, setQ] = useState('');
  const [showWontfix, setShowWontfix] = useState(false);

  const [drawer, setDrawer] = useState(null); // { mode:'edit'|'create', item }
  const [draggingId, setDraggingId] = useState(null);
  const [overCol, setOverCol] = useState(null);

  const loadProjects = useCallback(async (keepSel) => {
    try {
      const [p, a] = await Promise.all([pmProjects(), fetchApps().catch(() => [])]);
      setProjects(p || []);
      setApps(Array.isArray(a) ? a : a?.data || []);
      setSelId((cur) => (keepSel && cur) || cur || (p && p[0] && p[0].id) || null);
    } catch (e) { setErr(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { loadProjects(); }, [loadProjects]);

  const loadItems = useCallback(async (pid) => {
    if (!pid) { setItems([]); return; }
    try { setItems((await pmItems(pid)) || []); } catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { if (selId) loadItems(selId); else setItems([]); }, [selId, loadItems]);

  const run = async (fn) => { try { await fn(); setErr(null); } catch (e) { setErr(e.message); } };

  const sel = projects.find((p) => p.id === selId) || null;
  const liveApp = liveAppFor(apps, sel);

  const filtered = items.filter((it) =>
    (!fType || it.type === fType)
    && (!fPrio || it.priority === fPrio)
    && (!q || (it.title || '').toLowerCase().includes(q.toLowerCase())));

  const cols = showWontfix ? [...STATUS_COLS, { key: 'wontfix', label: 'Descartado' }] : STATUS_COLS;
  const byStatus = (s) => filtered.filter((it) => it.status === s);

  const total = items.length;
  const doneCount = items.filter((i) => DONE.has(i.status)).length;

  // Drop de um card numa coluna -> muda o status (otimista + persiste).
  const onDropTo = (status) => {
    setOverCol(null);
    const id = draggingId;
    setDraggingId(null);
    if (!id) return;
    const it = items.find((x) => x.id === id);
    if (!it || it.status === status) return;
    setItems((cur) => cur.map((x) => (x.id === id ? { ...x, status } : x)));
    pmPatchItem(id, { status }).catch((e) => { setErr(e.message); loadItems(selId); });
  };

  const createProject = () => run(async () => {
    // eslint-disable-next-line no-alert
    const key = prompt('Chave do projeto (kebab-case):');
    if (!key) return;
    // eslint-disable-next-line no-alert
    const name = prompt('Nome do projeto:') || key;
    await pmCreateProject({ key: key.trim(), name: name.trim() });
    await loadProjects(true);
  });

  if (loading) return <p className="state state--loading">Carregando projetos…</p>;

  return (
    <div className="meta">
      {err && <div className="state state--error" role="alert">⚠ {err}</div>}

      {/* Pills de projeto + criar */}
      <div className="toolbar" style={{ marginBottom: 14 }}>
        <div className="meta__pills">
          {projects.map((p) => {
            const live = liveAppFor(apps, p);
            return (
              <button
                key={p.id}
                className={'pill' + (p.id === selId ? ' pill--active' : '')}
                onClick={() => setSelId(p.id)}
                title={live ? `app no ar · ${live.pods} pod(s)` : 'sem app vivo no cluster'}
              >
                <span className={'dot ' + (live ? 'dot--ok' : 'dot--warn')} />
                {p.name}
                {p.id === selId && <span className="pill__count">{items.length}</span>}
              </button>
            );
          })}
          {!projects.length && <span className="muted">Nenhum projeto. Rode o seed do pm-api ou crie um.</span>}
        </div>
        <button className="btn" onClick={createProject}>+ projeto</button>
      </div>

      {!sel && <p className="state state--empty">Selecione um projeto acima.</p>}

      {sel && (
        <>
          {/* Cabeçalho: cross-link ao vivo */}
          <div className="app-card">
            <div className="app-card__head">
              <div>
                <h3 className="app-card__title">{sel.name}</h3>
                <p className="app-card__meta">{[sel.stack, sel.description].filter(Boolean).join(' · ') || '—'}</p>
              </div>
              <div className="app-card__urls">
                <span className={'badge ' + (liveApp ? 'badge-ok' : 'badge-muted')}>
                  {liveApp ? '● no ar' : '○ sem app vivo'}
                </span>
                {sel.route && (
                  <a className="quick-link" href={sel.route} target="_blank" rel="noopener noreferrer">
                    Abrir {sel.route} ↗
                  </a>
                )}
              </div>
            </div>
            <div className="app-stats">
              <div className="stat"><span className="stat__value">{total}</span><span className="stat__label">itens</span></div>
              <div className="stat"><span className="stat__value">{doneCount}</span><span className="stat__label">concluídos</span></div>
              <div className="stat"><span className="stat__value">{liveApp ? liveApp.pods : '—'}</span><span className="stat__label">pods</span></div>
              <div className="stat">
                <span className={'stat__value' + (liveApp && liveApp.restarts ? ' stat__value--warn' : '')}>{liveApp ? liveApp.restarts : '—'}</span>
                <span className="stat__label">restarts</span>
              </div>
              <div className="stat"><span className="stat__value">{liveApp && liveApp.age ? liveApp.age : '—'}</span><span className="stat__label">idade</span></div>
            </div>
            {liveApp && Array.isArray(liveApp.urls) && liveApp.urls.length > 0 && (
              <div className="app-section">
                <span className="app-section__label">🔗 rotas ao vivo</span>
                <div className="chips">
                  {liveApp.urls.map((u) => (
                    <a key={u} className="chip" href={u} target="_blank" rel="noopener noreferrer">{u}</a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Filtros + novo item */}
          <div className="toolbar" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', flex: 1 }}>
              <select className="select" style={{ minWidth: 120 }} value={fType} onChange={(e) => setFType(e.target.value)}>
                <option value="">todos os tipos</option>
                {ITEM_TYPES.map((t) => <option key={t} value={t}>{TYPE_META[t].icon} {TYPE_META[t].label}</option>)}
              </select>
              <select className="select" style={{ minWidth: 120 }} value={fPrio} onChange={(e) => setFPrio(e.target.value)}>
                <option value="">todas prioridades</option>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <input className="input" style={{ flex: 1, minWidth: 160 }} placeholder="Buscar por título…" value={q} onChange={(e) => setQ(e.target.value)} />
              <label className="check-inline" style={{ paddingBottom: 0 }}>
                <input type="checkbox" checked={showWontfix} onChange={(e) => setShowWontfix(e.target.checked)} /> descartados
              </label>
            </div>
            <button className="btn btn--primary" onClick={() => setDrawer({ mode: 'create', item: null })}>+ item</button>
          </div>

          {/* Board */}
          <div className="board">
            {cols.map((col) => {
              const colItems = byStatus(col.key);
              return (
                <div
                  key={col.key}
                  className={'board__col' + (overCol === col.key ? ' board__col--over' : '')}
                  onDragOver={(e) => { e.preventDefault(); if (overCol !== col.key) setOverCol(col.key); }}
                  onDragLeave={(e) => { if (e.currentTarget === e.target) setOverCol((c) => (c === col.key ? null : c)); }}
                  onDrop={() => onDropTo(col.key)}
                >
                  <div className="board__col-head">
                    <span>{col.label}</span>
                    <span className="board__col-count">{colItems.length}</span>
                  </div>
                  <div className="board__col-body">
                    {colItems.map((it) => (
                      <Card
                        key={it.id}
                        it={it}
                        dragging={draggingId === it.id}
                        setDragging={setDraggingId}
                        onOpen={() => setDrawer({ mode: 'edit', item: it })}
                      />
                    ))}
                    {!colItems.length && <div className="board__empty">vazio</div>}
                  </div>
                </div>
              );
            })}
          </div>
          {!total && <p className="muted" style={{ marginTop: 10 }}>Nenhum item ainda. Clique em <strong>+ item</strong> para cadastrar um bug, feature ou evolução.</p>}
        </>
      )}

      {drawer && (
        <ItemDrawer
          mode={drawer.mode}
          item={drawer.item}
          projectId={selId}
          onClose={() => setDrawer(null)}
          onSaved={() => loadItems(selId)}
        />
      )}
    </div>
  );
}
