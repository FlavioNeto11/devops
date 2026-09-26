import React, { useEffect, useRef, useState } from 'react';
import { Routes, Route, Link, NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useMeta, Loading } from './ui.jsx';
import { Icon, BrandMark } from './icons.jsx';
import { useAuth } from './auth.jsx';
import PortalHome from './pages/PortalHome.jsx';
import Dashboard from './pages/Dashboard.jsx';
import CaseForm from './pages/CaseForm.jsx';
import CaseDetail from './pages/CaseDetail.jsx';
import Ajuda from './pages/Ajuda.jsx';
import BibliotecaList from './pages/BibliotecaList.jsx';
import BibliotecaDetail from './pages/BibliotecaDetail.jsx';
import JurisprudenciaList from './pages/JurisprudenciaList.jsx';
import JurisprudenciaDetail from './pages/JurisprudenciaDetail.jsx';
import Glossario from './pages/Glossario.jsx';
import Roadmap from './pages/Roadmap.jsx';
import Referencia from './pages/Referencia.jsx';
import GestaoUsuarios from './pages/GestaoUsuarios.jsx';
import GestaoPapeis from './pages/GestaoPapeis.jsx';
import RecuperacaoList from './pages/RecuperacaoList.jsx';
import RecuperacaoNova from './pages/RecuperacaoNova.jsx';
import RecuperacaoDetail from './pages/RecuperacaoDetail.jsx';
import Desativado from './pages/Desativado.jsx';
// ADR-010: as telas da tese de marketplace/tokenização (Marketplace, TituloDossie,
// InvestidorCarteira, GestaoTitulos, GestaoTituloDetail, GestaoFinanceiro, GestaoAlugueis,
// GateRegulatorio, Auditoria, AuditoriaTitulo) continuam no repositório, marcadas DEPRECATED,
// mas não são mais roteadas. Os caminhos antigos levam a /desativado.
const FROZEN_PATHS = ['/marketplace', '/marketplace/*', '/investidor/*', '/gestao/titulos', '/gestao/titulos/*', '/gestao/financeiro', '/gestao/alugueis', '/gestao/gate', '/auditoria', '/auditoria/*'];
import Entrar, { EntrarCallback, Cadastro, AceitarConvite } from './pages/Entrar.jsx';

const ROLE_LABELS = { public: 'Público', investor: 'Investidor (desativado)', lawyer: 'Advogado', judge: 'Juiz', manager: 'Gestor', admin: 'Administrador' };

// Título do documento por rota (prefix-match; específicos primeiro). Sufixo "· BESC".
const ROUTE_TITLES = [
  ['/biblioteca', 'Biblioteca institucional'],
  ['/jurisprudencia', 'Jurisprudência'],
  ['/glossario', 'Glossário'],
  ['/roadmap', 'Roadmap'],
  ['/referencia', 'Referência'],
  ['/recuperacao', 'Reivindicações'],
  ['/desativado', 'Funcionalidade desativada'],
  ['/entrar', 'Entrar'],
  ['/cadastro', 'Criar conta'],
  ['/convite', 'Aceitar convite'],
  ['/casos', 'Casos'],
  ['/cases', 'Casos'],
  ['/gestao/usuarios', 'Gestão de usuários'],
  ['/gestao/papeis', 'Gestão de papéis'],
  ['/gestao', 'Gestão'],
  ['/ajuda', 'Ajuda'],
];

function useDocumentTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    const hit = ROUTE_TITLES.find(([p]) => pathname === p || pathname.startsWith(`${p}/`));
    document.title = hit ? `${hit[1]} · Ativos Legados` : 'Plataforma de Pesquisa e Recuperação de Ativos Legados';
  }, [pathname]);
}

// Reset de scroll ao trocar de página (SPA não faz sozinha). scrollTo(0,0) direto,
// sem smooth — comportamento idêntico com prefers-reduced-motion.
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

// Comportamento padrão dos menus <details> da topbar (Gestão/Recursos/usuário):
// fecham ao navegar, ao clicar/tocar fora e com Escape (devolvendo o foco ao summary).
function useMenuAutoClose(containerRef) {
  const location = useLocation();
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    root.querySelectorAll('details[open]').forEach((d) => { d.open = false; });
  }, [location, containerRef]);
  useEffect(() => {
    const onPointerDown = (e) => {
      const root = containerRef.current;
      if (!root) return;
      root.querySelectorAll('details[open]').forEach((d) => {
        if (!d.contains(e.target)) d.open = false;
      });
    };
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return;
      const root = containerRef.current;
      if (!root) return;
      const open = Array.from(root.querySelectorAll('details[open]'));
      if (!open.length) return;
      open.forEach((d) => { d.open = false; });
      const summary = open[open.length - 1].querySelector('summary');
      if (summary) summary.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [containerRef]);
}

// Skip-link: leva o foco direto ao <main id="conteudo"> (tabIndex -1).
function skipToContent(e) {
  e.preventDefault();
  const el = document.getElementById('conteudo');
  if (el) el.focus();
}

// Conta criada mas ainda sem papel/permissão: estado próprio, com o fluxo real
// (o gestor concede o perfil e isso libera o acesso) + re-checagem sem F5.
function PendingGate() {
  const { refreshMe } = useAuth();
  const [busy, setBusy] = useState(false);
  const check = async () => {
    setBusy(true);
    try { await refreshMe(); } finally { setBusy(false); }
  };
  return (
    <div className="empty">
      <h3><Icon name="clock" size={16} /> Conta aguardando liberação</h3>
      <p>
        Sua conta foi criada e está aguardando o gestor da plataforma conceder o perfil adequado —
        assim que ele conceder, o acesso é liberado automaticamente. Enquanto isso, o conteúdo
        público (biblioteca, jurisprudência, glossário e referência) continua navegável.
      </p>
      <p className="row" style={{ justifyContent: 'center' }}>
        <button type="button" className="btn sm primary" onClick={check} disabled={busy}>
          {busy ? 'Verificando…' : 'Já liberou? Atualizar'}
        </button>
        <Link to="/" className="btn sm">Ir para o início</Link>
      </p>
    </div>
  );
}

// Guard de rota (UX apenas — a autoridade de acesso é a API, que responde 401/403).
// Sem sessão → /entrar?next=…; pendente → "aguardando liberação"; sem a permissão → "Acesso restrito".
function RequireRole({ perm, children }) {
  const { loading, user, hasPerm, isPending } = useAuth();
  const location = useLocation();
  if (loading) return <Loading label="Verificando acesso…" />;
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/entrar?next=${next}`} replace />;
  }
  if (perm && !hasPerm(perm)) {
    if (isPending) return <PendingGate />;
    return (
      <div className="empty">
        <h3><Icon name="lock" size={16} /> Acesso restrito</h3>
        <p>
          Sua conta não tem permissão para acessar esta área. Se você acredita que deveria ter
          acesso, fale com o gestor da plataforma.
        </p>
        <p><Link to="/" className="btn sm">Voltar ao início</Link></p>
      </div>
    );
  }
  return children;
}

// Área do usuário na topbar: menu (nome/e-mail/papéis + Sair) quando logado; "Entrar" quando não.
function UserArea() {
  const { user, logout, isPending, refreshMe } = useAuth();
  const navigate = useNavigate();
  if (!user) {
    return <NavLink to="/entrar" className="nav-entrar"><Icon name="login" size={14} /> Entrar</NavLink>;
  }
  const displayName = user.name || user.email || 'Usuário';
  const firstName = String(displayName).split(/\s+/)[0];
  const doLogout = async () => {
    await logout();
    navigate('/');
  };
  return (
    <details className="user-menu">
      <summary>
        <span className="um-avatar" aria-hidden="true"><Icon name="user" size={13} /></span>
        <span className="um-name">{firstName}</span>
        {isPending && <span className="um-dot" title="Conta aguardando liberação" aria-hidden="true" />}
      </summary>
      <div className="um-pop">
        <div className="um-id">
          <strong>{displayName}</strong>
          {user.email && <span className="um-mail">{user.email}</span>}
        </div>
        {Array.isArray(user.roles) && user.roles.length > 0 ? (
          <div className="um-roles">
            {user.roles.map((r) => <span key={r} className="pill">{ROLE_LABELS[r] || r}</span>)}
          </div>
        ) : (
          <div className="um-pending">
            <Icon name="clock" size={13} /> Conta aguardando o gestor liberar seu acesso.
            <button type="button" className="um-refresh" onClick={() => refreshMe()}>Já liberou? Atualizar</button>
          </div>
        )}
        <button type="button" className="btn sm" onClick={doLogout}>
          <Icon name="logout" size={14} /> Sair
        </button>
      </div>
    </details>
  );
}

export default function App() {
  const { error } = useMeta();
  const { hasPerm } = useAuth();
  const topnavRef = useRef(null);
  useMenuAutoClose(topnavRef);
  useDocumentTitle();
  const canSeeCases = hasPerm('cases:read');
  const canSeeRecovery = hasPerm('recovery:read');
  const canManageUsers = hasPerm('users:manage');
  const canManageRoles = hasPerm('rbac:manage');
  const canAdmin = canManageUsers || canManageRoles;
  // Fade de overflow da nav só quando HÁ itens fora da tela à direita — a mask estática
  // esmaecia o último item mesmo com a nav rolada até o fim (falsa indicação de "tem mais").
  useEffect(() => {
    const nav = topnavRef.current && topnavRef.current.querySelector('.nav-scroll');
    if (!nav) return undefined;
    const sync = () => {
      nav.classList.toggle('has-more', nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 1);
    };
    sync();
    nav.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    return () => {
      nav.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
    };
  }, [canSeeCases, canSeeRecovery]);
  return (
    <>
      <a className="skip-link" href="#conteudo" onClick={skipToContent}>Pular para o conteúdo</a>
      <ScrollToTop />
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <Link to="/">
              <span className="brand-mark"><BrandMark /></span>
              <span className="brand-text">
                <b>Ativos Legados</b>
                <small>Pesquisa e recuperação · origem BESC</small>
              </span>
            </Link>
          </div>
          <nav className="topnav" ref={topnavRef}>
            <div className="nav-scroll">
              <NavLink to="/" end><Icon name="landmark" /> Início</NavLink>
              {canSeeRecovery && <NavLink to="/recuperacao"><Icon name="folder" /> Reivindicações</NavLink>}
              {canSeeCases && <NavLink to="/casos"><Icon name="cases" /> Levantamento</NavLink>}
              <NavLink to="/biblioteca"><Icon name="library" /> Biblioteca</NavLink>
              <NavLink to="/jurisprudencia"><Icon name="gavel" /> Jurisprudência</NavLink>
            </div>
            {/* dropdowns FORA de .nav-scroll: o overflow do scroller clipava o popup
                (mesmo padrão do .user-menu — o .topnav não clipa). */}
            {canAdmin && (
              <details className="nav-dd">
                <summary aria-label="Gestão"><Icon name="shield" size={14} /> <span>Gestão</span></summary>
                <div className="nav-dd-pop">
                  {canManageUsers && <NavLink to="/gestao/usuarios" className="nav-dd-link"><Icon name="user" size={14} /> Usuários</NavLink>}
                  {canManageRoles && <NavLink to="/gestao/papeis" className="nav-dd-link"><Icon name="shield" size={14} /> Papéis</NavLink>}
                </div>
              </details>
            )}
            <details className="nav-dd">
              <summary aria-label="Recursos"><Icon name="layers" size={14} /> <span>Recursos</span></summary>
              <div className="nav-dd-pop">
                <NavLink to="/glossario" className="nav-dd-link"><Icon name="glossary" size={14} /> Glossário</NavLink>
                <NavLink to="/referencia" className="nav-dd-link"><Icon name="scale" size={14} /> Referência</NavLink>
                <NavLink to="/roadmap" className="nav-dd-link"><Icon name="roadmap" size={14} /> Roadmap</NavLink>
                <NavLink to="/ajuda" className="nav-dd-link"><Icon name="help" size={14} /> Ajuda</NavLink>
              </div>
            </details>
            <UserArea />
          </nav>
        </div>
      </header>
      <div className="legal-strip">
        Pesquisa e organização de evidências de direitos societários antigos. <strong>Não</strong> é oferta de investimento, <strong>não</strong> executa tokenização e <strong>não</strong> presta aconselhamento jurídico. Documento antigo não é ativo.
      </div>
      <main className="container" id="conteudo" tabIndex={-1}>
        {error && <div className="banner err">Falha ao carregar metadados da API: {error}</div>}
        <Routes>
          <Route path="/" element={<PortalHome />} />
          <Route path="/biblioteca" element={<BibliotecaList />} />
          <Route path="/biblioteca/:id" element={<BibliotecaDetail />} />
          <Route path="/jurisprudencia" element={<JurisprudenciaList />} />
          <Route path="/jurisprudencia/:id" element={<JurisprudenciaDetail />} />
          <Route path="/glossario" element={<Glossario />} />
          <Route path="/roadmap" element={<Roadmap />} />
          <Route path="/referencia" element={<Referencia />} />
          <Route path="/recuperacao" element={<RequireRole perm="recovery:read"><RecuperacaoList /></RequireRole>} />
          <Route path="/recuperacao/nova" element={<RequireRole perm="recovery:write"><RecuperacaoNova /></RequireRole>} />
          <Route path="/recuperacao/:id" element={<RequireRole perm="recovery:read"><RecuperacaoDetail /></RequireRole>} />
          <Route path="/desativado" element={<Desativado />} />
          {FROZEN_PATHS.map((p) => <Route key={p} path={p} element={<Navigate to="/desativado" replace />} />)}
          <Route path="/entrar" element={<Entrar />} />
          <Route path="/entrar/callback" element={<EntrarCallback />} />
          <Route path="/cadastro" element={<Cadastro />} />
          <Route path="/convite/:token" element={<AceitarConvite />} />
          <Route path="/casos" element={<RequireRole perm="cases:read"><Dashboard /></RequireRole>} />
          <Route path="/gestao/usuarios" element={<RequireRole perm="users:manage"><GestaoUsuarios /></RequireRole>} />
          <Route path="/gestao/papeis" element={<RequireRole perm="rbac:manage"><GestaoPapeis /></RequireRole>} />
          <Route path="/ajuda" element={<Ajuda />} />
          <Route path="/cases/new" element={<RequireRole perm="cases:read"><CaseForm /></RequireRole>} />
          <Route path="/cases/:id" element={<RequireRole perm="cases:read"><CaseDetail /></RequireRole>} />
          <Route path="/cases/:id/edit" element={<RequireRole perm="cases:read"><CaseForm /></RequireRole>} />
          <Route path="*" element={<div className="empty"><h3>Página não encontrada</h3><Link to="/">Voltar ao início</Link></div>} />
        </Routes>
      </main>
      <footer className="app-footer">
        <div className="foot-inner">
          <span><strong>Plataforma de Pesquisa e Recuperação de Ativos Legados</strong> — evidência, reivindicação e o caminho até a confirmação na fonte oficial.</span>
          <span className="spacer" />
          <Link to="/biblioteca">Biblioteca</Link>
          <Link to="/jurisprudencia">Jurisprudência</Link>
          <Link to="/glossario">Glossário</Link>
          <span className="muted">Não é oferta nem aconselhamento jurídico · ADR-010</span>
        </div>
      </footer>
    </>
  );
}
