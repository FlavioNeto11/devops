import React, {
  createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowUp, ArrowDown, Check, Circle, Eye, EyeOff, FolderOpen, ImagePlus, Pencil, Plus, Trash2 } from 'lucide-react';
import type { ContentTree } from './content';
import { cn } from './utils';

/**
 * cmsEdit — modo de EDIÇÃO VISUAL do portal embarcado no DevOps Console.
 *
 * O console abre o portal num iframe com `?cmsEdit=1` e estabelece um canal
 * postMessage (mesma origem). Aqui o portal apenas: (a) recebe a árvore EDITÁVEL
 * injetada pelo console (inclui rascunho/oculto), (b) renderiza overlays de
 * edição e (c) EMITE intenções (setField/intent/select) — NUNCA grava. Toda a
 * persistência roda no console autenticado. Fora do modo edição, os primitivos
 * são inertes (renderizam o conteúdo normal, sem nenhum chrome).
 */
const SOURCE = 'cms-visual-editor';
const SLUG_TO_PATH: Record<string, string> = { home: '/', contato: '/contato', solucoes: '/solucoes' };

function pathToSlug(pathname: string): string {
  const clean = (pathname || '/').replace(/\/+$/, '') || '/';
  return clean === '/' ? 'home' : clean.replace(/^\//, '');
}

// Gate estático (latcheado): em iframe + ?cmsEdit=1. Visitante normal nunca está
// em iframe, então jamais entra em modo edição. O valor é cacheado porque a
// navegação SPA descarta a query string — não devemos "desarmar" ao navegar.
let _wants: boolean | undefined;
export function wantsEdit(): boolean {
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

type Selection = { sectionId?: string; path?: string; site?: boolean } | null;
type EditState = {
  active: boolean;
  tree: ContentTree | null;
  selected: Selection;
  emit: (type: string, payload?: Record<string, unknown>) => void;
};

const Ctx = createContext<EditState>({ active: false, tree: null, selected: null, emit: () => {} });
const SectionIdCtx = createContext<string | undefined>(undefined);

export const useEditMode = () => useContext(Ctx).active;
export const useEditTree = () => useContext(Ctx).tree;
export const useEditSelection = () => useContext(Ctx).selected;
export const useEmit = () => useContext(Ctx).emit;
export const useSectionId = () => useContext(SectionIdCtx);

// ===========================================================================
export function CmsEditProvider({ children }: { children: ReactNode }) {
  const wants = wantsEdit();
  const navigate = useNavigate();
  const location = useLocation();
  const [active, setActive] = useState(false);
  const [tree, setTree] = useState<ContentTree | null>(null);
  const [selected, setSelected] = useState<Selection>(null);

  const emit = useCallback((type: string, payload: Record<string, unknown> = {}) => {
    if (!wants) return;
    try { window.parent.postMessage({ source: SOURCE, type, ...payload }, window.location.origin); } catch { /* noop */ }
  }, [wants]);

  useEffect(() => {
    if (!wants) return undefined;
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const m = e.data as Record<string, unknown>;
      if (!m || m.source !== SOURCE) return;
      switch (m.type) {
        case 'cms:hello': setActive(true); break;
        case 'cms:tree': setTree(m.tree as ContentTree); break;
        case 'cms:navigate': navigate(SLUG_TO_PATH[m.slug as string] ?? `/${m.slug}`); break;
        case 'cms:select':
          // emissão local (clique aqui) E eco do console ({} limpa a seleção).
          setSelected((m.sectionId || m.site)
            ? { sectionId: m.sectionId as string | undefined, path: m.path as string | undefined, site: !!m.site }
            : null);
          break;
        default: break;
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [wants, navigate]);

  // handshake ao montar
  useEffect(() => {
    if (wants) emit('cms:ready', { slug: pathToSlug(location.pathname) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wants]);

  // avisa o console quando a rota muda (navegação interna por links/menu)
  useEffect(() => {
    if (wants && active) emit('cms:nav-changed', { slug: pathToSlug(location.pathname) });
  }, [location.pathname, wants, active, emit]);

  const value: EditState = { active: wants && active, tree, selected, emit };
  return (
    <Ctx.Provider value={value}>
      {value.active && <style dangerouslySetInnerHTML={{ __html: CMS_EDIT_CSS }} />}
      {children}
    </Ctx.Provider>
  );
}

// ===========================================================================
type Tag = keyof JSX.IntrinsicElements;

/** Texto editável in-place (contentEditable). Caret-safe: só sincroniza o DOM
 *  quando o valor muda por fora E o campo não está em foco. */
export function EditableText({
  sectionId, path, value = '', as = 'span', className, multiline = false, placeholder = '',
}: {
  sectionId?: string; path: string; value?: string; as?: Tag; className?: string; multiline?: boolean; placeholder?: string;
}) {
  const active = useEditMode();
  const emit = useEmit();
  const ctxId = useSectionId();
  const sid = sectionId ?? ctxId;
  const ref = useRef<HTMLElement | null>(null);
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useLayoutEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (el && !focused.current && el.textContent !== value) el.textContent = value || '';
  }, [value, active]);

  if (!active) return React.createElement(as, { className }, value);

  const flush = (text: string) => emit('cms:setField', { sectionId: sid, path, value: text });
  return React.createElement(as, {
    ref,
    className: cn(className, 'cms-editable'),
    contentEditable: true,
    suppressContentEditableWarning: true,
    spellCheck: false,
    'data-cms-ph': placeholder,
    onInput: (e: React.FormEvent<HTMLElement>) => {
      const text = e.currentTarget.textContent || '';
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => flush(text), 400);
    },
    onFocus: () => { focused.current = true; },
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      focused.current = false;
      if (timer.current) clearTimeout(timer.current);
      flush(e.currentTarget.textContent || '');
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (!multiline && e.key === 'Enter') { e.preventDefault(); (e.currentTarget as HTMLElement).blur(); }
      e.stopPropagation();
    },
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
  });
}

/** Moldura por seção: contorno + barra de ações (mover/ocultar/publicar/excluir/
 *  adicionar) no hover; clique seleciona (abre painel no console). Inerte fora de edição. */
export function SectionFrame({ section, index, count, children }: {
  section: { id?: string; kind: string; status?: string; visible?: boolean };
  index: number; count: number; children: ReactNode;
}) {
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
        {/* barra sticky de altura 0: gruda abaixo do header fixo do portal e o
            ponteiro nunca precisa cruzar o header para alcançá-la. */}
        <div className="cms-frame__bar" onClick={(e) => e.stopPropagation()}>
          <div className="cms-frame__bar-pill">
            <span className="cms-frame__tag">{section.kind}</span>
            {draft && <span className="cms-frame__badge">rascunho</span>}
            {hidden && <span className="cms-frame__badge">oculto</span>}
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

/** Controles flutuantes por item de lista (cards, etc.): editar/mover/excluir. */
export function ItemControls({ sectionId, path, index, count }: { sectionId?: string; path: string; index: number; count: number }) {
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
export function AddButton({ sectionId, path, label }: { sectionId?: string; path: string; label: string }) {
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

/** Slot de mídia com UPLOAD NO LUGAR: o input de arquivo vive aqui (gesto do
 *  usuário no documento do iframe abre o file dialog) e o File viaja por
 *  structured clone no postMessage (`cms:upload`) — quem grava é o console.
 *  `site` aponta para cms_site.data (ex.: photos.hero) em vez de section.data.
 *  `empty` deixa o overlay persistente (placeholder "descobrível") e o clique
 *  em qualquer ponto abre o file dialog. `compact` usa botões só-ícone. */
export function MediaSlot({
  sectionId, path, site = false, accept = 'image/*', empty = false, compact = false,
  maxSize = 8 * 1024 * 1024, className, children,
}: {
  sectionId?: string; path: string; site?: boolean; accept?: string; empty?: boolean; compact?: boolean;
  maxSize?: number; className?: string; children: ReactNode;
}) {
  const active = useEditMode();
  const emit = useEmit();
  const tree = useEditTree();
  const ctxId = useSectionId();
  const sid = sectionId ?? ctxId;
  const inp = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  // o console SEMPRE re-posta a árvore (sucesso ou falha=nack) → reseta o busy.
  useEffect(() => { setBusy(false); }, [tree]);
  if (!active) return <>{children}</>;
  const target = site ? { site: true, path } : { sectionId: sid, path };
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > maxSize) { // espelha o limite do pm-api (8 MB; vídeo 50 MB)
      window.alert(`Arquivo excede o limite de ${Math.round(maxSize / 1024 / 1024)} MB.`);
      return;
    }
    setBusy(true);
    emit('cms:upload', { ...target, file, name: file.name, mime: file.type, size: file.size });
  };
  const activate = () => {
    if (busy) return;
    if (empty) inp.current?.click(); else emit('cms:select', target);
  };
  return (
    <div
      className={cn('cms-media', empty && 'cms-media--empty', className)}
      role="button"
      tabIndex={0}
      aria-label={empty ? 'Adicionar imagem' : 'Selecionar imagem'}
      onClick={(e) => { e.stopPropagation(); activate(); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); activate(); }
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

// CSS do chrome de edição — injetado SÓ quando o modo está ativo (inerte no bundle público).
// Barra/controles: visibility+opacity com DELAY no esconder (grace period — o ponteiro pode
// cruzar brevemente o header fixo sem a barra sumir). z-index 60/55 fica acima do header (z-50)
// e ABAIXO dos lightboxes/modais dos portais (z-70) — não subir.
const CMS_EDIT_CSS = `
.cms-frame { position: relative; }
.cms-frame:hover { outline: 2px dashed rgba(56,189,248,.65); outline-offset: -2px; }
.cms-frame--sel { outline: 2px solid #38bdf8 !important; outline-offset: -2px; }
.cms-frame--dim > *:not(.cms-frame__bar) { opacity: .42; }
.cms-frame__bar { position: sticky; top: 80px; height: 0; overflow: visible; z-index: 60; display: flex; align-items: flex-start; justify-content: flex-end; visibility: hidden; opacity: 0; transition: opacity .15s ease .35s, visibility 0s linear .5s; }
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
.cms-media:focus-visible { outline: 2px solid #38bdf8; outline-offset: 2px; }
.cms-media__hint { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 6px; visibility: hidden; opacity: 0; transition: opacity .12s ease .3s, visibility 0s linear .45s; background: rgba(2,6,23,.55); color: #fff; font: 600 12px/1 ui-sans-serif,system-ui,sans-serif; border-radius: inherit; z-index: 5; }
.cms-media:hover > .cms-media__hint, .cms-media--empty > .cms-media__hint { visibility: visible; opacity: 1; transition-delay: 0s, 0s; }
.cms-media--empty > .cms-media__hint { background: rgba(2,6,23,.35); border: 1px dashed rgba(56,189,248,.6); }
.cms-media__hint button { display: inline-flex; align-items: center; gap: 5px; padding: 6px 10px; border: 0; border-radius: 8px; background: rgba(15,23,42,.92); color: #e2e8f0; font: 600 12px/1 ui-sans-serif,system-ui,sans-serif; cursor: pointer; }
.cms-media__hint button:hover { background: rgba(56,189,248,.9); color: #06121f; }
`;
