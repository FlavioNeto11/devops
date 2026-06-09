import React, { useEffect, useMemo, useRef, useState } from 'react';
import { openStream, pmMe } from './api.js';
import Overview from './components/Overview.jsx';
import Apps from './components/Apps.jsx';
import Publications from './components/Publications.jsx';
import Health from './components/Health.jsx';
import Logs from './components/Logs.jsx';
import MetaProjects from './components/MetaProjects.jsx';
import AccessAdmin from './components/AccessAdmin.jsx';

/**
 * Abas do console. Admin (platform-admins) vê todas + "Usuários". Usuário restrito
 * (project-members) vê SOMENTE "Projetos & Tarefas". O papel vem de /me (pm-api),
 * que lê os grupos repassados pela borda (oauth2-proxy/Keycloak).
 */
const ADMIN_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'apps', label: 'Apps' },
  { key: 'publications', label: 'Publicacoes' },
  { key: 'health', label: 'Health' },
  { key: 'logs', label: 'Logs' },
  { key: 'projects', label: 'Projetos & Tarefas' },
  { key: 'access', label: 'Usuários' },
];
const MEMBER_TABS = [{ key: 'projects', label: 'Projetos & Tarefas' }];

const QUICK_LINKS = [
  { href: '/argocd', label: 'Argo CD' },
  { href: '/grafana', label: 'Grafana' },
  { href: '/dashboard/', label: 'Traefik' },
];

const STREAM_LABEL = {
  connecting: { text: 'conectando…', cls: 'badge badge-warn' },
  open: { text: 'ao vivo', cls: 'badge badge-ok' },
  error: { text: 'reconectando…', cls: 'badge badge-err' },
};

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [me, setMe] = useState(null);
  const [meLoaded, setMeLoaded] = useState(false);

  const [streamStatus, setStreamStatus] = useState('connecting');
  const [streamData, setStreamData] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const esRef = useRef(null);

  // Identidade + papel. Em caso de falha (ex.: pm-api fora), degrada para "sem me"
  // (comportamento atual de admin, já que a borda só deixa admin entrar por padrão).
  useEffect(() => {
    let alive = true;
    pmMe()
      .then((data) => { if (alive) setMe(data); })
      .catch(() => { if (alive) setMe(null); })
      .finally(() => { if (alive) setMeLoaded(true); });
    return () => { alive = false; };
  }, []);

  const isAdmin = !!me?.isAdmin;
  const isMember = !!me?.isMember && !isAdmin;
  const canManageProjects = !isMember; // admin e dev/desconhecido gerenciam; member não
  const tabs = useMemo(() => (isMember ? MEMBER_TABS : ADMIN_TABS), [isMember]);

  // Mantém a aba ativa válida para o papel (member → sempre "projects").
  useEffect(() => {
    if (!meLoaded) return;
    if (isMember) setActiveTab('projects');
    else if (activeTab === 'access' && !isAdmin) setActiveTab('overview');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meLoaded, isMember, isAdmin]);

  // SSE (dados do cluster) só para admin — o member não vê Overview/Health.
  useEffect(() => {
    if (!meLoaded || isMember) return undefined;
    let closed = false;
    let es;
    try {
      es = openStream();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Falha ao abrir SSE:', err);
      setStreamStatus('error');
      return undefined;
    }
    esRef.current = es;
    es.onopen = () => { if (!closed) setStreamStatus('open'); };
    es.onerror = () => { if (!closed) setStreamStatus('error'); };
    const onSnapshot = (evt) => {
      if (closed) return;
      try {
        setStreamData(JSON.parse(evt.data));
        setLastUpdate(new Date());
        setStreamStatus('open');
      } catch (parseErr) {
        // eslint-disable-next-line no-console
        console.warn('Frame SSE "snapshot" ignorado (nao-JSON):', parseErr);
      }
    };
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
      try { es.close(); } catch { /* noop */ }
      esRef.current = null;
    };
  }, [meLoaded, isMember]);

  const streamBadge = STREAM_LABEL[streamStatus] || STREAM_LABEL.connecting;

  if (!meLoaded) {
    return (
      <div className="app">
        <p className="state state--loading" style={{ margin: 24 }}>Carregando…</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header__brand">
          <span className="app-header__logo" aria-hidden="true">◆</span>
          <h1 className="app-header__title">DevOps Console</h1>
          {!isMember && (
            <span className={streamBadge.cls} title="Estado da conexao em tempo real (SSE)">
              {streamBadge.text}
            </span>
          )}
          {!isMember && lastUpdate && (
            <span className="app-header__updated">atualizado {lastUpdate.toLocaleTimeString('pt-BR')}</span>
          )}
          {isMember && <span className="badge badge-accent">Projetos &amp; Tarefas</span>}
        </div>

        <nav className="app-header__links" aria-label="Atalhos">
          {!isMember && QUICK_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="quick-link" target="_blank" rel="noopener noreferrer">
              {link.label} ↗
            </a>
          ))}
          {me?.email && <span className="app-header__updated" title="usuário autenticado">{me.email}</span>}
          <a href="/oauth2/sign_out" className="quick-link" title="Encerrar sessão">sair ↗</a>
        </nav>
      </header>

      {tabs.length > 1 && (
        <nav className="tabs" role="tablist" aria-label="Secoes do console">
          {tabs.map((tab) => (
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
      )}

      <main className="content" role="tabpanel">
        {!isMember && activeTab === 'overview' && (
          <Overview streamData={streamData} streamStatus={streamStatus} />
        )}
        {!isMember && activeTab === 'apps' && <Apps />}
        {!isMember && activeTab === 'publications' && <Publications />}
        {!isMember && activeTab === 'health' && (
          <Health streamData={streamData} streamStatus={streamStatus} />
        )}
        {!isMember && activeTab === 'logs' && <Logs />}
        {activeTab === 'projects' && <MetaProjects canManageProjects={canManageProjects} />}
        {activeTab === 'access' && isAdmin && <AccessAdmin />}
      </main>

      <footer className="app-footer">
        <span>
          {isMember
            ? 'Você tem acesso aos projetos atribuídos. Fale com um administrador para mais acessos.'
            : 'Observacao do cluster docker-desktop em somente leitura. Projetos & Tarefas usa um modulo dedicado (pm-api) com seu proprio banco.'}
        </span>
      </footer>
    </div>
  );
}
