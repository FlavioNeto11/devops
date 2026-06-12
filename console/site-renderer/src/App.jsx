import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Blocks from './Blocks.jsx';

/**
 * App — renderer genérico de portais CMS.
 * URL: /sites/<chave>[/<pagina>] → busca a árvore PUBLICADA do portal na rota
 * pública do pm-api (mesma origem) e renderiza as seções por kind. Portal
 * pendente/desativado responde 404 na API → tela de "fora do ar".
 */
const API = (key) => `${window.location.origin}/devops/api/cms/public/${key}`;

function parsePath() {
  // /sites/<key>/<slug?>  (tolera barra final)
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
  const [tree, setTree] = useState(null);
  const [state, setState] = useState('loading'); // loading | ok | notfound | error

  useEffect(() => {
    const onPop = () => setRoute(parsePath());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (!key) { setState('notfound'); return; }
    let alive = true;
    setState('loading');
    fetch(API(key))
      .then(async (r) => {
        if (!alive) return;
        if (r.status === 404) { setState('notfound'); return; }
        if (!r.ok) { setState('error'); return; }
        const json = await r.json();
        setTree(json.data);
        applyPalette(json.data?.site);
        document.title = json.data?.site?.name || json.data?.project?.name || 'Portal';
        setState('ok');
      })
      .catch(() => { if (alive) setState('error'); });
    return () => { alive = false; };
  }, [key]);

  const pages = tree?.pages || [];
  const page = useMemo(
    () => pages.find((p) => p.slug === slug) || pages.find((p) => p.slug === 'home') || pages[0] || null,
    [pages, slug],
  );

  const nav = useCallback((toSlug) => {
    const base = `/sites/${key}`;
    const url = toSlug && toSlug !== 'home' ? `${base}/${toSlug}` : base;
    window.history.pushState(null, '', url);
    setRoute({ key, slug: toSlug === 'home' ? '' : toSlug });
    window.scrollTo({ top: 0 });
  }, [key]);

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
  const name = site.name || tree?.project?.name || key;
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
