import React, { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { pmMe, pmProjects } from '../api.js';
import { ToastProvider } from './ToastProvider.jsx';
import { parseEmbedHash, embedMessage } from '../lib/embed.js';

// Mesmo code-split do App: o editor (Tiptap + editor visual + AutoForm) é o pedaço
// mais pesado do bundle — o embed é exatamente essa superfície.
const ContentEditor = lazy(() => import('./ContentEditor.jsx'));

// postMessage ao pai SEMPRE com targetOrigin = a MESMA origem (o embed é same-origin
// por contrato — nginx só libera frame-ancestors 'self'); nunca '*'.
function postToParent(msg) {
  try {
    if (window.parent && window.parent !== window) window.parent.postMessage(msg, window.location.origin);
  } catch { /* fail-soft: sem pai, o embed continua utilizável standalone */ }
}

/**
 * (E4, Forja 4.1) Superfície EMBED do Console: SÓ o editor de conteúdo (CMS), sem
 * casca/sidebar/topbar/platform-shell. Renderizada pelo App quando a URL tem
 * ?embed=1; o foco de portal vem do hash #conteudo?projeto=<key> (gramática E1).
 * Anuncia `embed:ready` ao carregar e `embed:navigate` quando o portal em edição
 * muda — o Studio usa isso para loading/erro fail-soft.
 */
export default function EmbedSurface() {
  const [me, setMe] = useState(null);
  const [meLoaded, setMeLoaded] = useState(false);
  const [focusProject, setFocusProject] = useState(null);
  const [hashApplied, setHashApplied] = useState(false);

  useEffect(() => { document.title = 'Conteúdo · DevOps Console'; }, []);

  // Identidade (mesma degradação do App: falha -> sem me; a borda já só deixa passar quem pode).
  useEffect(() => {
    let alive = true;
    pmMe()
      .then((data) => { if (alive) setMe(data); })
      .catch(() => { if (alive) setMe(null); })
      .finally(() => { if (alive) setMeLoaded(true); });
    return () => { alive = false; };
  }, []);

  // Foco do portal via hash (#conteudo?projeto=<key>) — fail-soft: key desconhecida ou
  // pm-api fora = o editor abre no primeiro portal, nada quebra. Reaplica em hashchange
  // (o pai pode trocar o portal alterando a URL do iframe sem recriá-lo).
  useEffect(() => {
    let alive = true;
    const apply = () => {
      const h = parseEmbedHash(window.location.hash);
      const projeto = h && h.view === 'conteudo' ? h.params.get('projeto') : null;
      if (!projeto) { setHashApplied(true); return; }
      pmProjects()
        .then((list) => {
          const p = (Array.isArray(list) ? list : []).find((x) => x.key === projeto || String(x.id) === projeto);
          if (alive && p) setFocusProject(p.id);
        })
        .catch(() => { /* fail-soft */ })
        .finally(() => { if (alive) setHashApplied(true); });
    };
    apply();
    window.addEventListener('hashchange', apply);
    return () => { alive = false; window.removeEventListener('hashchange', apply); };
  }, []);

  // Superfície pronta (identidade + hash resolvidos) -> avisa o pai (esconde o loading no Studio).
  useEffect(() => {
    if (meLoaded && hashApplied) postToParent(embedMessage('embed:ready'));
  }, [meLoaded, hashApplied]);

  // Navegação interna (trocou o portal em edição) -> o pai acompanha.
  const onNavigate = useCallback(({ projeto }) => {
    postToParent(embedMessage('embed:navigate', { view: 'conteudo', projeto: projeto || '' }));
  }, []);

  if (!meLoaded || !hashApplied) {
    return (
      <div className="shell-loading">
        <span className="skel" style={{ width: 180, height: 16, borderRadius: 6 }} />
      </div>
    );
  }

  return (
    <ToastProvider>
      <main className="content content--embed" role="main">
        <Suspense fallback={<div className="muted" style={{ padding: 24 }}>Carregando editor…</div>}>
          <ContentEditor initialId={focusProject} me={me} embed onNavigate={onNavigate} />
        </Suspense>
      </main>
    </ToastProvider>
  );
}
