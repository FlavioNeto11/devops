import { useEffect, useState } from 'react';

/**
 * router.js
 * ---------
 * Roteador minimo baseado em hash (sem dependencia externa), no estilo "estado
 * simples" do console. Evita configuracao de basename: o hash vive depois do '#'
 * e e independente do subpath /portal-rec/ servido pelo nginx.
 *
 * Rotas suportadas:
 *   #/                         -> Portais & Sessoes
 *   #/capture/:sessionId       -> Captura
 *   #/review/:sessionId        -> Revisao
 */

/** Le o hash atual e devolve { name, sessionId }. */
export function parseHash(hash) {
  const raw = (hash || '').replace(/^#/, '');
  const parts = raw.split('/').filter(Boolean); // ['capture','<id>']
  if (parts[0] === 'capture' && parts[1]) {
    return { name: 'capture', sessionId: decodeURIComponent(parts[1]) };
  }
  if (parts[0] === 'review' && parts[1]) {
    return { name: 'review', sessionId: decodeURIComponent(parts[1]) };
  }
  return { name: 'portals', sessionId: null };
}

/** Navega trocando o hash (dispara hashchange). */
export function navigate(to) {
  window.location.hash = to;
}

/** Hook que devolve a rota atual e reage a mudancas de hash. */
export function useRoute() {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
