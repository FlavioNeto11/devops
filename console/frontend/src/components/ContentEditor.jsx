import React, { useCallback, useEffect, useState } from 'react';
import {
  pmProjects, fetchApps,
  pmCmsSite, pmCmsSaveSite,
  pmCmsPages, pmCmsCreatePage,
  pmCmsSections, pmCmsCreateSection, pmCmsPatchSection, pmCmsDeleteSection, pmCmsReorderSections,
} from '../api.js';
import Icon from './Icon.jsx';
import Modal from './Modal.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import EmptyState from './EmptyState.jsx';
import PageHeader from './PageHeader.jsx';
import { ListSkeleton } from './Skeleton.jsx';
import { useToast } from './ToastProvider.jsx';
import AutoForm from './cms/AutoForm.jsx';

/** Templates de "Nova secao" — dados iniciais por kind (genericos editaveis). */
const KIND_TEMPLATES = {
  'section-heading': { label: 'Título de seção', data: { eyebrow: '', title: 'Novo título', titleAccent: '', subtitle: '', center: false } },
  'rich-text': { label: 'Texto rico', data: { eyebrow: '', heading: '', html: '<p>Novo texto…</p>' } },
  'card-grid': { label: 'Grade de cards', data: { heading: { eyebrow: '', title: 'Título', titleAccent: '', subtitle: '', center: false }, layout: 'grid', columns: 3, cards: [{ icon: 'Sparkles', title: 'Card', desc: '' }] } },
  'timeline': { label: 'Linha do tempo', data: { heading: { eyebrow: '', title: 'Como funciona', titleAccent: '' }, steps: [{ icon: 'Search', title: 'Etapa', desc: '' }] } },
  'accordion': { label: 'FAQ / Acordeão', data: { heading: { eyebrow: '', title: 'Perguntas frequentes', titleAccent: '', center: true }, items: [{ q: 'Pergunta?', a: 'Resposta.' }] } },
  'video-gallery': { label: 'Galeria de vídeos', data: { heading: { eyebrow: 'Mídia', title: 'Vídeos', titleAccent: '' }, items: [{ youtubeId: '', title: 'Vídeo', tipo: 'palestra' }] } },
  'materials': { label: 'Materiais', data: { heading: { eyebrow: 'Materiais', title: 'Recursos', titleAccent: '' }, items: [{ icon: 'FileText', title: 'Material', desc: '', kind: 'pdf', url: '', available: false }] } },
  'testimonials': { label: 'Depoimentos', data: { heading: { eyebrow: '', title: 'Depoimentos', titleAccent: '', center: true }, items: [{ quote: '', author: '', role: '' }] } },
  'logos': { label: 'Logos / marcas', data: { heading: { eyebrow: '', title: 'Quem confia', titleAccent: '' }, items: [{ name: '', logoUrl: '' }] } },
  'cta': { label: 'Chamada (CTA)', data: { title: 'Vamos conversar', titleAccent: '', titleTail: '?', text: '', buttons: [{ label: 'Solicitar proposta', kind: 'proposal', href: '' }] } },
};

const KIND_LABEL = {
  hero: 'Hero', 'section-heading': 'Título', 'rich-text': 'Texto', 'card-grid': 'Cards',
  timeline: 'Timeline', accordion: 'FAQ', 'video-gallery': 'Vídeos', materials: 'Materiais',
  palestras: 'Palestras', testimonials: 'Depoimentos', logos: 'Logos', cta: 'CTA', 'lead-form': 'Formulário',
};

function liveAppFor(apps, proj) {
  if (!proj) return null;
  return (apps || []).find((a) => a && (a.app === proj.k8s_label_selector || a.app === proj.key)) || null;
}

// ===========================================================================
function SectionDrawer({ section, onClose, onSaved }) {
  const toast = useToast();
  const [data, setData] = useState(() => JSON.parse(JSON.stringify(section.data || {})));
  const [anchor, setAnchor] = useState(section.anchor || '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = async () => {
    setBusy(true);
    try {
      await pmCmsPatchSection(section.id, { data, anchor: anchor || null });
      toast.ok('Seção salva.');
      await onSaved?.();
      onClose();
    } catch (e) { toast.err(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="drawer__overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Editar seção">
        <div className="drawer__head">
          <div className="kcard__tags">
            <span className="badge badge-accent">{KIND_LABEL[section.kind] || section.kind}</span>
          </div>
          <button className="drawer__close" onClick={onClose} aria-label="Fechar"><Icon name="x" size={18} /></button>
        </div>
        <div className="drawer__body">
          <label className="field">
            <span className="field__label">Âncora (link #)</span>
            <input className="input" value={anchor} placeholder="ex.: palestras" onChange={(e) => setAnchor(e.target.value)} />
          </label>
          <AutoForm value={data} onChange={setData} projectId={section._projectId} />
        </div>
        <div className="drawer__foot">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn--primary" disabled={busy} onClick={save}>Salvar seção</button>
        </div>
      </aside>
    </div>
  );
}

// ===========================================================================
export default function ContentEditor() {
  const toast = useToast();
  const [projects, setProjects] = useState([]);
  const [apps, setApps] = useState([]);
  const [selId, setSelId] = useState(null);
  const [pages, setPages] = useState([]);
  const [selPageId, setSelPageId] = useState(null);
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);

  const [drawer, setDrawer] = useState(null);
  const [siteDraft, setSiteDraft] = useState(null);
  const [siteBusy, setSiteBusy] = useState(false);
  const [newSec, setNewSec] = useState('');
  const [confirmDel, setConfirmDel] = useState(null);
  const [dragId, setDragId] = useState(null);

  const loadProjects = useCallback(async () => {
    try {
      const [p, a] = await Promise.all([pmProjects(), fetchApps().catch(() => [])]);
      setProjects(p || []);
      setApps(Array.isArray(a) ? a : a?.data || []);
      setSelId((cur) => cur || (p && p[0] && p[0].id) || null);
    } catch (e) { toast.err(e.message); } finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { loadProjects(); }, [loadProjects]);

  const loadPages = useCallback(async (pid) => {
    if (!pid) { setPages([]); setSelPageId(null); return; }
    try {
      const pg = (await pmCmsPages(pid)) || [];
      setPages(pg);
      setSelPageId((cur) => (pg.find((x) => x.id === cur) ? cur : pg[0]?.id || null));
    } catch (e) { toast.err(e.message); }
  }, [toast]);
  useEffect(() => { loadPages(selId); }, [selId, loadPages]);

  const loadSections = useCallback(async (pageId) => {
    if (!pageId) { setSections([]); return; }
    try { setSections((await pmCmsSections(pageId)) || []); } catch (e) { toast.err(e.message); }
  }, [toast]);
  useEffect(() => { loadSections(selPageId); }, [selPageId, loadSections]);

  const sel = projects.find((p) => p.id === selId) || null;
  const liveApp = liveAppFor(apps, sel);

  const toggle = (s, field) => {
    const next = field === 'status' ? (s.status === 'published' ? 'draft' : 'published') : !s.visible;
    setSections((cur) => cur.map((x) => (x.id === s.id ? { ...x, [field]: next } : x)));
    pmCmsPatchSection(s.id, { [field]: next }).catch((e) => { toast.err(e.message); loadSections(selPageId); });
  };

  const onDrop = (targetId) => {
    const from = dragId; setDragId(null);
    if (!from || from === targetId) return;
    const ids = sections.map((s) => s.id);
    const a = ids.indexOf(from); const b = ids.indexOf(targetId);
    if (a < 0 || b < 0) return;
    ids.splice(b, 0, ids.splice(a, 1)[0]);
    const reordered = ids.map((id) => sections.find((s) => s.id === id));
    setSections(reordered);
    pmCmsReorderSections(selPageId, ids).catch((e) => { toast.err(e.message); loadSections(selPageId); });
  };

  const createSection = async () => {
    const tmpl = KIND_TEMPLATES[newSec];
    if (!tmpl) return;
    try {
      await pmCmsCreateSection(selPageId, { kind: newSec, data: tmpl.data, status: 'published', visible: true });
      setNewSec('');
      await loadSections(selPageId);
      toast.ok('Seção criada.');
    } catch (e) { toast.err(e.message); }
  };

  const openSite = async () => {
    try { setSiteDraft((await pmCmsSite(selId)) || {}); } catch (e) { toast.err(e.message); }
  };
  const saveSite = async () => {
    setSiteBusy(true);
    try { await pmCmsSaveSite(selId, siteDraft); toast.ok('Configuração salva.'); setSiteDraft(null); }
    catch (e) { toast.err(e.message); } finally { setSiteBusy(false); }
  };

  if (loading) return <ListSkeleton rows={3} />;

  return (
    <div className="meta">
      <PageHeader actions={sel && (
        <>
          <button className="btn" onClick={openSite}><Icon name="file-text" size={16} /> Editar site</button>
          {sel.route && <a className="btn" href={sel.route} target="_blank" rel="noopener noreferrer">Pré-visualizar ↗</a>}
        </>
      )} />

      {/* Portais */}
      <div className="toolbar" style={{ marginBottom: 14 }}>
        <div className="meta__pills">
          {projects.map((p) => {
            const live = liveAppFor(apps, p);
            return (
              <button key={p.id} className={'pill' + (p.id === selId ? ' pill--active' : '')} onClick={() => setSelId(p.id)}>
                <span className={'dot ' + (live ? 'dot--ok' : 'dot--warn')} />
                {p.name}
              </button>
            );
          })}
        </div>
      </div>

      {!projects.length && <EmptyState icon="file-text" title="Nenhum portal atribuído" hint="Fale com um administrador para receber acesso a um portal." />}

      {sel && (
        <>
          {/* Abas de página */}
          <div className="toolbar" style={{ marginBottom: 12, gap: 8 }}>
            <div className="meta__pills">
              {pages.map((pg) => (
                <button key={pg.id} className={'pill' + (pg.id === selPageId ? ' pill--active' : '')} onClick={() => setSelPageId(pg.id)}>
                  {pg.title}
                  <span className="pill__count">{pg.status === 'published' ? '●' : '○'}</span>
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select className="select" value={newSec} onChange={(e) => setNewSec(e.target.value)}>
                <option value="">+ nova seção…</option>
                {Object.entries(KIND_TEMPLATES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <button className="btn btn--primary" disabled={!newSec || !selPageId} onClick={createSection}>Adicionar</button>
            </div>
          </div>

          {!sections.length && <EmptyState icon="file-text" title="Página sem seções" hint="Use “+ nova seção” para começar a montar o conteúdo." />}

          <div style={{ display: 'grid', gap: 8 }}>
            {sections.map((s) => (
              <article
                key={s.id}
                className="app-card"
                draggable
                onDragStart={() => setDragId(s.id)}
                onDragEnd={() => setDragId(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(s.id)}
                style={{ padding: 12, cursor: 'grab', opacity: dragId === s.id ? 0.5 : 1 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span className="badge badge-accent">{KIND_LABEL[s.kind] || s.kind}</span>
                  {s.anchor && <span className="muted" style={{ fontSize: '.8rem' }}>#{s.anchor}</span>}
                  <span style={{ flex: 1 }} />
                  <button className={'badge ' + (s.status === 'published' ? 'badge-ok' : 'badge-muted')} onClick={() => toggle(s, 'status')} title="publicar/rascunho" style={{ cursor: 'pointer', border: 0 }}>
                    {s.status === 'published' ? '● publicado' : '○ rascunho'}
                  </button>
                  <button className={'badge ' + (s.visible ? 'badge-ok' : 'badge-warn')} onClick={() => toggle(s, 'visible')} title="visível/oculto" style={{ cursor: 'pointer', border: 0 }}>
                    {s.visible ? 'visível' : 'oculto'}
                  </button>
                  <button className="btn" style={{ fontSize: '.8rem', padding: '4px 10px' }} onClick={() => setDrawer({ ...s, _projectId: selId })}>Editar</button>
                  <button className="icon-btn" title="excluir" onClick={() => setConfirmDel(s)}><Icon name="trash2" size={16} /></button>
                </div>
              </article>
            ))}
          </div>
          <p className="muted" style={{ marginTop: 10, fontSize: '.82rem' }}>Arraste as seções para reordenar. As mudanças aparecem no portal após recarregar.</p>
        </>
      )}

      {drawer && <SectionDrawer section={drawer} onClose={() => setDrawer(null)} onSaved={() => loadSections(selPageId)} />}

      {siteDraft && (
        <Modal title="Configuração do site (contato, redes, fotos)" size="md" onClose={() => setSiteDraft(null)}
          footer={<>
            <button className="btn" onClick={() => setSiteDraft(null)}>Cancelar</button>
            <button className="btn btn--primary" disabled={siteBusy} onClick={saveSite}>Salvar</button>
          </>}>
          <AutoForm value={siteDraft} onChange={setSiteDraft} projectId={selId} />
        </Modal>
      )}

      {confirmDel && (
        <ConfirmDialog title="Excluir seção" message="Excluir esta seção do portal? Esta ação não pode ser desfeita."
          confirmLabel="Excluir" danger onClose={() => setConfirmDel(null)}
          onConfirm={async () => { await pmCmsDeleteSection(confirmDel.id); await loadSections(selPageId); toast.ok('Seção excluída.'); }} />
      )}
    </div>
  );
}
