import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { maybeSeedDevPreview } from './dev/devPreview';

// Seed de dev (?devpreview) antes do render — garante estado estável para verificação.
maybeSeedDevPreview();

createRoot(document.getElementById('root')!).render(
  <BrowserRouter basename="/zapbridge">
    <App />
  </BrowserRouter>,
);
