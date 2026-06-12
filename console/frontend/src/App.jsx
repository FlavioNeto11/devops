import React, { useEffect, useMemo, useRef, useState } from 'react';
import { openStream, pmMe } from './api.js';
import Overview from './components/Overview.jsx';
import Apps from './components/Apps.jsx';
import Publications from './components/Publications.jsx';
import Health from './components/Health.jsx';
import Logs from './components/Logs.jsx';
import MetaProjects from './components/MetaProjects.jsx';
import ContentEditor from './components/ContentEditor.jsx';
import UserHome from './components/UserHome.jsx';
import { isPortal } from './lib/appTypes.js';
import AccessAdmin from './components/AccessAdmin.jsx';
import SharedResources from './components/SharedResources.jsx';
import Sidebar from './components/Sidebar.jsx';
import TopBar from './components/TopBar.jsx';
import Modal from './components/Modal.jsx';
import { ToastProvider } from './components/ToastProvider.jsx';

/**
 * Metadados de cada seção: rótulo (pt-BR), ícone, descrição (subtítulo na TopBar) e grupo
 * de navegação. A ordem aqui define a ordem na sidebar.
 */
const SECTIONS = {
  painel: { label: 'Meu painel', icon: 'home', group: 'Gestão', description: 'Seus portais e sistemas, separados por tipo de acesso.' },
  overview: { label: 'Overview', icon: 'grid', group: 'Cluster', description: 'Panorama do cluster em tempo real.' },
  apps: { label: 'Apps', icon: 'layers', group: 'Cluster', description: 'Aplicações agrupadas por label, com URLs e saúde.' },
  health: { label: 'Health', icon: 'activity', group: 'Cluster', description: 'Saúde de pods e deployments.' },
  logs: { label: 'Logs', icon: 'terminal', group: 'Cluster', description: 'Logs dos pods, em tempo quase real.' },
  publications: { label: 'Publicações', icon: 'rocket', group: 'Cluster', description: 'Histórico de deploys da esteira.' },
  projects: { label: 'Projetos & Tarefas', icon: 'kanban', group: 'Gestão', description: 'Board de projetos, itens e tarefas.' },
  conteudo: { label: 'Conteúdo', icon: 'file-text', group: 'Gestão', description: 'Editor de conteúdo dos portais (CMS).' },
  access: { label: 'Usuários', icon: 'users', group: 'Gestão', description: 'Usuários restritos e acesso por projeto.' },
  shared: { label: 'Compartilhados', icon: 'package', group: 'Gestão', description: 'Recursos compartilhados entre projetos e suas versões (drift).' },
};
const SECTION_ORDER = ['painel', 'overview', 'apps', 'health', 'logs', 'publications', 'projects', 'conteudo', 'access', 'shared'];

// Traefik fica de fora: o dashboard NÃO tem rota neste host (só existe em
// http://traefik.localhost/dashboard/, interno) — a entrada vira um modal
// informativo em vez de um link quebrado que caía na homepage.
const QUICK_LINKS = [
  { href: '/argocd', label: 'Argo CD' },
  { href: '/grafana', label: 'Grafana' },
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

  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => { try { return localStorage.getItem('console-sidebar') === 'collapsed'; } catch { return false; } },
  );
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [streamStatus, setStreamStatus] = useState('connecting');
  const [streamData, setStreamData] = useState(null);
  const esRef = useRef(null);

  // Tema (valor inicial vem do index.html, anti-flash).
  const [theme, setTheme] = useState(
    () => (typeof document !== 'undefined' && document.documentElement.dataset.theme) || 'light',
  );
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    if (typeof document !== 'undefined') document.documentElement.dataset.theme = next;
    try { localStorage.setItem('console-theme', next); } catch { /* ignore */ }
    setTheme(next);
  };

  const toggleCollapse = () => {
    setSidebarCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem('console-sidebar', next ? 'collapsed' : 'expanded'); } catch { /* ignore */ }
      return next;
    });
  };

  // Identidade + papel. Falha → "sem me" (degrada para admin, já que a borda só deixa admin por padrão).
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
  const canManageProjects = !isMember;

  // Acessos do member por TIPO de projeto: quem só gerencia portal não vê o board
  // de Projetos & Tarefas; quem só tem produto não vê o CMS; com ambos, vê os dois.
  const memberHasPortal = isMember && (me?.projects || []).some((p) => isPortal(p));
  const memberHasProduct = isMember && (me?.projects || []).some((p) => !isPortal(p));
  const memberSections = useMemo(() => {
    const s = ['painel'];
    if (memberHasProduct) s.push('projects');
    if (memberHasPortal) s.push('conteudo');
    return s;
  }, [memberHasPortal, memberHasProduct]);

  // Projeto em foco (navegação a partir do painel: "Editar conteúdo"/"Abrir board").
  const [focusProject, setFocusProject] = useState(null);
  // Modal informativo do Traefik (dashboard interno, sem rota pública).
  const [traefikInfo, setTraefikInfo] = useState(false);
  const goTo = (tab, projectId = null) => { setFocusProject(projectId); setActiveTab(tab); setMobileNavOpen(false); };

  // Mantém a aba ativa válida para o papel.
  useEffect(() => {
    if (!meLoaded) return;
    if (isMember) setActiveTab((cur) => (memberSections.includes(cur) ? cur : 'painel'));
    else if (activeTab === 'access' && !isAdmin) setActiveTab('overview');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meLoaded, isMember, isAdmin]);

  // Título da aba do navegador acompanha a seção (várias abas abertas ficam distinguíveis).
  useEffect(() => {
    document.title = `${SECTIONS[activeTab]?.label || 'DevOps Console'} · DevOps Console`;
  }, [activeTab]);

  // SSE (dados do cluster) só para admin.
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
      try { setStreamData(JSON.parse(evt.data)); setStreamStatus('open'); }
      catch (e) { /* frame não-JSON ignorado */ }
    };
    const onAppError = () => { if (!closed) setStreamStatus('error'); };
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

  // Grupos da sidebar (filtrados por papel, na ordem de SECTION_ORDER).
  // Member vê o painel + apenas as áreas do(s) tipo(s) de acesso que possui.
  const sidebarGroups = useMemo(() => {
    const visible = isMember ? memberSections : SECTION_ORDER.filter((k) => k !== 'painel');
    const byGroup = new Map();
    for (const key of SECTION_ORDER) {
      if (!visible.includes(key)) continue;
      const s = SECTIONS[key];
      if (!byGroup.has(s.group)) byGroup.set(s.group, []);
      byGroup.get(s.group).push({ key, label: s.label, icon: s.icon });
    }
    return [...byGroup.entries()].map(([label, items]) => ({ label, items }));
  }, [isMember, memberSections]);

  if (!meLoaded) {
    return (
      <div className="shell-loading">
        <span className="skel" style={{ width: 180, height: 16, borderRadius: 6 }} />
      </div>
    );
  }

  const streamBadge = STREAM_LABEL[streamStatus] || STREAM_LABEL.connecting;
  const selectSection = (key) => { setActiveTab(key); setMobileNavOpen(false); };
  const platformLinks = isMember ? [] : [
    ...QUICK_LINKS,
    { label: 'Traefik', icon: 'info', title: 'Dashboard interno — como acessar', onClick: () => setTraefikInfo(true) },
  ];

  return (
    <ToastProvider>
      <div className={'shell' + (sidebarCollapsed ? ' shell--collapsed' : '') + (mobileNavOpen ? ' shell--navopen' : '')}>
        <Sidebar
          groups={sidebarGroups}
          links={platformLinks}
          activeKey={activeTab}
          onSelect={selectSection}
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleCollapse}
        />
        <div className="sidebar__backdrop" onClick={() => setMobileNavOpen(false)} aria-hidden="true" />

        <div className="shell__main">
          <TopBar
            section={SECTIONS[activeTab]}
            onMenu={() => setMobileNavOpen((o) => !o)}
            theme={theme}
            onToggleTheme={toggleTheme}
            me={me}
            live={!isMember ? streamBadge : null}
          />

          <main className="content" role="main">
            {isMember && activeTab === 'painel' && <UserHome me={me} onGo={goTo} />}
            {!isMember && activeTab === 'overview' && <Overview streamData={streamData} streamStatus={streamStatus} />}
            {!isMember && activeTab === 'apps' && <Apps />}
            {!isMember && activeTab === 'publications' && <Publications />}
            {!isMember && activeTab === 'health' && <Health streamData={streamData} streamStatus={streamStatus} />}
            {!isMember && activeTab === 'logs' && <Logs />}
            {activeTab === 'projects' && <MetaProjects canManageProjects={canManageProjects} initialId={focusProject} />}
            {activeTab === 'conteudo' && <ContentEditor initialId={focusProject} me={me} />}
            {activeTab === 'access' && isAdmin && <AccessAdmin />}
            {activeTab === 'shared' && isAdmin && <SharedResources />}
          </main>

          {traefikInfo && (
            <Modal title="Dashboard do Traefik (interno)" size="sm" onClose={() => setTraefikInfo(false)}
              footer={<button className="btn" onClick={() => setTraefikInfo(false)}>Fechar</button>}>
              <p style={{ marginTop: 0 }}>
                O dashboard do Traefik é <strong>interno</strong> e não tem rota pública neste domínio
                (expor o painel do ingress na internet seria inseguro).
              </p>
              <p>
                <strong>No host da plataforma</strong> (entrada <code>traefik.localhost</code> já configurada no hosts):
              </p>
              <p>
                <a className="quick-link" href="http://traefik.localhost/dashboard/" target="_blank" rel="noopener noreferrer">
                  http://traefik.localhost/dashboard/ ↗
                </a>
              </p>
              <p className="muted" style={{ fontSize: '.85rem' }}>
                De outra máquina: acesse via o host da plataforma (o dashboard só casa o Host
                <code> traefik.localhost</code> — ver <code>platform/traefik/dashboard-ingressroute.yaml</code> e
                <code> docs/local-domain-setup.md</code>).
              </p>
            </Modal>
          )}

          <footer className="app-footer">
            <span>
              {isMember
                ? 'Você tem acesso aos projetos atribuídos. Fale com um administrador para mais acessos.'
                : 'Observação do cluster docker-desktop em somente leitura. Projetos & Tarefas usa um módulo dedicado (pm-api) com banco próprio.'}
            </span>
          </footer>
        </div>
      </div>
    </ToastProvider>
  );
}
