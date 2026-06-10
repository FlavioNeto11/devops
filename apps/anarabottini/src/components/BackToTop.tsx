import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { hasWhatsApp } from '../lib/site';

/**
 * Botão "voltar ao topo". Aparece após rolar a página. Posicionado acima do
 * WhatsAppFab quando ele existe (para não sobrepor).
 */
export default function BackToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 600);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!show) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Voltar ao topo"
      title="Voltar ao topo"
      className={`fixed right-5 z-40 grid h-11 w-11 place-items-center rounded-full border border-brand-text/10 bg-brand-surface/90 text-brand-text shadow-soft backdrop-blur transition-all hover:border-brand-neon/40 hover:text-brand-neon sm:right-6 ${
        hasWhatsApp ? 'bottom-24 sm:bottom-28' : 'bottom-5 sm:bottom-6'
      }`}
    >
      <ArrowUp className="h-5 w-5" />
    </button>
  );
}
