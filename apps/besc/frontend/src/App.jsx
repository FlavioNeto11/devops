import React from 'react';
import { Routes, Route, Link, NavLink } from 'react-router-dom';
import { useMeta } from './ui.jsx';
import Dashboard from './pages/Dashboard.jsx';
import CaseForm from './pages/CaseForm.jsx';
import CaseDetail from './pages/CaseDetail.jsx';

export default function App() {
  const { error } = useMeta();
  return (
    <>
      <header className="topbar">
        <div className="brand">
          <Link to="/">BESC&nbsp;Tokenização</Link>
          <small>Plataforma de Levantamento</small>
        </div>
        <div className="spacer" />
        <nav><NavLink to="/" end>Casos</NavLink></nav>
      </header>
      <div className="legal-strip">
        Ferramenta de levantamento e organização documental — <strong>não</strong> executa tokenização nem presta aconselhamento jurídico.
      </div>
      <main className="container">
        {error && <div className="banner err">Falha ao carregar metadados da API: {error}</div>}
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/cases/new" element={<CaseForm />} />
          <Route path="/cases/:id" element={<CaseDetail />} />
          <Route path="/cases/:id/edit" element={<CaseForm />} />
          <Route path="*" element={<div className="empty"><h3>Página não encontrada</h3><Link to="/">Voltar aos casos</Link></div>} />
        </Routes>
      </main>
    </>
  );
}
