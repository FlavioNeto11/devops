import React, { useCallback, useEffect, useState } from 'react';
import {
  pmProjects, pmCreateProject,
  pmItems, pmCreateItem, pmPatchItem, pmDeleteItem,
  pmTasks, pmCreateTask, pmPatchTask, pmDeleteTask,
  fetchApps,
} from '../api.js';

const ITEM_TYPES = ['bug', 'feature', 'evolution'];
const ITEM_STATUSES = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'wontfix'];
const PRIORITIES = ['P0', 'P1', 'P2', 'P3'];
const TASK_COLS = [['todo', 'A fazer'], ['in_progress', 'Em andamento'], ['done', 'Concluido']];
const DONE = new Set(['done', 'wontfix']);
const TYPE_LABEL = { bug: '🐞 bug', feature: '✨ feature', evolution: '🚀 evolução' };

const box = { background: 'var(--card,#151c34)', border: '1px solid var(--line,#26314f)', borderRadius: 12, padding: 14 };

export default function MetaProjects() {
  const [projects, setProjects] = useState([]);
  const [apps, setApps] = useState([]);
  const [selId, setSelId] = useState(null);
  const [items, setItems] = useState([]);
  const [openItemId, setOpenItemId] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState({ type: 'feature', title: '', priority: 'P2' });
  const [taskTitle, setTaskTitle] = useState('');

  const loadProjects = useCallback(async (keepSel) => {
    try {
      const [p, a] = await Promise.all([pmProjects(), fetchApps().catch(() => [])]);
      setProjects(p || []);
      setApps(Array.isArray(a) ? a : a?.data || []);
      setSelId((cur) => (keepSel && cur) || cur || (p && p[0] && p[0].id) || null);
    } catch (e) { setErr(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { loadProjects(); }, [loadProjects]);

  const loadItems = useCallback(async (pid) => { setItems(pid ? (await pmItems(pid)) || [] : []); }, []);
  useEffect(() => { setOpenItemId(null); setTasks([]); if (selId) loadItems(selId); }, [selId, loadItems]);

  const loadTasks = useCallback(async (iid) => { setTasks(iid ? (await pmTasks(iid)) || [] : []); }, []);
  useEffect(() => { if (openItemId) loadTasks(openItemId); else setTasks([]); }, [openItemId, loadTasks]);

  const run = async (fn) => { try { await fn(); setErr(null); } catch (e) { setErr(e.message); } };

  const sel = projects.find((p) => p.id === selId) || null;
  const liveApp = sel ? (apps || []).find((a) => a && (a.name === sel.k8s_label_selector || a.name === sel.key)) : null;
  const total = items.length;
  const doneCount = items.filter((i) => DONE.has(i.status)).length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;

  if (loading) return <p className="muted">Carregando projetos…</p>;

  return (
    <div>
      {err && <div style={{ ...box, borderColor: '#b04444', marginBottom: 12, color: '#ffb4b4' }}>⚠ {err}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16, alignItems: 'start' }}>

        {/* ── Sidebar: projetos ── */}
        <aside style={box}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong>Projetos</strong>
            <button className="btn" style={{ fontSize: '.75rem', padding: '3px 8px' }}
              onClick={() => run(async () => {
                const key = prompt('Chave do projeto (kebab-case):'); if (!key) return;
                const name = prompt('Nome:') || key;
                await pmCreateProject({ key, name }); await loadProjects(true);
              })}>+ novo</button>
          </div>
          {projects.map((p) => (
            <button key={p.id} onClick={() => setSelId(p.id)}
              style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 4, padding: '8px 10px',
                borderRadius: 8, border: '1px solid ' + (p.id === selId ? 'var(--accent,#5b8cff)' : 'transparent'),
                background: p.id === selId ? 'rgba(91,140,255,.12)' : 'transparent', color: 'inherit', cursor: 'pointer' }}>
              <div style={{ fontWeight: 600 }}>{p.name}</div>
              <div className="muted" style={{ fontSize: '.78rem' }}>{p.route || p.key} · {p.status}</div>
            </button>
          ))}
          {!projects.length && <p className="muted">Nenhum projeto. Crie um ou rode o seed.</p>}
        </aside>

        {/* ── Detalhe ── */}
        <section style={{ display: 'grid', gap: 14 }}>
          {!sel && <p className="muted">Selecione um projeto.</p>}
          {sel && (
            <>
              <div style={box}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <h3 style={{ margin: '0 0 4px' }}>{sel.name}</h3>
                    <div className="muted" style={{ fontSize: '.85rem' }}>{sel.stack}</div>
                    <div className="muted" style={{ fontSize: '.82rem' }}>{sel.description}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {sel.route && <a className="btn" href={sel.route} target="_blank" rel="noopener" style={{ fontSize: '.8rem' }}>Abrir {sel.route} ↗</a>}
                    <div style={{ marginTop: 6 }}>
                      <span className={'badge ' + (liveApp ? 'badge-ok' : 'badge-warn')}>{liveApp ? '● no ar' : '○ sem app vivo'}</span>
                    </div>
                  </div>
                </div>
                {/* progresso done-vs-pending */}
                <div style={{ marginTop: 12 }}>
                  <div className="muted" style={{ fontSize: '.8rem', marginBottom: 4 }}>{doneCount}/{total} concluídos · {pct}%</div>
                  <div style={{ height: 8, borderRadius: 6, background: 'rgba(255,255,255,.08)', overflow: 'hidden' }}>
                    <div style={{ width: pct + '%', height: '100%', background: 'linear-gradient(90deg,#34d399,#5b8cff)' }} />
                  </div>
                </div>
                {liveApp && (
                  <div className="muted" style={{ marginTop: 10, fontSize: '.78rem' }}>
                    🔗 ao vivo: {liveApp.name}{liveApp.hosts ? ' · ' + [].concat(liveApp.hosts).join(', ') : ''}
                    {Array.isArray(liveApp.paths) ? ' · ' + liveApp.paths.join(', ') : ''}
                  </div>
                )}
              </div>

              {/* novo item */}
              <div style={{ ...box, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>
                  {ITEM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <select value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })}>
                  {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <input style={{ flex: 1, minWidth: 180 }} placeholder="Título do item (bug/feature/evolução)…"
                  value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                <button className="btn" disabled={!draft.title.trim()}
                  onClick={() => run(async () => { await pmCreateItem(sel.id, draft); setDraft({ type: 'feature', title: '', priority: 'P2' }); await loadItems(sel.id); })}>
                  + item
                </button>
              </div>

              {/* itens */}
              {items.map((it) => (
                <div key={it.id} style={box}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="pill">{TYPE_LABEL[it.type] || it.type}</span>
                    <span className="pill">{it.priority}</span>
                    <strong style={{ flex: 1, textDecoration: DONE.has(it.status) ? 'line-through' : 'none', opacity: DONE.has(it.status) ? 0.7 : 1 }}>{it.title}</strong>
                    <select value={it.status} onChange={(e) => run(async () => { await pmPatchItem(it.id, { status: e.target.value }); await loadItems(sel.id); })}>
                      {ITEM_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <button className="btn" style={{ fontSize: '.75rem', padding: '4px 9px' }}
                      onClick={() => setOpenItemId(openItemId === it.id ? null : it.id)}>
                      {openItemId === it.id ? 'fechar tasks' : 'tasks ▾'}
                    </button>
                    <button title="excluir" style={{ background: 'none', border: 'none', color: '#ff8080', cursor: 'pointer' }}
                      onClick={() => run(async () => { if (confirm('Excluir item?')) { await pmDeleteItem(it.id); await loadItems(sel.id); } })}>✕</button>
                  </div>

                  {openItemId === it.id && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                        <input style={{ flex: 1 }} placeholder="Nova task…" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} />
                        <button className="btn" disabled={!taskTitle.trim()}
                          onClick={() => run(async () => { await pmCreateTask(it.id, { title: taskTitle }); setTaskTitle(''); await loadTasks(it.id); })}>+ task</button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                        {TASK_COLS.map(([col, label]) => (
                          <div key={col} style={{ background: 'rgba(255,255,255,.03)', borderRadius: 8, padding: 8, minHeight: 60 }}>
                            <div className="muted" style={{ fontSize: '.74rem', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
                            {tasks.filter((t) => t.status === col).map((t) => (
                              <div key={t.id} style={{ background: 'rgba(255,255,255,.05)', borderRadius: 6, padding: '6px 8px', marginBottom: 6, fontSize: '.84rem' }}>
                                <div>{t.title}</div>
                                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                                  {TASK_COLS.filter(([c]) => c !== col).map(([c, l]) => (
                                    <button key={c} title={'mover p/ ' + l} style={{ fontSize: '.7rem', padding: '1px 6px', cursor: 'pointer' }}
                                      onClick={() => run(async () => { await pmPatchTask(t.id, { status: c }); await loadTasks(it.id); })}>
                                      {c === 'done' ? '✓' : c === 'todo' ? '⟲' : '▶'}
                                    </button>
                                  ))}
                                  <button title="excluir" style={{ fontSize: '.7rem', padding: '1px 6px', color: '#ff8080', cursor: 'pointer', marginLeft: 'auto' }}
                                    onClick={() => run(async () => { await pmDeleteTask(t.id); await loadTasks(it.id); })}>✕</button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {!items.length && <p className="muted">Nenhum item ainda. Cadastre um bug/feature/evolução acima.</p>}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
