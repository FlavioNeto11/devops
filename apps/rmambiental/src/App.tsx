import { useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import WhatsAppFab from './components/WhatsAppFab';
import Home from './pages/Home';
import Solucoes from './pages/Solucoes';
import Contato from './pages/Contato';
import { ContentProvider } from './lib/SiteContext';

/** Sobe ao topo a cada navegação; rola até a âncora quando há hash (#secao). */
function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1));
      if (el) {
        const t = setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 70);
        return () => clearTimeout(t);
      }
    }
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname, hash]);
  return null;
}

export default function App() {
  return (
    <ContentProvider>
      <div className="relative min-h-screen bg-brand-bg">
        <ScrollManager />
        <Header />
        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/solucoes" element={<Solucoes />} />
            <Route path="/contato" element={<Contato />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </main>
        <Footer />
        <WhatsAppFab />
      </div>
    </ContentProvider>
  );
}
