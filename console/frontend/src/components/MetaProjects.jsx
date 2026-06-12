import React, { useCallback, useEffect, useState } from 'react';
import {
  pmProjects, pmCreateProject, pmDeleteProject,
  pmItems, pmCreateItem, pmPatchItem, pmDeleteItem,
  pmTasks, pmCreateTask, pmPatchTask, pmDeleteTask,
  fetchApps,
} from '../api.js';
import { ageFrom } from '../format.js';
import Icon from './Icon.jsx';
import Modal from './Modal.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import EmptyState from './EmptyState.jsx';
import PageHeader from './PageHeader.jsx';
import { ListSkeleton } from './Skeleton.jsx';
import { useToast } from './ToastProvider.jsx';
import { appTypeOf, isPortal, typeMeta } from '../lib/appTypes.js';

/**
 * MetaProjects — "Projetos & Tarefas": board estilo Trello (pills de projeto, colunas por
 * status, cards arrastáveis, drawer de detalhe com checklist de tasks). Criação/exclusão via
 * modal/confirm; feedback por toast. Admin gerencia projetos; member só edita os atribuídos.
 */
const ITEM_TYPES = ['bug', 'feature', 'evolution'];
const ITEM_STATUSES = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'wontfix'];
const PRIORITIES = ['P0', 'P1', 'P2', 'P3'];
const DONE = new Set(['done', 'wontfix']);

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

function liveAppFor(apps, proj) {
  if (!proj) return null;
  return (apps || []).find((a) => a && (a.app === proj.k8s_label_selector || a.app === proj.key)) || null;
}

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
        try { e.dataTransfer.setData('text/plain', it.id); } catch { /* alguns browsers exigem */ }
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
function ItemDrawer({ mode, item, projectId, onClose, onSaved }) {
  const isCreate = mode === 'create';
  const toast = useToast();
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
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const reloadTasks = useCallback(async () => {
    if (isCreate || !item) return;
    try { setTasks((await pmTasks(item.id)) || []); } catch (e) { toast.err(e.message); }
  }, [isCreate, item, toast]);

  useEffect(() => { reloadTasks(); }, [reloadTasks]);

  // Esc fecha o drawer.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const guard = async (fn) => {
    setBusy(true);
    try { await fn(); } catch (e) { toast.err(e.message); } finally { setBusy(false); }
  };

  const saveField = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (isCreate || !item || item[key] === value) return;
    guard(async () => { await pmPatchItem(item.id, { [key]: value }); await onSaved?.(); });
  };

  const createItem = () => guard(async () => {
    if (!form.title.trim()) { toast.err('Título é obrigatório.'); return; }
    await pmCreateItem(projectId, { ...form, title: form.title.trim() });
    await onSaved?.();
    toast.ok('Item criado.');
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

  const doneCount = tasks.filter((t) => t.status === 'done').length;
  const type = TYPE_META[form.type] || TYPE_META.feature;

  return (
    <div className="drawer__overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Detalhe do item">
        <div className="drawer__head">
          <div className="kcard__tags">
            <span className={'badge ' + type.cls}>{type.icon} {type.label}</span>
            <span className={'badge ' + (PRIO_META[form.priority] || 'badge-muted')}>{form.priority}</span>
            {!isCreate && <span className="badge badge-muted">{STATUS_LABEL[form.status]}</span>}
          </div>
          <button className="drawer__close" onClick={onClose} aria-label="Fechar"><Icon name="x" size={18} /></button>
        </div>

        <div className="drawer__body">
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
              <input className="input" placeholder="https://github.com/…" value={form.git_url || ''}
                onChange={(e) => setForm((f) => ({ ...f, git_url: e.target.value }))}
                onBlur={(e) => saveField('git_url', e.target.value.trim())} />
            </label>
            <label className="field">
              <span className="field__label">PR URL</span>
              <input className="input" placeholder="https://github.com/…/pull/1" value={form.pr_url || ''}
                onChange={(e) => setForm((f) => ({ ...f, pr_url: e.target.value }))}
                onBlur={(e) => saveField('pr_url', e.target.value.trim())} />
            </label>
          </div>

          {!isCreate && (
            <div>
              <div className="section-title" style={{ margin: '2px 0 8px' }}>
                Tasks <span className="muted">({doneCount}/{tasks.length})</span>
              </div>
              <div className="drawer__row" style={{ marginBottom: 10 }}>
                <input className="input" style={{ flex: 1 }} placeholder="Nova task (começo → meio → fim)…"
                  value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addTask(); }} />
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
                    <button className="icon-btn" title="excluir task" onClick={() => delTask(t)}><Icon name="x" size={14} /></button>
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
              <button className="btn btn--danger" disabled={busy} onClick={() => setConfirmDel(true)}>Excluir item</button>
              <button className="btn" onClick={onClose}>Fechar</button>
            </>
          )}
        </div>
      </aside>

      {confirmDel && (
        <ConfirmDialog
          title="Excluir item"
          message="Excluir este item e todas as suas tasks? Esta ação não pode ser desfeita."
          confirmLabel="Excluir" danger
          onClose={() => setConfirmDel(false)}
          onConfirm={async () => {
            await pmDeleteItem(item.id);
            await onSaved?.();
            toast.ok('Item excluído.');
            onClose();
          }}
        />
      )}
    </div>
  );
}

// ===========================================================================
export default function MetaProjects({ canManageProjects = true, initialId = null }) {
  const toast = useToast();
  const [projects, setProjects] = useState([]);
  const [apps, setApps] = useState([]);
  const [selId, setSelId] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const [fType, setFType] = useState('');
  const [fPrio, setFPrio] = useState('');
  const [q, setQ] = useState('');
  const [showWontfix, setShowWontfix] = useState(false);

  const [drawer, setDrawer] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [overCol, setOverCol] = useState(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [newProj, setNewProj] = useState({ key: '', name: '', appType: 'product_software' });
  const [confirmDelProject, setConfirmDelProject] = useState(null);

  const loadProjects = useCallback(async (keepSel) => {
    try {
      const [p, a] = await Promise.all([pmProjects(), fetchApps().catch(() => [])]);
      // Produtos/sistemas primeiro; portais CMS por último (mundos separados na UI).
      const ordered = [...(p || [])].sort((x, y) => Number(isPortal(x)) - Number(isPortal(y)));
      setProjects(ordered);
      setApps(Array.isArray(a) ? a : a?.data || []);
      setSelId((cur) => (keepSel && cur) || cur
        || (initialId && ordered.some((x) => x.id === initialId) ? initialId : null)
        || (ordered[0] && ordered[0].id) || null);
    } catch (e) { toast.err(e.message); } finally { setLoading(false); }
  }, [toast, initialId]);
  useEffect(() => { loadProjects(); }, [loadProjects]);

  // Navegação vinda do painel ("Abrir board" num projeto específico).
  useEffect(() => {
    if (initialId) setSelId((cur) => (cur === initialId ? cur : initialId));
  }, [initialId]);

  const loadItems = useCallback(async (pid) => {
    if (!pid) { setItems([]); return; }
    try { setItems((await pmItems(pid)) || []); } catch (e) { toast.err(e.message); }
  }, [toast]);
  useEffect(() => { if (selId) loadItems(selId); else setItems([]); }, [selId, loadItems]);

  const sel = projects.find((p) => p.id === selId) || null;
  const liveApp = liveAppFor(apps, sel);

  const filtered = items.filter((it) =>
    (!fType || it.type === fType) && (!fPrio || it.priority === fPrio)
    && (!q || (it.title || '').toLowerCase().includes(q.toLowerCase())));

  const cols = showWontfix ? [...STATUS_COLS, { key: 'wontfix', label: 'Descartado' }] : STATUS_COLS;
  const byStatus = (s) => filtered.filter((it) => it.status === s);
  const total = items.length;
  const doneCount = items.filter((i) => DONE.has(i.status)).length;

  const onDropTo = (status) => {
    setOverCol(null);
    const id = draggingId;
    setDraggingId(null);
    if (!id) return;
    const it = items.find((x) => x.id === id);
    if (!it || it.status === status) return;
    setItems((cur) => cur.map((x) => (x.id === id ? { ...x, status } : x)));
    pmPatchItem(id, { status }).catch((e) => { toast.err(e.message); loadItems(selId); });
  };

  const submitCreateProject = async () => {
    const key = newProj.key.trim();
    const name = newProj.name.trim() || key;
    if (!key) { toast.err('Informe a chave do projeto.'); return; }
    try {
      await pmCreateProject({ key, name, app_type: newProj.appType });
      setCreateOpen(false);
      setNewProj({ key: '', name: '', appType: 'product_software' });
      toast.ok('Projeto criado.');
      await loadProjects(true);
    } catch (e) { toast.err(e.message); }
  };

  if (loading) return <ListSkeleton rows={3} />;

  return (
    <div className="meta">
      {canManageProjects && (
        <PageHeader
          actions={<button className="btn btn--primary" onClick={() => setCreateOpen(true)}><Icon name="plus" size={16} /> Novo projeto</button>}
        />
      )}

      {/* Pills de projeto */}
      <div className="toolbar" style={{ marginBottom: 14 }}>
        <div className="meta__pills">
          {projects.map((p, i) => {
            const live = liveAppFor(apps, p);
            const meta = typeMeta(appTypeOf(p));
            const firstPortal = isPortal(p) && (i === 0 || !isPortal(projects[i - 1]));
            return (
              <React.Fragment key={p.id}>
                {firstPortal && <span className="muted" style={{ alignSelf: 'center', padding: '0 6px', fontSize: '.78rem' }}>| portais</span>}
                <button className={'pill' + (p.id === selId ? ' pill--active' : '')}
                  onClick={() => setSelId(p.id)}
                  title={`${meta.label}${live ? ` · app no ar · ${live.pods} pod(s)` : ' · sem app vivo no cluster'}`}>
                  <span className={'dot ' + (live ? 'dot--ok' : 'dot--warn')} />
                  {p.name}
                  {isPortal(p) && <span className="pill__count">CMS</span>}
                  {p.id === selId && <span className="pill__count">{items.length}</span>}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {!projects.length && (
        <EmptyState
          icon="kanban"
          title={canManageProjects ? 'Nenhum projeto ainda' : 'Nenhum projeto atribuído a você'}
          hint={canManageProjects ? 'Crie o primeiro projeto para começar a organizar itens e tarefas.' : 'Fale com um administrador para receber acesso a um projeto.'}
          action={canManageProjects ? <button className="btn btn--primary" onClick={() => setCreateOpen(true)}><Icon name="plus" size={16} /> Novo projeto</button> : null}
        />
      )}

      {projects.length > 0 && !sel && <EmptyState icon="kanban" title="Selecione um projeto acima." />}

      {sel && (
        <>
          <div className="app-card">
            <div className="app-card__head">
              <div>
                <h3 className="app-card__title">{sel.name}</h3>
                <p className="app-card__meta">{[sel.stack, sel.description].filter(Boolean).join(' · ') || '—'}</p>
              </div>
              <div className="app-card__urls">
                <span className={'badge ' + typeMeta(appTypeOf(sel)).badge}>{typeMeta(appTypeOf(sel)).label}</span>
                <span className={'badge ' + (liveApp ? 'badge-ok' : 'badge-muted')}>{liveApp ? '● no ar' : '○ sem app vivo'}</span>
                {sel.route && <a className="quick-link" href={sel.route} target="_blank" rel="noopener noreferrer">Abrir {sel.route} ↗</a>}
                {canManageProjects && (
                  <button className="btn btn--danger" style={{ fontSize: '.8rem', padding: '4px 10px' }} onClick={() => setConfirmDelProject(sel)}>
                    Excluir projeto
                  </button>
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
                  {liveApp.urls.map((u) => <a key={u} className="chip" href={u} target="_blank" rel="noopener noreferrer">{u}</a>)}
                </div>
              </div>
            )}
          </div>

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
            <button className="btn btn--primary" onClick={() => setDrawer({ mode: 'create', item: null })}><Icon name="plus" size={16} /> item</button>
          </div>

          <div className="board">
            {cols.map((col) => {
              const colItems = byStatus(col.key);
              return (
                <div key={col.key}
                  className={'board__col' + (overCol === col.key ? ' board__col--over' : '')}
                  onDragOver={(e) => { e.preventDefault(); if (overCol !== col.key) setOverCol(col.key); }}
                  onDragLeave={(e) => { if (e.currentTarget === e.target) setOverCol((c) => (c === col.key ? null : c)); }}
                  onDrop={() => onDropTo(col.key)}>
                  <div className="board__col-head">
                    <span>{col.label}</span>
                    <span className="board__col-count">{colItems.length}</span>
                  </div>
                  <div className="board__col-body">
                    {colItems.map((it) => (
                      <Card key={it.id} it={it} dragging={draggingId === it.id} setDragging={setDraggingId}
                        onOpen={() => setDrawer({ mode: 'edit', item: it })} />
                    ))}
                    {!colItems.length && <div className="board__empty">sem itens — arraste para cá ou use “+ item”</div>}
                  </div>
                </div>
              );
            })}
          </div>
          {!total && <p className="muted" style={{ marginTop: 10 }}>Nenhum item ainda. Clique em <strong>+ item</strong> para cadastrar um bug, feature ou evolução.</p>}
        </>
      )}

      {drawer && (
        <ItemDrawer mode={drawer.mode} item={drawer.item} projectId={selId}
          onClose={() => setDrawer(null)} onSaved={() => loadItems(selId)} />
      )}

      {createOpen && (
        <Modal title="Novo projeto" size="sm" onClose={() => setCreateOpen(false)}
          footer={<>
            <button className="btn" onClick={() => setCreateOpen(false)}>Cancelar</button>
            <button className="btn btn--primary" onClick={submitCreateProject} disabled={!newProj.key.trim()}>Criar</button>
          </>}>
          <label className="field" style={{ marginBottom: 10 }}>
            <span className="field__label">Chave (kebab-case)</span>
            <input className="input" placeholder="ex.: meu-app" value={newProj.key}
              onChange={(e) => setNewProj((p) => ({ ...p, key: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') submitCreateProject(); }} />
          </label>
          <label className="field" style={{ marginBottom: 10 }}>
            <span className="field__label">Nome</span>
            <input className="input" placeholder="ex.: Meu App" value={newProj.name}
              onChange={(e) => setNewProj((p) => ({ ...p, name: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') submitCreateProject(); }} />
          </label>
          <label className="field">
            <span className="field__label">Tipo</span>
            <select className="select" value={newProj.appType}
              onChange={(e) => setNewProj((p) => ({ ...p, appType: e.target.value }))}>
              <option value="product_software">Produto / sistema (board de projetos & tarefas)</option>
              <option value="cms_portal">Portal CMS (conteúdo gerenciado pelo editor)</option>
              <option value="platform_tool">Ferramenta interna da plataforma</option>
            </select>
          </label>
          <p className="muted" style={{ marginTop: 8, fontSize: '.8rem' }}>
            Portais CMS aparecem na aba <strong>Conteúdo</strong> e no painel do usuário em “Meus Portais”;
            produtos aparecem aqui e em “Meus Sistemas”.
          </p>
        </Modal>
      )}

      {confirmDelProject && (
        <ConfirmDialog
          title="Excluir projeto"
          message={`Excluir o projeto "${confirmDelProject.name}" e TODOS os seus itens e tasks? Esta ação não pode ser desfeita.`}
          confirmLabel="Excluir" danger
          onClose={() => setConfirmDelProject(null)}
          onConfirm={async () => {
            await pmDeleteProject(confirmDelProject.id);
            setDrawer(null);
            const fresh = (await pmProjects()) || [];
            setProjects(fresh);
            setSelId(fresh.length ? fresh[0].id : null);
            toast.ok('Projeto excluído.');
          }}
        />
      )}
    </div>
  );
}
