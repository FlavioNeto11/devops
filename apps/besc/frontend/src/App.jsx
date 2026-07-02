import React from 'react';
import { Routes, Route, Link, NavLink } from 'react-router-dom';
import { useMeta } from './ui.jsx';
import { Icon, BrandMark } from './icons.jsx';
import Dashboard from './pages/Dashboard.jsx';
import CaseForm from './pages/CaseForm.jsx';
import CaseDetail from './pages/CaseDetail.jsx';
import Ajuda from './pages/Ajuda.jsx';

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
                <b>BESC Tokenização</b>
                <small>Plataforma de Levantamento</small>
              </span>
            </Link>
          </div>
          <div className="spacer" />
          <nav>
            <NavLink to="/" end><Icon name="cases" /> Casos</NavLink>
            <NavLink to="/ajuda"><Icon name="help" /> Ajuda</NavLink>
          </nav>
        </div>
      </header>
      <div className="legal-strip">
        Ferramenta de levantamento e organização documental — <strong>não</strong> executa tokenização nem presta aconselhamento jurídico.
      </div>
      <main className="container">
        {error && <div className="banner err">Falha ao carregar metadados da API: {error}</div>}
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/ajuda" element={<Ajuda />} />
          <Route path="/cases/new" element={<CaseForm />} />
          <Route path="/cases/:id" element={<CaseDetail />} />
          <Route path="/cases/:id/edit" element={<CaseForm />} />
          <Route path="*" element={<div className="empty"><h3>Página não encontrada</h3><Link to="/">Voltar aos casos</Link></div>} />
        </Routes>
      </main>
      <footer className="app-footer">
        <div className="foot-inner">
          <span><strong>Plataforma de Levantamento BESC Tokenização</strong> — organização documental, checklists e relatórios.</span>
          <span className="spacer" />
          <span className="muted">Não é aconselhamento jurídico · sem login</span>
          <Link to="/ajuda">Ajuda</Link>
        </div>
      </footer>
    </>
  );
}
