import { useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import WhatsAppFab from './components/WhatsAppFab';
import BackToTop from './components/BackToTop';
import Home from './pages/Home';
import Contato from './pages/Contato';
import { ContentProvider } from './lib/SiteContext';
import { CmsEditProvider } from './lib/cmsEdit';

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
    <CmsEditProvider>
      <ContentProvider>
        <div className="relative min-h-screen bg-brand-bg">
          <ScrollManager />
          <a
            href="#conteudo"
            className="sr-only rounded-lg bg-brand-surface px-4 py-2 text-sm font-semibold text-brand-text shadow-card focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:outline-none focus:ring-2 focus:ring-brand-neon"
          >
            Pular para o conteúdo
          </a>
          <Header />
          <main id="conteudo">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/contato" element={<Contato />} />
              <Route path="*" element={<Home />} />
            </Routes>
          </main>
          <Footer />
          <WhatsAppFab />
          <BackToTop />
        </div>
      </ContentProvider>
    </CmsEditProvider>
  );
}
