import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { fetchOverview, openStream, pmMe, pmProjects } from './api.js';
import Overview from './components/Overview.jsx';
import Apps from './components/Apps.jsx';
import Publications from './components/Publications.jsx';
import Health from './components/Health.jsx';
import Logs from './components/Logs.jsx';
import MetaProjects from './components/MetaProjects.jsx';
import UserHome from './components/UserHome.jsx';

// Code-split: o editor de conteudo carrega Tiptap + editor visual + AutoForm —
// o pedaco mais pesado do bundle. Lazy tira tudo isso do chunk principal; quem
// nunca abre a aba Conteudo nao baixa nada disso.
const ContentEditor = lazy(() => import('./components/ContentEditor.jsx'));
import { isPortal } from './lib/appTypes.js';
import { isEmbedMode } from './lib/embed.js';
import EmbedSurface from './components/EmbedSurface.jsx';
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

// (E4, Forja 4.1) FLAG DE BOOTSTRAP: com ?embed=1 na URL o Console renderiza SÓ a
// superfície de conteúdo (EmbedSurface, sem casca/sidebar/topbar/platform-shell) —
// é o editor do CMS embutido no trilho t1 do Product Studio via iframe same-origin.
// Decidido uma única vez por carga (o search não muda sem reload), fora do corpo
// com hooks — a casca completa continua sendo o default inalterado.
const EMBED = isEmbedMode(window.location.search);

export default function App() {
  return EMBED ? <EmbedSurface /> : <ConsoleShell />;
}

function ConsoleShell() {
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

  // Tema vive na casca global (<platform-shell>, chave nvit-theme) — sem toggle próprio aqui.

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
  // Navegação interna SINCRONIZA a URL (recarregar/compartilhar preserva a seção).
  // A troca de seção iniciada pelo usuário empilha (pushState) uma entrada no
  // histórico — assim o botão Voltar do navegador retorna à seção anterior DENTRO
  // do Console, em vez de abandoná-lo. Voltar/Avançar mudam o hash e disparam
  // `hashchange` → o apply() abaixo reprocessa e ajusta a aba (sem re-gravar o
  // hash, então não há loop). Nem push nem replaceState disparam hashchange, logo
  // a gravação em si nunca re-executa o apply().
  const syncHash = (key, { push = false } = {}) => {
    try {
      const target = `#${key}`;
      if (push && window.location.hash !== target) window.history.pushState(null, '', target);
      else window.history.replaceState(null, '', target);
    } catch { /* noop (ambientes sem history) */ }
  };
  const goTo = (tab, projectId = null) => { setFocusProject(projectId); setActiveTab(tab); setMobileNavOpen(false); syncHash(tab, { push: true }); };

  // (A4, Forja 4.0) deep-link por hash: outros apps apontam para uma seção (#conteudo?novo=1 abre
  // o assistente de portal — a criação começa na Forja/Studio). Só LEITURA do hash na entrada e em
  // hashchange; a navegação interna segue por estado (sem virar router).
  // (E1, Forja 4.1) o CONTEXTO DE PRODUTO viaja por URL: `app=` pré-popula o filtro de
  // Logs/Publicações; `projeto=` (key do projeto) resolve para o id do CMS — fail-soft:
  // key desconhecida ou pm-api fora = seção abre sem foco, nada quebra.
  const [cmsAutoNew, setCmsAutoNew] = useState(false);
  const [deepApp, setDeepApp] = useState(null);
  useEffect(() => {
    let alive = true;
    const apply = () => {
      const m = String(window.location.hash || '').replace(/^#\/?/, '').match(/^([a-z]+)(?:\?(.*))?$/);
      if (!m || !SECTIONS[m[1]]) return;
      setActiveTab(m[1]);
      const params = new URLSearchParams(m[2] || '');
      if (m[1] === 'conteudo' && params.get('novo') === '1') setCmsAutoNew(true);
      if ((m[1] === 'logs' || m[1] === 'publications') && params.get('app')) setDeepApp(params.get('app'));
      const projeto = m[1] === 'conteudo' ? params.get('projeto') : null;
      if (projeto) {
        pmProjects()
          .then((list) => {
            const p = (Array.isArray(list) ? list : []).find((x) => x.key === projeto || String(x.id) === projeto);
            if (alive && p) setFocusProject(p.id);
          })
          .catch(() => { /* fail-soft: sem pm-api, o Conteúdo abre no primeiro portal */ });
      }
    };
    apply();
    window.addEventListener('hashchange', apply);
    return () => { alive = false; window.removeEventListener('hashchange', apply); };
  }, []);

  // Mantém a aba ativa válida para o papel. Depende de activeTab para reavaliar
  // também quando um deep-link por hash (colado por um admin) leva o member a uma
  // seção de Cluster após a carga — em vez de renderizar main vazio, cai no painel.
  useEffect(() => {
    if (!meLoaded) return;
    if (isMember) setActiveTab((cur) => (memberSections.includes(cur) ? cur : 'painel'));
    else if (activeTab === 'access' && !isAdmin) setActiveTab('overview');
  }, [meLoaded, isMember, isAdmin, activeTab, memberSections]);

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
    // Sessão expirada durante o SSE não é detectável pelo EventSource (ele não expõe o
    // status HTTP do reconnect — só onerror) e viraria "reconectando…" eterno. Após 2
    // falhas seguidas, um GET JSON descartável sonda a borda: o getJSON de api.js
    // converte 401 em handleAuthExpired() (reload → login). Rede/backend fora do ar
    // cai no catch e o EventSource segue reconectando normalmente.
    let streamErrCount = 0;
    let lastAuthProbe = 0;
    es.onopen = () => { if (!closed) { streamErrCount = 0; setStreamStatus('open'); } };
    es.onerror = () => {
      if (closed) return;
      setStreamStatus('error');
      streamErrCount += 1;
      if (streamErrCount >= 2 && Date.now() - lastAuthProbe > 15000) {
        lastAuthProbe = Date.now();
        fetchOverview().catch(() => { /* 401 já redirecionou; outras falhas: seguir reconectando */ });
      }
    };
    const onSnapshot = (evt) => {
      if (closed) return;
      streamErrCount = 0;
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
  // Navegação interna limpa o contexto de app do deep-link (ele vale para a seção onde
  // se chegou) — e escreve o hash SEM query, coerente com o contexto limpo.
  const selectSection = (key) => { setActiveTab(key); setDeepApp(null); setMobileNavOpen(false); syncHash(key, { push: true }); };
  const platformLinks = isMember ? [] : [
    ...QUICK_LINKS,
    { label: 'Traefik', icon: 'info', title: 'Dashboard interno — como acessar', onClick: () => setTraefikInfo(true) },
  ];

  return (
    <ToastProvider>
      {/* App-bar global da plataforma (Web Component). Fica no TOPO da árvore, acima
          do shell/sidebar próprios do Console. React 18 passa surface/me-url como
          strings ao custom element. */}
      <platform-shell
        surface="devops"
        me-url="/devops/api/pm/me"
        me-url-fallback="/devops/api/me"
      ></platform-shell>
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
            navOpen={mobileNavOpen}
            live={!isMember ? streamBadge : null}
          />

          <main className="content" role="main">
            {isMember && activeTab === 'painel' && <UserHome me={me} onGo={goTo} />}
            {!isMember && activeTab === 'overview' && <Overview streamData={streamData} streamStatus={streamStatus} />}
            {!isMember && activeTab === 'apps' && <Apps />}
            {!isMember && activeTab === 'publications' && <Publications initialApp={deepApp} />}
            {!isMember && activeTab === 'health' && <Health streamData={streamData} streamStatus={streamStatus} />}
            {!isMember && activeTab === 'logs' && <Logs initialApp={deepApp} />}
            {activeTab === 'projects' && <MetaProjects canManageProjects={canManageProjects} initialId={focusProject} />}
            {activeTab === 'conteudo' && (
              <Suspense fallback={<div className="muted" style={{ padding: 24 }}>Carregando editor…</div>}>
                <ContentEditor initialId={focusProject} me={me} autoNew={cmsAutoNew} />
              </Suspense>
            )}
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
