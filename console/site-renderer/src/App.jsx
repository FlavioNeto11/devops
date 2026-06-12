import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Blocks from './Blocks.jsx';
import { CmsEditProvider, EditableText, useEditMode, useEditTree, useEmit, wantsEdit } from './cmsEdit.jsx';

/**
 * App — renderer genérico de portais CMS.
 * URL: /sites/<chave>[/<pagina>] → busca a árvore PUBLICADA do portal na rota
 * pública do pm-api (mesma origem) e renderiza as seções por kind.
 *
 * Modo EDIÇÃO (embarcado no DevOps Console com ?cmsEdit=1): a árvore EDITÁVEL
 * (inclui rascunho/oculto) chega por postMessage e substitui a pública — o
 * editor visual (clique-para-editar, mover/ocultar/excluir/adicionar seções,
 * upload de mídia) funciona para QUALQUER portal servido aqui.
 */
const API = (key) => `${window.location.origin}/devops/api/cms/public/${key}`;

function parsePath() {
  const parts = window.location.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  const i = parts.indexOf('sites');
  const key = i >= 0 ? parts[i + 1] || '' : '';
  const slug = i >= 0 ? parts[i + 2] || '' : '';
  return { key, slug };
}

// Paleta do CMS (site.palette ou site.aiPalette) vira CSS vars do tema.
function applyPalette(site) {
  const p = site?.palette || site?.aiPalette || {};
  const root = document.documentElement;
  if (p.primary) root.style.setProperty('--c-primary', p.primary);
  if (p.accent) root.style.setProperty('--c-accent', p.accent);
  if (p.background) root.style.setProperty('--c-bg', p.background);
}

export default function App() {
  const [{ key, slug }, setRoute] = useState(parsePath);

  useEffect(() => {
    const onPop = () => setRoute(parsePath());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const nav = useCallback((toSlug) => {
    const base = `/sites/${parsePath().key}`;
    const url = toSlug && toSlug !== 'home' ? `${base}/${toSlug}` : base;
    window.history.pushState(null, '', url + window.location.search);
    setRoute(parsePath());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return (
    <CmsEditProvider currentSlug={slug || 'home'} onNavigate={nav}>
      <Shell siteKey={key} slug={slug} nav={nav} />
    </CmsEditProvider>
  );
}

function Shell({ siteKey, slug, nav }) {
  const edit = useEditMode();
  const editTree = useEditTree();
  const emit = useEmit();
  const [menuOpen, setMenuOpen] = useState(false);
  // clique no header/rodapé (fora dos textos editáveis) abre o painel do SITE
  // no console — identidade, paleta, contato e o comando de IA do site.
  const selectSite = edit ? (e) => { e.stopPropagation(); emit('cms:select', { site: true }); } : undefined;
  const [publicTree, setPublicTree] = useState(null);
  const [state, setState] = useState('loading'); // loading | ok | notfound | error

  useEffect(() => {
    if (!siteKey) { setState('notfound'); return undefined; }
    // No modo edição quem manda a árvore é o console (inclui rascunho/oculto);
    // a rota pública nem é consultada (portal pendente responderia 404).
    if (wantsEdit()) { setState('ok'); return undefined; }
    let alive = true;
    setState('loading');
    fetch(API(siteKey))
      .then(async (r) => {
        if (!alive) return;
        if (r.status === 404) { setState('notfound'); return; }
        if (!r.ok) { setState('error'); return; }
        const json = await r.json();
        setPublicTree(json.data);
        setState('ok');
      })
      .catch(() => { if (alive) setState('error'); });
    return () => { alive = false; };
  }, [siteKey]);

  const tree = (edit && editTree) || publicTree;

  useEffect(() => {
    if (!tree) return;
    applyPalette(tree.site);
    document.title = tree.site?.name || tree.project?.name || 'Portal';
    if (tree.site?.description) {
      let m = document.querySelector('meta[name="description"]');
      if (!m) { m = document.createElement('meta'); m.name = 'description'; document.head.appendChild(m); }
      m.content = tree.site.description;
    }
  }, [tree]);

  const pages = tree?.pages || [];
  const page = useMemo(
    () => pages.find((p) => p.slug === (slug || 'home')) || pages.find((p) => p.slug === 'home') || pages[0] || null,
    [pages, slug],
  );

  if (wantsEdit() && !tree) return <div className="sr-status">Conectando ao editor…</div>;
  if (state === 'loading') {
    // skeleton com a estrutura do site (hero + cards) — feedback imediato
    return (
      <div className="sr-skel" aria-busy="true" aria-label="Carregando o portal">
        <div className="sr-container">
          <span className="sr-skel__bar" style={{ width: 140, height: 18, marginTop: 26 }} />
          <span className="sr-skel__bar" style={{ width: '55%', height: 40, marginTop: 60 }} />
          <span className="sr-skel__bar" style={{ width: '70%', height: 16 }} />
          <span className="sr-skel__bar" style={{ width: '40%', height: 16 }} />
          <div style={{ display: 'flex', gap: 14, marginTop: 40 }}>
            {[0, 1, 2].map((i) => <span key={i} className="sr-skel__bar" style={{ flex: 1, height: 120 }} />)}
          </div>
        </div>
      </div>
    );
  }
  if (state === 'notfound') {
    return (
      <div className="sr-status">
        <h1>Portal indisponível</h1>
        <p>Este portal não existe, ainda não foi aprovado ou está temporariamente fora do ar.</p>
      </div>
    );
  }
  if (state === 'error') return <div className="sr-status"><h1>Erro ao carregar</h1><p>Tente novamente em instantes.</p></div>;

  const site = tree?.site || {};
  const name = site.name || tree?.project?.name || siteKey;
  const contact = site.contact || {};

  return (
    <div className="sr">
      <header className={'sr-header' + (edit ? ' sr-edit-zone' : '')} onClick={selectSite}
        title={edit ? 'Clique para editar o site (identidade, paleta, contato)' : undefined}>
        <div className="sr-container sr-header__in">
          {edit
            ? <span className="sr-brand"><EditableText as="span" site path="name" value={site.name || ''} placeholder="nome do site" /></span>
            : <button className="sr-brand" onClick={() => nav('home')}>{name}</button>}
          {pages.length > 1 && (
            <>
              <button className="sr-burger" aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'} aria-expanded={menuOpen}
                onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}>
                {menuOpen ? '✕' : '☰'}
              </button>
              <nav className={'sr-nav' + (menuOpen ? ' is-open' : '')}>
                {pages.map((p) => (
                  <button key={p.slug} className={'sr-nav__link' + (page?.slug === p.slug ? ' is-active' : '')}
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(false); nav(p.slug); }}>
                    {p.title}
                    {edit && p.status && p.status !== 'published' && <span className="sr-nav__draft" title="página em rascunho">○</span>}
                  </button>
                ))}
              </nav>
            </>
          )}
        </div>
      </header>

      <main>
        {page
          ? <Blocks sections={page.sections || []} site={site} />
          : <div className="sr-status"><p>Este portal ainda não tem páginas publicadas.</p></div>}
      </main>

      <footer className={'sr-footer' + (edit ? ' sr-edit-zone' : '')} id="contato" onClick={selectSite}
        title={edit ? 'Clique para editar o site (identidade, paleta, contato)' : undefined}>
        <div className="sr-container">
          <strong>{edit ? <EditableText as="span" site path="name" value={site.name || ''} placeholder="nome do site" /> : name}</strong>
          {(edit || site.tagline) && (
            <p className="sr-footer__tag">
              {edit ? <EditableText as="span" site path="tagline" value={site.tagline || ''} placeholder="tagline / frase de posicionamento" /> : site.tagline}
            </p>
          )}
          <div className="sr-footer__contact">
            {edit ? (
              <>
                <span>✉ <EditableText as="span" site path="contact.email" value={contact.email || ''} placeholder="e-mail" /></span>
                <span>WhatsApp: <EditableText as="span" site path="contact.whatsapp" value={contact.whatsapp || ''} placeholder="55 11 9…" /></span>
                <span>☎ <EditableText as="span" site path="contact.phone" value={contact.phone || ''} placeholder="telefone" /></span>
                <span>📍 <EditableText as="span" site path="contact.city" value={contact.city || ''} placeholder="cidade" /> · <EditableText as="span" site path="contact.state" value={contact.state || ''} placeholder="UF" /></span>
              </>
            ) : (
              <>
                {contact.email && <a href={`mailto:${contact.email}`}>{contact.email}</a>}
                {waDigits(contact.whatsapp) && <a href={`https://wa.me/${waDigits(contact.whatsapp)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
                {contact.phone && <span>{contact.phone}</span>}
                {(contact.city || contact.state) && <span>{[contact.city, contact.state].filter(Boolean).join(' · ')}</span>}
              </>
            )}
          </div>
          <p className="sr-footer__plat">© {new Date().getFullYear()} {name}. Todos os direitos reservados · Portal publicado pela plataforma NVIT.</p>
        </div>
      </footer>

      {/* botão flutuante de WhatsApp (conversão) — só no público e com número válido */}
      {!edit && waDigits(contact.whatsapp) && (
        <a className="sr-wa" href={`https://wa.me/${waDigits(contact.whatsapp)}`} target="_blank" rel="noopener noreferrer"
          aria-label="Conversar no WhatsApp">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden>
            <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.6-6.1c-.3-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.3-.7.8-.8 1-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4 0-.5.1-.7l.4-.5c.1-.2.1-.3 0-.5l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1.1 2.7c.1.2 1.8 2.8 4.4 3.9 1.6.7 2.2.7 3 .6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2 0-.1-.2-.2-.4-.3Z" />
          </svg>
        </a>
      )}
    </div>
  );
}

// dígitos do WhatsApp validados (mínimo DDI+DDD+número); inválido → some o link
function waDigits(v) {
  const d = String(v || '').replace(/\D/g, '');
  return d.length >= 10 ? d : null;
}
