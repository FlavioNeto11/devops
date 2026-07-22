import React, {
  createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState,
} from 'react';
import {
  ArrowUp, ArrowDown, Check, Circle, Eye, EyeOff, FolderOpen, ImagePlus, Pencil, Plus, Sparkles, Trash2,
} from 'lucide-react';

/**
 * cmsEdit — modo de EDIÇÃO VISUAL do portal embarcado no DevOps Console.
 * Port do padrão dos portais dedicados (apps/anarabottini/src/lib/cmsEdit.tsx),
 * adaptado ao renderer genérico (sem react-router; navegação via callback).
 *
 * O console abre /sites/<chave>/?cmsEdit=1 num iframe (mesma origem) e injeta a
 * árvore EDITÁVEL (inclui rascunho/oculto) por postMessage. Aqui o portal só
 * renderiza o chrome de edição e EMITE intenções (setField/intent/select/upload)
 * — NUNCA grava; a persistência roda no console autenticado. Fora do modo
 * edição os primitivos são inertes (conteúdo público normal, sem chrome).
 */
const SOURCE = 'cms-visual-editor';
const cn = (...a) => a.filter(Boolean).join(' ');

// Gate estático (latcheado): só em iframe + ?cmsEdit=1 — visitante nunca ativa.
let _wants;
export function wantsEdit() {
  if (_wants !== undefined) return _wants;
  _wants = (() => {
    if (typeof window === 'undefined') return false;
    try {
      if (window.self === window.top) return false;
      return new URLSearchParams(window.location.search).get('cmsEdit') === '1';
    } catch { return false; }
  })();
  return _wants;
}

const Ctx = createContext({ active: false, tree: null, selected: null, emit: () => {} });
const SectionIdCtx = createContext(undefined);

export const useEditMode = () => useContext(Ctx).active;
export const useEditTree = () => useContext(Ctx).tree;
export const useEditSelection = () => useContext(Ctx).selected;
export const useEmit = () => useContext(Ctx).emit;
export const useSectionId = () => useContext(SectionIdCtx);

// ===========================================================================
export function CmsEditProvider({ currentSlug, onNavigate, children }) {
  const wants = wantsEdit();
  const [active, setActive] = useState(false);
  const [tree, setTree] = useState(null);
  const [selected, setSelected] = useState(null);
  const navRef = useRef(onNavigate);
  useEffect(() => { navRef.current = onNavigate; });

  const emit = useCallback((type, payload = {}) => {
    if (!wants) return;
    try { window.parent.postMessage({ source: SOURCE, type, ...payload }, window.location.origin); } catch { /* noop */ }
  }, [wants]);

  useEffect(() => {
    if (!wants) return undefined;
    const onMsg = (e) => {
      if (e.origin !== window.location.origin) return;
      const m = e.data;
      if (!m || m.source !== SOURCE) return;
      switch (m.type) {
        case 'cms:hello': setActive(true); break;
        case 'cms:tree': setTree(m.tree); break;
        case 'cms:navigate': navRef.current?.(m.slug); break;
        case 'cms:select':
          setSelected((m.sectionId || m.site)
            ? { sectionId: m.sectionId, path: m.path, site: !!m.site }
            : null);
          break;
        default: break;
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [wants]);

  // handshake ao montar
  useEffect(() => {
    if (wants) emit('cms:ready', { slug: currentSlug || 'home' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wants]);

  // avisa o console quando a navegação interna muda de página
  useEffect(() => {
    if (wants && active) emit('cms:nav-changed', { slug: currentSlug || 'home' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSlug]);

  const value = { active: wants && active, tree, selected, emit };
  return (
    <Ctx.Provider value={value}>
      {value.active && <style dangerouslySetInnerHTML={{ __html: CMS_EDIT_CSS }} />}
      {children}
    </Ctx.Provider>
  );
}

// ===========================================================================
/** Texto editável in-place (contentEditable). Caret-safe: só sincroniza o DOM
 *  quando o valor muda por fora E o campo não está em foco.
 *  `site` aponta para cms_site.data (header/rodapé/identidade) em vez de section.data. */
export function EditableText({ sectionId, path, site = false, value = '', as = 'span', className, multiline = false, placeholder = '' }) {
  const active = useEditMode();
  const emit = useEmit();
  const ctxId = useSectionId();
  const sid = sectionId ?? ctxId;
  const ref = useRef(null);
  const focused = useRef(false);
  const timer = useRef(undefined);

  useLayoutEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (el && !focused.current && el.textContent !== value) el.textContent = value || '';
  }, [value, active]);

  if (!active) return React.createElement(as, { className }, value);

  const flush = (text) => emit('cms:setField', site
    ? { site: true, path, value: text }
    : { sectionId: sid, path, value: text });
  return React.createElement(as, {
    ref,
    className: cn(className, 'cms-editable'),
    contentEditable: true,
    suppressContentEditableWarning: true,
    spellCheck: false,
    'data-cms-ph': placeholder,
    onInput: (e) => {
      const text = e.currentTarget.textContent || '';
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => flush(text), 400);
    },
    onFocus: () => { focused.current = true; },
    onBlur: (e) => {
      focused.current = false;
      if (timer.current) clearTimeout(timer.current);
      flush(e.currentTarget.textContent || '');
    },
    onKeyDown: (e) => {
      if (!multiline && e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
      e.stopPropagation();
    },
    onClick: (e) => e.stopPropagation(),
  });
}

/** Moldura por seção: contorno + barra de ações (mover/ocultar/publicar/excluir/
 *  adicionar) no hover; clique seleciona (abre painel no console). */
export function SectionFrame({ section, index, count, children }) {
  const active = useEditMode();
  const emit = useEmit();
  const selected = useEditSelection();
  if (!active) return <>{children}</>;
  const id = section.id;
  const isSel = selected?.sectionId === id;
  const hidden = section.visible === false;
  const draft = !!section.status && section.status !== 'published';
  const sel = () => emit('cms:select', { sectionId: id, kind: section.kind });
  return (
    <SectionIdCtx.Provider value={id}>
      <div className={cn('cms-frame', isSel && 'cms-frame--sel', (hidden || draft) && 'cms-frame--dim')} onClick={(e) => { e.stopPropagation(); sel(); }}>
        <div className="cms-frame__bar" onClick={(e) => e.stopPropagation()}>
          <div className="cms-frame__bar-pill">
            <span className="cms-frame__tag">{section.kind}</span>
            {draft && <span className="cms-frame__badge">rascunho</span>}
            {hidden && <span className="cms-frame__badge">oculto</span>}
            <button title="Pedir à IA (reescreve esta seção)" onClick={() => emit('cms:select', { sectionId: id, kind: section.kind, ai: true })}><Sparkles size={14} /></button>
            <button title="Editar no painel" onClick={sel}><Pencil size={14} /></button>
            <button title="Mover para cima" disabled={index === 0} onClick={() => emit('cms:intent', { action: 'move-section', sectionId: id, dir: -1 })}><ArrowUp size={14} /></button>
            <button title="Mover para baixo" disabled={index === count - 1} onClick={() => emit('cms:intent', { action: 'move-section', sectionId: id, dir: 1 })}><ArrowDown size={14} /></button>
            <button title={section.status === 'published' ? 'Tornar rascunho' : 'Publicar'} onClick={() => emit('cms:intent', { action: 'set-status', sectionId: id, value: section.status === 'published' ? 'draft' : 'published' })}>{section.status === 'published' ? <Check size={14} /> : <Circle size={14} />}</button>
            <button title={hidden ? 'Mostrar' : 'Ocultar'} onClick={() => emit('cms:intent', { action: 'set-visible', sectionId: id, value: hidden })}>{hidden ? <EyeOff size={14} /> : <Eye size={14} />}</button>
            <button title="Excluir seção" onClick={() => emit('cms:intent', { action: 'delete-section', sectionId: id })}><Trash2 size={14} /></button>
            <button title="Adicionar seção abaixo" onClick={() => emit('cms:intent', { action: 'add-section', afterSectionId: id })}><Plus size={14} /></button>
          </div>
        </div>
        {children}
      </div>
    </SectionIdCtx.Provider>
  );
}

/** Controles flutuantes por item de lista (cards, steps, faq…): editar/mover/excluir. */
export function ItemControls({ sectionId, path, index, count }) {
  const active = useEditMode();
  const emit = useEmit();
  const ctxId = useSectionId();
  const sid = sectionId ?? ctxId;
  if (!active) return null;
  return (
    <div className="cms-item-ctl" onClick={(e) => e.stopPropagation()}>
      <button title="Editar item" onClick={() => emit('cms:select', { sectionId: sid, path: `${path}.${index}` })}><Pencil size={13} /></button>
      <button title="Subir" disabled={index === 0} onClick={() => emit('cms:intent', { action: 'move-item', sectionId: sid, path, index, dir: -1 })}><ArrowUp size={13} /></button>
      <button title="Descer" disabled={index === count - 1} onClick={() => emit('cms:intent', { action: 'move-item', sectionId: sid, path, index, dir: 1 })}><ArrowDown size={13} /></button>
      <button title="Excluir item" onClick={() => emit('cms:intent', { action: 'delete-item', sectionId: sid, path, index })}><Trash2 size={13} /></button>
    </div>
  );
}

/** Botão "+ adicionar" para uma lista (cards/itens). */
export function AddButton({ sectionId, path, label }) {
  const active = useEditMode();
  const emit = useEmit();
  const ctxId = useSectionId();
  const sid = sectionId ?? ctxId;
  if (!active) return null;
  return (
    <button className="cms-add" onClick={(e) => { e.stopPropagation(); emit('cms:intent', { action: 'add-item', sectionId: sid, path }); }}>
      <Plus size={15} /> {label}
    </button>
  );
}

/** Slot de mídia com UPLOAD NO LUGAR (File viaja por structured clone; quem grava é o console). */
export function MediaSlot({
  sectionId, path, site = false, accept = 'image/*', empty = false, compact = false,
  maxSize = 8 * 1024 * 1024, className, children,
}) {
  const active = useEditMode();
  const emit = useEmit();
  const tree = useEditTree();
  const ctxId = useSectionId();
  const sid = sectionId ?? ctxId;
  const inp = useRef(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setBusy(false); }, [tree]);
  if (!active) return <>{children}</>;
  const target = site ? { site: true, path } : { sectionId: sid, path };
  const onFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > maxSize) {
      window.alert(`Arquivo excede o limite de ${Math.round(maxSize / 1024 / 1024)} MB.`);
      return;
    }
    setBusy(true);
    emit('cms:upload', { ...target, file, name: file.name, mime: file.type, size: file.size });
  };
  return (
    <div
      className={cn('cms-media', empty && 'cms-media--empty', className)}
      onClick={(e) => {
        e.stopPropagation();
        if (busy) return;
        if (empty) inp.current?.click(); else emit('cms:select', target);
      }}
    >
      {children}
      <span className="cms-media__hint">
        {busy ? <span>enviando…</span> : (
          <>
            <button type="button" title="Enviar do computador" onClick={(e) => { e.stopPropagation(); inp.current?.click(); }}>
              <ImagePlus size={14} />{!compact && <> {empty ? 'adicionar imagem' : 'enviar'}</>}
            </button>
            <button type="button" title="Escolher da biblioteca" onClick={(e) => { e.stopPropagation(); emit('cms:select', target); }}>
              <FolderOpen size={14} />{!compact && <> biblioteca</>}
            </button>
          </>
        )}
      </span>
      <input ref={inp} type="file" hidden accept={accept} onChange={onFile} onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

// CSS do chrome de edição — injetado SÓ quando o modo está ativo.
const CMS_EDIT_CSS = `
.cms-frame { position: relative; }
.cms-frame:hover { outline: 2px dashed rgba(56,189,248,.65); outline-offset: -2px; }
.cms-frame--sel { outline: 2px solid #38bdf8 !important; outline-offset: -2px; }
.cms-frame--dim > *:not(.cms-frame__bar) { opacity: .42; }
.cms-frame__bar { position: sticky; top: 66px; height: 0; overflow: visible; z-index: 60; display: flex; align-items: flex-start; justify-content: flex-end; visibility: hidden; opacity: 0; transition: opacity .15s ease .35s, visibility 0s linear .5s; }
.cms-frame:hover > .cms-frame__bar, .cms-frame--sel > .cms-frame__bar, .cms-frame__bar:hover { visibility: visible; opacity: 1; transition-delay: 0s, 0s; }
.cms-frame__bar-pill { display: flex; gap: 2px; align-items: center; margin: 8px 12px 0 0; padding: 4px; border-radius: 9px; background: rgba(15,23,42,.94); box-shadow: 0 6px 18px rgba(0,0,0,.35); }
.cms-frame__bar button { display: grid; place-items: center; width: 27px; height: 27px; border: 0; border-radius: 6px; background: transparent; color: #e2e8f0; cursor: pointer; }
.cms-frame__bar button:hover { background: rgba(255,255,255,.16); }
.cms-frame__bar button:disabled { opacity: .35; cursor: default; }
.cms-frame__tag { font: 700 10px/1 ui-sans-serif,system-ui,sans-serif; color: #38bdf8; text-transform: uppercase; letter-spacing: .07em; padding: 0 6px; }
.cms-frame__badge { font: 700 9px/1 ui-sans-serif,system-ui,sans-serif; color: #fde68a; background: rgba(120,53,15,.7); padding: 4px 6px; border-radius: 5px; text-transform: uppercase; letter-spacing: .04em; }
.cms-editable { outline: none; cursor: text; border-radius: 3px; transition: box-shadow .15s; }
.cms-editable:hover { box-shadow: 0 0 0 2px rgba(56,189,248,.4); }
.cms-editable:focus { box-shadow: 0 0 0 2px rgba(56,189,248,.95); background: rgba(56,189,248,.08); }
.cms-editable:empty::before { content: attr(data-cms-ph); opacity: .45; font-style: italic; }
.cms-item { position: relative; }
.cms-item-ctl { position: absolute; top: 6px; right: 6px; z-index: 55; display: flex; gap: 2px; padding: 3px; border-radius: 8px; background: rgba(15,23,42,.94); box-shadow: 0 4px 12px rgba(0,0,0,.3); visibility: hidden; opacity: 0; transition: opacity .12s ease .3s, visibility 0s linear .45s; }
.cms-item:hover .cms-item-ctl, .cms-item-ctl:hover { visibility: visible; opacity: 1; transition-delay: 0s, 0s; }
.cms-item-ctl button { display: grid; place-items: center; width: 25px; height: 25px; border: 0; border-radius: 5px; background: transparent; color: #e2e8f0; cursor: pointer; }
.cms-item-ctl button:hover { background: rgba(255,255,255,.16); }
.cms-item-ctl button:disabled { opacity: .35; cursor: default; }
.cms-add { display: inline-flex; align-items: center; gap: 6px; margin-top: 18px; padding: 9px 16px; border: 1px dashed rgba(56,189,248,.65); border-radius: 11px; background: rgba(56,189,248,.1); color: #0ea5e9; font: 600 13px/1 ui-sans-serif,system-ui,sans-serif; cursor: pointer; }
.cms-add:hover { background: rgba(56,189,248,.2); }
.cms-media { position: relative; cursor: pointer; }
.cms-media__hint { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 6px; visibility: hidden; opacity: 0; transition: opacity .12s ease .3s, visibility 0s linear .45s; background: rgba(2,6,23,.55); color: #fff; font: 600 12px/1 ui-sans-serif,system-ui,sans-serif; border-radius: inherit; z-index: 5; }
.cms-media:hover > .cms-media__hint, .cms-media--empty > .cms-media__hint { visibility: visible; opacity: 1; transition-delay: 0s, 0s; }
.cms-media--empty > .cms-media__hint { background: rgba(2,6,23,.35); border: 1px dashed rgba(56,189,248,.6); }
.cms-media__hint button { display: inline-flex; align-items: center; gap: 5px; padding: 6px 10px; border: 0; border-radius: 8px; background: rgba(15,23,42,.92); color: #e2e8f0; font: 600 12px/1 ui-sans-serif,system-ui,sans-serif; cursor: pointer; }
.cms-media__hint button:hover { background: rgba(56,189,248,.9); color: #06121f; }
`;
