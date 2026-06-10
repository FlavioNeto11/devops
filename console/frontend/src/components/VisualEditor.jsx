import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  pmCmsSite, pmCmsSaveSite,
  pmCmsPages, pmCmsSections,
  pmCmsCreateSection, pmCmsPatchSection, pmCmsDeleteSection, pmCmsReorderSections,
} from '../api.js';
import { KIND_TEMPLATES, KIND_LABEL } from './cms/kinds.js';
import { getAt, setAt } from '../lib/jsonPath.js';
import Icon from './Icon.jsx';
import Modal from './Modal.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import EmptyState from './EmptyState.jsx';
import { useToast } from './ToastProvider.jsx';
import AutoForm from './cms/AutoForm.jsx';
import RichTextField from './cms/RichTextField.jsx';
import MediaPicker from './cms/MediaPicker.jsx';
import IconPicker from './cms/IconPicker.jsx';

// Protocolo postMessage com o portal embarcado no iframe (mesma origem).
const SOURCE = 'cms-visual-editor';
const FILE_KEY = /(fileid|photo|logo|image|url|hero|about)$/i;
const PATCH_DEBOUNCE = 600;

// ---- helpers imutáveis sobre a árvore -------------------------------------
function findSection(tree, id) {
  for (const p of tree?.pages || []) {
    const s = (p.sections || []).find((x) => x.id === id);
    if (s) return s;
  }
  return null;
}
function mapSection(tree, id, fn) {
  return { ...tree, pages: tree.pages.map((p) => ({ ...p, sections: p.sections.map((s) => (s.id === id ? fn(s) : s)) })) };
}
const clone = (v) => JSON.parse(JSON.stringify(v ?? null));

// ===========================================================================
export default function VisualEditor({ project }) {
  const toast = useToast();
  const iframeRef = useRef(null);
  const treeRef = useRef(null);
  const timersRef = useRef({});

  const [tree, setTree] = useState(null);
  const [pageSlug, setPageSlug] = useState(null);
  const [selected, setSelected] = useState(null); // { sectionId, path?, kind? }
  const [ready, setReady] = useState(false);
  const [loadErr, setLoadErr] = useState(null);
  const [siteDraft, setSiteDraft] = useState(null);
  const [siteBusy, setSiteBusy] = useState(false);
  const [pendingAdd, setPendingAdd] = useState(null); // { afterSectionId? }
  const [confirmDel, setConfirmDel] = useState(null);
  const [panelOpen, setPanelOpen] = useState(true);

  const iframeSrc = useMemo(() => {
    const base = (project.route || `/${project.key}`).replace(/\/+$/, '');
    return `${base}/?cmsEdit=1`;
  }, [project]);

  // ---- envio ao iframe -----------------------------------------------------
  const post = useCallback((type, payload = {}) => {
    try { iframeRef.current?.contentWindow?.postMessage({ source: SOURCE, type, ...payload }, window.location.origin); }
    catch { /* noop */ }
  }, []);

  const commitTree = useCallback((next) => {
    treeRef.current = next;
    setTree(next);
    post('cms:tree', { tree: next });
  }, [post]);

  // ---- montar a árvore EDITÁVEL (inclui draft/oculto) ----------------------
  const buildTree = useCallback(async () => {
    const [site, pages] = await Promise.all([
      pmCmsSite(project.id).catch(() => ({})),
      pmCmsPages(project.id),
    ]);
    const full = await Promise.all((pages || []).map(async (pg) => {
      const secs = (await pmCmsSections(pg.id)) || [];
      return {
        slug: pg.slug, title: pg.title, status: pg.status, _id: pg.id,
        sections: secs.map((s) => ({
          id: s.id, kind: s.kind, anchor: s.anchor, data: s.data || {},
          status: s.status, visible: s.visible, _pageId: pg.id,
        })),
      };
    }));
    const t = { project: { key: project.key, name: project.name }, site: site || {}, pages: full };
    commitTree(t);
    setPageSlug((cur) => (full.find((p) => p.slug === cur) ? cur : full[0]?.slug || null));
    return t;
  }, [project, commitTree]);

  useEffect(() => {
    let alive = true;
    setReady(false); setSelected(null); setLoadErr(null);
    buildTree().catch((e) => { if (alive) setLoadErr(e.message); });
    return () => { alive = false; };
  }, [buildTree]);

  // push da árvore assim que o iframe estiver pronto
  useEffect(() => { if (ready && treeRef.current) post('cms:tree', { tree: treeRef.current }); }, [ready, post]);
  // navega o iframe quando a aba de página muda
  useEffect(() => { if (ready && pageSlug) post('cms:navigate', { slug: pageSlug }); }, [ready, pageSlug, post]);

  // ---- persistência --------------------------------------------------------
  const schedulePatch = useCallback((sectionId) => {
    clearTimeout(timersRef.current[sectionId]);
    timersRef.current[sectionId] = setTimeout(async () => {
      const sec = findSection(treeRef.current, sectionId);
      if (!sec) return;
      try { await pmCmsPatchSection(sectionId, { data: sec.data, anchor: sec.anchor ?? null }); }
      catch (e) { toast.err(e.message); buildTree().catch(() => {}); }
    }, PATCH_DEBOUNCE);
  }, [toast, buildTree]);

  useEffect(() => () => { Object.values(timersRef.current).forEach(clearTimeout); }, []);

  const setSectionData = useCallback((sectionId, data) => {
    commitTree(mapSection(treeRef.current, sectionId, (s) => ({ ...s, data })));
    schedulePatch(sectionId);
  }, [commitTree, schedulePatch]);

  const setSectionField = useCallback((sectionId, field, value) => {
    commitTree(mapSection(treeRef.current, sectionId, (s) => ({ ...s, [field]: value })));
    if (field === 'status' || field === 'visible') {
      pmCmsPatchSection(sectionId, { [field]: value }).catch((e) => { toast.err(e.message); buildTree().catch(() => {}); });
    } else {
      schedulePatch(sectionId);
    }
  }, [commitTree, schedulePatch, toast, buildTree]);

  // ---- intents estruturais -------------------------------------------------
  const currentPage = useCallback(() => (treeRef.current?.pages || []).find((p) => p.slug === pageSlug) || null, [pageSlug]);

  const moveSection = useCallback(async (sectionId, dir) => {
    const page = currentPage(); if (!page) return;
    const ids = page.sections.map((s) => s.id);
    const i = ids.indexOf(sectionId); const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try { await pmCmsReorderSections(page._id, ids); await buildTree(); }
    catch (e) { toast.err(e.message); }
  }, [currentPage, buildTree, toast]);

  const addSectionOfKind = useCallback(async (kind) => {
    const page = currentPage(); const tmpl = KIND_TEMPLATES[kind];
    if (!page || !tmpl) { setPendingAdd(null); return; }
    const afterId = pendingAdd?.afterSectionId || null;
    try {
      await pmCmsCreateSection(page._id, { kind, data: clone(tmpl.data), status: 'published', visible: true });
      let t = await buildTree();
      if (afterId) {
        const fresh = t.pages.find((p) => p.slug === page.slug);
        const ids = fresh.sections.map((s) => s.id);
        const newId = ids[ids.length - 1]; // create anexa no fim
        const without = ids.filter((id) => id !== newId);
        const at = without.indexOf(afterId);
        without.splice(at + 1, 0, newId);
        await pmCmsReorderSections(fresh._id, without);
        await buildTree();
      }
      toast.ok('Seção criada.');
    } catch (e) { toast.err(e.message); }
    setPendingAdd(null);
  }, [currentPage, pendingAdd, buildTree, toast]);

  const onItemIntent = useCallback((action, sectionId, path, index) => {
    const sec = findSection(treeRef.current, sectionId); if (!sec) return;
    const arr = Array.isArray(getAt(sec.data, path)) ? getAt(sec.data, path) : [];
    const next = action === 'add-item'
      ? [...arr, arr[0] ? clone(arr[0]) : { title: 'Novo item' }]
      : arr.filter((_, i) => i !== index); // delete-item
    setSectionData(sectionId, setAt(sec.data, path, next));
  }, [setSectionData]);

  const onMoveItem = useCallback((sectionId, path, index, dir) => {
    const sec = findSection(treeRef.current, sectionId); if (!sec) return;
    const arr = Array.isArray(getAt(sec.data, path)) ? [...getAt(sec.data, path)] : [];
    const j = index + dir;
    if (index < 0 || j < 0 || j >= arr.length) return;
    [arr[index], arr[j]] = [arr[j], arr[index]];
    setSectionData(sectionId, setAt(sec.data, path, arr));
  }, [setSectionData]);

  const handleIntent = useCallback((m) => {
    switch (m.action) {
      case 'move-section': moveSection(m.sectionId, m.dir); break;
      case 'add-section': setPendingAdd({ afterSectionId: m.afterSectionId || null }); break;
      case 'delete-section': setConfirmDel({ id: m.sectionId }); break;
      case 'set-status': setSectionField(m.sectionId, 'status', m.value); break;
      case 'set-visible': setSectionField(m.sectionId, 'visible', m.value); break;
      case 'add-item': onItemIntent('add-item', m.sectionId, m.path); break;
      case 'delete-item': onItemIntent('delete-item', m.sectionId, m.path, m.index); break;
      case 'move-item': onMoveItem(m.sectionId, m.path, m.index, m.dir); break;
      default: break;
    }
  }, [moveSection, setSectionField, onItemIntent, onMoveItem]);

  // ---- recepção de mensagens do iframe -------------------------------------
  useEffect(() => {
    const onMsg = (e) => {
      if (e.origin !== window.location.origin) return;
      const m = e.data;
      if (!m || m.source !== SOURCE) return;
      switch (m.type) {
        case 'cms:ready':
          setReady(true);
          post('cms:hello', { origin: window.location.origin });
          if (m.slug) setPageSlug((cur) => cur || m.slug);
          break;
        case 'cms:nav-changed': if (m.slug) setPageSlug(m.slug); break;
        case 'cms:select': setSelected({ sectionId: m.sectionId, path: m.path, kind: m.kind }); setPanelOpen(true); break;
        case 'cms:setField': {
          const sec = findSection(treeRef.current, m.sectionId);
          if (sec) setSectionData(m.sectionId, setAt(sec.data, m.path, m.value));
          break;
        }
        case 'cms:intent': handleIntent(m); break;
        default: break;
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [post, setSectionData, handleIntent]);

  // ---- site (contato/redes/fotos) -----------------------------------------
  const openSite = async () => { try { setSiteDraft((await pmCmsSite(project.id)) || {}); } catch (e) { toast.err(e.message); } };
  const saveSite = async () => {
    setSiteBusy(true);
    try { await pmCmsSaveSite(project.id, siteDraft); toast.ok('Configuração salva.'); setSiteDraft(null); post('cms:tree', { tree: { ...treeRef.current, site: siteDraft } }); commitTree({ ...treeRef.current, site: siteDraft }); }
    catch (e) { toast.err(e.message); } finally { setSiteBusy(false); }
  };

  const selSection = selected ? findSection(tree, selected.sectionId) : null;

  if (loadErr) return <EmptyState icon="alert" title="Falha ao carregar o conteúdo" hint={loadErr} />;
  if (!project.route) return <EmptyState icon="info" title="Portal sem rota pública" hint="Defina a rota do projeto para usar o editor visual." />;

  return (
    <div className="ve">
      {/* chrome: páginas + ações */}
      <div className="ve__chrome">
        <div className="meta__pills">
          {(tree?.pages || []).map((pg) => (
            <button key={pg._id} className={'pill' + (pg.slug === pageSlug ? ' pill--active' : '')} onClick={() => setPageSlug(pg.slug)}>
              {pg.title}
              <span className="pill__count">{pg.status === 'published' ? '●' : '○'}</span>
            </button>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={() => setPendingAdd({ afterSectionId: null })}><Icon name="plus" size={16} /> Seção</button>
        <button className="btn" onClick={openSite}><Icon name="file-text" size={16} /> Editar site</button>
        <button className="btn" onClick={() => setPanelOpen((o) => !o)} title="Painel"><Icon name={panelOpen ? 'chevronRight' : 'chevronLeft'} size={16} /></button>
        <a className="btn" href={iframeSrc.replace('?cmsEdit=1', '')} target="_blank" rel="noopener noreferrer">Abrir ↗</a>
      </div>

      <p className="muted ve__hint">
        Passe o mouse sobre uma seção para mover/ocultar/excluir; clique para editar no painel. Textos em destaque são editáveis direto na prévia.
      </p>

      {/* split: prévia (iframe) + painel contextual */}
      <div className={'ve__split' + (panelOpen && selSection ? ' ve__split--panel' : '')}>
        <div className="ve__frame">
          {!ready && <div className="ve__loading"><span className="skel" style={{ width: 160, height: 14, borderRadius: 6 }} /></div>}
          <iframe ref={iframeRef} src={iframeSrc} title="Prévia do portal" className="ve__iframe" />
        </div>

        {panelOpen && selSection && (
          <aside className="ve__panel">
            <div className="ve__panel-head">
              <span className="badge badge-accent">{KIND_LABEL[selSection.kind] || selSection.kind}</span>
              <span style={{ flex: 1 }} />
              <button className={'badge ' + (selSection.status === 'published' ? 'badge-ok' : 'badge-muted')} style={{ cursor: 'pointer', border: 0 }}
                onClick={() => setSectionField(selSection.id, 'status', selSection.status === 'published' ? 'draft' : 'published')}>
                {selSection.status === 'published' ? '● publicado' : '○ rascunho'}
              </button>
              <button className={'badge ' + (selSection.visible ? 'badge-ok' : 'badge-warn')} style={{ cursor: 'pointer', border: 0 }}
                onClick={() => setSectionField(selSection.id, 'visible', !selSection.visible)}>
                {selSection.visible ? 'visível' : 'oculto'}
              </button>
              <button className="drawer__close" onClick={() => setSelected(null)} aria-label="Fechar"><Icon name="x" size={18} /></button>
            </div>
            <div className="ve__panel-body">
              <PanelEditor section={selSection} path={selected.path} projectId={project.id} setSectionData={setSectionData} />
              <label className="field" style={{ marginTop: 14 }}>
                <span className="field__label">Âncora (link #)</span>
                <input className="input" value={selSection.anchor || ''} placeholder="ex.: palestras"
                  onChange={(e) => setSectionField(selSection.id, 'anchor', e.target.value || null)} />
              </label>
              <button className="btn" style={{ marginTop: 12, color: 'var(--danger, #dc2626)' }} onClick={() => setConfirmDel({ id: selSection.id })}>
                <Icon name="trash2" size={15} /> Excluir seção
              </button>
            </div>
          </aside>
        )}
      </div>

      {/* picker de kind para "Nova seção" */}
      {pendingAdd && (
        <Modal title="Nova seção" size="sm" onClose={() => setPendingAdd(null)}>
          <div className="ve__kinds">
            {Object.entries(KIND_TEMPLATES).map(([k, v]) => (
              <button key={k} className="ve__kind" onClick={() => addSectionOfKind(k)}>{v.label}</button>
            ))}
          </div>
        </Modal>
      )}

      {/* site */}
      {siteDraft && (
        <Modal title="Configuração do site (contato, redes, fotos)" size="md" onClose={() => setSiteDraft(null)}
          footer={<>
            <button className="btn" onClick={() => setSiteDraft(null)}>Cancelar</button>
            <button className="btn btn--primary" disabled={siteBusy} onClick={saveSite}>Salvar</button>
          </>}>
          <AutoForm value={siteDraft} onChange={setSiteDraft} projectId={project.id} />
        </Modal>
      )}

      {confirmDel && (
        <ConfirmDialog title="Excluir seção" message="Excluir esta seção do portal? Esta ação não pode ser desfeita."
          confirmLabel="Excluir" danger onClose={() => setConfirmDel(null)}
          onConfirm={async () => {
            try {
              await pmCmsDeleteSection(confirmDel.id);
              if (selected?.sectionId === confirmDel.id) setSelected(null);
              await buildTree();
              toast.ok('Seção excluída.');
            } catch (e) { toast.err(e.message); }
          }} />
      )}
    </div>
  );
}

// ---- editor do painel (seção inteira ou sub-caminho focado) ---------------
function PanelEditor({ section, path, projectId, setSectionData }) {
  const data = section.data || {};
  if (!path) {
    return <AutoForm value={data} onChange={(n) => setSectionData(section.id, n)} projectId={projectId} />;
  }
  const sub = getAt(data, path);
  if (sub && typeof sub === 'object') {
    return <AutoForm value={sub} onChange={(n) => setSectionData(section.id, setAt(data, path, n))} projectId={projectId} />;
  }
  const key = String(path).split('.').pop();
  const onChange = (v) => setSectionData(section.id, setAt(data, path, v));
  if (key === 'html') return <RichTextField value={sub || ''} onChange={onChange} />;
  if (key === 'icon') return <IconPicker value={sub || ''} onChange={onChange} />;
  if (FILE_KEY.test(key)) return <MediaPicker projectId={projectId} value={sub || ''} onChange={onChange} />;
  return <textarea className="textarea" autoFocus value={sub || ''} onChange={(e) => onChange(e.target.value)} />;
}
