import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

/**
 * Ponto de entrada do frontend. Monta o componente <App /> na div#root
 * declarada em index.html.
 */
const container = document.getElementById('root');

if (!container) {
  // Falha visivel e cedo: sem a div#root nao ha onde montar a aplicacao.
  throw new Error('Elemento #root nao encontrado em index.html');
}

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
