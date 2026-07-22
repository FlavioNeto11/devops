import React, { useState } from 'react';
import { useRoute, navigate } from './router.js';
import { getToken, setToken } from './api.js';
import PortalsView from './views/PortalsView.jsx';
import CaptureView from './views/CaptureView.jsx';
import ReviewView from './views/ReviewView.jsx';

/**
 * Shell do portal-recorder. Cabecalho com titulo, campo de token (PORTAL_REC_TOKEN,
 * persistido em localStorage), toggle de tema e navegacao. O corpo renderiza a view
 * conforme a rota (hash): Portais & Sessoes, Captura ou Revisao.
 *
 * Estilo seguindo o console: CSS simples tokenizado (styles.css), sem framework.
 */
export default function App() {
  const route = useRoute();

  // O tema agora é controlado pela casca global (<platform-shell>) — sem toggle próprio aqui.
  return (
    <div className="shell">
      <platform-shell surface="portal-rec" me-url="/devops/api/me"></platform-shell>
      <TokenBar />
      <header className="topbar">
        <div className="topbar__brand">
          <button className="brand-btn" onClick={() => navigate('#/')} title="Portais & Sessoes">
            <span className="brand-dot" aria-hidden="true" />
            <strong>portal<b>recorder</b></strong>
          </button>
          <span className="topbar__sub">
            {route.name === 'capture' && 'Captura'}
            {route.name === 'review' && 'Revisao'}
            {route.name === 'portals' && 'Portais & Sessoes'}
          </span>
        </div>
        <nav className="topbar__nav" aria-label="Navegacao principal">
          {route.name !== 'portals' && (
            <button className="btn btn-ghost" onClick={() => navigate('#/')}>
              ← Portais
            </button>
          )}
          {route.name === 'capture' && (
            <button
              className="btn btn-ghost"
              onClick={() => navigate(`#/review/${route.sessionId}`)}
            >
              Revisao
            </button>
          )}
          {route.name === 'review' && (
            <button
              className="btn btn-ghost"
              onClick={() => navigate(`#/capture/${route.sessionId}`)}
            >
              Captura
            </button>
          )}
        </nav>
      </header>

      <main className="content" role="main">
        {route.name === 'portals' && <PortalsView />}
        {route.name === 'capture' && <CaptureView sessionId={route.sessionId} />}
        {route.name === 'review' && <ReviewView sessionId={route.sessionId} />}
      </main>

      <footer className="app-footer">
        <span>
          Ferramenta de operador. Capturas redigidas na origem (segredos → ***). Browser remoto
          efemero por sessao.
        </span>
      </footer>
    </div>
  );
}

/**
 * Barra de token (PORTAL_REC_TOKEN). O token e necessario para as escritas (criar
 * portal/sessao, anotar, print, encerrar, normalizar). Guardado em localStorage.
 */
function TokenBar() {
  const [token, setTokenState] = useState(() => getToken());
  const [editing, setEditing] = useState(() => !getToken());

  const save = () => {
    setToken(token.trim());
    setEditing(false);
  };
  const clear = () => {
    setToken('');
    setTokenState('');
    setEditing(true);
  };

  const hasToken = !!getToken();

  return (
    <section
      className={'tokenbar' + (hasToken ? ' tokenbar--ok' : ' tokenbar--warn')}
      aria-label="Token de escrita"
    >
      <span className="tokenbar__label">Token de escrita (PORTAL_REC_TOKEN)</span>
      {editing ? (
        <>
          <input
            className="input tokenbar__input"
            type="password"
            placeholder="cole o token aqui…"
            value={token}
            onChange={(e) => setTokenState(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            autoComplete="off"
            aria-label="Token de escrita PORTAL_REC_TOKEN"
          />
          <button className="btn btn-primary" onClick={save} disabled={!token.trim()}>
            Salvar
          </button>
          <span className="tokenbar__hint muted small">
            Onde obter: Secret <code>portal-recorder-config</code> (namespace <code>apps</code>),
            chave <code>PORTAL_REC_TOKEN</code> — peça ao operador da plataforma se não tiver.
          </span>
        </>
      ) : (
        <>
          <span className="tokenbar__status">
            <span className="tokenbar__dot" aria-hidden="true" />
            {hasToken ? 'configurado' : 'ausente — escritas vao falhar'}
          </span>
          <button className="btn btn-ghost" onClick={() => setEditing(true)}>
            Editar
          </button>
          {hasToken && (
            <button className="btn btn-ghost" onClick={clear}>
              Limpar
            </button>
          )}
        </>
      )}
    </section>
  );
}
