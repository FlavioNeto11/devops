import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, Leaf, ArrowRight } from 'lucide-react';
import { cn } from '../lib/utils';

const NAV = [
  { label: 'Início', to: '/' },
  { label: 'Soluções', to: '/solucoes' },
  { label: 'Sobre', to: '/#sobre' },
  { label: 'Processo', to: '/#processo' },
  { label: 'Setores', to: '/#setores' },
  { label: 'Projetos', to: '/#projetos' },
  { label: 'ESG', to: '/#esg' },
  { label: 'Contato', to: '/contato' },
];

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-all duration-300',
        scrolled || open ? 'border-b border-white/10 bg-brand-bg/85 backdrop-blur-xl' : 'border-b border-transparent bg-transparent',
      )}
    >
      <div className="container-wide flex h-[72px] items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-neon/15 ring-1 ring-brand-neon/30">
            <Leaf className="h-5 w-5 text-brand-neon" />
          </span>
          <span className="leading-tight">
            <span className="block font-display text-sm font-bold tracking-tight text-white">RM Ambiental</span>
            <span className="block text-[10px] font-medium uppercase tracking-[0.24em] text-brand-muted">Brasil</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-0.5 xl:flex">
          {NAV.map((n) => (
            <Link
              key={n.label}
              to={n.to}
              className="rounded-lg px-3 py-2 text-sm font-medium text-brand-muted transition-colors hover:text-white"
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 xl:flex">
          <Link to="/contato" className="btn-primary">
            Fale com um especialista <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <button
          className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 text-white xl:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Abrir menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden border-t border-white/10 bg-brand-bg/95 backdrop-blur-xl xl:hidden"
          >
            <nav className="container-wide flex flex-col gap-1 py-5">
              {NAV.map((n) => (
                <Link
                  key={n.label}
                  to={n.to}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-3 text-base font-medium text-brand-muted transition-colors hover:bg-white/5 hover:text-white"
                >
                  {n.label}
                </Link>
              ))}
              <Link to="/contato" onClick={() => setOpen(false)} className="btn-primary mt-3">
                Fale com um especialista <ArrowRight className="h-4 w-4" />
              </Link>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
