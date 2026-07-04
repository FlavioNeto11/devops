import React from 'react';
import { Routes, Route, Link, NavLink } from 'react-router-dom';
import { useMeta } from './ui.jsx';
import { Icon, BrandMark } from './icons.jsx';
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

export default function App() {
  const { error } = useMeta();
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
            <NavLink to="/casos"><Icon name="cases" /> Casos</NavLink>
            <span className="nav-sep" aria-hidden="true" />
            <NavLink to="/glossario"><Icon name="glossary" /> Glossário</NavLink>
            <NavLink to="/referencia"><Icon name="scale" /> Referência</NavLink>
            <NavLink to="/ajuda"><Icon name="help" /> Ajuda</NavLink>
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
          <Route path="/casos" element={<Dashboard />} />
          <Route path="/ajuda" element={<Ajuda />} />
          <Route path="/cases/new" element={<CaseForm />} />
          <Route path="/cases/:id" element={<CaseDetail />} />
          <Route path="/cases/:id/edit" element={<CaseForm />} />
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
          <span className="muted">Não é aconselhamento jurídico · sem login</span>
        </div>
      </footer>
    </>
  );
}
