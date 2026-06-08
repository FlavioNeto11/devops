import React, { useEffect, useRef, useState } from 'react';
import { openStream } from './api.js';
import Overview from './components/Overview.jsx';
import Apps from './components/Apps.jsx';
import Publications from './components/Publications.jsx';
import Health from './components/Health.jsx';
import Logs from './components/Logs.jsx';
import MetaProjects from './components/MetaProjects.jsx';

/**
 * Abas disponiveis na navegacao principal.
 * O `key` e usado no estado; o `label` e o texto (pt-BR) exibido na UI.
 */
const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'apps', label: 'Apps' },
  { key: 'publications', label: 'Publicacoes' },
  { key: 'health', label: 'Health' },
  { key: 'logs', label: 'Logs' },
  { key: 'projects', label: 'Projetos & Tarefas' },
];

/**
 * Links externos (abertos em nova aba). Apontam para os outros componentes da
 * plataforma publicados no mesmo host, sob seus respectivos subpaths.
 */
const QUICK_LINKS = [
  { href: '/argocd', label: 'Argo CD' },
  { href: '/grafana', label: 'Grafana' },
  { href: '/dashboard/', label: 'Traefik' },
];

/**
 * Estados possiveis da conexao SSE, mapeados para rotulo + classe de badge.
 */
const STREAM_LABEL = {
  connecting: { text: 'conectando…', cls: 'badge badge-warn' },
  open: { text: 'ao vivo', cls: 'badge badge-ok' },
  error: { text: 'reconectando…', cls: 'badge badge-err' },
};

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');

  // Estado de conexao do stream SSE (compartilhado por Overview e Health).
  const [streamStatus, setStreamStatus] = useState('connecting');

  // Ultimo payload recebido via SSE. As abas reativas (Overview/Health) leem
  // este objeto para se atualizarem quase em tempo real.
  const [streamData, setStreamData] = useState(null);

  // Timestamp da ultima atualizacao recebida (para feedback na UI).
  const [lastUpdate, setLastUpdate] = useState(null);

  // Mantemos a referencia do EventSource para fechar no unmount.
  const esRef = useRef(null);

  useEffect(() => {
    let closed = false;
    let es;

    try {
      es = openStream();
    } catch (err) {
      // Navegador sem suporte a EventSource ou URL invalida: degrada para erro.
      // As abas continuam funcionando via fetch (botoes de atualizar).
      // eslint-disable-next-line no-console
      console.error('Falha ao abrir SSE:', err);
      setStreamStatus('error');
      return undefined;
    }

    esRef.current = es;

    es.onopen = () => {
      if (!closed) setStreamStatus('open');
    };

    es.onerror = () => {
      // O EventSource tenta reconectar sozinho; refletimos isso na UI.
      if (!closed) setStreamStatus('error');
    };

    // O backend emite eventos NOMEADOS, nao o evento padrao "message".
    // 'snapshot': payload agregado { generatedAt, overview, pods, events }.
    const onSnapshot = (evt) => {
      if (closed) return;
      try {
        const parsed = JSON.parse(evt.data);
        setStreamData(parsed);
        setLastUpdate(new Date());
        setStreamStatus('open');
      } catch (parseErr) {
        // eslint-disable-next-line no-console
        console.warn('Frame SSE "snapshot" ignorado (nao-JSON):', parseErr);
      }
    };

    // 'error' (evento de aplicacao enviado pelo backend ao falhar um snapshot).
    // Distinto do es.onerror (erro de transporte). Mantemos o ultimo snapshot
    // bom na tela e apenas sinalizamos o estado.
    const onAppError = (evt) => {
      if (closed) return;
      // eslint-disable-next-line no-console
      console.warn('Evento SSE de erro do backend:', evt && evt.data);
      setStreamStatus('error');
    };

    es.addEventListener('snapshot', onSnapshot);
    es.addEventListener('error', onAppError);

    return () => {
      closed = true;
      es.removeEventListener('snapshot', onSnapshot);
      es.removeEventListener('error', onAppError);
      try {
        es.close();
      } catch {
        /* noop */
      }
      esRef.current = null;
    };
  }, []);

  const streamBadge = STREAM_LABEL[streamStatus] || STREAM_LABEL.connecting;

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header__brand">
          <span className="app-header__logo" aria-hidden="true">
            ◆
          </span>
          <h1 className="app-header__title">DevOps Console</h1>
          <span
            className={streamBadge.cls}
            title="Estado da conexao em tempo real (SSE)"
          >
            {streamBadge.text}
          </span>
          {lastUpdate && (
            <span className="app-header__updated">
              atualizado {lastUpdate.toLocaleTimeString('pt-BR')}
            </span>
          )}
        </div>

        <nav className="app-header__links" aria-label="Atalhos externos">
          {QUICK_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="quick-link"
              target="_blank"
              rel="noopener noreferrer"
            >
              {link.label} ↗
            </a>
          ))}
        </nav>
      </header>

      <nav className="tabs" role="tablist" aria-label="Secoes do console">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            className={`tab ${activeTab === tab.key ? 'tab--active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="content" role="tabpanel">
        {activeTab === 'overview' && (
          <Overview streamData={streamData} streamStatus={streamStatus} />
        )}
        {activeTab === 'apps' && <Apps />}
        {activeTab === 'publications' && <Publications />}
        {activeTab === 'health' && (
          <Health streamData={streamData} streamStatus={streamStatus} />
        )}
        {activeTab === 'logs' && <Logs />}
        {activeTab === 'projects' && <MetaProjects />}
      </main>

      <footer className="app-footer">
        <span>
          Observacao do cluster <code>docker-desktop</code> em somente leitura. A gestao de
          projetos (Projetos &amp; Tarefas) usa um modulo dedicado (pm-api) com seu proprio banco.
        </span>
      </footer>
    </div>
  );
}
