import React from 'react';
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
import GestaoTitulos from './pages/GestaoTitulos.jsx';
import GestaoTituloDetail from './pages/GestaoTituloDetail.jsx';
import Entrar, { EntrarCallback } from './pages/Entrar.jsx';

const ROLE_LABELS = { public: 'Público', investor: 'Investidor', lawyer: 'Advogado', judge: 'Juiz', manager: 'Gestor', admin: 'Administrador' };

// Guard de rota (UX apenas — a autoridade de acesso é a API, que responde 401/403).
// Sem sessão → /entrar?next=…; com sessão sem a permissão → tela "Acesso restrito".
function RequireRole({ perm, children }) {
  const { loading, user, hasPerm } = useAuth();
  const location = useLocation();
  if (loading) return <Loading label="Verificando acesso…" />;
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/entrar?next=${next}`} replace />;
  }
  if (perm && !hasPerm(perm)) {
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
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) {
    return <NavLink to="/entrar"><Icon name="login" /> Entrar</NavLink>;
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
      </summary>
      <div className="um-pop">
        <div className="um-id">
          <strong>{displayName}</strong>
          {user.email && <span className="um-mail">{user.email}</span>}
        </div>
        {Array.isArray(user.roles) && user.roles.length > 0 && (
          <div className="um-roles">
            {user.roles.map((r) => <span key={r} className="pill">{ROLE_LABELS[r] || r}</span>)}
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
  const canSeeCases = hasPerm('cases:read');
  const canManageTitles = hasPerm('titles:read');
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <Link to="/">
              <span className="brand-mark"><BrandMark /></span>
              <span className="brand-text">
                <b>Portal BESC</b>
                <small>Base de conhecimento e levantamento</small>
              </span>
            </Link>
          </div>
          <div className="spacer" />
          <nav>
            <NavLink to="/" end><Icon name="landmark" /> Início</NavLink>
            <NavLink to="/biblioteca"><Icon name="library" /> Biblioteca</NavLink>
            <NavLink to="/jurisprudencia"><Icon name="gavel" /> Jurisprudência</NavLink>
            {canSeeCases && <NavLink to="/casos"><Icon name="cases" /> Casos</NavLink>}
            {canManageTitles && <NavLink to="/gestao/titulos"><Icon name="coins" /> Gestão</NavLink>}
            <span className="nav-sep" aria-hidden="true" />
            <NavLink to="/glossario"><Icon name="glossary" /> Glossário</NavLink>
            <NavLink to="/referencia"><Icon name="scale" /> Referência</NavLink>
            <NavLink to="/ajuda"><Icon name="help" /> Ajuda</NavLink>
            <span className="nav-sep" aria-hidden="true" />
            <UserArea />
          </nav>
        </div>
      </header>
      <div className="legal-strip">
        Base de conhecimento e organização documental sobre as ações do antigo BESC — <strong>não</strong> executa tokenização nem presta aconselhamento jurídico.
      </div>
      <main className="container">
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
          <Route path="/entrar" element={<Entrar />} />
          <Route path="/entrar/callback" element={<EntrarCallback />} />
          <Route path="/casos" element={<RequireRole perm="cases:read"><Dashboard /></RequireRole>} />
          <Route path="/gestao/titulos" element={<RequireRole perm="titles:read"><GestaoTitulos /></RequireRole>} />
          <Route path="/gestao/titulos/:id" element={<RequireRole perm="titles:read"><GestaoTituloDetail /></RequireRole>} />
          <Route path="/ajuda" element={<Ajuda />} />
          <Route path="/cases/new" element={<RequireRole perm="cases:read"><CaseForm /></RequireRole>} />
          <Route path="/cases/:id" element={<RequireRole perm="cases:read"><CaseDetail /></RequireRole>} />
          <Route path="/cases/:id/edit" element={<RequireRole perm="cases:read"><CaseForm /></RequireRole>} />
          <Route path="*" element={<div className="empty"><h3>Página não encontrada</h3><Link to="/">Voltar ao início</Link></div>} />
        </Routes>
      </main>
      <footer className="app-footer">
        <div className="foot-inner">
          <span><strong>Portal BESC</strong> — base de conhecimento, jurisprudência, levantamento documental e futura tokenização.</span>
          <span className="spacer" />
          <Link to="/biblioteca">Biblioteca</Link>
          <Link to="/jurisprudencia">Jurisprudência</Link>
          <Link to="/glossario">Glossário</Link>
          <span className="muted">Não é aconselhamento jurídico · conteúdo público sem login</span>
        </div>
      </footer>
    </>
  );
}
