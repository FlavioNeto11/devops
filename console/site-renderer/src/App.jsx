import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Blocks from './Blocks.jsx';
import { CmsEditProvider, useEditMode, useEditTree, wantsEdit } from './cmsEdit.jsx';

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
    window.scrollTo({ top: 0 });
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
  if (state === 'loading') return <div className="sr-status">Carregando…</div>;
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
      <header className="sr-header">
        <div className="sr-container sr-header__in">
          <button className="sr-brand" onClick={() => nav('home')}>{name}</button>
          {pages.length > 1 && (
            <nav className="sr-nav">
              {pages.map((p) => (
                <button key={p.slug} className={'sr-nav__link' + (page?.slug === p.slug ? ' is-active' : '')} onClick={() => nav(p.slug)}>
                  {p.title}
                  {edit && p.status && p.status !== 'published' && <span className="sr-nav__draft" title="página em rascunho">○</span>}
                </button>
              ))}
            </nav>
          )}
        </div>
      </header>

      <main>
        {page
          ? <Blocks sections={page.sections || []} site={site} />
          : <div className="sr-status"><p>Este portal ainda não tem páginas publicadas.</p></div>}
      </main>

      <footer className="sr-footer" id="contato">
        <div className="sr-container">
          <strong>{name}</strong>
          {site.tagline && <p className="sr-footer__tag">{site.tagline}</p>}
          <div className="sr-footer__contact">
            {contact.email && <a href={`mailto:${contact.email}`}>{contact.email}</a>}
            {contact.whatsapp && <a href={`https://wa.me/${String(contact.whatsapp).replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
            {contact.phone && <span>{contact.phone}</span>}
            {(contact.city || contact.state) && <span>{[contact.city, contact.state].filter(Boolean).join(' · ')}</span>}
          </div>
          <p className="sr-footer__plat">Portal publicado pela plataforma NVIT.</p>
        </div>
      </footer>
    </div>
  );
}
